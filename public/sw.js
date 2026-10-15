/* ForgeHouse 50 — Self-Healing Service Worker (v2)
 * Version: fh50-v2-09
 *
 * Requirements (Item 1 & Item 5):
 * - Never serve /assets/* blindly from cache.
 * - Navigations: NETWORK-FIRST with offline cached app shell fallback.
 * - Hashed assets (/assets/*): Cache-first ONLY if active valid JS/CSS, never cache 404 or HTML fallback.
 * - Avatars: Persistent cache.
 * - API calls: NEVER cached by service worker.
 * - Deletes all legacy caches on activation.
 */

const VERSION = "fh50-v2-09";
const SHELL_CACHE = `shell-${VERSION}`;
const AVATAR_CACHE = "fh50-avatars";

const PRECACHE_FILES = [
  "/",
  "/index.html",
  "/app/",
  "/app/index.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  "/icons/favicon-16.png",
  "/icons/favicon.ico",
  "/branding/forgehouse50-icon-v3.png",
  "/sw-reset.html"
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

  // 1. Never cache API routes in service worker
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) {
    return;
  }

  // 2. Persistent avatar cache (WebP / PNG)
  if (url.origin === self.location.origin && url.pathname.startsWith("/avatars/")) {
    event.respondWith(
      caches.open(AVATAR_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch (_) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  // 3. Hashed assets (/assets/*) — Validate type, never cache HTML fallback or 404
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          // Check that cached response is valid JS/CSS, not an HTML 200 fallback
          const cType = cached.headers.get("content-type") || "";
          if (url.pathname.endsWith(".js") && !cType.includes("javascript")) {
            // Bad cache entry, delete and re-fetch
            caches.open(SHELL_CACHE).then((c) => c.delete(request));
          } else if (url.pathname.endsWith(".css") && !cType.includes("css")) {
            caches.open(SHELL_CACHE).then((c) => c.delete(request));
          } else {
            return cached;
          }
        }
        return fetch(request).then((res) => {
          if (res.ok && res.status === 200) {
            const cType = res.headers.get("content-type") || "";
            const isExpectedType =
              (url.pathname.endsWith(".js") && cType.includes("javascript")) ||
              (url.pathname.endsWith(".css") && cType.includes("css")) ||
              (!url.pathname.endsWith(".js") && !url.pathname.endsWith(".css"));

            if (isExpectedType) {
              const clone = res.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
            }
          }
          return res;
        }).catch(() => cached || Response.error());
      })
    );
    return;
  }

  // 4. Navigations (HTML pages) — Network-first, fallback to cached shell
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && res.status === 200) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(request);
          if (hit) return hit;
          if (url.pathname.startsWith("/app")) {
            const appFallback = (await caches.match("/app/index.html")) || (await caches.match("/app/"));
            if (appFallback) return appFallback;
          }
          const rootFallback = (await caches.match("/index.html")) || (await caches.match("/"));
          return rootFallback || Response.error();
        })
    );
    return;
  }

  // 5. General assets — Network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && res.status === 200) {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
