// GET /api/app-release — resolves the latest signed Android APK for ForgeHouse 50.
// Spec: read releases of vjumbo264/forgebuild through the GitHub API,
// select the numerically highest N from tags matching ^forgehouse50-v(\d+)$,
// and return { version, tag, apkUrl, sizeBytes, publishedAt, versionCode, sha256, changelog }.

import { json } from '../lib/http.mjs';

const SLUG = 'forgehouse50';
const FALLBACK_RELEASE = {
  version: 22,
  tag: 'forgehouse50-v22',
  apkUrl: 'https://github.com/vjumbo264/forgebuild/releases/download/forgehouse50-v22/app-forgehouse50-v22.apk',
  sizeBytes: 8860924,
  publishedAt: '2026-10-14T09:48:24Z',
  versionCode: 22,
  sha256: '7c762aefa4cc8117b71b9743d10866b6fb4f0910e66058692b62dbdd5a57c599',
  changelog: [
    'Password reset with 6-digit email verification code',
    'In-app update checks and new version notifications',
    'What's new changelog viewer in Profile',
  ],
};

export async function onRequestGet({ env }) {
  try {
    const headers = {
      'User-Agent': 'ForgeHouse50-Web-ReleasePicker',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (env && env.GITHUB_PAT) {
      headers['Authorization'] = `token ${env.GITHUB_PAT}`;
    }

    const res = await fetch('https://api.github.com/repos/vjumbo264/forgebuild/releases?per_page=50', {
      headers,
    });

    if (!res.ok) {
      return json(FALLBACK_RELEASE, 200, {
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=3600',
        'X-Fallback': 'github-status-' + res.status,
      });
    }

    const releases = await res.json();
    const tagPattern = new RegExp(`^${SLUG}-v(\\d+)$`);
    const candidates = [];

    for (const r of releases) {
      if (r.draft || r.prerelease) continue;
      const match = (r.tag_name || '').match(tagPattern);
      if (!match) continue;

      const versionNum = parseInt(match[1], 10);
      const apk = (r.assets || []).find((a) => a.name && a.name.endsWith('.apk'));
      const releaseJsonAsset = (r.assets || []).find((a) => a.name === 'release.json');

      if (apk && apk.browser_download_url) {
        candidates.push({
          version: versionNum,
          tag: r.tag_name,
          apkUrl: apk.browser_download_url,
          sizeBytes: apk.size || 0,
          publishedAt: r.published_at || new Date().toISOString(),
          releaseJsonUrl: releaseJsonAsset ? releaseJsonAsset.browser_download_url : null,
          versionCode: null,
          sha256: null,
          changelog: null,
        });
      }
    }

    if (candidates.length === 0) {
      return json(FALLBACK_RELEASE, 200, {
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=3600',
      });
    }

    // Sort descending by integer version (v22 > v21 > v18)
    candidates.sort((a, b) => b.version - a.version);
    const latest = candidates[0];

    // If release.json exists as an asset, fetch it to enrich metadata
    if (latest.releaseJsonUrl) {
      try {
        const rjRes = await fetch(latest.releaseJsonUrl, { headers });
        if (rjRes.ok) {
          const rj = await rjRes.json();
          if (rj) {
            latest.versionCode = rj.versionCode ?? null;
            latest.sha256 = rj.sha256 ?? null;
            latest.changelog = Array.isArray(rj.changelog) ? rj.changelog : null;
          }
        }
      } catch (_) {
        // Tolerated — fallback to nulls
      }
    }

    // Clean up internal url property before sending response
    delete latest.releaseJsonUrl;

    return json(latest, 200, {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
    });
  } catch (err) {
    return json(FALLBACK_RELEASE, 200, {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
      'X-Fallback': 'exception',
    });
  }
}
