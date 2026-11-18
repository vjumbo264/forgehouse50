import assert from 'node:assert/strict';
import { createTestD1, seedCanonicalPlan } from './helpers_d1.mjs';
import { hashPassword, SESSION_TTL_MS } from '../functions/lib/auth.mjs';
import { onRequestPost as login } from '../functions/api/auth/login.mjs';
import { onRequestPost as logout } from '../functions/api/auth/logout.mjs';
import { onRequestGet as me } from '../functions/api/auth/me.mjs';
import { onRequestPost as adminLogin } from '../functions/api/admin/login.mjs';
import { onRequestPost as forgotPassword } from '../functions/api/auth/forgot_password.mjs';
import { onRequestPost as resetPassword } from '../functions/api/auth/reset_password.mjs';
import { onRequestGet as today } from '../functions/api/today.mjs';
import { onRequestGet as leaderboard } from '../functions/api/leaderboard.mjs';
import { onRequestGet as chatThreads } from '../functions/api/community/chat/threads.mjs';
import { onRequestGet as adminParticipants } from '../functions/api/admin/participants.mjs';
import { onRequestGet as adminStats } from '../functions/api/admin/stats.mjs';
import { onRequestGet as adminProgramme } from '../functions/api/admin/programme.mjs';

console.log('=== Running Auth Login, Rolling Session, Error Mapping & Smoke Exclusion Tests (e1-e3) ===');

const db = createTestD1();
seedCanonicalPlan(db);

let nowMs = Date.parse('2026-10-17T10:00:00.000Z');
const env = {
  DB: db,
  BREVO_API_KEY: 'mock-brevo-key',
  get NOW_MS() {
    return nowMs;
  },
};

const memberHashA = await hashPassword('MemberPassA1!');
const memberHashB = await hashPassword('MemberPassB2!');
const smokeHash = await hashPassword('SmokeSecret99!');
const adminHash = await hashPassword('AdminStrongPass123!');

await db.prepare(
  `INSERT INTO profiles (id, email, name, surname, password_hash, role, email_verified, programme_start_date, is_smoke_test)
   VALUES ('m_alpha', 'alpha@example.com', 'Alpha', 'One', ?, 'member', 1, '2026-10-12', 0)`
).bind(memberHashA).run();

await db.prepare(
  `INSERT INTO profiles (id, email, name, surname, password_hash, role, email_verified, programme_start_date, is_smoke_test)
   VALUES ('m_beta', 'beta@example.com', 'Beta', 'Two', ?, 'member', 1, '2026-10-12', 0)`
).bind(memberHashB).run();

await db.prepare(
  `INSERT INTO profiles (id, email, name, surname, password_hash, role, email_verified, programme_start_date, is_smoke_test)
   VALUES ('m_smoke', 'smoke-check@forgehouse50.invalid', 'Smoke', 'Check', ?, 'member', 1, '2026-10-12', 1)`
).bind(smokeHash).run();

await db.prepare(
  `INSERT INTO admin_credentials (id, username, password_hash, salt, iterations)
   VALUES ('adm_1', 'pastordave', ?, '00112233445566778899aabbccddeeff', 100000)`
).bind(adminHash).run();

function jsonReq(url, body, headers = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function getReq(url, headers = {}) {
  return new Request(url, { method: 'GET', headers });
}

function extractCookieToken(res) {
  const sc = res.headers.get('set-cookie') || '';
  const m = sc.match(/fh50_session=([a-f0-9]{64})/);
  return m ? m[1] : null;
}

// 1. Member sign-in + follow-up authenticated calls
const rLoginA = await login({
  request: jsonReq('https://forgehouse50.pages.dev/api/auth/login', {
    email: 'ALPHA@example.com ',
    password: 'MemberPassA1!',
  }),
  env,
});
assert.equal(rLoginA.status, 200);
const loginBodyA = await rLoginA.json();
assert.equal(loginBodyA.ok, true);
assert.equal(loginBodyA.id, 'm_alpha');
assert.equal(loginBodyA.role, 'member');
assert.ok(/^[a-f0-9]{64}$/.test(loginBodyA.token));
const tokenA = extractCookieToken(rLoginA);
assert.equal(tokenA, loginBodyA.token);

const rMeA = await me({
  request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${tokenA}` }),
  env,
});
assert.equal(rMeA.status, 200);
const meBodyA = await rMeA.json();
assert.equal(meBodyA.id, 'm_alpha');

const rTodayA = await today({
  request: getReq('https://forgehouse50.pages.dev/api/today', { Cookie: `fh50_session=${tokenA}` }),
  env,
});
assert.equal(rTodayA.status, 200);

// 2. Rolling 30-day session renewal keeps active member signed in past initial 30-day mark
const sessBefore = await db.prepare('SELECT expires_at, last_seen_at FROM sessions WHERE id = ?').bind(tokenA).first();
assert.equal(Date.parse(sessBefore.expires_at), nowMs + SESSION_TTL_MS);

// Advance 20 days and make an authenticated call -> expires_at must roll forward +30 days from day 20 (day 50)
nowMs += 20 * 24 * 60 * 60 * 1000;
const rMeDay20 = await me({
  request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${tokenA}` }),
  env,
});
assert.equal(rMeDay20.status, 200);
const sessDay20 = await db.prepare('SELECT expires_at, last_seen_at FROM sessions WHERE id = ?').bind(tokenA).first();
assert.equal(Date.parse(sessDay20.expires_at), nowMs + SESSION_TTL_MS);
assert.equal(Date.parse(sessDay20.last_seen_at), nowMs);

