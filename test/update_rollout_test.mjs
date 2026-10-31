import assert from 'node:assert/strict';
import { createTestD1 } from './helpers_d1.mjs';
import { onRequestGet as getAppRelease } from '../functions/api/app-release.mjs';
import { onRequestGet as adminListReleases, onRequestPost as adminUpdateRelease } from '../functions/api/admin/releases.mjs';

console.log('=== Running i8 Update Rollout Role/State Matrix Tests (SQLite D1) ===');

const db = createTestD1(['migrations/reading_time_v1.sql', 'migrations/community_chat_and_rollout_v1.sql']);
const exp = '2027-01-01T00:00:00Z';
const tokMember = 'a'.repeat(64);
const tokProfileLegacyAdmin = 'b'.repeat(64); // Part B Rule 4: profile sessions are always members
const tokAdminVictor = 'c'.repeat(64);
const tokAdminPastor = 'd'.repeat(64);

db.exec(`
  INSERT INTO profiles (id, email, name, surname, password_hash, role, email_verified)
  VALUES
    ('mem1', 'mem1@fh.org', 'Grace', 'Okafor', 'hash', 'member', 1),
    ('prof2', 'prof2@fh.org', 'Chidi', 'Eze', 'hash', 'admin', 1);
  INSERT INTO sessions (id, user_id, expires_at) VALUES
    ('${tokMember}', 'mem1', '${exp}'),
    ('${tokProfileLegacyAdmin}', 'prof2', '${exp}');
  INSERT INTO admin_credentials (id, username, salt, password_hash) VALUES
    ('adm_vic', 'victor', 'salt', 'hash'),
    ('adm_dave', 'pastor_dave', 'salt', 'hash');
  INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES
    ('${tokAdminVictor}', 'adm_vic', '${exp}'),
    ('${tokAdminPastor}', 'adm_dave', '${exp}');
`);

// Seed releases: v33 and v34 both start on 'hold' (default for pre-release hold builds)
db.exec(`
  INSERT INTO app_releases (version_code, version_name, tag, apk_url, size_bytes, sha256, changelog, rollout_state, mandatory)
  VALUES
    (33, 'v33', 'v33', 'https://github.com/vjumbo264/forgehouse50-android/releases/download/v33/forgehouse50-v33.apk', 12000000, 'abc33', '["Announcements fix","Timer fix"]', 'hold', 0),
    (34, 'v34', 'v34', 'https://github.com/vjumbo264/forgehouse50-android/releases/download/v34/forgehouse50-v34.apk', 12500000, 'abc34', '["Rest-day catch-up","Audio"]', 'hold', 0);
`);

const env = { DB: db, SKIP_GITHUB_SYNC: true };

async function callAppRelease({ bearer = null, cookie = null } = {}) {
  const headers = new Headers();
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  if (cookie) headers.set('Cookie', `fh50_session=${cookie}`);
  const req = new Request('https://forgehouse50.pages.dev/api/app-release', { headers });
  const res = await getAppRelease({ request: req, env });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Cache-Control') || '', /no-store/);
  return res.json();
}

