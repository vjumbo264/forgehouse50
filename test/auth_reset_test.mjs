import assert from 'node:assert/strict';
import { createTestD1 } from './helpers_d1.mjs';
import { hashPassword } from '../functions/lib/auth.mjs';
import { onRequestPost as forgotPassword } from '../functions/api/auth/forgot_password.mjs';
import { onRequestPost as resetPassword } from '../functions/api/auth/reset_password.mjs';
import { onRequestPost as login } from '../functions/api/auth/login.mjs';

console.log('=== Running Forgot/Reset Password Tests (k9) ===');

const db = createTestD1();
const oldHash = await hashPassword('OldPassword123!');
db.prepare(
  `INSERT INTO profiles (id, email, name, surname, password_hash, avatar_id, role, email_verified)
   VALUES ('u_reset_1', 'ada@example.com', 'Ada', 'Okafor', ?, 'av_1', 'member', 1)`
).bind(oldHash).run();

let nowMs = Date.parse('2026-11-13T10:00:00.000Z');
const sentEmails = [];
let failNextEmail = false;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.brevo.com')) {
    if (failNextEmail) {
      return new Response('Service Unavailable', { status: 503 });
    }
    const payload = JSON.parse(opts.body);
    sentEmails.push(payload);
    return new Response(JSON.stringify({ messageId: 'mock-msg-1' }), { status: 201 });
  }
  return originalFetch(url, opts);
};

const env = {
  DB: db,
  BREVO_API_KEY: 'mock-brevo-key',
  get NOW_MS() {
    return nowMs;
  },
};

function makeJsonReq(body) {
  return new Request('https://forgehouse50.pages.dev/api/auth/forgot_password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// 1. Unknown email still returns 200 without enumeration and sends no email
const rUnknown = await forgotPassword({ request: makeJsonReq({ email: 'nobody@example.com' }), env });
assert.equal(rUnknown.status, 200);
assert.equal(sentEmails.length, 0);

// 2. Brevo failure deletes orphaned OTP and returns 503 instead of lying
failNextEmail = true;
const rFailMail = await forgotPassword({ request: makeJsonReq({ email: 'ada@example.com' }), env });
assert.equal(rFailMail.status, 503);
const orphan = await db.prepare("SELECT * FROM otp_codes WHERE user_id = 'u_reset_1'").first();
assert.equal(orphan, null);

// 3. Valid request sends 6-digit code via Brevo and enforces 30s cooldown
failNextEmail = false;
const rOk = await forgotPassword({ request: makeJsonReq({ email: '  ADA@example.com ' }), env });
assert.equal(rOk.status, 200);
assert.equal(sentEmails.length, 1);

const otpRow = await db.prepare("SELECT * FROM otp_codes WHERE user_id = 'u_reset_1'").first();
assert.ok(/^\d{6}$/.test(otpRow.code));
assert.ok(sentEmails[0].htmlContent.includes(otpRow.code));

const rCooldown = await forgotPassword({ request: makeJsonReq({ email: 'ada@example.com' }), env });
assert.equal(rCooldown.status, 429);

// 4. Wrong code increments attempts and rejects reset
const rWrong = await resetPassword({
  request: makeJsonReq({ email: 'ada@example.com', code: otpRow.code === '000000' ? '111111' : '000000', new_password: 'NewPassword999!' }),
  env,
});
assert.equal(rWrong.status, 400);

// 5. Seed old session, reset with valid code, verify old session is revoked, new cookie issued, and new password works
await db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES ('old_sess_tok', 'u_reset_1', '2027-01-01T00:00:00Z')").run();
const rReset = await resetPassword({
  request: makeJsonReq({ email: 'ada@example.com', code: otpRow.code, new_password: 'NewPassword999!' }),
  env,
});
assert.equal(rReset.status, 200);
const resetBody = await rReset.json();
assert.equal(resetBody.ok, true);
assert.equal(resetBody.id, 'u_reset_1');
assert.equal(resetBody.role, 'member');
assert.ok(rReset.headers.get('set-cookie')?.includes('fh50_session='));

const oldSess = await db.prepare("SELECT * FROM sessions WHERE id = 'old_sess_tok'").first();
assert.equal(oldSess, null);

// 6. Old password fails, new password succeeds, and consumed OTP cannot be reused
const rOldLogin = await login({ request: makeJsonReq({ email: 'ada@example.com', password: 'OldPassword123!' }), env });
assert.equal(rOldLogin.status, 401);

const rNewLogin = await login({ request: makeJsonReq({ email: 'ada@example.com', password: 'NewPassword999!' }), env });
assert.equal(rNewLogin.status, 200);

const rReplay = await resetPassword({
  request: makeJsonReq({ email: 'ada@example.com', code: otpRow.code, new_password: 'AnotherPassword1!' }),
  env,
});
assert.equal(rReplay.status, 400);

// 7. Expired OTP is rejected cleanly
nowMs += 60 * 1000;
await forgotPassword({ request: makeJsonReq({ email: 'ada@example.com' }), env });
const expRow = await db.prepare("SELECT code FROM otp_codes WHERE user_id = 'u_reset_1'").first();
nowMs += 11 * 60 * 1000; // past 10m TTL
const rExpired = await resetPassword({
  request: makeJsonReq({ email: 'ada@example.com', code: expRow.code, new_password: 'ExpiredTestPassword1!' }),
  env,
});
assert.equal(rExpired.status, 400);

// 8. Admin profile resetting password preserves role=admin
db.prepare(
  `INSERT INTO profiles (id, email, name, surname, password_hash, avatar_id, role, email_verified)
   VALUES ('u_admin_reset', 'pastor@example.com', 'Pastor', 'Dave', ?, 'av_1', 'admin', 1)`
).bind(oldHash).run();
await forgotPassword({ request: makeJsonReq({ email: 'pastor@example.com' }), env });
const adminOtp = await db.prepare("SELECT code FROM otp_codes WHERE user_id = 'u_admin_reset'").first();
const rAdminReset = await resetPassword({
  request: makeJsonReq({ email: 'pastor@example.com', code: adminOtp.code, new_password: 'PastorNewPass99!' }),
  env,
});
assert.equal(rAdminReset.status, 200);
const adminResetBody = await rAdminReset.json();
assert.equal(adminResetBody.role, 'admin');

globalThis.fetch = originalFetch;
console.log('PASSED all auth_reset_test checks!');
