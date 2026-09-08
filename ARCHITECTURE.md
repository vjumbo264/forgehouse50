# ForgeHouse 50 — Architecture

## Overview

ForgeHouse 50 is a mobile-first web app for the ForgeHouse Global initiative
**Read the New Testament in 50 Reading Days**: all 260 NT chapters across
exactly 50 reading days, starting **Monday, September 7, 2026**. Tuesdays and
Fridays are never reading days (Tuesday Fasting & Prayer; Friday Fasting &
Prayer + Bible Study).

## Stack

| Layer      | Choice                                             | Why |
|------------|----------------------------------------------------|-----|
| Frontend   | Astro (static build) on **Cloudflare Pages**       | Pages-native, zero Vercel/Next-specific APIs, fast mobile TTI |
| API        | **Cloudflare Pages Functions** (`functions/api/*`) | Runs on Workers runtime beside the static site; one deploy |
| Database   | **Cloudflare D1** (SQLite)                         | Free tier, SQL, bound directly to Pages Functions |
| Email      | **Brevo** transactional email                      | OTP mail via `POST https://api.brevo.com/v3/smtp/email` from verified single sender `Forgehouse 50 <vjumbo264@gmail.com>`; `BREVO_API_KEY` is a Pages secret |
| CI/CD      | **GitHub Actions** → `wrangler pages deploy`       | Push to `main` deploys automatically |
| Auth       | In-house: email+password (PBKDF2-SHA256 via Web Crypto), 6-digit OTP, signed session cookie backed by `sessions` table | No external auth vendor, free-tier only |

Everything is free-tier. The production URL is the `*.pages.dev` subdomain.

## Repository layout

```
schema.sql                  D1 schema (single source of truth for tables)
seed/calendar.mjs           reading-day calendar generator + seed SQL emitter
lib/                        shared Worker modules (db, auth, bible, points, badges)
functions/api/              Pages Functions — every API route
src/                        Astro frontend (pages, components, styles)
wrangler.toml               Pages project config + D1 binding
.github/workflows/deploy.yml  GitHub Actions deploy pipeline
BUILD_STATE.json            persistent build checkpoint (the project's memory)
```

## Programme calendar rules

- Start: 2026-09-07 (Monday).
- A day is a **reading day** unless its weekday is Tuesday or Friday.
- Exactly 50 reading days are generated; the programme ends when Reading
  Day 50 completes (2026-11-15, a Sunday).
- The 260 NT chapters are distributed as evenly as possible (5 or 6 per day,
  first 10 days get 6), and split into contiguous per-book assignments that
  never split a chapter.

## Row-level security: D1 has none — the Worker query layer is the boundary

D1 does not enforce per-row permissions. **Every** rule below is enforced in
`functions/api/*` by (a) resolving the session cookie to a `user_id` before
any query and (b) baking that `user_id` into the SQL `WHERE` clause. No
handler may accept a `user_id` from the client. Violating this table is a
build-blocking defect.

| Table | Read rule | Write rule |
|---|---|---|
| `profiles` | Self only. Admins may read non-sensitive fields (id, name, avatar, role, created_at) of all users — **never** `password_hash`. | Self only (name/avatar). `role` changes: admin-only. |
| `otp_codes` | Never returned to any client. | Created server-side on signup/resend; `consumed_at` set on success; `attempts` capped at 5. |
| `sessions` | Never returned to any client. Token lives only in an `HttpOnly; Secure; SameSite=Lax` cookie. | Created on login/verify; deleted on logout; expired rows purged opportunistically. |
| `reading_days` | Public (any authenticated user). | Seed-only. Admin may edit labels. |
| `reading_assignments` | Public (any authenticated user). | Seed-only. Admin may manage (task-11). |
| `reading_progress` | **Own rows only** (`WHERE user_id = ?`). Admin sees aggregates/counts only. | Own rows only; `completed` transitions award points idempotently. |
| `audio_progress` | Own rows only. | Own rows only; completion awards +5 once per day. |
| `notes` | **Own rows only — no exception.** Admins are explicitly forbidden from reading note bodies. Leaderboard uses counts only. | Own rows only. Every query includes `WHERE user_id = ?` bound from the session, never from input. |
| `bookmarks` | Own rows only. | Own rows only (upsert by unique key). |
| `highlights` | Own rows only. | Own rows only (upsert by unique key). |
| `points` | Own rows only. Admin may insert `admin_adjustment` with mandatory `reason`. | Server-side only; `UNIQUE(user_id, idempotency_key)` makes every award exactly-once per action per context. |
| `badges` | Public read. | Seed-only catalogue. |
| `user_badges` | Own rows + public display of badge ids per user on leaderboards/profiles. | Awarded server-side when rules are met; exactly-once via PK. |
| `leaderboard_snapshots` | Public (authenticated). Contains **only** display_name + aggregate numeric values — no note bodies, no emails. | Recomputed server-side on relevant events. |

