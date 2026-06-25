import { supabaseClient } from "./config.js?v=1.0.2";
		    
		    
export const GameSync = {
    // Charge depuis Supabase, sinon depuis LocalStorage
     async load(gameSlug) {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) {
                console.log("👤 Mode Invité : Chargement local uniquement.");
                return JSON.parse(localStorage.getItem(`save_${gameSlug}`)) || null;
            }

            // On cherche sur Supabase
            const { data, error } = await supabaseClient
                .from('user_game_data')
                .select('data')
                .eq('user_id', user.id)
                .eq('game_slug', gameSlug)
                .maybeSingle(); // Ne crash pas si vide

            if (data && data.data) {
                console.log("☁️ Données Cloud trouvées et synchronisées en local.");
                localStorage.setItem(`save_${gameSlug}`, JSON.stringify(data.data));
                return data.data;
            } else {
                console.log("ℹ️ Aucune donnée sur le Cloud. Utilisation du local ou défaut.");
                return JSON.parse(localStorage.getItem(`save_${gameSlug}`)) || null;
            }
        } catch (err) {
            console.error("❌ Erreur critique Load:", err);
            return null;
        }
    },

    // Sauvegarde immédiate dans le navigateur (très rapide)
    saveLocally(gameSlug, newData) {
        localStorage.setItem(`save_${gameSlug}`, JSON.stringify(newData));
    },

    // Envoi des données du navigateur vers Supabase
    async sync(gameSlug) {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return;

            const localData = JSON.parse(localStorage.getItem(`save_${gameSlug}`));
            if (!localData) return;

            await supabaseClient
                .from('user_game_data')
                .upsert({ 
                    user_id: user.id, 
                    game_slug: gameSlug, 
                    data: localData,
                    updated_at: new Date()
                }, { onConflict: 'user_id,game_slug' });

        } catch (err) {
            console.error("Erreur Sync Cloud:", err);
        }
    }
};
