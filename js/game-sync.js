import { supabaseClient } from "./config.js?v=1.0.2";
		    
		    
export const GameSync = {
    // Charge depuis Supabase, sinon depuis LocalStorage
    async load(gameSlug) {
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            
            // On récupère toujours le local par sécurité d'abord
            let localData = JSON.parse(localStorage.getItem(`save_${gameSlug}`)) || {};

            if (user) {
                const { data, error } = await supabaseClient
                    .from('user_game_data')
                    .select('data')
                    .eq('user_id', user.id)
                    .eq('game_slug', gameSlug)
                    .maybeSingle();

                if (data && data.data) {
                    // Si le serveur a des données, on synchronise le local avec le serveur
                    localData = data.data;
                    localStorage.setItem(`save_${gameSlug}`, JSON.stringify(localData));
                }
            }
            return localData;
        } catch (err) {
            console.error("Erreur Load:", err);
            return JSON.parse(localStorage.getItem(`save_${gameSlug}`)) || {};
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
