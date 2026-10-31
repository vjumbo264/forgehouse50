// Shared GitHub release sync & channel resolution for i8 controlled rollouts.
// Never defaults any newly discovered build to 'everyone'.
// GitHub pre-releases (or releaseHold=true in release.json) default to 'hold';
// non-prerelease builds default to 'admins_only'.

const NEW_REPO = 'vjumbo264/forgehouse50-android';
const SYNC_THROTTLE_MS = 60_000;

export async function syncReleasesFromGitHub(env, { force = false } = {}) {
  if (!env?.DB || env.SKIP_GITHUB_SYNC) return;
  try {
    const nowMs = Date.now();
    if (!force) {
      const cfg = await env.DB.prepare(
        "SELECT value FROM programme_config WHERE key = 'last_github_release_sync_ms'"
      ).first();
      const lastMs = cfg?.value ? parseInt(cfg.value, 10) : 0;
      if (lastMs > 0 && nowMs - lastMs < SYNC_THROTTLE_MS) {
        return;
      }
    }

    const headers = {
      'User-Agent': 'ForgeHouse50-ReleaseManager',
      'Accept': 'application/vnd.github+json',
    };
    if (env.GITHUB_PAT) {
      headers['Authorization'] = `Bearer ${env.GITHUB_PAT}`;
    }

    const res = await fetch(`https://api.github.com/repos/${NEW_REPO}/releases?per_page=20`, { headers });
    if (!res.ok) return;
    const releases = await res.json();

    await env.DB.prepare(
      `INSERT INTO programme_config (key, value, updated_at)
       VALUES ('last_github_release_sync_ms', ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(String(nowMs)).run();

    const { results: existingRows } = await env.DB.prepare(
      'SELECT version_code, sha256, changelog FROM app_releases'
    ).all();
    const existingMap = new Map((existingRows || []).map(r => [r.version_code, r]));

    for (const r of releases || []) {
      if (r.draft) continue;
      const tag = r.tag_name || '';
      const versionMatch = tag.match(/^v?(\d+)$/);
      if (!versionMatch) continue;
      const code = parseInt(versionMatch[1], 10);

      const apk = (r.assets || []).find(a => a.name && a.name.endsWith('.apk'));
      if (!apk || !apk.browser_download_url) continue;

      const existing = existingMap.get(code);
      let changelogArr = [];
      let sha256 = existing?.sha256 || null;
      let releaseHoldFlag = Boolean(r.prerelease);

      if (!existing || !existing.sha256 || !existing.changelog || existing.changelog === '[]') {
        const releaseJsonAsset = (r.assets || []).find(a => a.name === 'release.json');
        if (releaseJsonAsset?.browser_download_url) {
          try {
            const rjRes = await fetch(releaseJsonAsset.browser_download_url, { headers });
            if (rjRes.ok) {
              const rj = await rjRes.json();
              if (Array.isArray(rj?.changelog)) changelogArr = rj.changelog;
              if (rj?.sha256) sha256 = rj.sha256;
              if (rj?.releaseHold === true) releaseHoldFlag = true;
            }
          } catch (_) {}
        }
      } else {
        try {
          changelogArr = JSON.parse(existing.changelog || '[]');
        } catch (_) {}
      }

      // Newly discovered releases default to 'hold' when pre-release/releaseHold,
      // otherwise 'admins_only' — NEVER 'everyone'. Existing rollout_state is never overwritten by sync.
      const initialRollout = 'hold';

      await env.DB.prepare(
        `INSERT INTO app_releases (version_code, version_name, tag, apk_url, size_bytes, sha256, changelog, rollout_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(version_code) DO UPDATE SET
           apk_url = excluded.apk_url,
           size_bytes = excluded.size_bytes,
           sha256 = COALESCE(excluded.sha256, app_releases.sha256),
           changelog = CASE
             WHEN app_releases.changelog IS NULL OR app_releases.changelog = '[]' THEN excluded.changelog
             ELSE app_releases.changelog
           END`
      ).bind(
        code,
        tag,
        tag,
        apk.browser_download_url,
        apk.size || 0,
        sha256,
        JSON.stringify(changelogArr),
        initialRollout
      ).run();
    }
  } catch (_) {}
}