## Auth flow

1. `POST /api/auth/signup` — validate email/password, create `profiles` row
   (`email_verified=0`), generate 6-digit OTP (10-min expiry), store in
   `otp_codes`, send custom HTML email via Brevo.
2. `POST /api/auth/verify` — check OTP (max 5 attempts, must be unexpired &
   unconsumed), mark `email_verified=1`, create session, set cookie.
3. `POST /api/auth/login` — verify PBKDF2 hash, require `email_verified=1`,
   create session, set cookie.
4. `POST /api/auth/logout` — delete session row, clear cookie.
5. Password hashing: **PBKDF2-SHA256, 100,000 iterations, 16-byte salt**, via
   Web Crypto (`crypto.subtle`) — Workers-native, no native deps. Format:
   `pbkdf2$100000$salt_hex$hash_hex`, constant-time comparison.

## Points (idempotent — no farming)

| Action | Points | Idempotency key |
|---|---|---|
| Completed assigned reading | +10 | `reading_completed:{user}:{day}` |
| Audio reading completed | +5 | `audio_completed:{user}:{day}` |
| Daily streak | +3 | `daily_streak:{user}:{day}` |
| Observation saved | +2 | `observation_saved:{user}:{note_id}` |
| Question saved | +2 | `question_saved:{user}:{note_id}` |
| Community observation shared | +3 | `community_shared:{user}:{note_id}` (future) |
| Weekly target completed | +10 | `weekly_target:{user}:{iso_week}` |
| Programme completed | +100 | `programme_completed:{user}` |
| Admin adjustment | ±n | `admin_adjustment:{user}:{uuid}` (reason required) |

The `UNIQUE(user_id, idempotency_key)` constraint is the guard: duplicate
submissions are silently absorbed, so retries and double-taps cannot farm
points.

## Bible content

Scripture text and audio come exclusively from VerseWell's live static JSON
mirror (see "VerseWell integration" below) — fetched at request time through
`functions/lib/versewell.mjs`. The former mock/placeholder content layer
(`functions/lib/bible.mjs`, provider id `mock-web`) was **removed entirely**
in profile_content_cleanup_v1 (task-p04): the translation selector lists only
translations VerseWell actually serves, and if VerseWell is unreachable or a
chapter is missing the Reading page shows a clear "Scripture is temporarily
unavailable" state instead of falling back to placeholder text. No
copyrighted text is scraped or shipped.

## Secrets & environment

| Name | Where | Notes |
|---|---|---|
| `BREVO_API_KEY` | Pages project secret (API: `PATCH /pages/projects/{name}`, `deployment_configs.production.env_vars` type `secret_text`) | Never in code/logs; used by `functions/lib/email.mjs` as the `api-key` header on Brevo requests |
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions secrets | Used by deploy workflow |
| `WHATSAPP_GROUP_URL` | Pages env var (plain text, production + preview) | Real group invite link (set in task-p07) |

## Explicitly not built yet (clean seams only)

WhatsApp automation, push notifications, AI note organization, community
observations, Friday Bible Study integration, richer analytics. (Scripture
text/audio is fully live via VerseWell; there is no licensed-API fallback
layer by design.)

## VerseWell integration (versewell_integration_v1, 2026-09-08)

