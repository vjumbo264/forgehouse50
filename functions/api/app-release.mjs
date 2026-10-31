// GET /api/app-release — controlled update manifest endpoint (i8).
// Role/state matrix:
//   - 'hold':        nobody receives update
//   - 'admins_only': only authenticated admin sessions receive update
//   - 'everyone':    both members/unauthenticated and admins receive update
// Never exposes admin terminology in user-facing messages.

import { json } from '../lib/http.mjs';
import { getUser } from '../lib/auth.mjs';
import { syncReleasesFromGitHub } from '../lib/releases.mjs';

export async function onRequestGet({ request, env }) {
  let isAdmin = false;
  try {
    const user = await getUser(request, env);
    if (user && user.role === 'admin') {
      isAdmin = true;
    }
  } catch (_) {}

  await syncReleasesFromGitHub(env);

  const allowedStates = isAdmin ? "('admins_only', 'everyone')" : "('everyone')";
  const row = await env.DB.prepare(
    `SELECT version_code, version_name, tag, apk_url, size_bytes, sha256, changelog, rollout_state, mandatory, updated_at
     FROM app_releases
     WHERE rollout_state IN ${allowedStates}
     ORDER BY version_code DESC
     LIMIT 1`
  ).first();

  const headers = { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Vary': 'Authorization, Cookie' };

  if (!row) {
    return json({
      update_available: false,
      version: 0,
      versionCode: 0,
      message: 'You are up to date.',
    }, 200, headers);
  }

  let changelog = [];
  try {
    changelog = JSON.parse(row.changelog || '[]');
  } catch (_) {}

  return json({
    update_available: true,
    version: row.version_code,
    versionCode: row.version_code,
    versionName: row.version_name,
    tag: row.tag,
    apkUrl: row.apk_url,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    changelog,
    changelogText: changelog.join('\n'),
    rollout_state: row.rollout_state,
    rolloutState: row.rollout_state,
    mandatory: Boolean(row.mandatory),
    publishedAt: row.updated_at,
  }, 200, headers);
}
