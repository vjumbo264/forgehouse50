// POST /api/read/audio — mark an audio session complete for a day (+5 pts, once).
import { json, badRequest, readJson, uuid } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { awardPoints } from '../../lib/points.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  const n = parseInt(body?.day_number ?? 0, 10);
  if (!n || n < 1 || n > 50) return badRequest('A reading day between 1 and 50 is required');

  await env.DB.prepare(
    `INSERT INTO audio_progress (id, user_id, day_number, completed)
     VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id, day_number) DO UPDATE SET completed = 1`
  ).bind(uuid(), user.id, n).run();

  const award = await awardPoints(env.DB, user.id, 'audio_completed', `audio_completed:${user.id}:${n}`, { dayNumber: n });
  return json({ ok: true, points_awarded: award.points });
}