// Advance another 20 days (total 40 days since login, past original 30-day deadline, within rolled 50-day window)
nowMs += 20 * 24 * 60 * 60 * 1000;
const rMeDay40 = await me({
  request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${tokenA}` }),
  env,
});
assert.equal(rMeDay40.status, 200, 'Rolling session must stay valid past initial 30-day creation window for active member');

// Advance 35 days of total inactivity (past rolled Day 70 expiry) -> 401 session_expired
nowMs += 35 * 24 * 60 * 60 * 1000;
const rMeExpired = await me({
  request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${tokenA}` }),
  env,
});
assert.equal(rMeExpired.status, 401);
const expiredBody = await rMeExpired.json();
assert.equal(expiredBody.reason, 'session_expired');
const deletedExpired = await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(tokenA).first();
assert.equal(deletedExpired, null);

// 3. Session revocation is scoped strictly to target user; other member + admin sessions remain valid
const rLoginA2 = await login({
  request: jsonReq('https://forgehouse50.pages.dev/api/auth/login', { email: 'alpha@example.com', password: 'MemberPassA1!' }),
  env,
});
const tokenA2 = extractCookieToken(rLoginA2);
const rLoginB = await login({
  request: jsonReq('https://forgehouse50.pages.dev/api/auth/login', { email: 'beta@example.com', password: 'MemberPassB2!' }),
  env,
});
const tokenB = extractCookieToken(rLoginB);
const rAdminLogin = await adminLogin({
  request: jsonReq('https://forgehouse50.pages.dev/api/admin/login', { username: 'pastordave', password: 'AdminStrongPass123!' }),
  env,
});
assert.equal(rAdminLogin.status, 200);
const adminToken = (await rAdminLogin.json()).token;
assert.ok(adminToken);

// Mock Brevo fetch for forgot/reset password
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes('api.brevo.com')) {
    return new Response(JSON.stringify({ messageId: 'mock-id' }), { status: 201 });
  }
  return originalFetch(url);
};
await forgotPassword({
  request: jsonReq('https://forgehouse50.pages.dev/api/auth/forgot_password', { email: 'alpha@example.com' }),
  env,
});
const otpA = await db.prepare("SELECT code FROM otp_codes WHERE user_id = 'm_alpha' ORDER BY created_at DESC LIMIT 1").first();
const rResetA = await resetPassword({
  request: jsonReq('https://forgehouse50.pages.dev/api/auth/reset_password', {
    email: 'alpha@example.com',
    code: otpA.code,
    new_password: 'MemberPassA2!',
  }),
  env,
});
assert.equal(rResetA.status, 200);
const tokenA3 = extractCookieToken(rResetA);
assert.ok(tokenA3 && tokenA3 !== tokenA2);

// Alpha's old token must be invalidated, while Alpha's new token, Beta's token, and Admin's token stay valid
assert.equal((await me({ request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${tokenA2}` }), env })).status, 401);
assert.equal((await me({ request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${tokenA3}` }), env })).status, 200);
assert.equal((await me({ request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${tokenB}` }), env })).status, 200);
const rAdminMe = await me({ request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${adminToken}` }), env });
assert.equal(rAdminMe.status, 200);
assert.equal((await rAdminMe.json()).role, 'admin');

// Logout of Alpha only revokes Alpha's session, never Beta or Admin
const rLogoutA = await logout({
  request: new Request('https://forgehouse50.pages.dev/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenA3}` },
  }),
  env,
});
assert.equal(rLogoutA.status, 200);
assert.equal((await me({ request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${tokenA3}` }), env })).status, 401);
assert.equal((await me({ request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${tokenB}` }), env })).status, 200);
assert.equal((await me({ request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${adminToken}` }), env })).status, 200);
globalThis.fetch = originalFetch;

// 4. Honest status codes & reasons: wrong creds vs missing/invalid tokens vs DB/runtime faults
const rWrongPwd = await login({
  request: jsonReq('https://forgehouse50.pages.dev/api/auth/login', { email: 'alpha@example.com', password: 'WrongPassword!' }),
  env,
});
assert.equal(rWrongPwd.status, 401);
const wrongPwdBody = await rWrongPwd.json();
assert.equal(wrongPwdBody.reason, 'invalid_credentials');
assert.ok(!wrongPwdBody.error.toLowerCase().includes('session expired'));

const rMissingTok = await me({ request: getReq('https://forgehouse50.pages.dev/api/auth/me'), env });
assert.equal(rMissingTok.status, 401);
assert.equal((await rMissingTok.json()).reason, 'session_missing');

const rInvalidTok = await me({
  request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${'f'.repeat(64)}` }),
  env,
});
assert.equal(rInvalidTok.status, 401);
assert.equal((await rInvalidTok.json()).reason, 'session_invalid');

