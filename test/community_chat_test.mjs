import assert from 'node:assert/strict';
import { createTestD1, seedCanonicalPlan } from './helpers_d1.mjs';
import { onRequestGet as getGroupMsgs, onRequestPost as postGroupMsg } from '../functions/api/community/chat/messages.mjs';
import { onRequestDelete as deleteChatMsg } from '../functions/api/community/chat/messages/[id].mjs';
import { onRequestGet as getDirectMsgs, onRequestPost as postDirectMsg } from '../functions/api/community/chat/direct.mjs';
import { onRequestGet as getThreads } from '../functions/api/community/chat/threads.mjs';
import { onRequestGet as syncChat } from '../functions/api/community/chat/sync.mjs';
import { onRequestPost as markChatRead } from '../functions/api/community/chat/read.mjs';
import { onRequestDelete as adminDeleteMsg } from '../functions/api/admin/community/chat/messages/[id].mjs';
import { onRequestPost as adminMute } from '../functions/api/admin/community/chat/mute.mjs';
import { onRequestGet as getToday } from '../functions/api/today.mjs';

console.log('=== Running Community Chat & Direct Messaging Tests (i9 + k1/k2/k3/k5/k6) ===');

const db = createTestD1([
  'migrations/reading_time_v1.sql',
  'migrations/community_chat_v2.sql',
  'migrations/community_chat_v3.sql',
]);
seedCanonicalPlan(db);

const exp = '2027-06-01T00:00:00.000Z';
const tokMemA = '1'.repeat(64);
const tokMemB = '2'.repeat(64);
const tokAdminDave = '3'.repeat(64);
const tokAdminVictor = '4'.repeat(64);

db.exec(`
  INSERT INTO profiles (id, email, name, surname, password_hash, avatar_id, role, email_verified, programme_start_date)
  VALUES
    ('mem_a', 'grace.secret@example.com', 'Grace', 'Okafor', 'hash', 'av_1', 'member', 1, '2026-10-19'),
    ('mem_b', 'chidi.secret@example.com', 'Chidi', 'Nwosu', 'hash', 'av_2', 'member', 1, '2026-10-19');

  INSERT INTO sessions (id, user_id, expires_at, last_seen_at) VALUES
    ('${tokMemA}', 'mem_a', '${exp}', '2026-10-31T09:59:00.000Z'),
    ('${tokMemB}', 'mem_b', '${exp}', '2026-10-31T09:59:00.000Z');

  INSERT INTO admin_credentials (id, username, salt, password_hash) VALUES
    ('adm_dave_uuid', 'fh50-admin-tw4xm5', 'salt', 'hash'),
    ('adm_victor_uuid', 'victor-admin', 'salt', 'hash');

  INSERT INTO admin_sessions (id, admin_id, expires_at, last_seen_at) VALUES
    ('${tokAdminDave}', 'adm_dave_uuid', '${exp}', '2026-10-31T09:59:00.000Z'),
    ('${tokAdminVictor}', 'adm_victor_uuid', '${exp}', '2026-10-31T09:59:00.000Z');
`);

let nowMs = Date.parse('2026-10-31T10:00:00.000Z');
const env = {
  DB: db,
  get NOW_MS() {
    return nowMs;
  },
};

function makeReq(url, { method = 'GET', token = null, body = null } = {}) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (body !== null) headers.set('Content-Type', 'application/json');
  return new Request(url, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
}

function assertPrivacyClean(payload) {
  const raw = JSON.stringify(payload);
  assert.ok(!raw.includes('grace.secret@example.com'), 'Must never leak member email');
  assert.ok(!raw.includes('chidi.secret@example.com'), 'Must never leak member email');
  assert.ok(!raw.includes('Okafor'), 'Must never leak full surname');
  assert.ok(!raw.includes('Nwosu'), 'Must never leak full surname');
  assert.ok(!raw.includes('fh50-admin-tw4xm5'), 'Must never leak raw admin login username');
  assert.ok(!raw.includes('victor-admin'), 'Must never leak raw admin login username');
}

// 1. Auth guard
{
  const res = await getGroupMsgs({ request: makeReq('https://fh50/api/community/chat/messages'), env });
  assert.equal(res.status, 401);
  console.log('  [PASS] Unauthenticated chat access blocked (401).');
}

