// POST /api/read/complete — marks a reading day complete and awards the
// day's non-quiz points. quiz_redesign_and_launch_wipe_v1 / task-w02+w03.
//
// The quiz is NO LONGER a gate (it never was before
// per_user_calendar_and_quiz_v1 introduced the gate): completion and its
// points (reading_completed +10, daily_streak +3, programme_completed +100)
// do NOT depend on the quiz in any way — a user may complete the day with a
// 0/5 quiz score, or with no quiz attempt at all. The quiz is purely
// informational/scoring (POST /api/quiz/submit, proportional quiz_score pts).
//
// Kept from the prior session (unchanged, UNRELATED to the quiz):
//   sequential  — day N-1 must be complete first (N > 1)
//   read-ahead  — N <= elapsed_days(today) + 1 (at most ONE day ahead)
// Points are idempotent via their UNIQUE(user_id, idempotency_key) keys.
import { json, badRequest, readJson, uuid, nowIso, conflict } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { awardPoints } from '../../lib/points.mjs';
import { ensureUserCalendar, elapsedDays, utcToday, TOTAL_DAYS } from '../../lib/calendar.mjs';

const BLOCK_MESSAGES = {
  previous_day_incomplete: 'Finish the previous reading day first — days must be completed in order.',
  read_ahead_limit: 'You can only read one day ahead — come back tomorrow to continue.',
};

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  const n = parseInt(body?.day_number ?? 0, 10);
  if (!n || n < 1 || n > TOTAL_DAYS) return badRequest('A reading day between 1 and 50 is required');

  // ── Idempotent: already complete ────────────────────────────────────────
  const progress = await env.DB.prepare(
    'SELECT completed FROM reading_progress WHERE user_id = ? AND day_number = ?'
  ).bind(user.id, n).first();
  if (progress?.completed) {
    return json({ ok: true, already_completed: true, day_number: n, points_awarded: 0 });
  }

  // ── Sequential + read-ahead guards (unchanged; unrelated to the quiz) ───
  const { rows } = await ensureUserCalendar(env.DB, user.id);
  const elapsed = elapsedDays(rows, utcToday());

  if (n > 1) {
    const prev = await env.DB.prepare(
      'SELECT completed FROM reading_progress WHERE user_id = ? AND day_number = ?'
    ).bind(user.id, n - 1).first();
    if (!prev?.completed) {
      return conflict(BLOCK_MESSAGES.previous_day_incomplete + ' (Complete Day ' + (n - 1) + ' first.)');
    }
  }
  if (n > elapsed + 1) {
    return conflict(BLOCK_MESSAGES.read_ahead_limit);
  }

  // ── Complete the day + award non-quiz points (idempotent) ───────────────
  const chapterRow = await env.DB.prepare(
    'SELECT COALESCE(SUM(chapter_count),0) AS chapters FROM reading_assignments WHERE day_number = ?'
  ).bind(n).first();
  const chapters = chapterRow?.chapters ?? 0;

  await env.DB.prepare(
    `INSERT INTO reading_progress (id, user_id, day_number, completed, completed_at, chapters_read)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(user_id, day_number) DO UPDATE SET
       completed = 1,
       completed_at = COALESCE(reading_progress.completed_at, excluded.completed_at),
       chapters_read = MAX(reading_progress.chapters_read, excluded.chapters_read),
       updated_at = ?`
  ).bind(uuid(), user.id, n, nowIso(), chapters, nowIso()).run();

  const reading = await awardPoints(env.DB, user.id, 'reading_completed', `reading_completed:${user.id}:${n}`, { dayNumber: n });
  const streak = await awardPoints(env.DB, user.id, 'daily_streak', `daily_streak:${user.id}:${n}`, { dayNumber: n });

  const done = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM reading_progress WHERE user_id = ? AND completed = 1'
  ).bind(user.id).first();
  let programme = { awarded: false, points: 0 };
  if ((done?.c ?? 0) >= TOTAL_DAYS) {
    programme = await awardPoints(env.DB, user.id, 'programme_completed', `programme_completed:${user.id}`);
  }

  return json({
    ok: true,
    day_number: n,
    points_awarded: reading.points + streak.points + programme.points,
  });
}

// Also accept PUT (some clients); identical handling.
export const onRequestPut = onRequestPost;
