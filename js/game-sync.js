import { supabaseClient } from "./config.js";

let syncTimer = null;

export const GameSync = {

    async load(gameSlug) {
		try {
			// 1. Récupérer l'utilisateur
			const { data: { user } } = await supabaseClient.auth.getUser();
			
			// 2. Récupérer la sauvegarde locale (navigateur)
			const localRaw = localStorage.getItem(`save_${gameSlug}`);
			const localData = localRaw ? JSON.parse(localRaw) : null;

			// Si pas connecté, on renvoie direct le local
			if (!user) return localData;

			// 3. Récupérer la sauvegarde Cloud
			const { data, error } = await supabaseClient
				.from("user_game_data")
				.select("data")
				.eq("user_id", user.id)
				.eq("game_slug", gameSlug)
				.maybeSingle();

			if (error) throw error;

			// 4. Si le Cloud existe, on met à jour le local et on renvoie le Cloud
			if (data && data.data) {
				localStorage.setItem(`save_${gameSlug}`, JSON.stringify(data.data));
				return data.data;
			}

			// 5. Si rien sur le Cloud, on renvoie le local
			return localData;

		} catch (err) {
			console.error("❌ Erreur Load brute :", err.message);
			// En cas d'erreur (réseau/auth), on renvoie le local par sécurité
			const backup = localStorage.getItem(`save_${gameSlug}`);
			return backup ? JSON.parse(backup) : null;
		}
	},
	
	scheduleSync(gameSlug) {
		// 1. Annuler le décompte précédent s'il existe
		if (syncTimer) clearTimeout(syncTimer);

		// 2. Lancer un nouveau décompte de 3 secondes
		syncTimer = setTimeout(() => {
			this.sync(gameSlug);
		}, 3000);
	},

    saveLocally(gameSlug, newData) {
		newData.saved_at = Date.now();
		
		// Sauvegarde dans le navigateur
		localStorage.setItem(
			`save_${gameSlug}`,
			JSON.stringify(newData)
		);
		// PROGRAMME l'envoi vers le Cloud automatiquement
		this.scheduleSync(gameSlug);
	}

    async sync(gameSlug) {
		try {
			// 1. Vérifier si l'utilisateur est connecté
			const { data: { user } } = await supabaseClient.auth.getUser();
			if (!user) return; // On ne fait rien s'il n'est pas connecté

			// 2. Récupérer la donnée locale brute
			const localRaw = localStorage.getItem(`save_${gameSlug}`);
			if (!localRaw) return; // Rien à sauvegarder

			// 3. Écraser sur Supabase (Simple Upsert)
			const { error } = await supabaseClient
				.from("user_game_data")
				.upsert({
					user_id: user.id,
					game_slug: gameSlug,
					data: JSON.parse(localRaw),
					updated_at: new Date().toISOString()
				}, {
					onConflict: "user_id,game_slug"
				});

			if (error) throw error;
			console.log("☁️ Sauvegarde Cloud réussie.");
		} catch (err) {
			console.error("❌ Erreur Sync brute :", err.message);
		}
	}

};