// 2. Group chat posting (member + admin_credentials), reply-to, client_msg_id dedupe (k3), privacy formatting, pagination
let firstMsgId;
let memBMsgId;
let adminMsgId;
{
  for (let i = 1; i <= 4; i++) {
    nowMs += 1000;
    const clientMsgId = i === 1 ? 'cli-group-dedupe-1' : `cli-group-${i}`;
    const r = await postGroupMsg({
      request: makeReq('https://fh50/api/community/chat/messages', {
        method: 'POST',
        token: tokMemA,
        body: { text: `Morning reflection #${i}`, client_msg_id: clientMsgId },
      }),
      env,
    });
    assert.equal(r.status, 201);
    const data = await r.json();
    assertPrivacyClean(data);
    assert.equal(data.message.author_name, 'Grace O.');
    assert.equal(data.message.author_role, 'member');
    if (i === 1) firstMsgId = data.message.id;
  }

  // k3: Retry with same client_msg_id returns original message without creating duplicate
  const dupRes = await postGroupMsg({
    request: makeReq('https://fh50/api/community/chat/messages', {
      method: 'POST',
      token: tokMemA,
      body: { text: 'Morning reflection #1', client_msg_id: 'cli-group-dedupe-1' },
    }),
    env,
  });
  assert.equal(dupRes.status, 200);
  const dupData = await dupRes.json();
  assert.equal(dupData.deduplicated, true);
  assert.equal(dupData.message.id, firstMsgId);

  // Member B posts a message
  nowMs += 1000;
  const rB = await postGroupMsg({
    request: makeReq('https://fh50/api/community/chat/messages', {
      method: 'POST',
      token: tokMemB,
      body: { text: 'Chidi secret private thought to delete later' },
    }),
    env,
  });
  assert.equal(rB.status, 201);
  memBMsgId = (await rB.json()).message.id;

  // Admin (Pastor Dave via admin_credentials) posts a reply quoting firstMsgId
  nowMs += 1000;
  const admRes = await postGroupMsg({
    request: makeReq('https://fh50/api/community/chat/messages', {
      method: 'POST',
      token: tokAdminDave,
      body: { text: 'Amen Grace! Keep pressing in.', reply_to_id: firstMsgId },
    }),
    env,
  });
  assert.equal(admRes.status, 201);
  const admData = await admRes.json();
  assertPrivacyClean(admData);
  assert.equal(admData.message.author_name, 'Pastor Dave');
  assert.equal(admData.message.author_role, 'admin');
  assert.equal(admData.message.reply_to.id, firstMsgId);
  assert.equal(admData.message.reply_to.author_name, 'Grace O.');
  adminMsgId = admData.message.id;

  // Pagination: limit=3 newest, then ?before=oldest
  const page1 = await (await getGroupMsgs({
    request: makeReq('https://fh50/api/community/chat/messages?limit=3', { token: tokMemB }),
    env,
  })).json();
  assertPrivacyClean(page1);
  assert.equal(page1.messages.length, 3);
  assert.equal(page1.has_older, true);
  assert.equal(page1.messages[2].id, adminMsgId);

  const page2 = await (await getGroupMsgs({
    request: makeReq(`https://fh50/api/community/chat/messages?limit=3&before=${encodeURIComponent(page1.oldest_timestamp)}`, {
      token: tokMemB,
    }),
    env,
  })).json();
  assert.equal(page2.messages.length, 3);
  assert.equal(page2.has_older, false);
  assert.equal(page2.messages[0].id, firstMsgId);

  // /api/today includes unread summary for member A (Pastor Dave + Chidi = 2 unread)
  const todayA = await (await getToday({
    request: makeReq('https://fh50/api/today', { token: tokMemA }),
    env,
  })).json();
  assert.equal(todayA.chat_unread.total_unread, 2);
  console.log('  [PASS] Group chat, client_msg_id dedupe (k3), reply-to, privacy, pagination, and unread counter verified.');
}

