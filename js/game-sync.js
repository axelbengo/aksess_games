import { supabaseClient } from "./config.js?v=1.0.2";

let syncTimer = null;
let syncRunning = false;
let syncQueued = false;
let lastSyncedVersion = -1;

export const GameSync = {

    async load(gameSlug) {

		try {

			const {
				data: { user },
				error: authError
			} = await supabaseClient.auth.getUser();

			if (authError)
				throw authError;

			// Sauvegarde locale
			const localRaw = localStorage.getItem(`save_${gameSlug}`);
			const localData = localRaw ? JSON.parse(localRaw) : null;

			// Pas connecté → on joue avec la sauvegarde locale
			if (!user) {
				return localData;
			}

			// Sauvegarde cloud
			const {
				data,
				error
			} = await supabaseClient
				.from("user_game_data")
				.select("data")
				.eq("user_id", user.id)
				.eq("game_slug", gameSlug)
				.maybeSingle();

			if (error)
				throw error;

			const remoteData = data?.data ?? null;

			// Rien dans le cloud
			if (!remoteData) {

				if (localData) {
					lastSyncedVersion = localData.save_version ?? 0;
				}

				return localData;
			}

			// Rien en local
			if (!localData) {

				localStorage.setItem(
					`save_${gameSlug}`,
					JSON.stringify(remoteData)
				);

				lastSyncedVersion = remoteData.save_version ?? 0;

				return remoteData;
			}

			// -----------------------------
			// Comparaison des versions
			// -----------------------------

			const localVersion = localData.save_version ?? 0;
			const remoteVersion = remoteData.save_version ?? 0;

			if (localVersion > remoteVersion) {

				console.log("📱 Sauvegarde locale plus récente.");

				lastSyncedVersion = remoteVersion;

				return localData;

			}

			if (remoteVersion > localVersion) {

				console.log("☁️ Sauvegarde cloud plus récente.");

				localStorage.setItem(
					`save_${gameSlug}`,
					JSON.stringify(remoteData)
				);

				lastSyncedVersion = remoteVersion;

				return remoteData;

			}

			// Même version : on compare les dates
			const localTime = localData.saved_at ?? 0;
			const remoteTime = remoteData.saved_at ?? 0;

			if (localTime >= remoteTime) {

				lastSyncedVersion = localVersion;

				return localData;

			}

			localStorage.setItem(
				`save_${gameSlug}`,
				JSON.stringify(remoteData)
			);

			lastSyncedVersion = remoteVersion;

			return remoteData;

		}
		catch (err) {

			console.error("Erreur Load :", err);

			return "NETWORK_ERROR";

		}

	},

    saveLocally(gameSlug, newData) {

		// Si aucune version n'existe encore, on démarre à 1
		if (typeof newData.save_version !== "number") {
			newData.save_version = 1;
		} else {
			newData.save_version++;
		}

		// Date de la dernière modification
		newData.saved_at = Date.now();

		// Sauvegarde locale
		localStorage.setItem(
			`save_${gameSlug}`,
			JSON.stringify(newData)
		);

		// Programme une synchronisation cloud
		this.scheduleSync(gameSlug);

	},

    async sync(gameSlug) {

		if (syncRunning) {
			return;
		}

		syncRunning = true;

		try {

			const {
				data: { user },
				error: authError
			} = await supabaseClient.auth.getUser();

			if (authError)
				throw authError;

			if (!user) {
				window.on_sync_finished?.("OK");
				return;
			}

			const localRaw = localStorage.getItem(`save_${gameSlug}`);

			if (!localRaw) {
				window.on_sync_finished?.("OK");
				return;
			}

			const localData = JSON.parse(localRaw);

			const localVersion = localData.save_version ?? 0;

			// Rien n'a changé depuis la dernière synchronisation
			if (localVersion === lastSyncedVersion) {
				window.on_sync_finished?.("OK");
				return;
			}

			// Lecture de la sauvegarde cloud actuelle
			const { data: remoteRow, error: readError } = await supabaseClient
				.from("user_game_data")
				.select("data")
				.eq("user_id", user.id)
				.eq("game_slug", gameSlug)
				.maybeSingle();

			if (readError)
				throw readError;

			const remoteData = remoteRow?.data ?? null;
			const remoteVersion = remoteData?.save_version ?? 0;

			// Le cloud possède une version plus récente
			if (remoteVersion > localVersion) {

				console.warn("☁️ Sauvegarde cloud plus récente, synchronisation annulée.");

				localStorage.setItem(
					`save_${gameSlug}`,
					JSON.stringify(remoteData)
				);

				lastSyncedVersion = remoteVersion;

				window.on_sync_finished?.("OK");

				return;
			}

			// Même version : on compare la date
			if (remoteVersion === localVersion && remoteData) {

				const remoteTime = remoteData.saved_at ?? 0;
				const localTime = localData.saved_at ?? 0;

				if (remoteTime > localTime) {

					console.warn("☁️ Sauvegarde cloud plus récente (saved_at).");

					localStorage.setItem(
						`save_${gameSlug}`,
						JSON.stringify(remoteData)
					);

					lastSyncedVersion = remoteVersion;

					window.on_sync_finished?.("OK");

					return;
				}
			}

			// Envoi vers Supabase
			const { error: upsertError } = await supabaseClient
				.from("user_game_data")
				.upsert(
					{
						user_id: user.id,
						game_slug: gameSlug,
						data: localData,
						updated_at: new Date().toISOString()
					},
					{
						onConflict: "user_id,game_slug"
					}
				);

			if (upsertError)
				throw upsertError;

			lastSyncedVersion = localVersion;

			console.log("☁️ Synchronisation Cloud OK");

			window.on_sync_finished?.("OK");

		}
		catch (err) {

			console.error("Erreur Sync :", err);

			window.on_sync_finished?.("ERROR");

		}
		finally {

			syncRunning = false;

		}

	}

};
