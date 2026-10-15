# ForgeHouse 50 — Architecture (Rebuild v2)

## 1. System Overview
ForgeHouse 50 is a mobile-first application for the ForgeHouse Global church initiative:
**Read the New Testament in 50 Reading Days** (all 260 NT chapters across 50 reading days).
Tuesdays and Fridays are fasting/prayer days (Friday also features Bible Study) and never count as reading days.
Every user progresses through their **own personal calendar** based on their start date in **West Africa Time (WAT, Africa/Lagos, UTC+1)**.

The frontend is completely rebuilt from scratch into two primary layers:
1. **Public Landing Page (`/`)**: High-performance static HTML/JS marketing entry point. Automatically detects visitor platform (Android vs. iOS vs. Desktop), serves a dynamic "Download for Android" CTA pointing to the latest signed release APK (`app-forgehouse50-v<N>.apk`), or an "Open Web App" CTA for iOS/desktop. Features full OpenGraph / Twitter meta tags, WhatsApp community link, prefilled WhatsApp support, FAQ, and live programme status.
2. **PWA Web App (`/app/`)**: Client-side routed Single Page Application offering complete parity with the native Android app, featuring cache-first offline rendering, IndexedDB-backed offline Bible translations, chapter reader with single-verse footnote expansion, single-attempt non-blocking quiz, full notes manager (5 types), personal progress tracker (days 1–50), categorized leaderboards (raw cumulative points, consistency, chapters, reading time, observations, questions), admin control center, and PWA installability.

---

## 2. Infrastructure & Environment
| Component | Details | Notes |
|---|---|---|
| **Frontend Runtime** | Cloudflare Pages (serving `/` landing & `/app/` SPA) | High speed edge static asset delivery |
| **API Backend** | Cloudflare Pages Functions (`functions/api/*`) | Edge Worker runtime bound directly to D1 |
| **Database** | Cloudflare D1 (`forgehouse50-db`, UUID `351aca36-14e4-4c6f-8e13-127caae5b72f`) | SQLite on Cloudflare edge |
| **Transactional Email** | Brevo SMTP REST API (`BREVO_API_KEY`) | Sender: `Forgehouse 50 <vjumbo264@gmail.com>` |
| **Android Repo** | `vjumbo264/forgebuild` (slug: `forgehouse50`) | Releases tagged `forgehouse50-v<N>` |
| **Live Production** | `https://forgehouse50.pages.dev` | Production branch: `main` |
| **Live Preview** | `https://site-v2.forgehouse50.pages.dev` | Feature branch: `site-v2` |

---

## 3. Android App Slug & Latest Version Resolution
- **App Slug**: `forgehouse50`
- **Location in ForgeBuild**: `apps/forgehouse50/`
- **Release Strategy**: Each release in `vjumbo264/forgebuild` is tagged `forgehouse50-v<N>` (e.g. `forgehouse50-v18`).
- **Resolution Logic**: In `/api/app-release`, the system queries the GitHub Releases API for `vjumbo264/forgebuild`, excludes drafts and prereleases, extracts `<N>` from `^forgehouse50-v(\d+)$`, sorts by **numeric integer value** (e.g. `v18 > v10 > v9`), extracts the `.apk` asset URL, size, and published date, and caches the result with `stale-if-error`.

---

## 4. Retired Features Inventory (Permanently Removed)
The new site contains **zero trace** of the following retired features:
1. **Audio Player & Downloads**: `audio_progress` and audio streaming/downloading are completely removed.
2. **Mock Bible Layer**: No mock scripture or mock translation layers; all reading is powered by verified VerseWell single-file bundles.
3. **Manual Light/Dark Toggle**: The UI strictly respects the OS/browser `prefers-color-scheme` without an in-app toggle switch.
4. **"Today" Leaderboard**: The leaderboard displays only valid aggregate categories: Overall (points), Consistency (streak), Chapters (chapters read), Reading Time, Observations, Questions.
5. **Damped / Averaged Overall Scoring**: Overall Score is strictly **raw cumulative total points**.
6. **Quiz Pass Threshold / Blocking / Retries**: The quiz allows exactly **one attempt**, shows results immediately, awards proportional points, and never blocks day completion. Retries are rejected by the server.
7. **Fixed Shared Calendar**: Replaced by individual start-date calendars in WAT (UTC+1).
8. **Resend References**: Replaced by Brevo.
9. **Duolingo-Style Clutter**: Clean, mature, premium UI design following Material 3 Expressive and Plus Jakarta Sans.
10. **Emojis in UI**: Completely replaced with purposeful, accessible SVG icons.

