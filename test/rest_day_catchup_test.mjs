import assert from 'node:assert/strict';
import { createTestD1, seedCanonicalPlan } from './helpers_d1.mjs';
import { getWatDateAndMinutes, getRestDayStatus } from '../functions/lib/rest_day.mjs';
import { onRequestGet as getToday } from '../functions/api/today.mjs';
import { onRequestPost as completeDay } from '../functions/api/read/complete.mjs';
import { onRequestGet as getSettings, onRequestPut as putSettings } from '../functions/api/admin/settings.mjs';
import { generatePlan } from '../functions/lib/calendar.mjs';

console.log('=== Running Rest Day 7pm Lagos Catch-up Integration Tests (i6) ===');

const DB = createTestD1();

seedCanonicalPlan(DB);

const exp = '2027-01-01T00:00:00Z';
const tokMember = 'd'.repeat(64);
const tokAdmin = 'e'.repeat(64);
DB.exec(`
  INSERT INTO profiles (id, email, name, surname, password_hash, role, email_verified, programme_start_date)
  VALUES ('u1', 'u1@fh.org', 'Tunde', 'Bakare', 'hash', 'member', 1, '2026-10-26');
  INSERT INTO sessions (id, user_id, expires_at) VALUES ('${tokMember}', 'u1', '${exp}');

  INSERT INTO admin_credentials (id, username, salt, password_hash) VALUES ('adm1', 'pastor', 'salt', 'hash');
  INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES ('${tokAdmin}', 'adm1', '${exp}');
`);

