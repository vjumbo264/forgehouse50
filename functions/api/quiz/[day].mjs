// GET /api/quiz/:day — the day's quiz questions (answers stripped), plus the
// user's attempt state and whether they may attempt right now.
// per_user_calendar_and_quiz_v1 / task-q05.
//
// can_attempt rules (hard gate re-checked server-side at submission):
//   1. day N-1 must already be quiz-passed complete (N > 1);
//   2. N <= elapsed_days(today) + 1  — at most ONE day ahead of the user's
//      own schedule. Display may be permissive; submission is the real gate.
import { json, badRequest } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { ensureUserCalendar, elapsedDays, utcToday, userDayMap, TOTAL_DAYS } from '../../lib/calendar.mjs';
import { publicQuestionsForDay, requiredScore } from '../../lib/quiz_questions.mjs';

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

  const { results: attempts } = await env.DB.prepare(
    'SELECT score, total, passed, created_at FROM quiz_attempts WHERE user_id = ? AND day_number = ? ORDER BY created_at DESC'
  ).bind(user.id, n).all();

  let can_attempt = true, block_reason = null;
  if (progress?.completed) { can_attempt = false; block_reason = 'already_completed'; }
  else if (!prevDone) { can_attempt = false; block_reason = 'previous_day_incomplete'; }
  else if (n > elapsed + 1) { can_attempt = false; block_reason = 'read_ahead_limit'; }

  return json({
    day_number: n,
    date: dayDate,
    questions,                          // [{ index, q, options }] — no answers
    total: questions.length,
    pass_mark: requiredScore(questions.length),
    completed: !!progress?.completed,
    prev_completed: prevDone,
    elapsed_days: elapsed,
    can_attempt,
    block_reason,
    attempts: (attempts || []).map(a => ({ score: a.score, total: a.total, passed: !!a.passed, at: a.created_at })),
  });
}
