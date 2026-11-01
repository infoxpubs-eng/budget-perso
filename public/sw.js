/* Service worker minimal — objectif : permettre l'installation en PWA
 * sans jamais servir une version périmée de l'application.
 *
 * Stratégies :
 * - /assets/* (bundles hachés par Vite, immuables) : cache d'abord ;
 * - tout le reste (index.html, manifest, icônes) : réseau d'abord,
 *   repli sur le cache uniquement hors ligne.
 */
const CACHE = "budget-perso-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (/\/assets\//.test(url.pathname)) {
    // Bundles hachés : cache d'abord (jamais périmé, le nom change à chaque build).
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((r) => {
            const copy = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return r;
          })
      )
    );
    return;
  }

  // Navigation et fichiers racine : réseau d'abord pour toujours servir la
  // dernière version publiée ; cache uniquement en repli hors ligne.
  e.respondWith(
    fetch(req)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return r;
      })
      .catch(() => caches.match(req))
  );
});
