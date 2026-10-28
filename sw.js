// Service worker: la app funciona sin conexión. Precios (data/*.json): red primero, caché si no hay red.
const V = 'cartera-v1';
const SHELL = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/calc.js', 'js/charts.js', 'js/store.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  const isData = u.pathname.includes('/data/');
  e.respondWith((async () => {
    const c = await caches.open(V);
    if (isData || r.mode === 'navigate') {
      try { const n = await fetch(r, { cache: 'no-cache' }); if (n.ok) c.put(r, n.clone()); return n; }
      catch { return (await c.match(r)) || (await c.match('index.html')) || Response.error(); }
    }
    const hit = await c.match(r);
    const net = fetch(r).then((n) => { if (n.ok) c.put(r, n.clone()); return n; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
