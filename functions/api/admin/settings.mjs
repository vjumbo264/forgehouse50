// GET /api/admin/settings — get admin-configurable settings
// PUT /api/admin/settings — update admin-configurable settings
import { json, badRequest, forbidden, readJson, nowIso, uuid } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const { results } = await env.DB.prepare(
    "SELECT key, value, updated_at FROM programme_config WHERE key IN ('rest_day_catchup_cutoff_time')"
  ).all();

  const settings = {
    rest_day_catchup_cutoff_time: '19:00',
  };
  for (const r of results || []) {
    settings[r.key] = r.value;
  }

  return json({ ok: true, settings });
}

export async function onRequestPut({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  const cutoff = String(body?.rest_day_catchup_cutoff_time || '').trim();

  if (cutoff) {
    if (!/^\d{1,2}:\d{2}$/.test(cutoff)) {
      return badRequest('Cutoff time must be in HH:MM format (24-hour), e.g. 19:00');
    }
    const [h, m] = cutoff.split(':').map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59) {
      return badRequest('Invalid hour or minute in cutoff time');
    }

    const formatted = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const now = nowIso();
    await env.DB.prepare(
      `INSERT INTO programme_config (key, value, updated_at) VALUES ('rest_day_catchup_cutoff_time', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(formatted, now).run();

    await env.DB.prepare(
      "INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, 'update_rest_day_cutoff', ?, ?)"
    ).bind(uuid(), user.id, formatted, now).run();
  }

  return json({ ok: true });
}
