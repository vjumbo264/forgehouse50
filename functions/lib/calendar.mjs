// Reading-day calendar generator — the single source of truth for the
// programme schedule. Pure functions; shared by the seed script and the API.
//
// Rules (non-negotiable):
//   start Monday 2026-09-07; Tuesdays & Fridays are NEVER reading days;
//   exactly 50 reading days; 260 NT chapters distributed 6/day for the
//   first 10 days, then 5/day (10*6 + 40*5 = 260); contiguous book ranges.

export const START_DATE = '2026-09-07';
export const TOTAL_DAYS = 50;
export const TOTAL_CHAPTERS = 260;
export const EXCLUDED_WEEKDAYS = [2, 5]; // Tue, Fri (0 = Sunday)

export const NT_BOOKS = [
  ['Matthew', 28], ['Mark', 16], ['Luke', 24], ['John', 21], ['Acts', 28],
  ['Romans', 16], ['1 Corinthians', 16], ['2 Corinthians', 13], ['Galatians', 6],
  ['Ephesians', 6], ['Philippians', 4], ['Colossians', 4], ['1 Thessalonians', 5],
  ['2 Thessalonians', 3], ['1 Timothy', 6], ['2 Timothy', 4], ['Titus', 3],
  ['Philemon', 1], ['Hebrews', 13], ['James', 5], ['1 Peter', 5], ['2 Peter', 3],
  ['1 John', 5], ['2 John', 1], ['3 John', 1], ['Jude', 1], ['Revelation', 22],
];

export function ntChapterTotal() {
  return NT_BOOKS.reduce((sum, [, c]) => sum + c, 0); // 260
}

// Build the 50 reading-day dates, skipping Tuesdays and Fridays.
export function generateReadingDayDates(startDate = START_DATE, totalDays = TOTAL_DAYS) {
  const days = [];
  const cursor = new Date(startDate + 'T00:00:00Z');
  while (days.length < totalDays) {
    const wd = cursor.getUTCDay();
    if (!EXCLUDED_WEEKDAYS.includes(wd)) {
      days.push({ day_number: days.length + 1, date: cursor.toISOString().slice(0, 10) });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

// Flatten the NT into an ordered list of { book, chapter }.
function flattenChapters() {
  const all = [];
  for (const [book, count] of NT_BOOKS) {
    for (let ch = 1; ch <= count; ch++) all.push({ book, chapter: ch });
  }
  return all;
}

// Split a day's contiguous chapter slice into per-book assignments.
function splitIntoBooks(slice) {
  const out = [];
  let i = 0;
  while (i < slice.length) {
    const book = slice[i].book;
    let j = i;
    while (j < slice.length && slice[j].book === book) j++;
    out.push({
      book,
      chapter_start: slice[i].chapter,
      chapter_end: slice[j - 1].chapter,
      chapter_count: j - i,
    });
    i = j;
  }
  return out;
}

// Generate the full plan: 50 days, each with date + assignments.
export function generatePlan() {
  const dates = generateReadingDayDates();
  const chapters = flattenChapters();
  if (chapters.length !== TOTAL_CHAPTERS) throw new Error(`NT chapter total is ${chapters.length}, expected ${TOTAL_CHAPTERS}`);
  const base = Math.floor(TOTAL_CHAPTERS / TOTAL_DAYS);          // 5
  const extra = TOTAL_CHAPTERS % TOTAL_DAYS;                     // 10
  const plan = [];
  let idx = 0;
  for (const { day_number, date } of dates) {
    const count = base + (day_number <= extra ? 1 : 0);          // 6 for days 1-10, else 5
    const slice = chapters.slice(idx, idx + count);
    idx += count;
    plan.push({
      day_number,
      date,
      chapter_count: count,
      assignments: splitIntoBooks(slice).map(a => ({ ...a, day_number })),
    });
  }
  if (idx !== TOTAL_CHAPTERS) throw new Error(`assigned ${idx} chapters, expected ${TOTAL_CHAPTERS}`);
  return plan;
}

// Estimated minutes: ~4 minutes per chapter, minimum 10.
export function estimateMinutes(chapterCount) {
  return Math.max(10, Math.round(chapterCount * 4));
}

// Classify a calendar date for the dashboard.
// Returns: 'reading' | 'tuesday_prayer' | 'friday_prayer_study' | 'rest'
export function classifyDate(dateStr, planByDate) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const wd = d.getUTCDay();
  if (wd === 2) return 'tuesday_prayer';
  if (wd === 5) return 'friday_prayer_study';
  if (planByDate && planByDate.has(dateStr)) return 'reading';
  return 'rest';
}
