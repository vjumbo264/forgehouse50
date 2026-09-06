// POST /api/read/time — accumulate reading seconds for a day (capped per call).
import { json, badRequest, readJson, uuid, nowIso } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  const n = parseInt(body?.day_number ?? 0, 10);
  const seconds = Math.min(Math.max(parseInt(body?.seconds ?? 0, 10), 0), 600); // cap 10 min per heartbeat
  if (!n || n < 1 || n > 50 || !seconds) return badRequest('day_number and positive seconds are required');

  await env.DB.prepare(
    `INSERT INTO reading_progress (id, user_id, day_number, reading_seconds)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, day_number) DO UPDATE SET
       reading_seconds = reading_progress.reading_seconds + excluded.reading_seconds,
       updated_at = ?`
  ).bind(uuid(), user.id, n, seconds, nowIso()).run();

  return json({ ok: true });
}
