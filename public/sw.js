/* ForgeHouse 50 service worker
   Strategy:
   - Precache the static app shell (pages, CSS, JS, icons, manifest) on install.
   - Cache-first for same-origin static assets (shell files, icons, css, js).
   - Network-first with cache fallback for same-origin API calls (freshness
     matters for today/progress/leaderboard; cache only rescues offline reads
     of previously-fetched GETs).
   - Stale-while-revalidate for VerseWell scripture mirror content (text is
     immutable per version, audio grows over time).
*/
const VERSION = "fh50-v1";
const SHELL_CACHE = `shell-${VERSION}`;
const API_CACHE = `api-${VERSION}`;
const CONTENT_CACHE = `versewell-${VERSION}`;

const SHELL_FILES = [
  "/",
  "/index.html",
  "/login.html",
  "/signup.html",
  "/verify.html",
  "/read.html",
  "/notes.html",
  "/progress.html",
  "/leaderboard.html",
  "/profile.html",
  "/admin.html",
  "/app.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  "/icons/favicon-16.png",
  "/icons/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, API_CACHE, CONTENT_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

const isVerseWell = (url) => url.hostname === "versewell.pages.dev";
const isApi = (url) => url.origin === self.location.origin && url.pathname.startsWith("/api/");
const isStaticShell = (url) =>
  url.origin === self.location.origin &&
  (SHELL_FILES.includes(url.pathname) ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/branding/") ||
    /\.(css|js|png|ico|webmanifest|woff2?)$/.test(url.pathname));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never touch mutations (POST/PUT/DELETE)

  const url = new URL(request.url);

  // VerseWell scripture/audio mirror: stale-while-revalidate
  if (isVerseWell(url)) {
    event.respondWith(
      caches.open(CONTENT_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetched = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }

  // API calls: network-first, cache fallback for offline reading
  if (isApi(url)) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch (err) {
          const cached = await cache.match(request);
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  // Static shell: cache-first, then network (and cache the fresh copy)
  if (isStaticShell(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Navigations to same-origin pages not in the shell list: network,
  // fall back to cached copy of the request, then the app shell.
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        return cached || caches.match("/index.html");
      })
    );
    return;
  }
  // Everything else: default browser behavior.
});
