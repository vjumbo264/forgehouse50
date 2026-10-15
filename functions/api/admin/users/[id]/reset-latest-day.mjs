// POST /api/admin/users/:id/reset-latest-day — Item 4.3
// Admin only, atomic batch reversal of the user's most recently completed day.
import { json, badRequest, forbidden, notFound, readJson, uuid } from '../../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../../lib/auth.mjs';
import { streaks } from '../../../../lib/points.mjs';

export async function onRequestPost({ request, env, params }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const userId = String(params.id || '').trim();
  if (!userId) return badRequest('User ID is required');

  const target = await env.DB.prepare('SELECT id, name, surname, email, role FROM profiles WHERE id = ?').bind(userId).first();
  if (!target) return notFound('Participant not found');
  if (target.role === 'admin') return forbidden('Admin accounts operate the programme and cannot be targeted');

  const body = (await readJson(request)) || {};
  const requestId = String(body.request_id || request.headers.get('x-request-id') || '').trim();

  // Idempotency: if request_id matches a recently processed reset
  if (requestId) {
    const existingAudit = await env.DB.prepare(
      "SELECT id, target_user_id, day_number, points_reversed, created_at FROM admin_audit WHERE request_id = ? AND action = 'reset_latest_day'"
    ).bind(requestId).first();
    if (existingAudit) {
      return json({
        ok: true,
        already_processed: true,
        action: 'reset_latest_day',
        target_user_id: existingAudit.target_user_id,
        day_number: existingAudit.day_number,
        points_reversed: existingAudit.points_reversed,
      });
    }
  }

  // 1. Target the user's most recently completed reading day (by completed_at DESC, day_number DESC)
  const latestCompleted = await env.DB.prepare(
    `SELECT day_number, completed_at, reading_seconds, first_opened_at, chapters_read
     FROM reading_progress
     WHERE user_id = ? AND completed = 1
     ORDER BY completed_at DESC, day_number DESC LIMIT 1`
  ).bind(userId).first();

  if (!latestCompleted) {
    return badRequest('User has no completed reading days to reset');
  }

  const dayNumber = latestCompleted.day_number;
  const prevReadingSec = latestCompleted.reading_seconds ?? 0;

  // 2. Exact points that day awarded
  const pointsRows = await env.DB.prepare(
    `SELECT id, action, points FROM points WHERE user_id = ? AND day_number = ? AND action != 'admin_adjustment'`
  ).bind(userId, dayNumber).all();

  let pointsReversed = (pointsRows?.results || []).reduce((acc, r) => acc + (r.points || 0), 0);

  // If day 50, also reverse programme_completed if awarded
  if (dayNumber >= 50) {
    const progRow = await env.DB.prepare(
      `SELECT id, points FROM points WHERE user_id = ? AND action = 'programme_completed'`
    ).bind(userId).first();
    if (progRow) {
      pointsReversed += progRow.points || 0;
    }
  }

  // 3. Quiz attempt to clear
  const quizAttempt = await env.DB.prepare(
    `SELECT score, total FROM quiz_attempts WHERE user_id = ? AND day_number = ?`
  ).bind(userId, dayNumber).first();
  const prevQuizScore = quizAttempt ? `${quizAttempt.score}/${quizAttempt.total}` : null;

  // 4. Atomic transaction / batch
  const now = new Date().toISOString();
  const displayName = [target.name, target.surname].filter(Boolean).join(' ').trim() || target.name || 'Member';
  const auditId = uuid();

  const statements = [
    // Reverse points awarded by this day
    env.DB.prepare(`DELETE FROM points WHERE user_id = ? AND day_number = ? AND action != 'admin_adjustment'`).bind(userId, dayNumber),
    // Clear quiz attempt
    env.DB.prepare(`DELETE FROM quiz_attempts WHERE user_id = ? AND day_number = ?`).bind(userId, dayNumber),
    // Reset reading progress: completed=0, timer=0, stamps cleared
    env.DB.prepare(
      `UPDATE reading_progress
       SET completed = 0,
           completed_at = NULL,
           reading_seconds = 0,
           first_opened_at = NULL,
           final_chapter_reached_at = NULL,
           time_source = 'client',
           chapters_read = 0,
           updated_at = ?
       WHERE user_id = ? AND day_number = ?`
    ).bind(now, userId, dayNumber),
    // Write admin audit record
    env.DB.prepare(
      `INSERT INTO admin_audit (id, admin_id, action, target_user_id, target_display_name, day_number, points_reversed, previous_reading_seconds, previous_quiz_score, request_id, created_at)
       VALUES (?, ?, 'reset_latest_day', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(auditId, user.id, userId, displayName, dayNumber, pointsReversed, prevReadingSec, prevQuizScore, requestId || null, now),
  ];

  if (dayNumber >= 50) {
    statements.push(env.DB.prepare(`DELETE FROM points WHERE user_id = ? AND action = 'programme_completed'`).bind(userId));
    statements.push(env.DB.prepare(`DELETE FROM user_badges WHERE user_id = ? AND badge_id = 'finisher-50'`).bind(userId));
  }

  await env.DB.batch(statements);

  // 5. Recompute streak and badges
  const { current: newStreak, longest: newLongest } = await streaks(env.DB, userId);

  const remainingDone = await env.DB.prepare(
    `SELECT COUNT(*) AS c, COALESCE(SUM(reading_seconds),0) AS sec FROM reading_progress WHERE user_id = ? AND completed = 1`
  ).bind(userId).first();
  const newDaysCompleted = remainingDone?.c ?? 0;
  const newReadingSeconds = remainingDone?.sec ?? 0;

  // Revoke badges that are no longer met
  if (newDaysCompleted < 50) {
    await env.DB.prepare(`DELETE FROM user_badges WHERE user_id = ? AND badge_id = 'finisher-50'`).bind(userId).run();
  }
  const totalChaptersRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(chapters_read),0) AS chapters FROM reading_progress WHERE user_id = ? AND completed = 1`
  ).bind(userId).first();
  const chapters = totalChaptersRow?.chapters ?? 0;
  if (chapters < 260) await env.DB.prepare(`DELETE FROM user_badges WHERE user_id = ? AND badge_id = 'chapters-260'`).bind(userId).run();
  if (chapters < 200) await env.DB.prepare(`DELETE FROM user_badges WHERE user_id = ? AND badge_id = 'chapters-200'`).bind(userId).run();
  if (chapters < 100) await env.DB.prepare(`DELETE FROM user_badges WHERE user_id = ? AND badge_id = 'chapters-100'`).bind(userId).run();

  const newTotalPointsRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(points),0) AS pts FROM points WHERE user_id = ?`
  ).bind(userId).first();
  const newTotalPoints = newTotalPointsRow?.pts ?? 0;

  return json({
    ok: true,
    action: 'reset_latest_day',
    target_user_id: userId,
    target_display_name: displayName,
    day_number: dayNumber,
    points_reversed: pointsReversed,
    previous_reading_seconds: prevReadingSec,
    previous_quiz_score: prevQuizScore,
    new_totals: {
      points: newTotalPoints,
      days_completed: newDaysCompleted,
      reading_seconds: newReadingSeconds,
      streak_current: newStreak,
      streak_longest: newLongest,
    }
  });
}
