// POST /api/read/time — accumulate reading seconds for a day (capped per call).
// Also records first_opened_at and final_chapter_reached_at when reported.
import { json, badRequest, readJson, uuid, nowIso } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  const n = parseInt(body?.day_number ?? 0, 10);
  const seconds = Math.min(Math.max(parseInt(body?.seconds ?? 0, 10), 0), 600); // cap 10 min per heartbeat
  if (!n || n < 1 || n > 50) return badRequest('day_number between 1 and 50 is required');

  const now = nowIso();
  const firstOpened = body?.first_opened_at || body?.firstOpenedAt || null;
  const finalReached = body?.final_chapter_reached || body?.finalChapterReached ? now : null;

  await env.DB.prepare(
    `INSERT INTO reading_progress (id, user_id, day_number, reading_seconds, first_opened_at, final_chapter_reached_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, day_number) DO UPDATE SET
       reading_seconds = reading_progress.reading_seconds + excluded.reading_seconds,
       first_opened_at = COALESCE(reading_progress.first_opened_at, excluded.first_opened_at),
       final_chapter_reached_at = COALESCE(reading_progress.final_chapter_reached_at, excluded.final_chapter_reached_at),
       updated_at = excluded.updated_at`
  ).bind(uuid(), user.id, n, seconds || 0, firstOpened, finalReached, now).run();

  return json({ ok: true });
}
