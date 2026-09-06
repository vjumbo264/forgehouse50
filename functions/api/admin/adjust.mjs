// POST /api/admin/adjust — admin point adjustment (requires reason).
// POST /api/admin/adjust  { action: 'points', user_id, points, reason }
// POST /api/admin/adjust  { action: 'completion', user_id, day_number, completed }
import { json, badRequest, forbidden, readJson, uuid, nowIso } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  const action = String(body?.action || '');
  const targetId = String(body?.user_id || '');
  if (!targetId) return badRequest('user_id is required');

  const target = await env.DB.prepare('SELECT id FROM profiles WHERE id = ?').bind(targetId).first();
  if (!target) return badRequest('Unknown user');

  if (action === 'points') {
    const pts = parseInt(body?.points ?? 0, 10);
    const reason = String(body?.reason || '').trim();
    if (!pts) return badRequest('points must be a non-zero integer');
    if (!reason) return badRequest('A reason is required for manual point adjustments');
    await env.DB.prepare(
      `INSERT INTO points (id, user_id, action, points, idempotency_key, reason)
       VALUES (?, ?, 'admin_adjustment', ?, ?, ?)`
    ).bind(uuid(), targetId, pts, `admin_adjustment:${targetId}:${crypto.randomUUID()}`, reason).run();
    return json({ ok: true });
  }

  if (action === 'completion') {
    const day = parseInt(body?.day_number ?? 0, 10);
    const completed = body?.completed ? 1 : 0;
    if (!day || day < 1 || day > 50) return badRequest('day_number must be 1–50');
    if (completed) {
      const row = await env.DB.prepare('SELECT COALESCE(SUM(chapter_count),0) AS chapters FROM reading_assignments WHERE day_number = ?').bind(day).first();
      await env.DB.prepare(
        `INSERT INTO reading_progress (id, user_id, day_number, completed, completed_at, chapters_read)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT(user_id, day_number) DO UPDATE SET completed = 1, completed_at = COALESCE(reading_progress.completed_at, excluded.completed_at), updated_at = ?`
      ).bind(uuid(), targetId, day, nowIso(), row?.chapters ?? 0, nowIso()).run();
    } else {
      await env.DB.prepare(
        'UPDATE reading_progress SET completed = 0, completed_at = NULL, updated_at = ? WHERE user_id = ? AND day_number = ?'
      ).bind(nowIso(), targetId, day).run();
    }
    return json({ ok: true });
  }

  return badRequest('action must be points or completion');
}