---

## 5. Frozen Backend API Contract
The backend in `functions/` remains untouched except for additive read-only endpoints (such as `/api/app-release`):
- `GET /api/config` — WhatsApp link, programme dates, registration status
- `POST /api/auth/signup` — `{ email, password, name, surname, avatar_id }`
- `POST /api/auth/verify` — `{ email, code }`
- `POST /api/auth/resend` — `{ email }`
- `POST /api/auth/login` — `{ email, password }`
- `POST /api/auth/logout` — clear session
- `GET /api/auth/me` — current authenticated user details
- `POST /api/auth/avatar` — update user avatar
- `GET /api/today` — personal calendar status for today in WAT
- `GET /api/read/day?n=<day>` — day assignments and completion
- `GET /api/read/passage?book=...&chapter_start=...&chapter_end=...&translation=...` — online fallback for scripture
- `POST /api/read/complete` — `{ day_number, viewed_chapters }` (strictly gated)
- `POST /api/read/time` — `{ day_number, seconds }` (reading time reporting)
- `GET /api/quiz/<day>` — quiz questions and prior attempt status
- `POST /api/quiz/submit` — `{ day_number, answers }` (single attempt)
- `GET /api/notes`, `POST /api/notes`, `PUT /api/notes/<id>`, `DELETE /api/notes/<id>` — private notes
- `GET /api/progress` — 50-day completion and streak stats
- `GET /api/leaderboard?category=<cat>` — rankings (day 3+ eligibility)
- `GET /api/final_results`, `POST /api/final_results` — post-programme celebration
- `GET /api/admin/*`, `POST /api/admin/*` — participants, stats, assignments, point adjustments, start programme, end testing phase & reset
- `GET /bundles/manifest.json` — 12 translation bundles (`kjv`, `amp`, `niv`, etc.)

---

## 6. Offline Bible Translation Architecture (IndexedDB)
Translations are delivered as single gzip-compressed JSON files hosted at `/bundles/<code].json.gz` (with KJV pre-stored on initial load).
- **Storage Engine**: `IndexedDB` (database: `fh50_bible`, objectStore: `translations`).
- **Gzip Detection**: Probes magic bytes `0x1f 0x8b` to dynamically determine whether decompression via `DecompressionStream('gzip')` is required (safeguarding against automatic CDN decompression).
- **Real-Time Progress**: Downloads report true byte streaming via `ReadableStream` reader and `content-length`.
- **Zero API Reading**: Once a translation is stored, all reading is 100% offline and instant.

---

<<<<<<< HEAD
## 7. Cache-First Data Layer
To eliminate the "stale flash" bug, client screens hydrate synchronously from the last known user cache (`localStorage` partitioned by `userId`), immediately paint real user data, and revalidate against the network in the background. On logout, all cached user data is purged.
=======
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

## Admin Authentication & User Lifecycle Architecture (admin_delete_and_login_v1)

### Dedicated Admin Credential Model
- **Credentials (`admin_credentials`)**: Admin authentication uses a dedicated username (format: `fh50-admin-xxxxxx`) and strong password hashed with PBKDF2-SHA256 (100,000 iterations, 16-byte random salt).
- **Separation of Concerns**: Admin credentials exist independently of `profiles`. Admin accounts never participate in reading days, streaks, quizzes, or leaderboards.
- **Retirement of Email Admin**: No email OTP flow can ever grant administrative privileges. All participant profiles hold `role = 'member'`.
- **Sessions (`admin_sessions`)**: Fixed 12-hour expiration. On password change or rotation via `tools/rotate-admin.mjs`, prior sessions are immediately invalidated.
- **Brute-Force Protection (`admin_login_attempts`)**: 5 failed attempts within 15 minutes locks out authentication from the username and source IP for 15 minutes (HTTP 429 Retry-After).

### Complete Cascading Deletion
- **Atomic Deletion (`functions/lib/delete_user.mjs`)**: Deletes all 14 user child tables in a single atomic `env.DB.batch()` call:
  - `reading_progress`, `quiz_attempts`, `user_reading_days`, `audio_progress`
  - `notes`, `bookmarks`, `highlights`, `user_badges`, `points`
  - `sessions`, `otp_codes`, `leaderboard_snapshots`, `final_rank_acks`, `final_rankings`
  - `profiles`
