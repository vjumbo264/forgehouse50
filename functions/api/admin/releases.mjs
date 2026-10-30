// GET  /api/admin/releases — list all app releases with rollout states
// POST /api/admin/releases — update release rollout state (hold, admins_only, everyone)

import { json, badRequest, forbidden, notFound, readJson, nowIso, uuid } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const { results } = await env.DB.prepare(
    'SELECT version_code, version_name, tag, apk_url, size_bytes, sha256, changelog, rollout_state, mandatory, updated_by, updated_at, created_at FROM app_releases ORDER BY version_code DESC'
  ).all();

  const releases = (results || []).map((r) => {
    let changelog = [];
    try {
      changelog = JSON.parse(r.changelog || '[]');
    } catch (_) {}
    return {
      version_code: r.version_code,
      version_name: r.version_name,
      tag: r.tag,
      apk_url: r.apk_url,
      size_bytes: r.size_bytes,
      sha256: r.sha256,
      changelog,
      rollout_state: r.rollout_state,
      mandatory: !!r.mandatory,
      updated_by: r.updated_by,
      updated_at: r.updated_at,
    };
  });

  return json({ ok: true, releases });
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  const versionCode = parseInt(body?.version_code ?? 0, 10);
  const action = String(body?.action || '').trim(); // 'hold' | 'admins_only' | 'everyone'

  if (!versionCode) return badRequest('version_code is required');
  if (!['hold', 'admins_only', 'everyone'].includes(action)) {
    return badRequest("action must be 'hold', 'admins_only', or 'everyone'");
  }

  // Guard: releasing to everyone requires confirmation dialog input
  if (action === 'everyone' && body?.confirm !== 'RELEASE_TO_EVERYONE') {
    return badRequest("Confirmation required — resend with confirm: 'RELEASE_TO_EVERYONE'.");
  }

  const now = nowIso();
  const res = await env.DB.prepare(
    'UPDATE app_releases SET rollout_state = ?, updated_by = ?, updated_at = ? WHERE version_code = ?'
  ).bind(action, user.id, now, versionCode).run();

  if ((res.meta?.changes ?? 0) === 0) {
    return notFound(`Release with versionCode ${versionCode} not found`);
  }

  await env.DB.prepare(
    "INSERT INTO admin_audit (id, admin_id, action, target_user_id, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(uuid(), user.id, `release_rollout_${action}`, String(versionCode), now).run();

  return json({
    ok: true,
    version_code: versionCode,
    rollout_state: action,
    updated_at: now,
  });
}
