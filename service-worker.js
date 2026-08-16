// Cache-first app-shell service worker. This is a fully static app with no
// dynamic server content, so everything can be cached up front and served
// from cache first, falling back to network only if something's missing.
//
// Bump CACHE_NAME on every deploy to bust old caches (no build tooling here
// to content-hash filenames).
const CACHE_NAME = "darts-v15";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./Images/logo.jpeg",
  "./js/app.js",
  "./js/state.js",
  "./js/players.js",
  "./js/bracket.js",
  "./js/boards.js",
  "./js/export.js",
  "./js/github.js",
  "./js/util.js",
  "./js/i18n.js",
  "./js/ui/render.js",
  "./js/ui/setup-view.js",
  "./js/ui/match-view.js",
  "./js/ui/champion-view.js",
  "./js/ui/completed-matches.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
