// seed/calendar.mjs — generates the 50-day reading calendar and emits SQL
// to seed reading_days + reading_assignments. Run via:
//   node seed/calendar.mjs > seed/seed.sql
// then apply to D1 (wrangler d1 execute --file=seed/seed.sql --remote).
//
// Rules: start Mon 2026-09-07; skip every Tuesday & Friday; exactly 50
// reading days; 260 NT chapters (6/day days 1–10, 5/day after).

import { generatePlan, estimateMinutes, ntChapterTotal, TOTAL_DAYS, TOTAL_CHAPTERS } from '../functions/lib/calendar.mjs';

const plan = generatePlan();

// Sanity checks (fail loudly rather than seed a wrong calendar).
if (plan.length !== TOTAL_DAYS) throw new Error(`expected ${TOTAL_DAYS} days, got ${plan.length}`);
if (ntChapterTotal() !== TOTAL_CHAPTERS) throw new Error('NT chapter total mismatch');
for (const d of plan) {
  const wd = new Date(d.date + 'T00:00:00Z').getUTCDay();
  if (wd === 2 || wd === 5) throw new Error(`day ${d.day_number} (${d.date}) falls on excluded weekday ${wd}`);
}
const totalAssigned = plan.reduce((s, d) => s + d.chapter_count, 0);
if (totalAssigned !== TOTAL_CHAPTERS) throw new Error(`assigned ${totalAssigned} chapters`);

// Emit SQL
const lines = [];
lines.push('-- ForgeHouse 50 — reading calendar seed (generated; do not hand-edit dates)');
lines.push('DELETE FROM reading_assignments;');
lines.push('DELETE FROM reading_days;');
for (const d of plan) {
  lines.push(`INSERT INTO reading_days (day_number, date, label) VALUES (${d.day_number}, '${d.date}', 'Reading Day ${d.day_number}');`);
  for (const a of d.assignments) {
    const id = `ra-${d.day_number}-${a.book.replace(/[^a-z0-9]/gi, '').toLowerCase()}-${a.chapter_start}`;
    lines.push(`INSERT INTO reading_assignments (id, day_number, book, chapter_start, chapter_end, chapter_count, est_minutes) VALUES ('${id}', ${d.day_number}, '${a.book.replace(/'/g, "''")}', ${a.chapter_start}, ${a.chapter_end}, ${a.chapter_count}, ${estimateMinutes(a.chapter_count)});`);
  }
}
console.log(lines.join('\n'));

// Human-readable summary to stderr so it doesn't pollute the SQL.
const first = plan[0], last = plan[plan.length - 1];
console.error(`OK: ${plan.length} reading days, ${totalAssigned} chapters`);
console.error(`Starts ${first.date} (day ${first.day_number}), ends ${last.date} (day ${last.day_number})`);
console.error('First 5 days:', plan.slice(0, 5).map(d => `${d.day_number}:${d.date}`).join(' '));