async function callAdminPost(token, payload) {
  const req = new Request('https://forgehouse50.pages.dev/api/admin/releases', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  return adminUpdateRelease({ request: req, env });
}

// 1. Non-admin (including profile row) cannot access /api/admin/releases
{
  for (const tok of [tokMember, tokProfileLegacyAdmin]) {
    const resGet = await adminListReleases({
      request: new Request('https://forgehouse50.pages.dev/api/admin/releases', {
        headers: { Authorization: `Bearer ${tok}` },
      }),
      env,
    });
    assert.equal(resGet.status, 403);
    const resPost = await callAdminPost(tok, { version_code: 34, action: 'everyone', confirm: 'RELEASE_TO_EVERYONE' });
    assert.equal(resPost.status, 403);
  }
  console.log('  [PASS] Non-admin sessions blocked (403) from GET/POST /api/admin/releases.');
}

// 2. State = 'hold': anon, member, and admins ALL get update_available: false
{
  for (const [label, opts] of [
    ['anon', {}],
    ['member', { bearer: tokMember }],
    ['admin_victor_bearer', { bearer: tokAdminVictor }],
    ['admin_pastor_cookie', { cookie: tokAdminPastor }],
  ]) {
    const r = await callAppRelease(opts);
    assert.equal(r.update_available, false, `${label} must not see held release`);
    assert.ok(!JSON.stringify(r).toLowerCase().includes('admin'), 'No admin mention in user-facing response');
  }
  console.log('  [PASS] Matrix state=hold: anon, member, and admins all receive no update.');
}

// 3. Admin promotes v34 to 'admins_only' -> admins (Bearer & Cookie) get v34; member & anon get update_available: false
{
  const postRes = await callAdminPost(tokAdminVictor, { version_code: 34, action: 'admins_only' });
  assert.equal(postRes.status, 200);

  assert.equal((await callAppRelease({})).update_available, false);
  assert.equal((await callAppRelease({ bearer: tokMember })).update_available, false);
  assert.equal((await callAppRelease({ bearer: tokProfileLegacyAdmin })).update_available, false);

  const admBearer = await callAppRelease({ bearer: tokAdminVictor });
  const admCookie = await callAppRelease({ cookie: tokAdminPastor });
  assert.equal(admBearer.update_available, true);
  assert.equal(admBearer.versionCode, 34);
  assert.equal(admBearer.rolloutState, 'admins_only');
  assert.equal(admCookie.update_available, true);
  assert.equal(admCookie.versionCode, 34);
  console.log('  [PASS] Matrix state=admins_only: admins receive v34; member & anon receive no update.');
}

// 4. Releasing v33 to 'everyone' requires explicit confirmation; once confirmed,
//    member & anon get v33 ('everyone') while admins STILL get v34 ('admins_only', higher versionCode)!
{
  const missingConfirm = await callAdminPost(tokAdminVictor, { version_code: 33, action: 'everyone' });
  assert.equal(missingConfirm.status, 400, 'Releasing to everyone without confirm must return 400');

  const okEveryone = await callAdminPost(tokAdminVictor, {
    version_code: 33,
    action: 'everyone',
    confirm: 'RELEASE_TO_EVERYONE',
  });
  assert.equal(okEveryone.status, 200);

  const anonRel = await callAppRelease({});
  const memRel = await callAppRelease({ bearer: tokMember });
  const admRel = await callAppRelease({ bearer: tokAdminPastor });
  assert.equal(anonRel.update_available, true);
  assert.equal(anonRel.versionCode, 33);
  assert.equal(memRel.update_available, true);
  assert.equal(memRel.versionCode, 33);
  assert.equal(admRel.update_available, true);
  assert.equal(admRel.versionCode, 34);
  console.log('  [PASS] Matrix mixed channels: everyone gets v33 while admins get v34, confirmation guard enforced.');
}

// 5. Pull back to hold: pulling both v33 and v34 back to 'hold' immediately stops delivery + logs audit trail
{
  await callAdminPost(tokAdminPastor, { version_code: 33, action: 'hold' });
  await callAdminPost(tokAdminPastor, { version_code: 34, action: 'hold' });

  assert.equal((await callAppRelease({ bearer: tokMember })).update_available, false);
  assert.equal((await callAppRelease({ bearer: tokAdminPastor })).update_available, false);

  const listRes = await adminListReleases({
    request: new Request('https://forgehouse50.pages.dev/api/admin/releases?sync=0', {
      headers: { Authorization: `Bearer ${tokAdminPastor}` },
    }),
    env,
  });
  const listData = await listRes.json();
  assert.equal(listData.audit_log.length, 4, 'All 4 rollout transitions must be recorded in admin_audit with who & time');
  assert.ok(listData.audit_log[0].summary.includes('pastor_dave'));
  assert.ok(listData.audit_log[0].created_at);
  console.log('  [PASS] Pull back to hold & server-side audit log (time + actor) verified.');
}

console.log('ALL i8 UPDATE ROLLOUT BACKEND TESTS PASSED!');