ForgeHouse 50's Scripture layer is a **read-only consumer of VerseWell's
static JSON mirror** (`https://versewell.pages.dev/static-data/`, sibling
project `vjumbo264/versewell`, also Cloudflare Pages). No API key, no auth,
no D1/KV added on our side — plain public `fetch` with a short-TTL
in-memory cache in the Pages Functions isolate. VerseWell is the sole
Scripture source: the earlier mock provider was removed in
profile_content_cleanup_v1, so a VerseWell failure surfaces as a clear
unavailable state rather than placeholder text.

### Live-verified data contract (inspected against the deployed mirror, not assumed)

| Item | Verified value |
|---|---|
| Top-level index | `GET /static-data/index.json` → `{versions:[{code,name,language,description,has_footnotes,has_intros,verse_count}]}` — **12 versions live**: AMP, CEV, GW, KJV, MSG, NIV, NKJV, NLT, NLV, TLB, TPT, VOICE |
| Per-version index | `GET /static-data/{version_lower}/index.json` → `{version,name,books:[{book (OSIS),book_name,book_order,chapters,verse_count,slug,testament}]}` |
| Chapter JSON | `GET /static-data/{version_lower}/{book_slug}/{chapter}.json` → `{version,book,book_name,chapter,audio_url,intros:[{start_verse,end_verse,text}],verses:[{verse,text,footnotes?:[{marker,text}]}],navigation:{prev,next}}` |
| Book slug | Full book name lowercased, spaces → hyphens (`Matthew`→`matthew`, `1 Corinthians`→`1-corinthians`). **Never derive from OSIS codes** (`1Sam`→`1sam` misses; resolve via the per-version index's `slug`/`book_name`). |
| Audio file | `/static-data/{version_lower}/{book_slug}/{chapter}.m4a` (AAC/M4A 48kbps, Edge TTS, one per chapter per allowlisted version, generated by `generate-audio.yml`, committed incrementally every ~100 chapters). Chapter JSON's `audio_url` field carries the path when the file exists, else `null`. |
| Missing-file behavior | Pages SPA fallback returns **HTTP 200 `text/html`** for unknown paths — every fetch must verify `Content-Type: application/json` (text) or `audio/*` (HEAD for audio) before trusting a 200. |

### Known-bug status (checked live, 2026-09-08)

- **Section intros merging into verse text** — FIXED upstream (VerseWell
  `INTRO_FIX_STATE.json`, fix_complete=true, commit c99a1fa6): intros are
  structurally separate in `intros[]`; footnotes nest per verse. ForgeHouse
  50 still renders intros **defensively**: an intro whose text appears
  concatenated inside any verse's text is treated as malformed and dropped
  rather than rendered.
- **Intros misreported as missing** — FIXED upstream (same fix series).
- **Incomplete-version books lumped under "Old Testament"** — FIXED
  upstream (commit a4710c80): TPT index now correctly groups
  Psalm/Proverbs/Song of Songs as OT and all 27 NT books as NT.
- **Audio availability is a live, growing dataset** — at inspection time
  exactly 200 `.m4a` files exist, all AMP Old Testament
  (Genesis→Joshua); NT audio has not rendered yet. Generation is a
  self-resuming GitHub Actions job (~24h+ to finish the full allowlist).
  ForgeHouse 50 therefore checks audio existence **at request time**
  (content-type-verified HEAD, short-TTL cached) — never a hardcoded list.

### Unavailable-state rules (mock fallback removed, task-p04)

- VerseWell unreachable / fetch error / non-JSON response / version or
  chapter not present in the mirror → `GET /api/read/passage` returns
  **503 `{error, unavailable:true}`** and the Reading page shows a clear
  "Scripture is temporarily unavailable — please try again shortly" state.
  The failure is never silently swallowed.
- The translation selector lists **only** the live VerseWell versions. If
  the live index fetch fails, the selector is empty/disabled and the page
  shows the same unavailable state — no mock entry is ever offered.
- A version whose per-version index lacks the assigned book (partial
  canon) returns the same 503 unavailable state for that passage only.
- The optional `VERSEWELL_BASE` Pages env var overrides the mirror base URL
  (kept as a general override; originally used to test the old fallback).
