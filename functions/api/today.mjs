// GET /api/today — today's programme status + assignment (authenticated).
import { json } from '../lib/http.mjs';
import { requireUser } from '../lib/auth.mjs';
import { classifyDate, estimateMinutes } from '../lib/calendar.mjs';
import { userAggregates } from '../lib/points.mjs';

function todayUtc() { return new Date().toISOString().slice(0, 10); }

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const today = todayUtc();
  const { results: allDays } = await env.DB.prepare(
    'SELECT day_number, date FROM reading_days ORDER BY day_number'
  ).all();
  const byDate = new Map((allDays || []).map(d => [d.date, d.day_number]));

  const status = classifyDate(today, byDate);
  const todayDayNumber = byDate.get(today) || null;

  // Next reading day (today if it's one and not yet completed, else next upcoming).
  const upcoming = (allDays || []).filter(d => d.date >= today);
  const nextDay = upcoming[0] || null;

  async function assignmentFor(dayNumber) {
    if (!dayNumber) return null;
    const { results } = await env.DB.prepare(
      'SELECT book, chapter_start, chapter_end, chapter_count, est_minutes FROM reading_assignments WHERE day_number = ? ORDER BY rowid'
    ).bind(dayNumber).all();
    const chapters = (results || []).reduce((s, a) => s + a.chapter_count, 0);
    const first = results?.[0], last = results?.[results.length - 1];
    return {
      day_number: dayNumber,
      assignments: results || [],
      chapter_count: chapters,
      est_minutes: estimateMinutes(chapters),
      summary: first ? (first.book === last.book
        ? `${first.book} ${first.chapter_start}–${last.chapter_end}`
        : `${first.book} ${first.chapter_start} – ${last.book} ${last.chapter_end}`) : '',
    };
  }

  const progress = todayDayNumber
    ? await env.DB.prepare('SELECT completed, reading_seconds FROM reading_progress WHERE user_id = ? AND day_number = ?')
        .bind(user.id, todayDayNumber).first()
    : null;

  const stats = await userAggregates(env.DB, user.id);

  return json({
    date: today,
    status,                                  // reading | tuesday_prayer | friday_prayer_study | rest
    is_reading_day: status === 'reading',
    today: todayDayNumber ? {
      day_number: todayDayNumber,
      completed: !!progress?.completed,
      reading_seconds: progress?.reading_seconds ?? 0,
      assignment: await assignmentFor(todayDayNumber),
    } : null,
    next_reading_day: nextDay ? { day_number: nextDay.day_number, date: nextDay.date, assignment: await assignmentFor(nextDay.day_number) } : null,
    stats,
    programme: { total_days: 50, total_chapters: 260 },
  });
}