- **Safety Guards**:
  1. Admins cannot delete their own account or other admin accounts.
  2. Exact confirmation matching the target user's display name or ID is required.
  3. Every deletion logs an entry to `admin_audit` (`id`, `admin_id`, `action`, `target_user_id`, `target_display_name`, `created_at`).
  4. Post-deletion cascade script (`scripts/check_cascade_orphans.mjs`) validates 0 orphan rows.


### Batch Deletion & Simplified Confirmation Contract (batch_fixes_oct12_v1)

- **Single Delete (`POST /api/admin/users/:id/delete`)**:
  - Accepts `{ confirm: true }` directly without requiring typing the user display name.
  - Backward-compatible: also accepts `{ confirm_name: "<display_name_or_id>" }`.
  - Atomic cascade across all 14 child tables + `profiles`.
  - Audited in `admin_audit` with `action: "delete_user"`.
  - Protected against self-delete and admin account deletion.

- **Batch Delete (`POST /api/admin/users/delete`)**:
  - Request body: `{ user_ids: string[], confirm_word: "DELETE" }` (1 to 50 user IDs per call).
  - Skips invalid IDs, self-admin IDs, or non-existent users without failing the entire batch.
  - Returns HTTP 200 `{ ok: true, deleted: string[], skipped: string[], failed: string[] }`.
  - Audited per-deleted user in `admin_audit` with `action: "batch_delete_user"`.

- **Participant List Schema (`GET /api/admin/participants`)**:
  - Returns enhanced fields per user:
    - `id`: full user UUID
    - `name`: given name
    - `surname`: surname (nullable)
    - `full_name`: trimmed `name + " " + surname` (or `name` if surname missing)
    - `short_tag`: `#<id.slice(-4)>` for disambiguating participants with duplicate first names
    - `status`: `"active"` (has completed days/points/notes) or `"inactive"` (zero activity)
    - `points`, `days_completed`, `notes_count`, `email`, `role`, `created_at`


## Programme Window, End-Date Integrity & Reset Guard (ops_batch_oct14_v1)

### 1. Join Window Rule
- The join window is strictly **10 calendar days in WAT (Africa/Lagos, UTC+1)** counted from the programme start date, with start day as Day 1.
- Started Monday 2026-10-12, the window covers Monday 12 to **Wednesday 2026-10-21 inclusive**, closing at **23:59:59 WAT on 2026-10-21**.
- The date calculations are dynamically derived from the stored `start_at` timestamp in `programme_config`, never hard-coded.
- On Wednesday 2026-10-14, exactly **8 days remain** including today.
- Registration endpoints (`/api/auth/signup`, `/api/auth/verify`) reject attempts after the window closes with HTTP 403 and the clear message `"Joining has closed"`.

### 2. Programme End Date Derivation
- Overall programme end date is dynamically derived from the latest possible joiner (Day 1 on 2026-10-21).
- Using the standard calendar function (50 reading days, skipping Tuesdays and Fridays), Day 50 for an Oct 21 joiner lands on **2026-12-28**.
- The final ranking snapshot and top-3 celebration cannot trigger until on or after `2026-12-28`.

### 3. Reset Guard
- Once the programme has started (`programme_config.start_at` exists), **End Testing Phase & Reset** (`POST /api/admin/end_testing`) is permanently blocked server-side, returning **HTTP 409 Conflict** with `"The programme has started; reset is disabled"`.
- The admin dashboard button is disabled with that reason.
- **Start Programme** (`POST /api/admin/programme`) is fully idempotent: subsequent taps return `{ ok: true, already_started: true }` and preserve the existing stored timestamp.

---

## 13. Data Integrity & No Mock Data Policy (fixes_oct15_v1)

- **Single Source of Truth**: Both the native Android application (`apps/forgehouse50` in `vjumbo264/forgebuild`) and the website (`https://forgehouse50.pages.dev`) connect to the exact same Cloudflare D1 database: `forgehouse50-db` (UUID `351aca36-14e4-4c6f-8e13-127caae5b72f`).
- **Zero Mock / Synthetic Data in Production**: All fallback mock arrays (such as synthetic participant lists in client bundles) are prohibited and eradicated. If an endpoint fails or returns no records, the UI must display an honest empty state or honest error message, never fabricated data.
- **Contract Parity**: `/api/leaderboard` returns both `entries` (Android contract) and `rankings` (web alias) pointing to the same list of real participant records from D1.
