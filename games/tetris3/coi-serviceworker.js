/*! coi-serviceworker v0.1.7 - Version Ultra-Compatible (Chrome, Opera, Firefox, Safari) */
if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", function (event) {
        const r = event.request;

        // --- BYPASS : On ne touche pas à Supabase, Paddle et Cloudflare ---
        if (r.url.includes("cdn-cgi/rum") || r.url.includes("supabase.co")) {
            return; 
        }

        if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;

        event.respondWith(
            fetch(r)
                .then((response) => {
                    if (response.status === 0) return response;

                    const newHeaders = new Headers(response.headers);
                    
                    // --- CONFIGURATION UNIVERSELLE ---
                    // On utilise 'require-corp' qui est le standard le plus largement supporté
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
                    newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");

                    // Gestion des réponses vides (204, 304) pour éviter le crash
                    if (response.status === 204 || response.status === 304) {
                        return new Response(null, {
                            status: response.status,
                            statusText: response.statusText,
                            headers: newHeaders,
                        });
                    }

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => {
                    console.error("SW Fetch Error:", e);
                    return fetch(event.request);
                }) 
        );
    });

} else {
    // --- PARTIE CLIENT (Navigateur) ---
    (() => {
        const n = navigator;
        if (n.serviceWorker) {
            n.serviceWorker.register(window.document.currentScript.src).then((registration) => {
                // Si une mise à jour est trouvée, on recharge
                registration.addEventListener("updatefound", () => {
                    window.location.reload();
                });

                // Si le service worker est prêt mais ne contrôle pas encore la page
                if (registration.active && !n.serviceWorker.controller) {
                    window.location.reload();
                }
            });
        }

        // Vérification : si on n'est pas en mode isolé après chargement, on force le SW
        if (window.crossOriginIsolated === false && n.serviceWorker.controller) {
            console.log("🔄 Activation de l'isolation Cross-Origin...");
            window.location.reload();
        }
    })();
}
