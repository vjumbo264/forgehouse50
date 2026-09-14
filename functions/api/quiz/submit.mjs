// POST /api/quiz/submit — records the user's ONE quiz attempt for a reading
// day (informational, scoring-only). quiz_redesign_and_launch_wipe_v1.
//
// THE QUIZ IS NEVER A GATE. There is no pass threshold and no retry:
//   - ONE attempt only, ever, per user per reading day — a second submission
//     is rejected server-side (409 attempt_used). The DB also enforces this
//     with UNIQUE INDEX idx_quiz_one_attempt on quiz_attempts(user_id, day).
//   - ANY score (including 0/total) is a final, valid attempt. The result is
//     returned immediately, always, regardless of score.
//   - Quiz points are PROPORTIONAL: (score/total) * QUIZ_POINTS_PER_DAY,
//     recorded as a points row with action 'quiz_score' (idempotency key
//     quiz_score:{user}:{day}). A user who never attempts simply has no
//     quiz_score row for that day => 0 quiz points — no special-casing.
//   - Reading-day completion + non-quiz points (reading_completed +10,
//     daily_streak +3, programme_completed +100) are handled by
//     POST /api/read/complete, exactly as they were before quiz-gating was
//     introduced. Submitting this quiz neither completes nor blocks the day.
//
// Ordering guard (kept): a quiz attempt is only accepted for a day the user
// could legitimately complete right now — day N-1 complete and at most one
// day ahead of their own schedule (same rule as read/complete).
import { json, badRequest, readJson, uuid, conflict, forbidden } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { awardPoints } from '../../lib/points.mjs';
import { ensureUserCalendar, elapsedDays, utcToday, TOTAL_DAYS } from '../../lib/calendar.mjs';
import { gradeDay, questionsForDay } from '../../lib/quiz_questions.mjs';

export const QUIZ_POINTS_PER_DAY = 5; // Q in (score/total) × Q — documented judgment

const BLOCK_MESSAGES = {
  previous_day_incomplete: 'Finish the previous reading day first — days are taken in order.',
  read_ahead_limit: 'You can only read one day ahead — come back tomorrow to continue.',
};

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  // admin_reset_and_start_guardrail_v1: admin accounts operate the
  // programme, they never participate in it — no quiz attempts, no points.
  if (user.role === 'admin') return forbidden('Admin accounts cannot participate in the programme.');

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const n = parseInt(body.day_number ?? 0, 10);
  if (!n || n < 1 || n > TOTAL_DAYS) return badRequest('A reading day between 1 and 50 is required');
  const answers = Array.isArray(body.answers) ? body.answers : null;
  if (!answers) return badRequest('answers array is required');

  const bank = questionsForDay(n);
  if (!bank) return badRequest('No quiz for that day');

  // ── One attempt only, ever — server-side rejection of a second try ──────
  const existingAttempt = await env.DB.prepare(
    'SELECT score, total FROM quiz_attempts WHERE user_id = ? AND day_number = ?'
  ).bind(user.id, n).first();
  if (existingAttempt) {
    return conflict(
      `You already took the Day ${n} quiz (you scored ${existingAttempt.score}/${existingAttempt.total}). Only one attempt is allowed — no retakes.`
    );
  }

  // ── Ordering guard: same reachability rule as read/complete ─────────────
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

  // ── Grade (server-side) + record the single final attempt ───────────────
  const graded = gradeDay(n, answers);
  if (!graded) return badRequest('Could not grade that quiz');

  // 'passed' is kept as an INFORMATIONAL flag only (>= 67% correct) — it has
  // zero effect on completion or point eligibility anywhere in the app.
  await env.DB.prepare(
    'INSERT INTO quiz_attempts (id, user_id, day_number, score, total, passed) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uuid(), user.id, n, graded.score, graded.total, graded.passed ? 1 : 0).run();

  // ── Proportional quiz points: (score/total) × Q, idempotent ─────────────
  const quizValue = Math.round((graded.score / graded.total) * QUIZ_POINTS_PER_DAY);
  const quiz = await awardPoints(
    env.DB, user.id, 'quiz_score', `quiz_score:${user.id}:${n}`,
    { dayNumber: n, points: quizValue, reason: `quiz ${graded.score}/${graded.total}` }
  );

  return json({
    ok: true,
    day_number: n,
    score: graded.score,
    total: graded.total,
    passed: !!graded.passed,            // informational only — never a gate
    final: true,                        // no retake exists for this day
    quiz_points: quiz.points,           // proportional quiz points earned
    quiz_points_possible: QUIZ_POINTS_PER_DAY,
    message: `You scored ${graded.score} out of ${graded.total} (+${quiz.points} quiz pts). This was your one attempt for Day ${n} — the quiz never blocks your reading.`,
  });
}

// Also accept PUT (some clients); identical handling.
export const onRequestPut = onRequestPost;