// 3. Zero-write idle polling check (both community_chat_members and sessions.last_seen_at throttled)
{
  const beforeRow = db.sqlite.prepare('SELECT updated_at FROM community_chat_members WHERE user_id = ?').get('mem_b');
  const beforeSession = db.sqlite.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').get(tokMemB);
  nowMs += 10_000;
  const pollRes = await (await getGroupMsgs({
    request: makeReq(`https://fh50/api/community/chat/messages?since=${encodeURIComponent(new Date(nowMs).toISOString())}`, {
      token: tokMemB,
    }),
    env,
  })).json();
  assert.equal(pollRes.messages.length, 0);
  const syncRes = await (await syncChat({
    request: makeReq(`https://fh50/api/community/chat/sync?bg=1&group_since=${encodeURIComponent(new Date(nowMs).toISOString())}`, {
      token: tokMemB,
    }),
    env,
  })).json();
  assert.equal(syncRes.group_messages.length, 0);
  const afterRow = db.sqlite.prepare('SELECT updated_at FROM community_chat_members WHERE user_id = ?').get('mem_b');
  const afterSession = db.sqlite.prepare('SELECT last_seen_at FROM sessions WHERE id = ?').get(tokMemB);
  assert.equal(afterRow.updated_at, beforeRow.updated_at, 'Idle poll must perform 0 D1 writes to chat_members');
  assert.equal(afterSession.last_seen_at, beforeSession.last_seen_at, 'Idle poll must not write sessions.last_seen_at within 15m');
  console.log('  [PASS] Zero D1 writes on idle ?since= and /sync polls verified.');
}

// 4. Member-initiated Leadership Shared Inbox (k6), Admin DM send (k2), confidentiality & non-null empty cursor
{
  // Member A always has "ForgeHouse Leadership" thread available immediately (k6)
  const initThreadsA = await (await getThreads({
    request: makeReq('https://fh50/api/community/chat/threads', { token: tokMemA }),
    env,
  })).json();
  assert.equal(initThreadsA.threads.length, 1);
  assert.equal(initThreadsA.threads[0].title, 'ForgeHouse Leadership');

  // Member B empty direct thread returns non-null EPOCH_ISO last_timestamp so client never loops (k2/FH-014)
  const emptyDirectB = await (await getDirectMsgs({
    request: makeReq('https://fh50/api/community/chat/direct', { token: tokMemB }),
    env,
  })).json();
  assert.equal(emptyDirectB.messages.length, 0);
  assert.equal(emptyDirectB.thread_started_by_admin, true);
  assert.ok(emptyDirectB.last_timestamp && emptyDirectB.last_timestamp.length > 0);

  // Member A initiates private message to leadership (k6) -> 201!
  nowMs += 1000;
  const memStartDm = await postDirectMsg({
    request: makeReq('https://fh50/api/community/chat/direct', {
      method: 'POST',
      token: tokMemA,
      body: { text: 'Hello leadership, can we pray about my schedule?', client_msg_id: 'cli-dm-1' },
    }),
    env,
  });
  assert.equal(memStartDm.status, 201);

  // Retry same client_msg_id -> deduplicated 200
  const memDupDm = await postDirectMsg({
    request: makeReq('https://fh50/api/community/chat/direct', {
      method: 'POST',
      token: tokMemA,
      body: { text: 'Hello leadership, can we pray about my schedule?', client_msg_id: 'cli-dm-1' },
    }),
    env,
  });
  assert.equal(memDupDm.status, 200);
  assert.equal((await memDupDm.json()).deduplicated, true);

  // Member A tries to message Member B -> 403
  const memToMemPost = await postDirectMsg({
    request: makeReq('https://fh50/api/community/chat/direct', {
      method: 'POST',
      token: tokMemA,
      body: { target_user_id: 'mem_b', text: 'Psst Chidi' },
    }),
    env,
  });
  assert.equal(memToMemPost.status, 403);

  // Both Pastor Dave and ForgeHouse Admin see Member A's thread in the shared inbox and can reply (k2 + k6)
  const bgCursorBeforeReply = new Date(nowMs).toISOString();
  nowMs += 1000;
  const admDm = await postDirectMsg({
    request: makeReq('https://fh50/api/community/chat/direct', {
      method: 'POST',
      token: tokAdminDave,
      body: { target_user_id: 'mem_a', text: 'Grace, we are praying with you!' },
    }),
    env,
  });
  assert.equal(admDm.status, 201);

  nowMs += 1000;
  const admVictorDm = await postDirectMsg({
    request: makeReq('https://fh50/api/community/chat/direct', {
      method: 'POST',
      token: tokAdminVictor,
      body: { target_user_id: 'mem_a', text: 'Checking in too - Victor' },
    }),
    env,
  });
  assert.equal(admVictorDm.status, 201);
  assert.equal((await admVictorDm.json()).message.author_name, 'ForgeHouse Admin');

  // Member B CANNOT read Member A's thread under any query param -> 403
  const snoopingGet = await getDirectMsgs({
    request: makeReq('https://fh50/api/community/chat/direct?thread_id=mem_a', { token: tokMemB }),
    env,
  });
  assert.equal(snoopingGet.status, 403);

  // Background /sync for Member A sees the 2 new leader replies without marking them read
  const syncA = await (await syncChat({
    request: makeReq(`https://fh50/api/community/chat/sync?bg=1&group_since=${encodeURIComponent(bgCursorBeforeReply)}&direct_since=${encodeURIComponent(bgCursorBeforeReply)}`, {
      token: tokMemA,
    }),
    env,
  })).json();
  assert.equal(syncA.direct_messages.length, 2);
  assert.equal(syncA.unread.direct_unread, 2);

  // POST /api/community/chat/read marks direct thread read (k7 notification Mark-as-read action)
  await markChatRead({
    request: makeReq('https://fh50/api/community/chat/read', {
      method: 'POST',
      token: tokMemA,
      body: { channel_type: 'direct', timestamp: new Date(nowMs).toISOString() },
    }),
    env,
  });
  const syncAfterRead = await (await syncChat({
    request: makeReq('https://fh50/api/community/chat/sync?unread_only=1', { token: tokMemA }),
    env,
  })).json();
  assert.equal(syncAfterRead.unread.direct_unread, 0);

  console.log('  [PASS] Member-initiated shared leadership inbox (k6), multi-admin replies (k2), /sync & /read verified.');
}

