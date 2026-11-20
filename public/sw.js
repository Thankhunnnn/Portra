const scope = new URL(self.registration.scope);
const key = "portra:" + scope.pathname + ":";
const CACHE = key + "v3";
const shellUrl = (path) => new URL(path, scope).href;
const SHELL = ["", "icon.svg", "manifest.webmanifest"].map(shellUrl);

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(key) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith(scope.pathname + "api/")) return;
  // network-first for pages, falling back to cache when offline; cache-first for static assets
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; })
        .catch(() => caches.match(req).then((m) => m || caches.match(shellUrl(""))))
    );
  } else if (url.pathname.startsWith(scope.pathname + "_next/static/") || url.pathname.endsWith(".svg")) {
    e.respondWith(
      caches.match(req).then((m) => m || fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return r; }))
    );
  }
});
