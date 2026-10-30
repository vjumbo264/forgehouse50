import assert from 'assert';
import { getWatDateAndMinutes, getRestDayStatus } from '../functions/lib/rest_day.mjs';

console.log("=== Running Rest Day Catch-up Tests ===");

// Test 1: getWatDateAndMinutes on Tuesday 18:30 WAT (before 19:00 cutoff)
// 2026-10-27 was a Tuesday. 18:30 WAT is 17:30 UTC.
const tueBeforeCutoff = new Date('2026-10-27T17:30:00Z').getTime();
const wat1 = getWatDateAndMinutes(tueBeforeCutoff);
assert.strictEqual(wat1.weekday, 'Tue');
assert.strictEqual(wat1.isRestDay, true);
assert.strictEqual(wat1.hour, 18);
assert.strictEqual(wat1.minute, 30);

// Mock DB with 19:00 cutoff setting
const mockDb = {
  prepare: (sql) => ({
    first: async () => ({ value: '19:00' }),
    all: async () => ({ results: [{ key: 'rest_day_catchup_cutoff_time', value: '19:00' }] })
  })
};

const status1 = await getRestDayStatus(mockDb, tueBeforeCutoff);
assert.strictEqual(status1.is_rest_day, true);
assert.strictEqual(status1.catchup_allowed, true);
console.log("✓ Tuesday 18:30 WAT: catch-up is ALLOWED");

// Test 2: Tuesday 19:05 WAT (after 19:00 cutoff)
// 19:05 WAT is 18:05 UTC.
const tueAfterCutoff = new Date('2026-10-27T18:05:00Z').getTime();
const status2 = await getRestDayStatus(mockDb, tueAfterCutoff);
assert.strictEqual(status2.is_rest_day, true);
assert.strictEqual(status2.catchup_allowed, false);
assert.strictEqual(status2.message, 'Catch-up closes at 7pm today for Bible Study, continue tomorrow.');
console.log("✓ Tuesday 19:05 WAT: catch-up is CLOSED ('Catch-up closes at 7pm today for Bible Study, continue tomorrow.')");

// Test 3: Friday 14:00 WAT (before cutoff) and Friday 20:00 WAT (after cutoff)
// 2026-10-30 is a Friday.
const friBefore = new Date('2026-10-30T13:00:00Z').getTime(); // 14:00 WAT
const friAfter = new Date('2026-10-30T19:30:00Z').getTime();  // 20:30 WAT
const statusFri1 = await getRestDayStatus(mockDb, friBefore);
const statusFri2 = await getRestDayStatus(mockDb, friAfter);
assert.strictEqual(statusFri1.is_rest_day, true);
assert.strictEqual(statusFri1.catchup_allowed, true);
assert.strictEqual(statusFri2.is_rest_day, true);
assert.strictEqual(statusFri2.catchup_allowed, false);
console.log("✓ Friday tests passed (allowed at 14:00, closed at 20:30)");

// Test 4: Wednesday (normal reading day)
// 2026-10-28 was Wednesday
const wedTime = new Date('2026-10-28T20:00:00Z').getTime();
const statusWed = await getRestDayStatus(mockDb, wedTime);
assert.strictEqual(statusWed.is_rest_day, false);
assert.strictEqual(statusWed.catchup_allowed, true);
console.log("✓ Wednesday (normal reading day): is_rest_day=false, catchup_allowed=true (always open)");

console.log("ALL REST DAY CATCH-UP TESTS PASSED!");
