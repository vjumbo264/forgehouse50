// GET /api/today — today's programme status + assignment (authenticated).
// per_user_calendar_and_quiz_v1: every date below is computed against THIS
// user's own calendar (user_reading_days), not the shared reading_days.
import { json } from '../lib/http.mjs';
import { requireUser } from '../lib/auth.mjs';
import { classifyUserDate, estimateMinutes, ensureUserCalendar, utcToday, userDateMap, elapsedDays, TOTAL_DAYS } from '../lib/calendar.mjs';
import { userAggregates } from '../lib/points.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const today = utcToday();
  const { startDate, rows } = await ensureUserCalendar(env.DB, user.id);
  const byDate = userDateMap(rows);

  const status = classifyUserDate(today, byDate);
  const todayDayNumber = byDate.get(today) || null;

  // Next reading day ON THE USER'S OWN SCHEDULE (today if it's one and not
  // yet completed, else the next upcoming one).
  const upcoming = (rows || []).filter(d => d.date >= today);
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

  // Catch-up mode: uncompleted days up to today on user schedule (Item 5)
  const uncompletedPast = await env.DB.prepare(`
    SELECT d.day_number, d.date
    FROM user_reading_days d
    LEFT JOIN reading_progress p ON p.user_id = ? AND p.day_number = d.day_number AND p.completed = 1
    WHERE d.user_id = ? AND d.date <= ? AND (p.completed IS NULL OR p.completed = 0)
    ORDER BY d.day_number ASC
  `).bind(user.id, user.id, today).all();
  const backlog = uncompletedPast?.results || [];
  const catchUpDays = [];
  for (const b of backlog.slice(0, 2)) {
    catchUpDays.push({
      day_number: b.day_number,
      date: b.date,
      assignment: await assignmentFor(b.day_number),
    });
  }

  const stats = await userAggregates(env.DB, user.id);

  return json({
    date: today,
    start_date: startDate,                   // this user's own Day 1
    elapsed_days: elapsedDays(rows, today),  // where their calendar places them today
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
    catch_up: {
      count: backlog.length,
      is_catch_up: backlog.length > 1,
      days: catchUpDays,
    },
    programme: { total_days: TOTAL_DAYS, total_chapters: 260 },
  });
}
