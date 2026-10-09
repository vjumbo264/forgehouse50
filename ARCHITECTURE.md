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

## 7. Cache-First Data Layer
To eliminate the "stale flash" bug, client screens hydrate synchronously from the last known user cache (`localStorage` partitioned by `userId`), immediately paint real user data, and revalidate against the network in the background. On logout, all cached user data is purged.
