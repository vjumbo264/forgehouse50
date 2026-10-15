// /api/admin/users/:id — GET (detail with per-day stats), DELETE/POST (delete participant)
import { json, badRequest, forbidden, notFound, readJson } from '../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../lib/auth.mjs';
import { deleteUserRecord } from '../../../lib/delete_user.mjs';

// GET /api/admin/users/:id — Participant detail (Item 4.1)
// Returns per-day rows (day number, date, status, completed_at, reading_seconds, quiz score, points earned that day)
// and totals (total reading time, average per completed day). NEVER returns note text.
export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const userId = String(params.id || '').trim();
  if (!userId) return badRequest('User ID is required');

  const profile = await env.DB.prepare(
    `SELECT id, name, surname, email, role, avatar_id, created_at, programme_start_date
     FROM profiles WHERE id = ?`
  ).bind(userId).first();

  if (!profile) return notFound('Participant not found');

  // Aggregates (reading time, days completed, points, note counts only — NO note text)
  const aggregates = await env.DB.prepare(
    `SELECT
       COALESCE((SELECT SUM(points) FROM points WHERE user_id = ?), 0) AS total_points,
       COALESCE((SELECT COUNT(*) FROM reading_progress WHERE user_id = ? AND completed = 1), 0) AS days_completed,
       COALESCE((SELECT SUM(reading_seconds) FROM reading_progress WHERE user_id = ?), 0) AS total_reading_seconds,
       COALESCE((SELECT COUNT(*) FROM notes WHERE user_id = ?), 0) AS notes_count,
       COALESCE((SELECT COUNT(*) FROM notes WHERE user_id = ? AND note_type = 'observation'), 0) AS observations_count,
       COALESCE((SELECT COUNT(*) FROM notes WHERE user_id = ? AND note_type = 'question'), 0) AS questions_count`
  ).bind(userId, userId, userId, userId, userId, userId).first();

  const totalPoints = aggregates?.total_points ?? 0;
  const daysCompleted = aggregates?.days_completed ?? 0;
  const totalReadingSec = aggregates?.total_reading_seconds ?? 0;
  const avgReadingSec = daysCompleted > 0 ? Math.round(totalReadingSec / daysCompleted) : 0;

  // Calendar dates
  const { results: calRows } = await env.DB.prepare(
    `SELECT day_number, date, label FROM user_reading_days WHERE user_id = ? ORDER BY day_number`
  ).bind(userId).all();
  const calMap = new Map((calRows || []).map(r => [r.day_number, r.date]));

  // Reading progress
  const { results: progRows } = await env.DB.prepare(
    `SELECT day_number, completed, completed_at, reading_seconds, first_opened_at, chapters_read
     FROM reading_progress WHERE user_id = ? ORDER BY day_number`
  ).bind(userId).all();
  const progMap = new Map((progRows || []).map(r => [r.day_number, r]));

  // Quiz attempts
  const { results: quizRows } = await env.DB.prepare(
    `SELECT day_number, score, total, passed, created_at FROM quiz_attempts WHERE user_id = ? ORDER BY day_number`
  ).bind(userId).all();
  const quizMap = new Map((quizRows || []).map(r => [r.day_number, r]));

  // Points per day
  const { results: ptRows } = await env.DB.prepare(
    `SELECT day_number, SUM(points) AS day_points FROM points WHERE user_id = ? AND day_number IS NOT NULL GROUP BY day_number`
  ).bind(userId).all();
  const ptMap = new Map((ptRows || []).map(r => [r.day_number, r.day_points]));

  // Find latest completed day
  let latestCompletedDay = 0;
  let latestCompletedAt = '';
  for (const p of (progRows || [])) {
    if (p.completed && p.completed_at) {
      if (!latestCompletedAt || p.completed_at > latestCompletedAt) {
        latestCompletedAt = p.completed_at;
        latestCompletedDay = p.day_number;
      }
    }
  }

  const days = [];
  for (let d = 1; d <= 50; d++) {
    const p = progMap.get(d);
    const q = quizMap.get(d);
    const isCompleted = Boolean(p?.completed);
    days.push({
      day_number: d,
      date: calMap.get(d) || null,
      status: isCompleted ? 'completed' : ((p?.reading_seconds ?? 0) > 0 ? 'in_progress' : 'pending'),
      completed: isCompleted,
      completed_at: p?.completed_at || null,
      reading_seconds: p?.reading_seconds ?? 0,
      quiz_score: q ? `${q.score}/${q.total}` : null,
      quiz_score_raw: q ? q.score : null,
      quiz_total_raw: q ? q.total : null,
      points_earned: ptMap.get(d) ?? 0,
      is_latest_completed: (d === latestCompletedDay && isCompleted),
    });
  }

  const fullName = [profile.name, profile.surname].filter(Boolean).join(' ').trim() || profile.name || 'Member';

  // Check picture_version if profile_pictures table exists
  let pictureVersion = null;
  try {
    const pic = await env.DB.prepare('SELECT version FROM profile_pictures WHERE user_id = ?').bind(userId).first();
    if (pic) pictureVersion = pic.version;
  } catch {}

  return json({
    participant: {
      id: profile.id,
      name: profile.name,
      surname: profile.surname || '',
      full_name: fullName,
      email: profile.email,
      role: profile.role,
      avatar_id: profile.avatar_id,
      picture_version: pictureVersion,
      created_at: profile.created_at,
      programme_start_date: profile.programme_start_date,
      total_points: totalPoints,
      days_completed: daysCompleted,
      total_reading_seconds: totalReadingSec,
      average_reading_seconds_per_completed_day: avgReadingSec,
      notes_count: aggregates?.notes_count ?? 0,
      observations_count: aggregates?.observations_count ?? 0,
      questions_count: aggregates?.questions_count ?? 0,
      latest_completed_day: latestCompletedDay || null,
      days,
    }
  });
}

// DELETE or POST /api/admin/users/:id (existing delete logic)
async function handleDelete({ request, env, params }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const userId = String(params.id || '').trim();
  if (!userId) return badRequest('User ID is required');

  const body = (await readJson(request)) || {};
  const url = new URL(request.url);
  const confirm = String(body.confirm || body.confirm_name || body.confirm_email || url.searchParams.get('confirm') || '').trim();
  if (!confirm) return badRequest('Confirmation required');

  const target = await env.DB.prepare('SELECT id, name, surname, email, role FROM profiles WHERE id = ?').bind(userId).first();
  if (!target) return notFound('User not found');

  try {
    const result = await deleteUserRecord(env.DB, user.id, target, confirm);
    return json({ ok: true, deleted_user_id: userId, display_name: result.display_name });
  } catch (err) {
    return badRequest(err.message);
  }
}

export async function onRequestDelete(ctx) { return handleDelete(ctx); }
export async function onRequestPost(ctx) { return handleDelete(ctx); }
