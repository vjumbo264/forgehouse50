// POST /api/quiz/submit — THE single completion gate for a reading day.
// per_user_calendar_and_quiz_v1 / task-q05 + task-q07 + task-q09.
//
// A day counts complete (and earns reading_completed +10 / daily_streak +3 /
// programme_completed +100 points) ONLY on a PASSING quiz submission:
//   pass bar = score >= ceil(2/3 * total)   (67%)
//
// Server-side gates, re-checked HERE (not merely at display) so they cannot
// be bypassed by calling the API directly:
//   sequential   — day N-1 must be quiz-passed complete first (N > 1)
//   read-ahead   — N <= elapsed_days(today) + 1 (max ONE day ahead of the
//                  user's own schedule). Two-days-ahead => 409.
//
// Every attempt (pass or fail) is recorded in quiz_attempts; retries are
// unlimited — a failed attempt never locks the user out of the day.
import { json, badRequest, readJson, uuid, nowIso, conflict } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { awardPoints } from '../../lib/points.mjs';
import { ensureUserCalendar, elapsedDays, utcToday, userDayMap, TOTAL_DAYS } from '../../lib/calendar.mjs';
import { gradeDay, requiredScore, questionsForDay } from '../../lib/quiz_questions.mjs';

const BLOCK_MESSAGES = {
  previous_day_incomplete: 'Finish the previous reading day first — days must be completed in order.',
  read_ahead_limit: 'You can only read one day ahead — come back tomorrow to continue.',
};

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const n = parseInt(body.day_number ?? 0, 10);
  if (!n || n < 1 || n > TOTAL_DAYS) return badRequest('A reading day between 1 and 50 is required');
  const answers = Array.isArray(body.answers) ? body.answers : null;
  if (!answers) return badRequest('answers array is required');

  const bank = questionsForDay(n);
  if (!bank) return badRequest('No quiz for that day');

  // ── Gate 0: already complete ────────────────────────────────────────────
  const existing = await env.DB.prepare(
    'SELECT completed FROM reading_progress WHERE user_id = ? AND day_number = ?'
  ).bind(user.id, n).first();
  if (existing?.completed) {
    return json({ ok: true, already_completed: true, day_number: n, points_awarded: 0 });
  }

  // ── Gates 1-2: sequence + read-ahead (enforced at submission) ───────────
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

  // ── Grade + record the attempt (pass OR fail) ───────────────────────────
  const graded = gradeDay(n, answers);
  if (!graded) return badRequest('Could not grade that quiz');

  await env.DB.prepare(
    'INSERT INTO quiz_attempts (id, user_id, day_number, score, total, passed) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(uuid(), user.id, n, graded.score, graded.total, graded.passed ? 1 : 0).run();

  if (!graded.passed) {
    // Failed: day NOT complete, no points — but the user may retry freely.
    return json({
      ok: true,
      passed: false,
      day_number: n,
      score: graded.score,
      total: graded.total,
      pass_mark: requiredScore(graded.total),
      message: `You scored ${graded.score}/${graded.total} — you need ${requiredScore(graded.total)} to pass. Re-read the passage and try again.`,
    });
  }

  // ── Passed: complete the day + award points (idempotent) ────────────────
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
    passed: true,
    day_number: n,
    score: graded.score,
    total: graded.total,
    pass_mark: requiredScore(graded.total),
    points_awarded: reading.points + streak.points + programme.points,
  });
}

// Also accept PUT (some clients); identical handling.
export const onRequestPut = onRequestPost;
