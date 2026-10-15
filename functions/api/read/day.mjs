// GET /api/read/day?n=&day= — a reading day's assignments + this user's state.
// Accepts both 'n' and 'day' query parameters for client compatibility.
import { json, badRequest } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { estimateMinutes, ensureUserCalendar, userDayMap, TOTAL_DAYS } from '../../lib/calendar.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const n = parseInt(url.searchParams.get('n') || url.searchParams.get('day') || '0', 10);
  if (!n || n < 1 || n > TOTAL_DAYS) return badRequest('A reading day between 1 and 50 is required');

  const { rows } = await ensureUserCalendar(env.DB, user.id);
  const date = userDayMap(rows).get(n);
  if (!date) return badRequest('Unknown reading day');

  const { results: assignments } = await env.DB.prepare(
    'SELECT book, chapter_start, chapter_end, chapter_count FROM reading_assignments WHERE day_number = ? ORDER BY rowid'
  ).bind(n).all();

  const progress = await env.DB.prepare(
    'SELECT completed, completed_at, reading_seconds, chapters_read FROM reading_progress WHERE user_id = ? AND day_number = ?'
  ).bind(user.id, n).first();

  const chapters = (assignments || []).reduce((s, a) => s + a.chapter_count, 0);

  return json({
    day_number: n,
    date,
    assignments: assignments || [],
    chapter_count: chapters,
    est_minutes: estimateMinutes(chapters),
    progress: progress || { completed: 0, reading_seconds: 0, chapters_read: 0 },
  });
}
