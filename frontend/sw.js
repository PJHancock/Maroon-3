// Bump the version when APP_SHELL changes so old caches are dropped.
const CACHE_NAME = "nudge-shell-v5";
const APP_SHELL = [
  "/",
  "/styles_b.css",
  "/styles_C.css",
  "/app_b.js",
  "/home_b.js",
  "/contacts_b.js",
  "/radar.js",
  "/notifications.js",
  "/game_C.js",
  "/tasks_C.js",
  "/manifest_C.json",
  "/icons/icon-192.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  // Cache files one at a time: addAll() rejects if any file is missing, which
  // would stop this worker from installing and leave the old one serving stale code.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => Promise.all(
    APP_SHELL.map((path) => cache.add(path).catch(() => console.warn(`sw: couldn't cache ${path}`))),
  )));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Network first so code changes reach the browser; the cache is only an offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
