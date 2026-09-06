// GET /api/progress — full day 1–50 breakdown + totals for the current user.
import { json } from '../lib/http.mjs';
import { requireUser } from '../lib/auth.mjs';
import { userAggregates } from '../lib/points.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const [days, progressRows, noteCounts, stats] = await Promise.all([
    env.DB.prepare('SELECT day_number, date FROM reading_days ORDER BY day_number').all(),
    env.DB.prepare('SELECT day_number, completed, reading_seconds, chapters_read FROM reading_progress WHERE user_id = ?').bind(user.id).all(),
    env.DB.prepare('SELECT day_number, COUNT(*) AS c FROM notes WHERE user_id = ? GROUP BY day_number').bind(user.id).all(),
    userAggregates(env.DB, user.id),
  ]);

  const progressByDay = new Map((progressRows.results || []).map(r => [r.day_number, r]));
  const notesByDay = new Map((noteCounts.results || []).map(r => [r.day_number, r.c]));

  const { results: assignmentRows } = await env.DB.prepare(
    'SELECT day_number, book, chapter_start, chapter_end, chapter_count FROM reading_assignments ORDER BY day_number, rowid'
  ).all();
  const assignByDay = new Map();
  for (const a of assignmentRows || []) {
    if (!assignByDay.has(a.day_number)) assignByDay.set(a.day_number, []);
    assignByDay.get(a.day_number).push(a);
  }

  const daysOut = (days.results || []).map(d => {
    const p = progressByDay.get(d.day_number);
    const assignments = assignByDay.get(d.day_number) || [];
    const first = assignments[0], last = assignments[assignments.length - 1];
    return {
      day_number: d.day_number,
      date: d.date,
      assignment: first ? (first.book === last.book
        ? `${first.book} ${first.chapter_start}–${last.chapter_end}`
        : `${first.book} ${first.chapter_start} – ${last.book} ${last.chapter_end}`) : '',
      chapter_count: assignments.reduce((s, a) => s + a.chapter_count, 0),
      completed: !!p?.completed,
      reading_seconds: p?.reading_seconds ?? 0,
      notes_count: notesByDay.get(d.day_number) ?? 0,
    };
  });

  return json({
    days: daysOut,
    totals: {
      chapters_completed: stats.chapters,
      percent_completed: Math.round((stats.chapters / 260) * 1000) / 10,
      reading_days_completed: stats.days_completed,
      streak_current: stats.streak_current,
      streak_longest: stats.streak_longest,
      reading_seconds_total: stats.reading_seconds,
    },
  });
}
