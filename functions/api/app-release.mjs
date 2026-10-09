// GET /api/app-release — resolves the latest signed Android APK for ForgeHouse 50.
import { json } from '../lib/http.mjs';

const SLUG = 'forgehouse50';
const FALLBACK_RELEASE = {
  version: 18,
  tag: 'forgehouse50-v18',
  apkUrl: 'https://github.com/vjumbo264/forgebuild/releases/download/forgehouse50-v18/app-forgehouse50-v18.apk',
  sizeBytes: 8774197,
  publishedAt: '2026-10-08T15:39:02Z',
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
      if (apk && apk.browser_download_url) {
        candidates.push({
          version: versionNum,
          tag: r.tag_name,
          apkUrl: apk.browser_download_url,
          sizeBytes: apk.size || 0,
          publishedAt: r.published_at || new Date().toISOString(),
        });
      }
    }

    if (candidates.length === 0) {
      return json(FALLBACK_RELEASE, 200, {
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=3600',
      });
    }

    // Sort descending by integer version (v18 > v10 > v9)
    candidates.sort((a, b) => b.version - a.version);
    const latest = candidates[0];

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
