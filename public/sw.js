/* ForgeHouse 50 — Rebuilt Service Worker (v2)
 *
 * Replaces all prior service workers (v15/v16/etc).
 * - Pre-caches essential app shell assets.
 * - Navigations: NETWORK-FIRST with offline cached app shell fallback.
 * - Hashed assets (/assets/*): CACHE-FIRST.
 * - Avatars: CACHE-FIRST in persistent cache.
 * - API calls: NEVER cached by service worker (handled by app-level IndexedDB/memory).
 * - Immediately activates with skipWaiting() and clients.claim().
 * - Deletes all legacy caches on activation.
 */

const VERSION = "fh50-v2-01";
const SHELL_CACHE = `shell-${VERSION}`;
const AVATAR_CACHE = "fh50-avatars";

const PRECACHE_FILES = [
  "/",
  "/index.html",
  "/app/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  "/icons/favicon-16.png",
  "/icons/favicon.ico",
  "/branding/forgehouse50-icon-v3.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_FILES).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== AVATAR_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 1. Never cache API routes in service worker (per architecture specification)
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  // 2. Persistent avatar cache (WebP / PNG)
  if (url.origin === self.location.origin && url.pathname.startsWith("/avatars/")) {
    event.respondWith(
      caches.open(AVATAR_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
    return;
  }

  // 3. Hashed assets (/assets/*) — Cache-first
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // 4. Navigations (HTML pages) — Network-first, fallback to cached shell
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(request);
          if (hit) return hit;
          if (url.pathname.startsWith("/app")) {
            const appFallback = await caches.match("/app/");
            if (appFallback) return appFallback;
          }
          const rootFallback = await caches.match("/");
          return rootFallback || Response.error();
        })
    );
    return;
  }

  // 5. General assets — Network first with cache fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request).then((res) => {
          if (res.ok && res.status === 200) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
      );
    })
  );
});
