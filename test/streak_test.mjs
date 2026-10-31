import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createTestD1, seedCanonicalPlan } from './helpers_d1.mjs';
import { streaks } from '../functions/lib/points.mjs';
import { ensureUserCalendar } from '../functions/lib/calendar.mjs';
import { onRequestPost as completeReading } from '../functions/api/read/complete.mjs';
import { onRequestGet as getToday } from '../functions/api/today.mjs';
import { onRequestGet as getProgress } from '../functions/api/progress.mjs';
import { onRequestGet as getMe } from '../functions/api/auth/me.mjs';

console.log('=== Running i7 Streak Verification & Regression Suite (SQLite D1) ===');

// Helper: convert WAT date + HH:MM to UTC epoch ms (WAT = UTC+1)
function watMs(isoDate, hhmm = '10:00') {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.parse(`${isoDate}T00:00:00Z`) + (h - 1) * 3600_000 + m * 60_000;
}

async function createAuthedUser(db, userId, startDate) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  await db.prepare(
    `INSERT INTO profiles (id, email, name, surname, password_hash, role, email_verified, programme_start_date)
     VALUES (?, ?, 'Test', 'Reader', 'hash', 'member', 1, ?)`
  ).bind(userId, `${userId}@fh.org`, startDate).run();
  await db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, '2027-01-01T00:00:00Z')`
  ).bind(rawToken, userId).run();
  await ensureUserCalendar(db, userId);
  return rawToken;
}

async function completeDayAt(db, token, dayNumber, nowMs) {
  const firstOpened = new Date(nowMs - 360_000).toISOString();
  const req = new Request('https://forgehouse50.pages.dev/api/read/complete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      day_number: dayNumber,
      readingSeconds: 320,
      firstOpenedAt: firstOpened,
      finalChapterReached: true,
    }),
  });
  const res = await completeReading({ request: req, env: { DB: db, NOW_MS: nowMs } });
  const body = await res.json();
  assert.equal(res.status, 200, `Expected 200 completing day ${dayNumber}: ${JSON.stringify(body)}`);
  return body;
}

async function fetchTodayStats(db, token, nowMs) {
  const req = new Request('https://forgehouse50.pages.dev/api/today', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const res = await getToday({ request: req, env: { DB: db, NOW_MS: nowMs } });
  assert.equal(res.status, 200);
  return (await res.json()).stats;
}

async function fetchMeStats(db, token, nowMs) {
  const req = new Request('https://forgehouse50.pages.dev/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const res = await getMe({ request: req, env: { DB: db, NOW_MS: nowMs } });
  assert.equal(res.status, 200);
  return (await res.json()).stats;
}

async function fetchProgressTotals(db, token, nowMs) {
  const req = new Request('https://forgehouse50.pages.dev/api/progress', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const res = await getProgress({ request: req, env: { DB: db, NOW_MS: nowMs } });
  assert.equal(res.status, 200);
  return (await res.json()).totals;
}

// ---------------------------------------------------------------------------
// Scenario 1 & 2: Genuine daily reader + Tue/Fri rest days + morning-before-reading (Oct 18 bug)
// Schedule starting Mon 2026-10-19:
//   Day 1 = Mon 2026-10-19
//   Rest  = Tue 2026-10-20
//   Day 2 = Wed 2026-10-21
//   Day 3 = Thu 2026-10-22
//   Rest  = Fri 2026-10-23
//   Day 4 = Sat 2026-10-24
// ---------------------------------------------------------------------------
{
  const db = createTestD1();
  seedCanonicalPlan(db);
  const token = await createAuthedUser(db, 'u_daily', '2026-10-19');

  // Before Day 1 reading on Mon morning -> 0
  let s = await streaks(db, 'u_daily', watMs('2026-10-19', '08:00'));
  assert.deepEqual(s, { current: 0, longest: 0 });

  // Complete Day 1 on Mon 18:00 WAT -> current=1, longest=1
  await completeDayAt(db, token, 1, watMs('2026-10-19', '18:00'));
  s = await streaks(db, 'u_daily', watMs('2026-10-19', '19:00'));
  assert.deepEqual(s, { current: 1, longest: 1 });

  // Tuesday rest day -> neither breaks nor adds (still current=1, longest=1)
  s = await streaks(db, 'u_daily', watMs('2026-10-20', '14:00'));
  assert.deepEqual(s, { current: 1, longest: 1 });

  // CRITICAL (Oct 18 bug check): Wednesday Day 2 at 08:30 AM BEFORE reading today's chapters!
  // Today is still open, so Today/Profile/Progress MUST show streak_current = 1 (NOT 0!)
  const wedMorning = watMs('2026-10-21', '08:30');
  const todayStats = await fetchTodayStats(db, token, wedMorning);
  const meStats = await fetchMeStats(db, token, wedMorning);
  const progTotals = await fetchProgressTotals(db, token, wedMorning);
  assert.equal(todayStats.streak_current, 1, 'Today screen must keep streak alive on reading morning');
  assert.equal(meStats.streak_current, 1, 'Profile /api/auth/me must keep streak alive on reading morning');
  assert.equal(progTotals.streak_current, 1, 'Progress /api/progress must keep streak alive on reading morning');

  // Complete Day 2 on Wed 19:00 WAT -> streak grows to 2!
  await completeDayAt(db, token, 2, watMs('2026-10-21', '19:00'));
  s = await streaks(db, 'u_daily', watMs('2026-10-21', '20:00'));
  assert.deepEqual(s, { current: 2, longest: 2 });

  // Complete Day 3 on Thu 17:00 WAT -> streak grows to 3!
  await completeDayAt(db, token, 3, watMs('2026-10-22', '17:00'));
  s = await streaks(db, 'u_daily', watMs('2026-10-22', '18:00'));
  assert.deepEqual(s, { current: 3, longest: 3 });

  // Friday rest day -> stays 3
  s = await streaks(db, 'u_daily', watMs('2026-10-23', '21:00'));
  assert.deepEqual(s, { current: 3, longest: 3 });

  // Saturday Day 4 morning before reading -> still 3!
  s = await streaks(db, 'u_daily', watMs('2026-10-24', '07:30'));
  assert.deepEqual(s, { current: 3, longest: 3 });

  // Saturday Day 4 completed -> grows to 4!
  await completeDayAt(db, token, 4, watMs('2026-10-24', '16:00'));
  s = await streaks(db, 'u_daily', watMs('2026-10-24', '16:05'));
  assert.deepEqual(s, { current: 4, longest: 4 });
  console.log('  [PASS] Scenario 1 & 2: Daily growth, morning-before-reading preservation, Tue/Fri rest days.');
}

// ---------------------------------------------------------------------------
// Scenario 3 & 4: Missing a day resets current streak to 0; catch-up days NEVER add to
// current OR longest streak (nor award daily_streak points); resuming on-time starts at 1.
// ---------------------------------------------------------------------------
{
  const db = createTestD1();
  seedCanonicalPlan(db);
  const token = await createAuthedUser(db, 'u_catchup', '2026-10-19');

  // Complete Days 1 (Mon) and 2 (Wed) on time -> current=2, longest=2
  await completeDayAt(db, token, 1, watMs('2026-10-19', '15:00'));
  await completeDayAt(db, token, 2, watMs('2026-10-21', '15:00'));
  assert.deepEqual(await streaks(db, 'u_catchup', watMs('2026-10-22', '09:00')), { current: 2, longest: 2 });

  // User MISSES Thursday 2026-10-22 (Day 3)!
  // On Friday 2026-10-23 (rest day) morning, Day 3 is strictly in the past (2026-10-22 < 2026-10-23) -> current resets to 0, longest stays 2!
  assert.deepEqual(await streaks(db, 'u_catchup', watMs('2026-10-23', '09:00')), { current: 0, longest: 2 });

  // On Friday rest-day catch-up window (before 19:00 WAT), user catches up Day 3!
  await completeDayAt(db, token, 3, watMs('2026-10-23', '14:00'));
  const streakPtsRow = await db.prepare("SELECT COUNT(*) AS c FROM points WHERE user_id = 'u_catchup' AND action = 'daily_streak' AND idempotency_key LIKE '%:3'").first();
  assert.equal(streakPtsRow.c, 0, 'Catch-up completion must not award daily_streak points');

  // Even though all past days (1..3) are now completed, Day 3 was a catch-up (compDate 10-23 > sched 10-22),
  // so current MUST remain 0 AND longest MUST remain 2 (NOT 3)!
  assert.deepEqual(await streaks(db, 'u_catchup', watMs('2026-10-23', '15:00')), { current: 0, longest: 2 });
  assert.deepEqual(await streaks(db, 'u_catchup', watMs('2026-10-24', '09:00')), { current: 0, longest: 2 });

  // Now on Saturday 2026-10-24 (Day 4), user reads Day 4 ON TIME -> starts fresh current=1, longest stays 2!
  await completeDayAt(db, token, 4, watMs('2026-10-24', '18:00'));
  assert.deepEqual(await streaks(db, 'u_catchup', watMs('2026-10-24', '19:00')), { current: 1, longest: 2 });
  console.log('  [PASS] Scenario 3 & 4: Missed day resets to 0; catch-up never adds to current or longest; on-time restarts at 1.');
}

// ---------------------------------------------------------------------------
// Scenario 5: Exact Section 5 screenshot reproduction (Day 13 of 50, Days 1..7 done, 6 days outstanding)
// ---------------------------------------------------------------------------
{
  const db = createTestD1();
  seedCanonicalPlan(db);
  // Start 2026-10-13 (Tue -> Day 1 = Wed 2026-10-14; Day 13 = Sat 2026-10-31)
  const token = await createAuthedUser(db, 'u_screen', '2026-10-13');
  const { rows } = await ensureUserCalendar(db, 'u_screen');
  for (let d = 1; d <= 7; d++) {
    const schedDate = rows.find(r => r.day_number === d).date;
    await completeDayAt(db, token, d, watMs(schedDate, '17:00'));
  }
  // Evaluate on Day 13 (Sat 2026-10-31): 6 days outstanding (Days 8..13) -> current=0, longest=7
  const s = await streaks(db, 'u_screen', watMs('2026-10-31', '12:00'));
  assert.deepEqual(s, { current: 0, longest: 7 });
  console.log('  [PASS] Scenario 5: Section 5 screenshot user (7/50 done on Day 13) -> current=0, longest=7.');
}

// ---------------------------------------------------------------------------
// Scenario 6: +1 day read-ahead completed early counts on-time and persists
// ---------------------------------------------------------------------------
{
  const db = createTestD1();
  seedCanonicalPlan(db);
  const token = await createAuthedUser(db, 'u_ahead', '2026-10-19');

  // Mon 2026-10-19: complete Day 1 AND read-ahead Day 2 (scheduled Wed 2026-10-21)
  await completeDayAt(db, token, 1, watMs('2026-10-19', '12:00'));
  await completeDayAt(db, token, 2, watMs('2026-10-19', '18:00'));

  assert.deepEqual(await streaks(db, 'u_ahead', watMs('2026-10-19', '20:00')), { current: 2, longest: 2 });
  assert.deepEqual(await streaks(db, 'u_ahead', watMs('2026-10-21', '22:00')), { current: 2, longest: 2 });
  assert.deepEqual(await streaks(db, 'u_ahead', watMs('2026-10-22', '09:00')), { current: 2, longest: 2 });
  console.log('  [PASS] Scenario 6: +1 read-ahead counts on-time and remains active.');
}

console.log('ALL i7 STREAK VERIFICATION TESTS PASSED!');
