// VerseWell static-mirror client (read-only, no auth, no D1/KV).
//
// Data source: https://versewell.pages.dev/static-data/ — sibling project
// vjumbo264/versewell (Cloudflare Pages). URL shapes + shapes verified live
// in task-v01 and documented in ARCHITECTURE.md "VerseWell integration".
//
// Design rules:
//   * Every fetch verifies Content-Type before trusting a 200 — VerseWell's
//     Pages SPA fallback returns 200 text/html for unknown paths.
//   * Short-TTL in-memory cache per isolate (Map). No KV/D1. Audio checks
//     use a shorter TTL because audio is a live, growing dataset (Edge TTS
//     job renders chapters over ~24h+).
//   * Intros are handled defensively: if intro text appears concatenated
//     into verse text (the historical upstream bug), the intro is dropped.
//   * Anything that fails returns null so callers can surface a clear
//     "scripture temporarily unavailable" state (the mock fallback layer was
//     removed in profile_content_cleanup_v1 / task-p04).

let BASE = 'https://versewell.pages.dev/static-data';

// Optional per-environment override (e.g. VERSEWELL_BASE Pages env var) —
// originally added to prove the (now-removed) mock-fallback path; kept as a
// general base-URL override.
export function configureVersewell(env) {
  if (env && typeof env.VERSEWELL_BASE === 'string' && env.VERSEWELL_BASE) {
    BASE = env.VERSEWELL_BASE.replace(/\/+$/, '');
  }
}
const TEXT_TTL_MS = 5 * 60 * 1000;   // 5 min — chapter text/translations
const AUDIO_TTL_MS = 60 * 1000;      // 60s — audio availability grows live

const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  if (hit) cache.delete(key);
  return undefined;
}
function cacheSet(key, value, ttl) {
  // Bound the map so a long-lived isolate can't grow without limit.
  if (cache.size > 500) cache.clear();
  cache.set(key, { value, expires: Date.now() + ttl });
}

async function fetchJson(url, ttl) {
  const ck = 'json:' + url;
  const cached = cacheGet(ck);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(url, { cf: { cacheTtl: 300, cacheEverything: true } });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || !ct.includes('application/json')) { cacheSet(ck, null, ttl); return null; }
    const data = await res.json();
    cacheSet(ck, data, ttl);
    return data;
  } catch {
    return null; // network/parse failure — caller falls back
  }
}

async function headExists(url, ttl) {
  const ck = 'head:' + url;
  const cached = cacheGet(ck);
  if (cached !== undefined) return cached;
  let ok = false;
  try {
    const res = await fetch(url, { method: 'HEAD', cf: { cacheTtl: 60, cacheEverything: true } });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    ok = res.ok && (ct.startsWith('audio/') || ct === 'application/octet-stream');
  } catch { ok = false; }
  cacheSet(ck, ok, ttl);
  return ok;
}

// Normalize an FH50 book name ("Matthew", "1 Corinthians") to the
// VerseWell static slug ("matthew", "1-corinthians") using the per-version
// index — never derive slugs from OSIS codes (1Sam -> 1sam misses).
async function resolveBook(versionLower, fhBookName) {
  const idx = await fetchJson(`${BASE}/${versionLower}/index.json`, TEXT_TTL_MS);
  if (!idx || !Array.isArray(idx.books)) return null;
  const wanted = fhBookName.trim().toLowerCase().replace(/\s+/g, ' ');
  return idx.books.find(b => (b.book_name || '').trim().toLowerCase() === wanted) || null;
}

// True when intro text appears to be merged into verse text (upstream bug):
// if any verse in the intro's range starts with (or fully contains) the
// intro text, the intro is malformed — treat it as absent.
function introsLookMalformed(intros, verses) {
  for (const intro of intros) {
    const t = (intro.text || '').trim();
    if (t.length < 20) continue;
    const probe = t.slice(0, 120);
    for (const v of verses) {
      const vt = (v.text || '').trim();
      if (vt.startsWith(probe)) return true;
    }
  }
  return false;
}

export const versewellProvider = {
  // Live translation list from the mirror's top-level index.
  async listTranslations() {
    const idx = await fetchJson(`${BASE}/index.json`, TEXT_TTL_MS);
    if (!idx || !Array.isArray(idx.versions)) return null;
    return idx.versions.map(v => ({
      id: `versewell-${(v.code || '').toLowerCase()}`,
      code: v.code,
      name: v.name || v.code,
      attribution: `Scripture text: ${v.name || v.code}, via VerseWell (versewell.pages.dev).`,
      versewell: true,
      has_footnotes: !!v.has_footnotes,
      has_intros: !!v.has_intros,
    }));
  },

  // Fetch one book/chapter range. Returns null when the version or any
  // chapter in the range is unavailable (caller shows an unavailable state).
  async getPassage(code, book, chapterStart, chapterEnd) {
    const versionLower = (code || '').toLowerCase();
    const bookEntry = await resolveBook(versionLower, book);
    if (!bookEntry) return null;
    if (chapterEnd > (bookEntry.chapters || 0)) return null;

    const chapters = [];
    const allIntros = [];
    let audioUrl = null;
    for (let ch = chapterStart; ch <= chapterEnd; ch++) {
      const data = await fetchJson(`${BASE}/${versionLower}/${bookEntry.slug}/${ch}.json`, TEXT_TTL_MS);
      if (!data || !Array.isArray(data.verses) || data.verses.length === 0) return null;
      const intros = Array.isArray(data.intros) ? data.intros : [];
      const introsOk = intros.length > 0 && !introsLookMalformed(intros, data.verses);
      if (introsOk) {
        for (const i of intros) allIntros.push({ chapter: ch, start_verse: i.start_verse, end_verse: i.end_verse, text: i.text });
      }
      if (!audioUrl && typeof data.audio_url === 'string' && data.audio_url) audioUrl = data.audio_url;
      for (const v of data.verses) {
        chapters.push({
          chapter: ch,
          verse: v.verse,
          text: v.text,
          footnotes: Array.isArray(v.footnotes) ? v.footnotes : [],
        });
      }
    }

    const reference = chapterStart === chapterEnd
      ? `${book} ${chapterStart}`
      : `${book} ${chapterStart}\u2013${chapterEnd}`;
    const vwName = `${code}`.toUpperCase();
    return {
      reference,
      verses: chapters,
      intros: allIntros,
      audio_path: audioUrl,
      attribution: `Scripture text: ${vwName}, via VerseWell (versewell.pages.dev).`,
      translation: `versewell-${versionLower}`,
      source: 'versewell',
    };
  },

  // Audio URL for a chapter if (and only if) the file actually exists
  // right now — request-time HEAD, short TTL, never a hardcoded list.
  async getAudioUrl(code, book, chapter) {
    const versionLower = (code || '').toLowerCase();
    const bookEntry = await resolveBook(versionLower, book);
    if (!bookEntry) return null;
    const url = `${BASE}/${versionLower}/${bookEntry.slug}/${chapter}.m4a`;
    return (await headExists(url, AUDIO_TTL_MS)) ? url : null;
  },
};

export function isVersewellId(id) {
  return typeof id === 'string' && id.startsWith('versewell-');
}
export function versewellCode(id) {
  return id.replace(/^versewell-/, '').toUpperCase();
}
