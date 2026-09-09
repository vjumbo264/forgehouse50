/* ForgeHouse 50 service worker
   Strategy:
   - Precache the static app shell (pages, CSS, JS, icons, manifest) on install.
   - Cache-first for same-origin static assets (shell files, icons, css, js).
   - Network-first with cache fallback for same-origin API calls (freshness
     matters for today/progress/leaderboard; cache only rescues offline reads
     of previously-fetched GETs).
   - Stale-while-revalidate for VerseWell scripture mirror content (text is
     immutable per version, audio grows over time).

   Shell page URLs are the EXTENSIONLESS canonical routes (/read, /notes, …).
   Cloudflare Pages 308-redirects /read.html -> /read, and a navigation that
   dies mid-redirect against a stale shell cache was the "new tab won't load
   unless I strip .html" bug — the app now only ever references the canonical
   extensionless URLs, which never redirect.
*/
// Bump VERSION on every deploy that changes any shell file: the install
// handler precaches under the new cache names and activate() deletes every
// old cache, so no visitor can be stranded on a stale app shell.
const VERSION = "fh50-v7";
const SHELL_CACHE = `shell-${VERSION}`;
const API_CACHE = `api-${VERSION}`;
const CONTENT_CACHE = `versewell-${VERSION}`;
// Avatars live OUTSIDE the versioned caches on purpose: the set only changes
// when new avatar images are added, so this cache survives every deploy and
// avatar images are fetched from the network exactly once per device
// (operator request: profile icons should never re-download on each visit).
const AVATAR_CACHE = "fh50-avatars";

const SHELL_FILES = [
  "/",
  "/index.html",
  "/login",
  "/signup",
  "/verify",
  "/read",
  "/notes",
  "/progress",
  "/leaderboard",
  "/profile",
  "/admin",
  "/app.v5.css",
  "/app.v5.js",
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
          .filter((k) => ![SHELL_CACHE, API_CACHE, CONTENT_CACHE, AVATAR_CACHE].includes(k))
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
  { // Avatar illustrations: cache-first into the PERSISTENT, unversioned
    // avatar cache (survives deploys) — load once, never re-download unless a
    // genuinely new file is requested.
    const u = new URL(event.request.url);
    if (u.origin === self.location.origin && u.pathname.startsWith("/avatars/")) {
      event.respondWith(caches.open(AVATAR_CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      }));
      return;
    }
  }
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