function makeReq(path, { method = 'GET', token = tokMember, body = null } = {}) {
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (body) headers.set('Content-Type', 'application/json');
  return new Request(`https://forgehouse50.pages.dev${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// 1. Midnight WAT (00:15 WAT Tuesday 2026-10-27 = 2026-10-26T23:15:00Z) must be hour=0, catchup_allowed=true!
const tueMidnightMs = new Date('2026-10-26T23:15:00Z').getTime();
const watMid = getWatDateAndMinutes(tueMidnightMs);
assert.equal(watMid.weekday, 'Tue');
assert.equal(watMid.hour, 0);
assert.equal(watMid.minute, 15);
const stMid = await getRestDayStatus(DB, tueMidnightMs);
assert.equal(stMid.is_rest_day, true);
assert.equal(stMid.catchup_allowed, true);
console.log('✓ Midnight WAT (00:15 Tue) parsed as hour 0, catch-up ALLOWED');

// 2. Tuesday 19:05 WAT (18:05 UTC): catch-up CLOSED for missed Monday (Day 1 = 2026-10-26)
const tueAfter7pm = new Date('2026-10-27T18:05:00Z').getTime();
const todayAfterRes = await getToday({ request: makeReq('/api/today'), env: { DB, NOW_MS: tueAfter7pm } });
const todayAfterJson = await todayAfterRes.json();
assert.equal(todayAfterJson.is_reading_day, false);
assert.equal(todayAfterJson.catch_up.count, 1);
assert.equal(todayAfterJson.catch_up.window_open, false);
assert.equal(todayAfterJson.catch_up.days.length, 0);
assert.equal(todayAfterJson.catch_up.cutoff_message, 'Catch-up closes at 7pm today for Bible Study, continue tomorrow.');

const blockedComplete = await completeDay({
  request: makeReq('/api/read/complete', {
    method: 'POST',
    body: {
      day_number: 1,
      readingSeconds: 360,
      firstOpenedAt: new Date(tueAfter7pm - 400_000).toISOString(),
      finalChapterReached: true,
    },
  }),
  env: { DB, NOW_MS: tueAfter7pm },
});
assert.equal(blockedComplete.status, 409);
const blockedBody = await blockedComplete.json();
assert.equal(blockedBody.code, 'rest_day_catchup_closed');
assert.match(blockedBody.error, /Catch-up closes at 7pm today for Bible Study, continue tomorrow/);
console.log('✓ Tuesday 19:05 WAT: /api/today hides catch-up session & /api/read/complete blocks Day 1 with 409');

// 3. Tuesday 18:30 WAT (17:30 UTC): catch-up ALLOWED for missed Monday (Day 1), and awards ZERO streak points!
const tueBefore7pm = new Date('2026-10-27T17:30:00Z').getTime();
const todayBeforeJson = await (await getToday({ request: makeReq('/api/today'), env: { DB, NOW_MS: tueBefore7pm } })).json();
assert.equal(todayBeforeJson.catch_up.window_open, true);
assert.equal(todayBeforeJson.catch_up.days.length, 1);
assert.equal(todayBeforeJson.catch_up.days[0].day_number, 1);

const okCatchup = await completeDay({
  request: makeReq('/api/read/complete', {
    method: 'POST',
    body: {
      day_number: 1,
      readingSeconds: 360,
      firstOpenedAt: new Date(tueBefore7pm - 400_000).toISOString(),
      finalChapterReached: true,
    },
  }),
  env: { DB, NOW_MS: tueBefore7pm },
});
assert.equal(okCatchup.status, 200);
const streakEvents = (await DB.prepare("SELECT * FROM points WHERE user_id = 'u1' AND action = 'daily_streak'").all()).results;
assert.equal(streakEvents.length, 0, 'Catch-up on Tuesday must NOT award daily_streak');
console.log('✓ Tuesday 18:30 WAT: missed Day 1 catch-up succeeds and awards 0 streak points');

// 4. On Tuesday 18:30 WAT, attempting normal/future Day 2 (scheduled for Wednesday 2026-10-28) is LOCKED!
const futureOnRestDay = await completeDay({
  request: makeReq('/api/read/complete', {
    method: 'POST',
    body: {
      day_number: 2,
      readingSeconds: 360,
      firstOpenedAt: new Date(tueBefore7pm - 400_000).toISOString(),
      finalChapterReached: true,
    },
  }),
  env: { DB, NOW_MS: tueBefore7pm },
});
assert.equal(futureOnRestDay.status, 409);
assert.equal((await futureOnRestDay.json()).code, 'normal_reading_locked_on_rest_day');
console.log('✓ Normal/read-ahead reading (Day 2) stays locked on Tuesday rest day');

// 5. Wednesday 21:15 WAT (20:15 UTC — after 7pm on a normal reading day!): Day 2 normal reading is ALLOWED!
const wedNight = new Date('2026-10-28T20:15:00Z').getTime();
const okNormal = await completeDay({
  request: makeReq('/api/read/complete', {
    method: 'POST',
    body: {
      day_number: 2,
      readingSeconds: 360,
      firstOpenedAt: new Date(wedNight - 400_000).toISOString(),
      finalChapterReached: true,
    },
  }),
  env: { DB, NOW_MS: wedNight },
});
assert.equal(okNormal.status, 200);
const streakAfterWed = (await DB.prepare("SELECT * FROM points WHERE user_id = 'u1' AND action = 'daily_streak'").all()).results;
assert.equal(streakAfterWed.length, 1, 'Normal reading on Wednesday awards daily_streak');
console.log('✓ Wednesday 21:15 WAT: normal reading has no evening cutoff and awards daily_streak');

// 6. Admin changes cutoff to 18:00 -> Friday 18:10 WAT is closed with updated display time (6pm)
const putRes = await putSettings({
  request: makeReq('/api/admin/settings', {
    method: 'PUT',
    token: tokAdmin,
    body: { rest_day_catchup_cutoff_time: '18:00' },
  }),
  env: { DB },
});
assert.equal(putRes.status, 200);
const getSetJson = await (await getSettings({ request: makeReq('/api/admin/settings', { token: tokAdmin }), env: { DB } })).json();
assert.equal(getSetJson.settings.rest_day_catchup_cutoff_time, '18:00');

const friAfter6pm = new Date('2026-10-30T17:10:00Z').getTime(); // 18:10 WAT Friday
const stFri = await getRestDayStatus(DB, friAfter6pm);
assert.equal(stFri.is_rest_day, true);
assert.equal(stFri.catchup_allowed, false);
assert.equal(stFri.message, 'Catch-up closes at 6pm today for Bible Study, continue tomorrow.');
console.log('✓ Admin-configurable cutoff (18:00 -> 6pm) verified on Friday');
console.log('=== All Rest Day Catch-up (i6) Integration Tests Passed! ===');