const rMalformedTok = await me({
  request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: 'Bearer not-a-hex-token' }),
  env,
});
assert.equal(rMalformedTok.status, 401);
assert.equal((await rMalformedTok.json()).reason, 'session_invalid');

// Simulated D1 outage: MUST return 503 (never 401!)
const brokenEnv = {
  DB: {
    prepare() {
      throw new Error('D1_ERROR: database unavailable');
    },
    async batch() {
      throw new Error('D1_ERROR: database unavailable');
    },
  },
};
const rDbLogin = await login({
  request: jsonReq('https://forgehouse50.pages.dev/api/auth/login', { email: 'alpha@example.com', password: 'MemberPassA2!' }),
  env: brokenEnv,
});
assert.equal(rDbLogin.status, 503);
const dbLoginBody = await rDbLogin.json();
assert.equal(dbLoginBody.reason, 'server_error');
assert.equal(dbLoginBody.unavailable, true);
assert.ok(!dbLoginBody.error.toLowerCase().includes('session expired'));

const rDbAdminLogin = await adminLogin({
  request: jsonReq('https://forgehouse50.pages.dev/api/admin/login', { username: 'pastordave', password: 'AdminStrongPass123!' }),
  env: brokenEnv,
});
assert.equal(rDbAdminLogin.status, 503);

const rDbMe = await me({
  request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${tokenB}` }),
  env: brokenEnv,
});
assert.equal(rDbMe.status, 503);
assert.equal((await rDbMe.json()).reason, 'db_error');

const rDbToday = await today({
  request: getReq('https://forgehouse50.pages.dev/api/today', { Authorization: `Bearer ${tokenB}` }),
  env: brokenEnv,
});
assert.equal(rDbToday.status, 503);

// Simulated WebCrypto failure in verifyPassword must map to 503, NEVER 401
const origSubtle = crypto.subtle.deriveBits;
crypto.subtle.deriveBits = async () => {
  throw new Error('Simulated WebCrypto internal failure');
};
try {
  const rCryptoFail = await login({
    request: jsonReq('https://forgehouse50.pages.dev/api/auth/login', { email: 'beta@example.com', password: 'MemberPassB2!' }),
    env,
  });
  assert.equal(rCryptoFail.status, 503);
} finally {
  crypto.subtle.deriveBits = origSubtle;
}

// 5. Dedicated smoke-test member (is_smoke_test = 1) can sign in cleanly, but is excluded from all real member & admin views
const rSmokeLogin = await login({
  request: jsonReq('https://forgehouse50.pages.dev/api/auth/login', { email: 'smoke-check@forgehouse50.invalid', password: 'SmokeSecret99!' }),
  env,
});
assert.equal(rSmokeLogin.status, 200);
const smokeToken = (await rSmokeLogin.json()).token;
assert.equal((await me({ request: getReq('https://forgehouse50.pages.dev/api/auth/me', { Authorization: `Bearer ${smokeToken}` }), env })).status, 200);

const rLb = await leaderboard({
  request: getReq('https://forgehouse50.pages.dev/api/leaderboard?category=overall', { Authorization: `Bearer ${tokenB}` }),
  env,
});
assert.equal(rLb.status, 200);
const lbBody = await rLb.json();
assert.equal(lbBody.entries.some(e => e.user_id === 'm_smoke'), false, 'Smoke member must be excluded from leaderboard');
assert.equal(lbBody.eligible_count, 2);

const rThreads = await chatThreads({
  request: getReq('https://forgehouse50.pages.dev/api/community/chat/threads', { Authorization: `Bearer ${adminToken}` }),
  env,
});
assert.equal(rThreads.status, 200);
const threadsBody = await rThreads.json();
assert.equal(threadsBody.directory.some(d => d.user_id === 'm_smoke'), false, 'Smoke member must be excluded from chat directory');

const rParts = await adminParticipants({
  request: getReq('https://forgehouse50.pages.dev/api/admin/participants', { Authorization: `Bearer ${adminToken}` }),
  env,
});
assert.equal(rParts.status, 200);
assert.equal((await rParts.json()).participants.some(p => p.id === 'm_smoke'), false, 'Smoke member must be excluded from admin participants');

const rStats = await adminStats({
  request: getReq('https://forgehouse50.pages.dev/api/admin/stats', { Authorization: `Bearer ${adminToken}` }),
  env,
});
assert.equal(rStats.status, 200);
assert.equal((await rStats.json()).total_participants, 2, 'Smoke member must be excluded from total_participants');

const rProg = await adminProgramme({
  request: getReq('https://forgehouse50.pages.dev/api/admin/programme', { Authorization: `Bearer ${adminToken}` }),
  env,
});
assert.equal(rProg.status, 200);
assert.equal((await rProg.json()).eligible_participants, 2);

console.log('PASSED all auth_login_session_test checks!');
