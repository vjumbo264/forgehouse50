import assert from 'assert';
import {
  registrationOpen,
  getJoinWindowDetails,
  day50Date,
  addDays,
  JOIN_WINDOW_DAYS,
  formatDateLong,
  formatDateMedium
} from '../functions/lib/programme.mjs';
import { generateReadingDayDates, EXCLUDED_WEEKDAYS, TOTAL_DAYS } from '../functions/lib/calendar.mjs';

console.log('=== TEST SUITE: Item 1 — Programme Window, End Dates & Reset Guard ===\n');

// 1. Join window rule tests:
// Stored start_at: Monday 2026-10-12 at 14:54:35.729Z (15:54:35 WAT)
const cfg = {
  started: true,
  start_at: '2026-10-12T14:54:35.729Z',
  join_window_closes_at: '2026-10-22',
};

// Case 1A: Day 1 (start day, Mon 2026-10-12)
{
  const tStart = '2026-10-12T15:00:00Z'; // 16:00 WAT on Monday Oct 12
  const details = getJoinWindowDetails(cfg, tStart);
  assert.strictEqual(details.started, true);
  assert.strictEqual(details.registration_open, true);
  assert.strictEqual(details.days_remaining, 10, 'Day 1 should have 10 days remaining');
  assert.strictEqual(details.start_formatted, 'Mon 12 Oct 2026');
  assert.strictEqual(details.join_window_last_day_formatted, 'Wed 21 Oct 2026');
  assert.strictEqual(details.status_summary, 'Started Mon 12 Oct 2026 · Joining closes Wed 21 Oct 2026 · 10 days left');
  assert.strictEqual(details.signup_label, 'Joining closes on 21 Oct 2026');
  console.log('PASS: Case 1A — Day 1 start (10 days remaining)');
}

// Case 1B: Mid-window (Wednesday 2026-10-14, today!)
{
  const tMid = '2026-10-14T07:00:00Z'; // 08:00 WAT on Wednesday Oct 14
  const details = getJoinWindowDetails(cfg, tMid);
  assert.strictEqual(details.registration_open, true);
  assert.strictEqual(details.days_remaining, 8, 'Wednesday 2026-10-14 should have exactly 8 days remaining');
  assert.strictEqual(details.status_summary, 'Started Mon 12 Oct 2026 · Joining closes Wed 21 Oct 2026 · 8 days left');
  assert.strictEqual(details.signup_label, 'Joining closes on 21 Oct 2026');
  console.log('PASS: Case 1B — Mid-window Wednesday Oct 14 (8 days remaining)');
}

// Case 1C: Last second of the last day (2026-10-21 23:59:59 WAT = 2026-10-21T22:59:59.000Z)
{
  const tLastSec = '2026-10-21T22:59:59.000Z';
  const open = registrationOpen(cfg, tLastSec);
  const details = getJoinWindowDetails(cfg, tLastSec);
  assert.strictEqual(open, true, 'Window must remain open at 23:59:59 WAT on last day');
  assert.strictEqual(details.registration_open, true);
  assert.strictEqual(details.days_remaining, 1, 'Last day must have 1 day remaining');
  assert.strictEqual(details.status_summary, 'Started Mon 12 Oct 2026 · Joining closes Wed 21 Oct 2026 · 1 day left');
  console.log('PASS: Case 1C — Last second of last day (23:59:59 WAT open, 1 day left)');
}

// Case 1D: One second after last day (2026-10-22 00:00:00 WAT = 2026-10-21T23:00:00.000Z)
{
  const tClosed = '2026-10-21T23:00:00.000Z';
  const open = registrationOpen(cfg, tClosed);
  const details = getJoinWindowDetails(cfg, tClosed);
  assert.strictEqual(open, false, 'Window must be closed at 00:00:00 WAT on day 11');
  assert.strictEqual(details.registration_open, false);
  assert.strictEqual(details.days_remaining, 0, 'Closed window must have 0 days remaining');
  assert.strictEqual(details.status_summary, 'Started Mon 12 Oct 2026 · Joining closed Wed 21 Oct 2026');
  assert.strictEqual(details.signup_label, 'Joining has closed');
  console.log('PASS: Case 1D — One second after last day (00:00:00 WAT closed, 0 days left)');
}

// Case 1E: Start time near midnight WAT (e.g. 2026-10-12T22:59:00Z = 23:59:00 WAT on 2026-10-12)
{
  const cfgMidnight = {
    started: true,
    start_at: '2026-10-12T22:59:00.000Z',
    join_window_closes_at: '2026-10-22',
  };
  const detailsStart = getJoinWindowDetails(cfgMidnight, '2026-10-12T22:59:30.000Z');
  assert.strictEqual(detailsStart.start_date, '2026-10-12');
  assert.strictEqual(detailsStart.days_remaining, 10);
  assert.strictEqual(detailsStart.join_window_last_day, '2026-10-21');

  // Verify it still closes at 23:59:59 WAT on 2026-10-21
  assert.strictEqual(registrationOpen(cfgMidnight, '2026-10-21T22:59:59.000Z'), true);
  assert.strictEqual(registrationOpen(cfgMidnight, '2026-10-21T23:00:00.000Z'), false);
  console.log('PASS: Case 1E — Start time near midnight WAT correctly anchors to start date');
}

// 2. Programme End Date & Calendar Rule Tests
console.log('\n--- Programme End Date & Calendar Generation Tests ---');
{
  // Test 2A: Start Monday 2026-10-12
  const planStart = generateReadingDayDates('2026-10-12', 50);
  assert.strictEqual(planStart.length, 50, 'Plan must contain exactly 50 days');
  assert.strictEqual(planStart[0].date, '2026-10-12', 'Day 1 must be 2026-10-12');
  assert.strictEqual(planStart[49].date, '2026-12-20', 'Day 50 must be 2026-12-20');

  // Test 2B: Latest possible joiner: Wednesday 2026-10-21
  const planLatest = generateReadingDayDates('2026-10-21', 50);
  assert.strictEqual(planLatest.length, 50);
  assert.strictEqual(planLatest[0].date, '2026-10-21', 'Latest joiner Day 1 must be 2026-10-21');
  assert.strictEqual(planLatest[49].date, '2026-12-28', 'Latest joiner Day 50 must be 2026-12-28');
  assert.strictEqual(day50Date('2026-10-21'), '2026-12-28');
  console.log('PASS: Case 2A & 2B — Oct 12 start ends 2026-12-20; Oct 21 start ends 2026-12-28');

  // Test 2C: Verify NO reading day is ever on Tuesday (2) or Friday (5) across all 50 days
  for (const day of planLatest) {
    const wd = new Date(day.date + 'T00:00:00Z').getUTCDay();
    assert(!EXCLUDED_WEEKDAYS.includes(wd), `Reading day ${day.day_number} (${day.date}) fell on excluded weekday ${wd}`);
  }
  console.log('PASS: Case 2C — Verified all 50 days strictly exclude Tuesdays and Fridays');
}

console.log('\nALL ITEM 1 UNIT TESTS PASSED SUCCESSFULLY!');
