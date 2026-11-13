// GET  /api/admin/releases — sync + list all app releases with rollout states and audit log
// POST /api/admin/releases — update release rollout state ('hold' | 'admins_only' | 'everyone')

import { json, badRequest, forbidden, notFound, readJson, nowIso, uuid } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';
import { syncReleasesFromGitHub } from '../../lib/releases.mjs';

const NO_STORE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };
const BRIDGE_DISPATCH_URL =
  'https://api.github.com/repos/vjumbo264/forgehouse50-android/actions/workflows/publish-bridge-release.yml/dispatches';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const url = new URL(request.url);
  const skipSync = url.searchParams.get('sync') === '0';
  if (!skipSync) {
    await syncReleasesFromGitHub(env, { force: true });
  }

  const [{ results }, { results: auditRows }] = await Promise.all([
    env.DB.prepare(
      `SELECT version_code, version_name, tag, apk_url, size_bytes, sha256, changelog,
              rollout_state, mandatory, publish_to_forgebuild, bridged, updated_by, updated_at, created_at
       FROM app_releases
       ORDER BY version_code DESC`
    ).all(),
    env.DB.prepare(
      `SELECT id, admin_id, action, target_user_id AS version_code, target_display_name AS summary, created_at
       FROM admin_audit
       WHERE action LIKE 'release_rollout_%'
       ORDER BY created_at DESC
       LIMIT 25`
    ).all(),
  ]);

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
      changelog_text: changelog.join('\n'),
      rollout_state: r.rollout_state,
      mandatory: Boolean(r.mandatory),
      publish_to_forgebuild: Boolean(r.publish_to_forgebuild),
      bridged: Boolean(r.bridged),
      updated_by: r.updated_by,
      updated_at: r.updated_at,
      created_at: r.created_at,
    };
  });

  return json({
    ok: true,
    releases,
    audit_log: auditRows || [],
  }, 200, NO_STORE);
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
  if (action === 'everyone' && body?.confirm !== 'RELEASE_TO_EVERYONE') {
    return badRequest("Confirmation required — resend with confirm: 'RELEASE_TO_EVERYONE'.");
  }

  const existing = await env.DB.prepare(
    'SELECT version_code, version_name, tag, rollout_state, mandatory, publish_to_forgebuild, bridged FROM app_releases WHERE version_code = ?'
  ).bind(versionCode).first();
  if (!existing) {
    return notFound(`Release with versionCode ${versionCode} not found`);
  }

  const mandatoryVal = typeof body?.mandatory === 'boolean' ? (body.mandatory ? 1 : 0) : (existing.mandatory ? 1 : 0);
  const wantsBridge = action === 'everyone' && body?.publish_to_forgebuild === true;
  const publishToForgebuildVal = wantsBridge ? 1 : (existing.publish_to_forgebuild ? 1 : 0);
  let bridgedVal = existing.bridged ? 1 : 0;
  let bridgeDryRun = false;
  let bridgeDispatchPreview = null;

  if (wantsBridge) {
    const tag = existing.tag || existing.version_name;
    bridgeDispatchPreview = {
      workflow: 'publish-bridge-release.yml',
      ref: 'main',
      inputs: {
        CONFIRM_PUSH_TO_ALL_USERS: 'yes',
        tag_name: tag,
      },
    };
    const isDryRun = Boolean(body?.dry_run) || Boolean(env.DRY_RUN);
    if (isDryRun || !env.GITHUB_PAT) {
      bridgeDryRun = true;
    } else if (!bridgedVal) {
      try {
        const ghRes = await fetch(BRIDGE_DISPATCH_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.GITHUB_PAT}`,
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'ForgeHouse50-ReleaseManager',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: bridgeDispatchPreview.inputs,
          }),
        });
        if (ghRes.ok) {
          bridgedVal = 1;
        }
      } catch (_) {}
    }
  }

  const actorName = user.username || user.name || user.email || user.id;
  const now = nowIso();

  await env.DB.prepare(
    `UPDATE app_releases
     SET rollout_state = ?, mandatory = ?, publish_to_forgebuild = ?, bridged = ?, updated_by = ?, updated_at = ?
     WHERE version_code = ?`
  ).bind(action, mandatoryVal, publishToForgebuildVal, bridgedVal, actorName, now, versionCode).run();

  const bridgeNote = wantsBridge ? (bridgeDryRun ? ' [forgebuild bridge dry-run]' : ' [forgebuild bridged]') : '';
  const summary = `${actorName}: ${existing.version_name} (${existing.rollout_state} -> ${action})${bridgeNote}`;
  await env.DB.prepare(
    `INSERT INTO admin_audit (id, admin_id, action, target_user_id, target_display_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(uuid(), user.id, `release_rollout_${action}`, String(versionCode), summary, now).run();

  return json({
    ok: true,
    version_code: versionCode,
    version_name: existing.version_name,
    previous_state: existing.rollout_state,
    rollout_state: action,
    mandatory: Boolean(mandatoryVal),
    publish_to_forgebuild: Boolean(publishToForgebuildVal),
    bridged: Boolean(bridgedVal),
    bridge_dry_run: bridgeDryRun,
    bridge_dispatch_preview: bridgeDispatchPreview,
    updated_by: actorName,
    updated_at: now,
  }, 200, NO_STORE);
}
