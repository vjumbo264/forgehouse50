// POST /api/read/complete — marks a reading day complete and awards the
// day's non-quiz points.
// fixes_oct15_v1 (Item 2a):
// 1. Minimum reading time MIN_READING_SECONDS = 300 (5 minutes) per day.
// 2. Acceptance of readingSeconds, firstOpenedAt, finalChapterReached.
// 3. Final chapter reached requirement (replaces "all chapters viewed").
// 4. Sanity checks on readingSeconds (clamped against elapsed wall-clock and 6h ceiling).
// 5. Backward compatibility for legacy clients without readingSeconds.
// 6. Admin override: admin action never blocked by minimum reading time.
// 7. Store reading_seconds, first_opened_at, completed_at, time_source.

import { json, badRequest, readJson, uuid, nowIso, conflict, forbidden } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { awardPoints } from '../../lib/points.mjs';
import { ensureUserCalendar, elapsedDays, utcToday, TOTAL_DAYS } from '../../lib/calendar.mjs';

export const MIN_READING_SECONDS = 300; // 5 minutes per reading day
export const MAX_READING_SECONDS_CEILING = 21600; // 6 hours

const BLOCK_MESSAGES = {
  previous_day_incomplete: 'Finish the previous reading day first — days must be completed in order.',
  read_ahead_limit: 'You can only read one day ahead — come back tomorrow to continue.',
};

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const isAdmin = user.role === 'admin';
  const body = await readJson(request);
  const n = parseInt(body?.day_number ?? 0, 10);
  if (!n || n < 1 || n > TOTAL_DAYS) return badRequest('A reading day between 1 and 50 is required');

  if (isAdmin && !body?.target_user_id) {
    return forbidden('Admin accounts operate the programme and cannot participate directly.');
  }

  const targetUserId = (isAdmin && body?.target_user_id) ? body.target_user_id : user.id;

  // ── Idempotent: already complete ────────────────────────────────────────
  const progress = await env.DB.prepare(
    'SELECT completed, reading_seconds, first_opened_at, final_chapter_reached_at, time_source FROM reading_progress WHERE user_id = ? AND day_number = ?'
  ).bind(targetUserId, n).first();

  if (progress?.completed) {
    return json({ ok: true, already_completed: true, day_number: n, points_awarded: 0 });
  }

  // ── Sequential + read-ahead guards ─────────────────────────────────────
  const { rows } = await ensureUserCalendar(env.DB, targetUserId);
  const elapsed = elapsedDays(rows, utcToday());

  if (n > 1) {
    const prev = await env.DB.prepare(
      'SELECT completed FROM reading_progress WHERE user_id = ? AND day_number = ?'
    ).bind(targetUserId, n - 1).first();
    if (!prev?.completed) {
      return conflict(BLOCK_MESSAGES.previous_day_incomplete + ' (Complete Day ' + (n - 1) + ' first.)');
    }
  }

  if (n > elapsed + 1 && !isAdmin) {
    return conflict(BLOCK_MESSAGES.read_ahead_limit);
  }

  // ── Final chapter reached check (Item 2a.1) ───────────────────────────
  const chapterRows = await env.DB.prepare(
    'SELECT book, chapter_start, chapter_end FROM reading_assignments WHERE day_number = ? ORDER BY rowid'
  ).bind(n).all();
  const assignments = chapterRows?.results || [];
  const lastAssignment = assignments[assignments.length - 1];
  const finalChapterRef = lastAssignment ? `${lastAssignment.book}:${lastAssignment.chapter_end}` : null;

  const viewed = Array.isArray(body?.viewed_chapters) ? body.viewed_chapters : [];
  const isFinalChapterReached = Boolean(
    isAdmin ||
    body?.finalChapterReached ||
    body?.final_chapter_reached ||
    progress?.final_chapter_reached_at ||
    (finalChapterRef && viewed.includes(finalChapterRef)) ||
    (assignments.length > 0 && viewed.length >= assignments.reduce((s, a) => s + (a.chapter_end - a.chapter_start + 1), 0))
  );

  if (!isFinalChapterReached) {
    return new Response(JSON.stringify({
      code: 'final_chapter_not_reached',
      error: `Reach the final chapter (${finalChapterRef || 'last chapter'}) before marking reading complete.`
    }), { status: 422, headers: { 'Content-Type': 'application/json' } });
  }

  // ── Active reading time calculation and sanity checks (Item 2a.2-2a.5) ──
  const now = new Date();
  const nowMs = now.getTime();
  const rawSeconds = body?.readingSeconds ?? body?.reading_seconds;
  const isLegacy = (rawSeconds === undefined || rawSeconds === null);

  let acceptedSeconds = 0;
  let timeSource = 'client';
  const firstOpenedAtStr = body?.firstOpenedAt || body?.first_opened_at || progress?.first_opened_at || now.toISOString();

  if (isAdmin) {
    acceptedSeconds = Math.max(0, parseInt(rawSeconds ?? 300, 10));
    timeSource = 'admin_override';
  } else if (isLegacy) {
    // Legacy client handling (Item 2a.5)
    if ((progress?.reading_seconds ?? 0) >= MIN_READING_SECONDS) {
      acceptedSeconds = progress.reading_seconds;
      timeSource = progress.time_source || 'client';
    } else if (progress?.first_opened_at) {
      const firstMs = new Date(progress.first_opened_at).getTime();
      const diffSec = Math.max(0, Math.floor((nowMs - firstMs) / 1000));
      acceptedSeconds = Math.min(diffSec, MAX_READING_SECONDS_CEILING);
      timeSource = 'server_estimate';
    } else {
      acceptedSeconds = progress?.reading_seconds ?? 0;
      timeSource = 'server_estimate';
    }
  } else {
    // Modern client with readingSeconds: sanity checks
    let claimed = parseInt(rawSeconds, 10);
    if (isNaN(claimed) || claimed < 0) claimed = 0;

    const firstMs = new Date(firstOpenedAtStr).getTime();
    if (!isNaN(firstMs) && firstMs > nowMs + 60000) {
      claimed = 0;
    } else if (!isNaN(firstMs)) {
      const elapsedWallClockSec = Math.max(0, Math.floor((nowMs - firstMs) / 1000)) + 60;
      claimed = Math.min(claimed, elapsedWallClockSec);
    }
    claimed = Math.min(claimed, MAX_READING_SECONDS_CEILING);

    acceptedSeconds = Math.max(claimed, progress?.reading_seconds ?? 0);
    timeSource = 'client';

    if (acceptedSeconds < MIN_READING_SECONDS) {
      const remainingSeconds = MIN_READING_SECONDS - acceptedSeconds;
      return new Response(JSON.stringify({
        code: 'reading_time_too_short',
        remainingSeconds,
        error: `Minimum 5 minutes of reading required. Read for ${Math.ceil(remainingSeconds / 60)} more minute(s).`
      }), { status: 422, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // ── Record completion in DB ─────────────────────────────────────────────
  const chapterRow = await env.DB.prepare(
    'SELECT COALESCE(SUM(chapter_count),0) AS chapters FROM reading_assignments WHERE day_number = ?'
  ).bind(n).first();
  const chapters = chapterRow?.chapters ?? 0;
  const completedAt = nowIso();

  await env.DB.prepare(
    `INSERT INTO reading_progress (id, user_id, day_number, completed, completed_at, reading_seconds, first_opened_at, final_chapter_reached_at, time_source, chapters_read, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, day_number) DO UPDATE SET
       completed = 1,
       completed_at = COALESCE(reading_progress.completed_at, excluded.completed_at),
       reading_seconds = MAX(reading_progress.reading_seconds, excluded.reading_seconds),
       first_opened_at = COALESCE(reading_progress.first_opened_at, excluded.first_opened_at),
       final_chapter_reached_at = COALESCE(reading_progress.final_chapter_reached_at, excluded.final_chapter_reached_at),
       time_source = excluded.time_source,
       chapters_read = MAX(reading_progress.chapters_read, excluded.chapters_read),
       updated_at = excluded.updated_at`
  ).bind(uuid(), targetUserId, n, completedAt, acceptedSeconds, firstOpenedAtStr, completedAt, timeSource, chapters, completedAt).run();

  const reading = await awardPoints(env.DB, targetUserId, 'reading_completed', `reading_completed:${targetUserId}:${n}`, { dayNumber: n });

  const isCatchup = n < elapsed;
  const streak = isCatchup
    ? { awarded: false, points: 0 }
    : await awardPoints(env.DB, targetUserId, 'daily_streak', `daily_streak:${targetUserId}:${n}`, { dayNumber: n });

  const done = await env.DB.prepare(
    'SELECT COUNT(*) AS c FROM reading_progress WHERE user_id = ? AND completed = 1'
  ).bind(targetUserId).first();

  let programme = { awarded: false, points: 0 };
  if ((done?.c ?? 0) >= TOTAL_DAYS) {
    programme = await awardPoints(env.DB, targetUserId, 'programme_completed', `programme_completed:${targetUserId}`);
  }

  return json({
    ok: true,
    day_number: n,
    reading_seconds: acceptedSeconds,
    time_source: timeSource,
    points_awarded: reading.points + streak.points + programme.points,
  });
}

export const onRequestPut = onRequestPost;
