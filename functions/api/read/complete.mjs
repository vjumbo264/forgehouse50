// POST /api/read/complete — legacy "mark complete" endpoint.
// per_user_calendar_and_quiz_v1 / task-q07: as of this session the quiz is
// the ONLY completion gate. This endpoint now acts as a thin compat alias:
//   - day already quiz-passed complete  -> idempotent OK (no double points)
//   - otherwise                         -> 409 quiz_required (the client must
//     send the user through POST /api/quiz/submit; the same sequential and
//     read-ahead gates are enforced there).
// Direct self-reported completion no longer awards points or marks a day done.
import { json, badRequest, readJson, conflict } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { TOTAL_DAYS } from '../../lib/calendar.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  const n = parseInt(body?.day_number ?? 0, 10);
  if (!n || n < 1 || n > TOTAL_DAYS) return badRequest('A reading day between 1 and 50 is required');

  const progress = await env.DB.prepare(
    'SELECT completed FROM reading_progress WHERE user_id = ? AND day_number = ?'
  ).bind(user.id, n).first();
  if (progress?.completed) return json({ ok: true, already_completed: true, day_number: n, points_awarded: 0 });

  const passed = await env.DB.prepare(
    'SELECT id FROM quiz_attempts WHERE user_id = ? AND day_number = ? AND passed = 1 LIMIT 1'
  ).bind(user.id, n).first();
  if (passed) {
    // Passed but progress row missing (edge case) — the submit endpoint is the
    // authority; tell the client to re-submit so completion+points are atomic.
    return conflict('Quiz passed but completion not recorded — resubmit the quiz for Day ' + n + '.');
  }

  return conflict('Complete the short quiz for Day ' + n + ' to mark it done.', {
    headers: {},
  });
}
