// GET /api/app-release — resolves the latest Android APK for ForgeHouse 50 based on rollout channel.
// Implements Item i8 (Admin-first update channels + controlled rollout).
// Reads releases from vjumbo264/forgehouse50-android.
// States:
//   - 'hold': not released to anyone.
//   - 'admins_only': released only to admins (tested before church-wide rollout).
//   - 'everyone': released church-wide.

import { json } from '../lib/http.mjs';
import { requireUser } from '../lib/auth.mjs';

const NEW_REPO = 'vjumbo264/forgehouse50-android';

async function syncReleasesFromGitHub(env) {
  try {
    const headers = {
      'User-Agent': 'ForgeHouse50-ReleaseManager',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (env && env.GITHUB_PAT) {
      headers['Authorization'] = `token ${env.GITHUB_PAT}`;
    }

    const res = await fetch(`https://api.github.com/repos/${NEW_REPO}/releases?per_page=20`, { headers });
    if (!res.ok) return;

    const releases = await res.json();
    for (const r of releases || []) {
      const tag = r.tag_name || '';
      const versionMatch = tag.match(/^v?(\d+)$/);
      if (!versionMatch) continue;

      const code = parseInt(versionMatch[1], 10);
      const apk = (r.assets || []).find((a) => a.name && a.name.endsWith('.apk'));
      if (!apk || !apk.browser_download_url) continue;

      let changelogArr = [];
      const releaseJsonAsset = (r.assets || []).find((a) => a.name === 'release.json');
      let sha256 = null;
      if (releaseJsonAsset) {
        try {
          const rjRes = await fetch(releaseJsonAsset.browser_download_url, { headers });
          if (rjRes.ok) {
            const rj = await rjRes.json();
            if (rj && Array.isArray(rj.changelog)) changelogArr = rj.changelog;
            if (rj && rj.sha256) sha256 = rj.sha256;
          }
        } catch (_) {}
      }

      await env.DB.prepare(
        `INSERT INTO app_releases (version_code, version_name, tag, apk_url, size_bytes, sha256, changelog, rollout_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'admins_only')
         ON CONFLICT(version_code) DO UPDATE SET
           apk_url = excluded.apk_url,
           size_bytes = excluded.size_bytes,
           sha256 = COALESCE(excluded.sha256, app_releases.sha256)`
      ).bind(
        code,
        tag,
        tag,
        apk.browser_download_url,
        apk.size || 0,
        sha256,
        JSON.stringify(changelogArr)
      ).run();
    }
  } catch (_) {}
}

export async function onRequestGet({ request, env }) {
  // Check caller authentication/role if provided
  let isAdmin = false;
  try {
    const authHeader = request.headers.get('Authorization') || '';
    if (authHeader) {
      const { user } = await requireUser(request, env);
      if (user && user.role === 'admin') {
        isAdmin = true;
      }
    }
  } catch (_) {}

  // Sync releases in background / best-effort
  await syncReleasesFromGitHub(env);

  // Query database according to role
  const allowedStates = isAdmin ? "('admins_only', 'everyone')" : "('everyone')";
  const row = await env.DB.prepare(
    `SELECT version_code, version_name, tag, apk_url, size_bytes, sha256, changelog, rollout_state, mandatory, updated_at
     FROM app_releases
     WHERE rollout_state IN ${allowedStates}
     ORDER BY version_code DESC
     LIMIT 1`
  ).first();

  if (!row) {
    return json({
      update_available: false,
      message: 'No updates available for your channel.',
    }, 200, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
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
    rollout_state: row.rollout_state,
    mandatory: !!row.mandatory,
    publishedAt: row.updated_at,
  }, 200, {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
}