// 5. Member self-delete & admin soft-delete (k5): non-admins NEVER see deleted text anywhere; admins see flagged original
{
  // Member A CANNOT delete Member B's message -> 403
  const stealDel = await deleteChatMsg({
    request: makeReq(`https://fh50/api/community/chat/messages/${memBMsgId}`, {
      method: 'DELETE',
      token: tokMemA,
    }),
    env,
  });
  assert.equal(stealDel.status, 403);

  // Member B deletes their own message -> 200
  const beforeMemDel = new Date(nowMs).toISOString();
  nowMs += 1000;
  const selfDel = await deleteChatMsg({
    request: makeReq(`https://fh50/api/community/chat/messages/${memBMsgId}`, {
      method: 'DELETE',
      token: tokMemB,
    }),
    env,
  });
  assert.equal(selfDel.status, 200);

  // Admin deletes firstMsgId (which adminMsgId quoted!)
  nowMs += 1000;
  const admDel = await adminDeleteMsg({
    request: makeReq(`https://fh50/api/admin/community/chat/messages/${firstMsgId}`, {
      method: 'DELETE',
      token: tokAdminDave,
    }),
    env,
  });
  assert.equal(admDel.status, 200);

  // Incremental ?since= poll for Member A returns updated soft-deleted messages with text replaced and NO leak
  const deltaMem = await (await getGroupMsgs({
    request: makeReq(`https://fh50/api/community/chat/messages?since=${encodeURIComponent(beforeMemDel)}`, {
      token: tokMemA,
    }),
    env,
  })).json();
  const rawDeltaMem = JSON.stringify(deltaMem);
  assert.ok(!rawDeltaMem.includes('Chidi secret private thought'), 'Deleted text MUST NEVER leak to members in ?since=');
  assert.ok(!rawDeltaMem.includes('Morning reflection #1'), 'Deleted text MUST NEVER leak to members in ?since=');

  // Full list for Member A shows tombstone "This message was deleted" + reply_to shows "This message was deleted"
  const fullMem = await (await getGroupMsgs({
    request: makeReq('https://fh50/api/community/chat/messages', { token: tokMemA }),
    env,
  })).json();
  const rawFullMem = JSON.stringify(fullMem);
  assert.ok(!rawFullMem.includes('Chidi secret private thought'), 'Deleted text MUST NEVER leak to members');
  assert.ok(!rawFullMem.includes('Morning reflection #1'), 'Deleted text MUST NEVER leak to members or reply_to');
  const tombstoneB = fullMem.messages.find((m) => m.id === memBMsgId);
  assert.equal(tombstoneB.is_deleted, true);
  assert.equal(tombstoneB.text, 'This message was deleted');
  const daveReplyMem = fullMem.messages.find((m) => m.id === adminMsgId);
  assert.equal(daveReplyMem.reply_to.text, 'This message was deleted');

  // Background /sync NEVER includes deleted messages for notification
  const bgMem = await (await syncChat({
    request: makeReq(`https://fh50/api/community/chat/sync?bg=1&group_since=${encodeURIComponent(beforeMemDel)}`, {
      token: tokMemA,
    }),
    env,
  })).json();
  assert.ok(!JSON.stringify(bgMem).includes('Chidi secret private thought'));

  // Admin STILL sees original text with is_deleted: true
  const fullAdm = await (await getGroupMsgs({
    request: makeReq('https://fh50/api/community/chat/messages', { token: tokAdminDave }),
    env,
  })).json();
  const admViewB = fullAdm.messages.find((m) => m.id === memBMsgId);
  assert.equal(admViewB.is_deleted, true);
  assert.equal(admViewB.text, 'Chidi secret private thought to delete later');

  // Member also deletes their own direct message and threads endpoint does NOT leak it
  const ownDm = await postDirectMsg({
    request: makeReq('https://fh50/api/community/chat/direct', {
      method: 'POST',
      token: tokMemB,
      body: { text: 'Secret DM text to remove' },
    }),
    env,
  });
  const ownDmId = (await ownDm.json()).message.id;
  nowMs += 1000;
  const delDmRes = await deleteChatMsg({
    request: makeReq(`https://fh50/api/community/chat/messages/${ownDmId}`, {
      method: 'DELETE',
      token: tokMemB,
    }),
    env,
  });
  assert.equal(delDmRes.status, 200);
  const threadsBAfter = await (await getThreads({
    request: makeReq('https://fh50/api/community/chat/threads', { token: tokMemB }),
    env,
  })).json();
  assert.equal(threadsBAfter.threads[0].latest_message, 'This message was deleted');
  assert.ok(!JSON.stringify(threadsBAfter).includes('Secret DM text to remove'));

  console.log('  [PASS] Member self-delete & admin soft-delete (k5): zero text leak to members, flagged original for admins.');
}

