// GET /api/quiz/:day — the day's quiz questions (answers stripped), plus the
// user's single-attempt state and whether they may take it right now.
// quiz_redesign_and_launch_wipe_v1 — NO pass mark, NO retry, NOT a gate.
//
//   - The quiz is informational/scoring-only: it never blocks completing a
//     reading day. Completion lives at POST /api/read/complete.
//   - ONE attempt per user per day: if an attempt already exists its score is
//     returned and can_attempt=false (block_reason 'attempt_used').
//   - may-take rules (hard-checked again at submission): day N-1 complete and
//     at most one day ahead of the user's own schedule.
import { json, badRequest } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { ensureUserCalendar, elapsedDays, utcToday, userDayMap, TOTAL_DAYS } from '../../lib/calendar.mjs';
import { publicQuestionsForDay } from '../../lib/quiz_questions.mjs';
import { QUIZ_POINTS_PER_DAY } from './submit.mjs';

export async function onRequestGet({ request, env, params }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const n = parseInt(params.day, 10);
  if (!n || n < 1 || n > TOTAL_DAYS) return badRequest('A reading day between 1 and 50 is required');

  const questions = publicQuestionsForDay(n);
  if (!questions) return badRequest('No quiz for that day');

  const { rows } = await ensureUserCalendar(env.DB, user.id);
  const elapsed = elapsedDays(rows, utcToday());
  const dayDate = userDayMap(rows).get(n) || null;

  const progress = await env.DB.prepare(
    'SELECT completed FROM reading_progress WHERE user_id = ? AND day_number = ?'
  ).bind(user.id, n).first();

  const prevDone = n === 1 ? true : !!(await env.DB.prepare(
    'SELECT completed FROM reading_progress WHERE user_id = ? AND day_number = ?'
  ).bind(user.id, n - 1).first())?.completed;

  // At most ONE attempt row can exist (unique index idx_quiz_one_attempt).
  const attempt = await env.DB.prepare(
    'SELECT score, total, passed, created_at FROM quiz_attempts WHERE user_id = ? AND day_number = ?'
  ).bind(user.id, n).first();

  let can_attempt = true, block_reason = null;
  if (attempt) { can_attempt = false; block_reason = 'attempt_used'; }
  else if (!prevDone) { can_attempt = false; block_reason = 'previous_day_incomplete'; }
  else if (n > elapsed + 1) { can_attempt = false; block_reason = 'read_ahead_limit'; }

  return json({
    day_number: n,
    date: dayDate,
    questions,                          // [{ index, q, options }] — no answers
    total: questions.length,
    quiz_points_possible: QUIZ_POINTS_PER_DAY,
    info_only: true,                    // quiz never gates day completion
    completed: !!progress?.completed,   // day completion is INDEPENDENT of the quiz
    prev_completed: prevDone,
    elapsed_days: elapsed,
    can_attempt,
    block_reason,
    attempt: attempt
      ? { score: attempt.score, total: attempt.total, passed: !!attempt.passed, at: attempt.created_at, final: true }
      : null,
  });
}
