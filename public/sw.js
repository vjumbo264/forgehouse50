/* ForgeHouse 50 service worker
   Strategy (cache_player_profile_fixes_v1 / task-f03):
   - Precache the static app shell (pages, versioned CSS/JS, icons) on install.
   - HTML pages / navigations: NETWORK-FIRST — a fresh deploy is visible
     immediately; the cache is only an offline fallback.
   - Icons / branding / manifest: NETWORK-FIRST — their URLs are STABLE but
     their CONTENT changes across deploys (e.g. the new app icon), so they
     must never be served stale. Cache-first here was exactly why users kept
     seeing the old PWA icon and old UI after deploys.
   - Versioned app assets (app.vN.css / app.vN.js): cache-first — the basename
     carries the deploy version, so a change always ships under a NEW URL.
   - API calls: network-first, cache fallback for offline reads.
   - VerseWell scripture mirror: stale-while-revalidate (text immutable per
     version, audio grows over time).
   - skipWaiting + clients.claim here, plus a one-time controllerchange
     reload in app.js: a new deploy activates at once and open tabs reload
     onto the new shell automatically.

   Shell page URLs are the EXTENSIONLESS canonical routes (/read, /notes, …).
   Cloudflare Pages 308-redirects /read.html -> /read; the app only ever
   references the canonical extensionless URLs, which never redirect.
*/
// Bump VERSION on every deploy that changes any shell file: install()
// precaches under the new cache names and activate() deletes every old
// cache, so no visitor can be stranded on a stale app shell.
const VERSION = "fh50-v9";
const SHELL_CACHE = `shell-${VERSION}`;
const API_CACHE = `api-${VERSION}`;
const CONTENT_CACHE = `versewell-${VERSION}`;
// Avatars live OUTSIDE the versioned caches on purpose: the set only changes
// when new avatar images are added, so this cache survives every deploy and
// avatar images are fetched from the network exactly once per device.
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
  "/app.v7.css",
  "/app.v7.js",
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
const isVersionedAsset = (url) =>
  url.origin === self.location.origin && /\/app\.v\d+\.(css|js)$/.test(url.pathname);
// Stable URL, CHANGING content — always revalidate.
const isFreshContentAsset = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/branding/") ||
    url.pathname === "/manifest.webmanifest");

async function networkFirst(request, cacheName, fallbacks = []) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    for (const f of fallbacks) {
      const fb = await caches.match(f);
      if (fb) return fb;
    }
    throw err;
  }
}

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
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  // Icons / branding / manifest: NETWORK-FIRST (stable URL, changing content).
  // This is the fix for the stale PWA icon: the browser and the SW both
  // revalidate these on every load instead of serving a months-old copy.
  if (isFreshContentAsset(url)) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // Navigations (HTML pages): NETWORK-FIRST so a fresh deploy is visible the
  // moment it lands; cached copy (then the app shell) rescues offline loads.
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL_CACHE, [url.pathname, "/"]));
    return;
  }

  // Versioned app assets: cache-first, then network (and cache the fresh
  // copy). The vN basename changes on every deploy, so this is always safe.
  if (isVersionedAsset(url)) {
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
  // Everything else: default browser behavior.
});