// 6. Mute & Rate limiting (max 10 messages per 60s)
{
  await adminMute({
    request: makeReq('https://fh50/api/admin/community/chat/mute', {
      method: 'POST',
      token: tokAdminDave,
      body: { user_id: 'mem_b', action: 'mute' },
    }),
    env,
  });
  const mutedPost = await postGroupMsg({
    request: makeReq('https://fh50/api/community/chat/messages', {
      method: 'POST',
      token: tokMemB,
      body: { text: 'Am I muted?' },
    }),
    env,
  });
  assert.equal(mutedPost.status, 403);
  await adminMute({
    request: makeReq('https://fh50/api/admin/community/chat/mute', {
      method: 'POST',
      token: tokAdminDave,
      body: { user_id: 'mem_b', action: 'unmute' },
    }),
    env,
  });

  nowMs += 120_000;
  for (let i = 1; i <= 10; i++) {
    nowMs += 500;
    const r = await postGroupMsg({
      request: makeReq('https://fh50/api/community/chat/messages', {
        method: 'POST',
        token: tokMemB,
        body: { text: `Burst ${i}` },
      }),
      env,
    });
    assert.equal(r.status, 201);
  }
  nowMs += 500;
  const r11 = await postGroupMsg({
    request: makeReq('https://fh50/api/community/chat/messages', {
      method: 'POST',
      token: tokMemB,
      body: { text: 'Burst 11 should rate limit' },
    }),
    env,
  });
  assert.equal(r11.status, 429);

  nowMs += 61_000;
  const recovered = await postGroupMsg({
    request: makeReq('https://fh50/api/community/chat/messages', {
      method: 'POST',
      token: tokMemB,
      body: { text: 'After window' },
    }),
    env,
  });
  assert.equal(recovered.status, 201);
  console.log('  [PASS] Mute & rate limit (10/60s -> 429, recovers after window) verified.');
}

console.log('ALL COMMUNITY CHAT TESTS PASSED!');
