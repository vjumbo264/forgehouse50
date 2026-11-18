// Post-deploy live auth smoke check (e3).
// Uses Cloudflare D1 API (via GitHub Actions secrets CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID)
// to provision a temporary hidden smoke member (is_smoke_test = 1) with an ephemeral random password,
// verifies member login, authenticated /api/auth/me, /api/announcements/latest, leaderboard exclusion,
// wrong-password 401 reason, invalid-token 401 reason, and logout revocation, then deletes the smoke user.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { hashPassword } from '../functions/lib/auth.mjs';

const TARGET_URL = (process.env.TEST_URL || 'https://forgehouse50.pages.dev').replace(/\/+$/, '');
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_DB_ID = process.env.CLOUDFLARE_D1_ID || '351aca36-14e4-4c6f-8e13-127caae5b72f';

if (!CF_TOKEN || !CF_ACCOUNT_ID) {
  console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required for scripts/smoke_auth.mjs');
  process.exit(1);
}

async function d1Query(sql, params = []) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${CF_DB_ID}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    },
  );
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(`D1 query failed (${res.status}): ${JSON.stringify(data.errors || data)}`);
  }
  return data.result?.[0]?.results || [];
}

const SMOKE_ID = 'smoke-test-member';
const SMOKE_EMAIL = 'smoke-check@forgehouse50.invalid';
const SMOKE_PASS = crypto.randomBytes(24).toString('hex');

async function ensureIsSmokeTestColumn() {
  const cols = await d1Query('PRAGMA table_info(profiles)');
  if (!cols.some((c) => c.name === 'is_smoke_test')) {
    await d1Query('ALTER TABLE profiles ADD COLUMN is_smoke_test INTEGER NOT NULL DEFAULT 0');
  }
}

async function cleanupSmokeUser() {
  try {
    await d1Query('DELETE FROM sessions WHERE user_id = ?', [SMOKE_ID]);
    await d1Query('DELETE FROM profiles WHERE id = ? OR email = ?', [SMOKE_ID, SMOKE_EMAIL]);
  } catch (err) {
    console.error('Cleanup warning:', err.message);
  }
}

async function main() {
  console.log(`Running post-deploy auth smoke check against ${TARGET_URL}`);
  await ensureIsSmokeTestColumn();
  await cleanupSmokeUser();

  const passHash = await hashPassword(SMOKE_PASS);
  await d1Query(
    `INSERT INTO profiles (id, email, password_hash, name, surname, role, email_verified, programme_start_date, is_smoke_test)
     VALUES (?, ?, ?, 'Smoke', 'Check', 'member', 1, '2026-10-12', 1)`,
    [SMOKE_ID, SMOKE_EMAIL, passHash],
  );

  // 1. Wrong password must return 401 invalid_credentials and NOT "Session expired"
  const wrongRes = await fetch(`${TARGET_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SMOKE_EMAIL, password: 'WrongPassword123!' }),
  });
  assert.equal(wrongRes.status, 401, `Expected 401 for wrong password, got ${wrongRes.status}`);
  const wrongJson = await wrongRes.json();
  assert.equal(wrongJson.reason, 'invalid_credentials');
  assert.ok(!String(wrongJson.error || '').toLowerCase().includes('session expired'));

  // 2. Valid member login returns 200, Set-Cookie, and Bearer token
  const loginRes = await fetch(`${TARGET_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASS }),
  });
  assert.equal(loginRes.status, 200, `Expected 200 on member login, got ${loginRes.status}`);
  const loginJson = await loginRes.json();
  assert.equal(loginJson.ok, true);
  assert.equal(loginJson.id, SMOKE_ID);
  assert.ok(/^[a-f0-9]{64}$/.test(loginJson.token || ''), 'Expected 64-hex session token');
  const setCookie = loginRes.headers.get('set-cookie') || '';
  assert.ok(setCookie.includes(`fh50_session=${loginJson.token}`), 'Expected fh50_session cookie');

  const authHeaders = {
    Authorization: `Bearer ${loginJson.token}`,
    Cookie: `fh50_session=${loginJson.token}`,
  };

  // 3. Follow-up authenticated endpoints succeed
  const meRes = await fetch(`${TARGET_URL}/api/auth/me`, { headers: authHeaders });
  assert.equal(meRes.status, 200, `Expected 200 on /api/auth/me, got ${meRes.status}`);
  const meJson = await meRes.json();
  assert.equal(meJson.id, SMOKE_ID);
  assert.equal(meJson.role, 'member');

  const annRes = await fetch(`${TARGET_URL}/api/announcements/latest`, { headers: authHeaders });
  assert.equal(annRes.status, 200, `Expected 200 on /api/announcements/latest, got ${annRes.status}`);

  // 4. Hidden smoke member must NOT appear on public/member leaderboard
  const lbRes = await fetch(`${TARGET_URL}/api/leaderboard?category=overall`, { headers: authHeaders });
  assert.equal(lbRes.status, 200, `Expected 200 on /api/leaderboard, got ${lbRes.status}`);
  const lbJson = await lbRes.json();
  assert.equal(
    (lbJson.entries || []).some((e) => e.user_id === SMOKE_ID),
    false,
    'Smoke check user leaked into leaderboard',
  );

  // 5. Unknown/invalid token returns 401 session_invalid
  const badTokRes = await fetch(`${TARGET_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${'0'.repeat(64)}` },
  });
  assert.equal(badTokRes.status, 401);
  const badTokJson = await badTokRes.json();
  assert.equal(badTokJson.reason, 'session_invalid');

  // 6. Logout revokes that session only
  const logoutRes = await fetch(`${TARGET_URL}/api/auth/logout`, {
    method: 'POST',
    headers: authHeaders,
  });
  assert.equal(logoutRes.status, 200);
  const postLogoutMe = await fetch(`${TARGET_URL}/api/auth/me`, { headers: authHeaders });
  assert.equal(postLogoutMe.status, 401);

  console.log('Post-deploy auth smoke check PASSED!');
}

try {
  await main();
} finally {
  await cleanupSmokeUser();
}
