# ForgeHouse 50 — Read the New Testament in 50 Reading Days

A ForgeHouse Global initiative: a mobile-first web app that walks members through
all **260 chapters of the New Testament in exactly 50 reading days**.

**Live app:** https://forgehouse50.pages.dev

## Programme rules

- Starts **Monday, 7 September 2026** and runs until Reading Day 50 (15 November 2026).
- **Tuesdays and Fridays are never reading days** — ForgeHouse already runs
  Tuesday Fasting & Prayer and Friday Fasting & Prayer + Bible Study. The calendar
  skips them automatically; they never count toward the 50.
- 6 chapters/day for the first 10 days, then 5/day (10×6 + 40×5 = 260).

## Stack

| Layer      | Technology                                             |
|------------|--------------------------------------------------------|
| Frontend   | Static mobile-first pages on **Cloudflare Pages**      |
| API        | **Cloudflare Pages Functions** (Workers runtime)       |
| Database   | **Cloudflare D1** (SQLite) — see `schema.sql`          |
| Auth       | In-house: email + password (PBKDF2-SHA256), 6-digit OTP email verification, 30-day HttpOnly session cookie |
| Email      | **Resend** (`onboarding@resend.dev` sender)            |
| CI/CD      | **GitHub Actions** → auto-deploy to Pages on push to `main` |

Architecture, per-table data-access rules, and the points/badge system are
documented in [`ARCHITECTURE.md`](ARCHITECTURE.md). The reading-day calendar logic
lives in [`functions/lib/calendar.mjs`](functions/lib/calendar.mjs) (single source of
truth; `seed/calendar.mjs` regenerates `seed/seed.sql` from it).

## First-priority user flow

REGISTER → VERIFY OTP → LOGIN → SEE TODAY'S READING → READ → MARK COMPLETE →
WRITE NOTE → SEE PROGRESS → SEE LEADERBOARD.

1. **Register** at `/signup` with name, email, password (min 8 chars).
2. **Verify**: a 6-digit code is emailed via Resend; enter it at `/verify`
   (10-minute expiry, 5 attempts max, codes are single-use).
3. **Log in** at `/login`. A 30-day session cookie keeps you signed in.
4. **Home** shows today's assignment (or the Fasting & Prayer notice on
   Tue/Fri), your stats, streak, and a Continue Reading button.
5. **Read** (`/read`) shows the passage with translation selector, font-size
   controls, dark/light mode, bookmarks, highlights, an audio-player stub, and
   **Mark Complete** (+10 pts, +3 streak pts — safe to tap twice, points are
   idempotent).
6. **Notes** (`/notes`): Observation, Question, Scripture Connection,
   Application, or Prayer — private to you, searchable and filterable.
7. **Progress** (`/progress`) shows days 1–50 with dates, assignments,
   completion, reading time and notes count, plus totals and streaks.
8. **Leaderboard** (`/leaderboard`): Overall, Consistency, Chapters, Reading
   Time, Observations, Questions — aggregate counts only, never note content.

## Phone-only administration (Termux + browser dashboards)

No local CLI is required anywhere. Everything below is doable from an Android
phone using browser dashboards, or with `curl` in Termux.

### Adding the licensed Bible API key (when you have one)

The app runs fully without it using the mock content layer
(`functions/lib/bible.mjs` — a few public-domain WEB sample passages plus
clearly-labelled placeholders). To go live with real licensed text:

1. Sign up with a licensed Bible API provider and get an API key.
2. In the Cloudflare dashboard (works in a phone browser):
   **Workers & Pages → forgehouse50 → Settings → Variables and Secrets →
   Add → type "Secret" → name `BIBLE_API_KEY` → paste the key → Save →
   redeploy** (Deployments → ⋯ → Retry deployment, or push any commit).
3. Add a provider in `functions/lib/bible.mjs` implementing
   `getPassage(book, chapterStart, chapterEnd)` and register it in `PROVIDERS`
   — the translation selector picks it up automatically, no other changes.

Or via Termux (keeps the key out of shell history if you paste when prompted):

```sh
read -s KEY
curl -X PATCH "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/pages/projects/forgehouse50" \
  -H "Authorization: Bearer YOUR_CF_TOKEN" -H "Content-Type: application/json" \
  -d "{\"deployment_configs\":{\"production\":{\"env_vars\":{\"BIBLE_API_KEY\":{\"type\":\"secret_text\",\"value\":\"$KEY\"}}}}}"
```

The same recipe works for `WHATSAPP_GROUP_URL` (plain_text, not secret) to
light up the **Join ForgeHouse WhatsApp Group** button.

### OTP / Resend email setup

- OTP codes (6 digits, 10-minute expiry, single-use, max 5 attempts) are stored
  in the D1 `otp_codes` table and sent via **Resend** from
  `onboarding@resend.dev`. No custom domain verification is needed for that
  sender.
- The Resend key lives only as the Pages secret **`RESEND_API_KEY`**
  (Settings → Variables and Secrets). It is never in the repo.
- **Free-tier limitation:** with the default Resend test sender, email can only
  be delivered to the Resend account owner's own email address. To email all
  participants, verify a domain at https://resend.com/domains (DNS records can
  be added from a phone browser wherever your DNS is hosted) and update the
  `from:` address in `functions/lib/email.mjs`.

### Making someone an admin

Admins see `/admin` (participants, programme stats, point/completion
corrections). Promote a verified user with one SQL statement in
**Cloudflare dashboard → D1 → forgehouse50-db → Console**:

```sql
UPDATE profiles SET role = 'admin' WHERE email = 'person@example.com';
```

(Or the same statement via the D1 REST API with `curl` in Termux.)

### GitHub Actions secrets

`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are stored as repo secrets
(**GitHub repo → Settings → Secrets and variables → Actions**) and used by
`.github/workflows/deploy.yml` to deploy on every push to `main`.

## Repository layout

```
public/            static frontend pages (home, read, notes, progress, leaderboard, profile, admin, auth)
functions/api/     Pages Functions API routes (auth, read, notes, progress, leaderboard, admin)
functions/lib/     shared modules: auth, calendar, bible content, points/badges, email, http
schema.sql         D1 schema (14 tables) — applied to forgehouse50-db
seed/              calendar generator + generated seed.sql (50 days / 260 chapters)
.github/workflows/ deploy workflow (GitHub → Cloudflare Pages)
ARCHITECTURE.md    data-access rules, points, badges, security model
BUILD_STATE.json   build ledger (task status, commits, verification notes)
```

## Explicitly not built yet (architected for)

Licensed Bible API integration, licensed audio, WhatsApp automation, push
notifications, AI note organization, community observations, Friday Bible Study
integration, richer analytics.

---

Soli Deo Gloria.
