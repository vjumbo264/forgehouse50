// GET /api/progress — full day 1–50 breakdown + totals for the current user.
// per_user_calendar_and_quiz_v1: each day's date is THIS user's own date
// (user_reading_days). quiz_redesign_and_launch_wipe_v1: quiz state per day is
// INFORMATIONAL only (at most one attempt, score shown) — never a gate.
import { json } from '../lib/http.mjs';
import { requireUser } from '../lib/auth.mjs';
import { userAggregates } from '../lib/points.mjs';
import { ensureUserCalendar, utcToday, TOTAL_DAYS } from '../lib/calendar.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const { startDate, rows: calRows } = await ensureUserCalendar(env.DB, user.id);
  const today = utcToday();

  const [progressRows, noteCounts, stats, quizRows] = await Promise.all([
    env.DB.prepare('SELECT day_number, completed, reading_seconds, chapters_read FROM reading_progress WHERE user_id = ?').bind(user.id).all(),
    env.DB.prepare('SELECT day_number, COUNT(*) AS c FROM notes WHERE user_id = ? GROUP BY day_number').bind(user.id).all(),
    userAggregates(env.DB, user.id),
    // at most ONE attempt row per day (unique index idx_quiz_one_attempt)
    env.DB.prepare('SELECT day_number, score, total, passed FROM quiz_attempts WHERE user_id = ?').bind(user.id).all(),
  ]);

  const progressByDay = new Map((progressRows.results || []).map(r => [r.day_number, r]));
  const notesByDay = new Map((noteCounts.results || []).map(r => [r.day_number, r.c]));
  const quizByDay = new Map((quizRows.results || []).map(r => [r.day_number, r]));

  const { results: assignmentRows } = await env.DB.prepare(
    'SELECT day_number, book, chapter_start, chapter_end, chapter_count FROM reading_assignments ORDER BY day_number, rowid'
  ).all();
  const assignByDay = new Map();
  for (const a of assignmentRows || []) {
    if (!assignByDay.has(a.day_number)) assignByDay.set(a.day_number, []);
    assignByDay.get(a.day_number).push(a);
  }

  const daysOut = (calRows || []).map(d => {
    const p = progressByDay.get(d.day_number);
    const q = quizByDay.get(d.day_number);  // single-attempt row (or none = quiz not taken, 0 quiz pts)
    const assignments = assignByDay.get(d.day_number) || [];
    const first = assignments[0], last = assignments[assignments.length - 1];
    return {
      day_number: d.day_number,
      date: d.date,                          // this user's own date
      assignment: first ? (first.book === last.book
        ? `${first.book} ${first.chapter_start}–${last.chapter_end}`
        : `${first.book} ${first.chapter_start} – ${last.book} ${last.chapter_end}`) : '',
      chapter_count: assignments.reduce((s, a) => s + a.chapter_count, 0),
      completed: !!p?.completed,
      quiz_taken: !!q,                       // one attempt max; informational only
      quiz_score: q?.score ?? null,
      quiz_total: q?.total ?? null,
      quiz_passed_info: !!(q?.passed),       // informational flag, never a gate
      is_future: d.date > today,
      reading_seconds: p?.reading_seconds ?? 0,
      notes_count: notesByDay.get(d.day_number) ?? 0,
    };
  });

  return json({
    start_date: startDate,
    days: daysOut,
    totals: {
      chapters_completed: stats.chapters,
      percent_completed: Math.round((stats.chapters / 260) * 1000) / 10,
      reading_days_completed: stats.days_completed,
      streak_current: stats.streak_current,
      streak_longest: stats.streak_longest,
      reading_seconds_total: stats.reading_seconds,
    },
    programme: { total_days: TOTAL_DAYS },
  });
}
