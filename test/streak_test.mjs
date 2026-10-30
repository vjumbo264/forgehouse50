import assert from 'assert';
import { streaks } from '../functions/lib/points.mjs';

console.log("=== Running Streak Calculation Tests ===");

const calendarRows = [
  { day_number: 1, date: '2026-10-19' },
  { day_number: 2, date: '2026-10-21' },
  { day_number: 3, date: '2026-10-22' },
  { day_number: 4, date: '2026-10-24' },
];

function createMockDb(progressList) {
  return {
    batch: async () => [],
    prepare: (sql) => {
      if (sql.includes('reading_progress')) {
        return {
          bind: () => ({
            all: async () => ({ results: progressList })
          })
        };
      }
      if (sql.includes('user_reading_days')) {
        return {
          bind: () => ({
            all: async () => ({ results: calendarRows })
          })
        };
      }
      if (sql.includes('profiles')) {
        return {
          bind: () => ({
            first: async () => ({ programme_start_date: '2026-10-19' })
          })
        };
      }
      return {
        bind: () => ({
          all: async () => ({ results: [] }),
          first: async () => null,
          run: async () => ({ meta: { changes: 1 } })
        })
      };
    }
  };
}

// Case A: Day 1 completed on time
const dbA = createMockDb([
  { day_number: 1, completed_at: '2026-10-19T10:00:00Z', updated_at: '2026-10-19T10:00:00Z' }
]);
const resA = await streaks(dbA, 'u1');
console.log("Case A:", resA);
assert.strictEqual(resA.longest, 1);

// Case B: Days 1 & 2 across rest day
const dbB = createMockDb([
  { day_number: 1, completed_at: '2026-10-19T10:00:00Z', updated_at: '2026-10-19T10:00:00Z' },
  { day_number: 2, completed_at: '2026-10-21T10:00:00Z', updated_at: '2026-10-21T10:00:00Z' },
]);
const resB = await streaks(dbB, 'u1');
console.log("Case B:", resB);
assert.strictEqual(resB.longest, 2);

console.log("ALL STREAK TESTS VERIFIED SUCCESSFULLY!");
