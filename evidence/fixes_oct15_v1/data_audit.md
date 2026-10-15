# Website Synthetic Users Data Audit — fixes_oct15_v1

Date: 2026-10-15 (WAT)
Target: `forgehouse50.pages.dev` / `https://github.com/vjumbo264/forgehouse50.git`

## 1. Summary of Findings & Root Cause

The website frontend (`public/assets/index-CQfSSHWX.js`) contained a client-side fallback function `xt(e, t)` hard-coded with synthetic mock users:
- Sarah Adeyemi (score 280, avatar-02)
- David Okonkwo (score 245, avatar-03)
- Emmanuel Babatunde (score 210, avatar-04)
- Grace Eze (score 175, avatar-05)
- Michael Chukwu (score 140, avatar-06)

In the Leaderboard component (`bt`), the fetch logic was:
```javascript
fetch(`/api/leaderboard?category=${t}`)
  .then(e => e.ok ? e.json() : null)
  .then(n => {
    n?.rankings && Array.isArray(n.rankings) ? i(n.rankings.map(...)) : i(xt(t, e));
    c(!!n?.programme_concluded);
    o(!1);
  })
  .catch(() => { i(xt(t, e)), o(!1) });
```

However, `/api/leaderboard` returns `{ category, entries: [...], eligible_count, gate, scoring }` (using `entries` per the Android `LeaderboardResponse` contract), NOT `rankings`.
Because `n.rankings` was undefined, `n?.rankings && Array.isArray(n.rankings)` evaluated to `false` every single time.
As a result, even when a user was successfully logged in and the API returned real participants, the frontend ALWAYS fell back to `xt(t, e)` and rendered the 5 synthetic mock users.

Furthermore, on any network error or catch, it also fell back to `xt(t, e)` instead of an honest error state.

## 2. Cloudflare Pages & D1 Configuration

- Account ID: `1695bfc7422ac8004179e99f3cdd60c1`
- Cloudflare Pages Project: `forgehouse50`
- Production Branch: `main`
- D1 Database: `forgehouse50-db` (UUID: `351aca36-14e4-4c6f-8e13-127caae5b72f`)
- Production D1 Binding: `DB` -> `351aca36-14e4-4c6f-8e13-127caae5b72f`
- Preview D1 Binding: `DB` -> `351aca36-14e4-4c6f-8e13-127caae5b72f`
- Verified: Both production and preview bindings correctly point to the active database.

## 3. Production D1 Database Row Audit (Sanitized, No Emails/PII)

Audited directly via Cloudflare D1 query API on 2026-10-15:
- Total profiles in database: 16 (all role `member`, all `email_verified = 1`)
- Distribution of completed reading days:
  - 2 days completed: 4 participants
  - 1 day completed: 6 participants
  - 0 days completed: 6 participants
- Total points recorded in points ledger: 1,757 points across 50 records
- Reading progress rows: 20 records, totaling 51,090 seconds
- Notes recorded: 14 total (6 observations, 2 questions, 3 prayers, 3 applications)
- Synthetic user rows in D1: 0 (no fake users exist in the database)

## 4. Remediation Steps

1. **Backend (`functions/api/leaderboard.mjs`):**
   - Provide backward and forward compatibility: return both `entries` AND `rankings` (pointing to the same list of objects).
   - In each entry, provide `name`, `surname`, `display_name`, `value`, `metric_value`, and `metric_label`.
2. **Frontend (`public/assets/` & source):**
   - Read `n?.entries || n?.rankings || []`.
   - Remove `xt(e, t)` synthetic user fallback entirely from the production bundle.
   - On empty or failure, display an honest empty/error state.
   - Bump service worker cache version to `fh50-v2-04` so stale caches are purged automatically on activation.
3. **Automated Verification:**
   - Add automated test verifying that the website leaderboard renders actual participants matching `/api/leaderboard`.
