import assert from 'node:assert/strict';
import { createTestD1 } from './helpers_d1.mjs';
import { onRequestGet as getLatest } from '../functions/api/announcements/latest.mjs';
import { onRequestGet as getArchive } from '../functions/api/announcements/index.mjs';
import { onRequestGet as adminList, onRequestPost as adminCreate } from '../functions/api/admin/announcements/index.mjs';
import { onRequestPut as adminUpdate, onRequestDelete as adminDelete } from '../functions/api/admin/announcements/[id].mjs';
import { onRequestGet as getToday } from '../functions/api/today.mjs';

console.log('=== Running Announcements (i4) Full SQLite Integration Tests ===');

const DB = createTestD1();
const env = { DB };

// Seed 1 dedicated admin_credentials + session, 1 profile admin + session, and 1 regular member + session
const exp = new Date(Date.now() + 86400_000).toISOString();
DB.exec(`
  INSERT INTO admin_credentials (id, username, salt, password_hash) VALUES ('adm-cred-1', 'pastordave', 'salt', 'hash');
  INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'adm-cred-1', '${exp}');

  INSERT INTO profiles (id, email, name, surname, password_hash, role, email_verified, programme_start_date)
  VALUES ('prof-admin-1', 'leader@fh.org', 'Grace', 'Okafor', 'hash', 'admin', 1, '2026-09-07'),
         ('member-1', 'john@fh.org', 'John', 'Adeyemi', 'hash', 'member', 1, '2026-09-07');

  INSERT INTO sessions (id, user_id, expires_at)
  VALUES ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'prof-admin-1', '${exp}'),
         ('cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'member-1', '${exp}');
`);

function req(url, { method = 'GET', token = null, body = null } = {}) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body) headers.set('Content-Type', 'application/json');
  return new Request(`https://forgehouse50.pages.dev${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// 1. Dedicated admin_credentials can fetch /api/today without FK failure!
const todayPastor = await getToday({ request: req('/api/today', { token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }), env });
assert.equal(todayPastor.status, 200);
const todayData = await todayPastor.json();
assert.equal(todayData.programme.total_days, 50);
console.log('✓ Dedicated admin_credentials session loads /api/today cleanly without FK error');

// 2. Member cannot post announcement
const denyRes = await adminCreate({
  request: req('/api/admin/announcements', { method: 'POST', token: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', body: { title: 'Hack', body: 'Nope' } }),
  env,
});
assert.equal(denyRes.status, 403);
console.log('✓ Non-admin blocked from creating announcements (403)');

// 3. Pastor posts a long multi-paragraph announcement (>1000 chars, <=4000 chars)
const longBody = 'Good afternoon ForgeHouse family. '.repeat(40).trim(); // ~1360 chars
const createRes = await adminCreate({
  request: req('/api/admin/announcements', {
    method: 'POST',
    token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    body: { title: 'IMPORTANT PASTORAL NOTICE ON CONSISTENCY', body: longBody },
  }),
  env,
});
assert.equal(createRes.status, 201);
const { id: annId } = await createRes.json();
assert.ok(annId);

// 4. Immediately visible on /api/announcements/latest with no-store headers and full non-truncated body
const latestRes = await getLatest({ request: req('/api/announcements/latest'), env });
assert.equal(latestRes.status, 200);
assert.match(latestRes.headers.get('Cache-Control') || '', /no-store/);
const latestJson = await latestRes.json();
assert.equal(latestJson.total_active, 1);
assert.equal(latestJson.total_all, 1);
assert.equal(latestJson.announcement.id, annId);
assert.equal(latestJson.announcement.body, longBody);
console.log('✓ Long announcement immediately served with full body & Cache-Control: no-store');

// 5. Edit announcement -> immediately reflected
const updatedBody = longBody + '\n\nPlease complete today before midnight.';
const editRes = await adminUpdate({
  request: req(`/api/admin/announcements/${annId}`, {
    method: 'PUT',
    token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    body: { title: 'UPDATED PASTORAL NOTICE', body: updatedBody, status: 'active' },
  }),
  env,
  params: { id: annId },
});
assert.equal(editRes.status, 200);
const afterEdit = await (await getLatest({ request: req('/api/announcements/latest'), env })).json();
assert.equal(afterEdit.announcement.title, 'UPDATED PASTORAL NOTICE');
assert.equal(afterEdit.announcement.body, updatedBody);
console.log('✓ Edited announcement immediately reflected on /api/announcements/latest');

// 6. Retire announcement (status='archived') -> removed from Today active card, preserved in archive!
const retireRes = await adminUpdate({
  request: req(`/api/admin/announcements/${annId}`, {
    method: 'PUT',
    token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    body: { status: 'archived' },
  }),
  env,
  params: { id: annId },
});
assert.equal(retireRes.status, 200);

const afterRetireLatest = await (await getLatest({ request: req('/api/announcements/latest'), env })).json();
assert.equal(afterRetireLatest.announcement, null);
assert.equal(afterRetireLatest.total_active, 0);
assert.equal(afterRetireLatest.total_archived, 1);
assert.equal(afterRetireLatest.total_all, 1);

const archiveJson = await (await getArchive({ request: req('/api/announcements'), env })).json();
assert.equal(archiveJson.announcements.length, 1);
assert.equal(archiveJson.announcements[0].id, annId);
assert.equal(archiveJson.announcements[0].status, 'archived');
console.log('✓ Retired announcement leaves Today active card while remaining in /api/announcements archive');

// 7. Audit trail recorded create, edit, retire
const audits = (await DB.prepare("SELECT action FROM admin_audit WHERE target_user_id = ? ORDER BY rowid ASC").bind(annId).all()).results;
assert.deepEqual(audits.map(a => a.action), ['announcement_create', 'announcement_edit', 'announcement_retire']);
console.log('✓ Admin audit trail verified:', audits.map(a => a.action).join(' -> '));

// 8. Email profile session cannot act as admin (Part B Rule 4), dedicated admin Cookie session deletes cleanly
const emailAdminDeny = await adminDelete({
  request: req(`/api/admin/announcements/${annId}`, { method: 'DELETE', token: 'b'.repeat(64) }),
  env,
  params: { id: annId },
});
assert.equal(emailAdminDeny.status, 403);

const cookieReq = new Request(`https://forgehouse50.pages.dev/api/admin/announcements/${annId}`, {
  method: 'DELETE',
  headers: { Cookie: `fh50_session=${'a'.repeat(64)}` },
});
const delRes = await adminDelete({ request: cookieReq, env, params: { id: annId } });
assert.equal(delRes.status, 200);
const afterDelArchive = await (await getArchive({ request: req('/api/announcements'), env })).json();
assert.equal(afterDelArchive.announcements.length, 0);
console.log('✓ Delete removes announcement cleanly');
console.log('=== All Announcements (i4) Backend Tests Passed! ===');
