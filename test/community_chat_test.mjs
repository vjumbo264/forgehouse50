import assert from 'node:assert/strict';
import { createTestD1, seedCanonicalPlan } from './helpers_d1.mjs';
import { onRequestGet as getGroupMsgs, onRequestPost as postGroupMsg } from '../functions/api/community/chat/messages.mjs';
import { onRequestGet as getDirectMsgs, onRequestPost as postDirectMsg } from '../functions/api/community/chat/direct.mjs';
import { onRequestGet as getThreads } from '../functions/api/community/chat/threads.mjs';
import { onRequestDelete as adminDeleteMsg } from '../functions/api/admin/community/chat/messages/[id].mjs';
import { onRequestPost as adminMute } from '../functions/api/admin/community/chat/mute.mjs';
import { onRequestGet as getToday } from '../functions/api/today.mjs';

console.log('=== Running i9 Community Chat & Direct Messaging Tests (SQLite D1) ===');

const db = createTestD1(['migrations/reading_time_v1.sql', 'migrations/community_chat_v2.sql']);
seedCanonicalPlan(db);

const exp = '2027-06-01T00:00:00.000Z';
const tokMemA = '1'.repeat(64);
const tokMemB = '2'.repeat(64);
const tokAdminDave = '3'.repeat(64);

db.exec(`
  INSERT INTO profiles (id, email, name, surname, password_hash, avatar_id, role, email_verified, programme_start_date)
  VALUES
    ('mem_a', 'grace.secret@example.com', 'Grace', 'Okafor', 'hash', 'av_1', 'member', 1, '2026-10-19'),
    ('mem_b', 'chidi.secret@example.com', 'Chidi', 'Nwosu', 'hash', 'av_2', 'member', 1, '2026-10-19');

  INSERT INTO sessions (id, user_id, expires_at) VALUES
    ('${tokMemA}', 'mem_a', '${exp}'),
    ('${tokMemB}', 'mem_b', '${exp}');

  INSERT INTO admin_credentials (id, username, salt, password_hash) VALUES
    ('adm_dave_uuid', 'fh50-admin-tw4xm5', 'salt', 'hash');

  INSERT INTO admin_sessions (id, admin_id, expires_at) VALUES
    ('${tokAdminDave}', 'adm_dave_uuid', '${exp}');
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
}

// 1. Auth guard
{
  const res = await getGroupMsgs({ request: makeReq('https://fh50/api/community/chat/messages'), env });
  assert.equal(res.status, 401);
  console.log('  [PASS] Unauthenticated chat access blocked (401).');
}

// 2. Group chat posting (member + admin_credentials), reply-to, privacy formatting, and pagination
let firstMsgId;
let adminMsgId;
{
  for (let i = 1; i <= 4; i++) {
    nowMs += 1000;
    const r = await postGroupMsg({
      request: makeReq('https://fh50/api/community/chat/messages', {
        method: 'POST',
        token: tokMemA,
        body: { text: `Morning reflection #${i}` },
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

  // Pastor Dave (admin_credentials, NOT in profiles) replies to message #1
  nowMs += 1000;
  const admRes = await postGroupMsg({
    request: makeReq('https://fh50/api/community/chat/messages', {
      method: 'POST',
      token: tokAdminDave,
      body: { text: 'Well spotted Grace! Keep pressing on.', reply_to_id: firstMsgId },
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
  assert.equal(admData.message.reply_to.text, 'Morning reflection #1');
  adminMsgId = admData.message.id;

  // Member B checks /api/today BEFORE opening chat -> sees 5 group_unread
  const todayBefore = await (await getToday({
    request: makeReq('https://fh50/api/today', { token: tokMemB }),
    env,
  })).json();
  assert.equal(todayBefore.chat_unread.group_unread, 5);
  assert.equal(todayBefore.chat_unread.direct_unread, 0);

  // Pagination: initial load with limit=3 returns newest 3 (#3, #4, Pastor Dave) in chronological order + has_older=true
  nowMs += 1000;
  const page1 = await (await getGroupMsgs({
    request: makeReq('https://fh50/api/community/chat/messages?limit=3', { token: tokMemB }),
    env,
  })).json();
  assertPrivacyClean(page1);
  assert.equal(page1.has_older, true);
  assert.equal(page1.messages.length, 3);
  assert.equal(page1.messages[0].text, 'Morning reflection #3');
  assert.equal(page1.messages[2].text, 'Well spotted Grace! Keep pressing on.');

  // Older history pagination (?before=oldest_timestamp) returns #1 and #2 chronologically
  const older = await (await getGroupMsgs({
    request: makeReq(`https://fh50/api/community/chat/messages?limit=3&before=${encodeURIComponent(page1.oldest_timestamp)}`, {
      token: tokMemB,
    }),
    env,
  })).json();
  assert.equal(older.has_older, false);
  assert.equal(older.messages.length, 2);
  assert.equal(older.messages[0].text, 'Morning reflection #1');
  assert.equal(older.messages[1].text, 'Morning reflection #2');

  // Member B's group_unread is now 0!
  const todayAfter = await (await getToday({
    request: makeReq('https://fh50/api/today', { token: tokMemB }),
    env,
  })).json();
  assert.equal(todayAfter.chat_unread.group_unread, 0);

  console.log('  [PASS] Group chat, admin_credentials FK safety, reply-to, privacy, pagination, and unread counter verified.');
}

// 3. Zero-write idle polling check
{
  const beforeRow = db.sqlite.prepare('SELECT updated_at FROM community_chat_members WHERE user_id = ?').get('mem_b');
  nowMs += 10_000;
  const pollRes = await (await getGroupMsgs({
    request: makeReq(`https://fh50/api/community/chat/messages?since=${encodeURIComponent(new Date(nowMs).toISOString())}`, {
      token: tokMemB,
    }),
    env,
  })).json();
  assert.equal(pollRes.messages.length, 0);
  const afterRow = db.sqlite.prepare('SELECT updated_at FROM community_chat_members WHERE user_id = ?').get('mem_b');
  assert.equal(afterRow.updated_at, beforeRow.updated_at, 'Idle poll must perform 0 D1 writes');
  console.log('  [PASS] Zero D1 writes on idle ?since= polls verified.');
}

// 4. Private direct threads: confidentiality & admin-initiated rule
{
  // Member A has no direct thread yet -> threads list is empty, cannot initiate before admin
  const initThreadsA = await (await getThreads({
    request: makeReq('https://fh50/api/community/chat/threads', { token: tokMemA }),
    env,
  })).json();
  assert.equal(initThreadsA.threads.length, 0);

  const prematurePost = await postDirectMsg({
    request: makeReq('https://fh50/api/community/chat/direct', {
      method: 'POST',
      token: tokMemA,
      body: { text: 'Hello Pastor!' },
    }),
    env,
  });
  assert.equal(prematurePost.status, 403, 'Member cannot initiate private thread before admin');

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

  // Admin starts private thread with Member A
  nowMs += 1000;
  const admDm = await postDirectMsg({
    request: makeReq('https://fh50/api/community/chat/direct', {
      method: 'POST',
      token: tokAdminDave,
      body: { target_user_id: 'mem_a', text: 'Grace, thank you for your consistency this week!' },
    }),
    env,
  });
  assert.equal(admDm.status, 201);

  // Member B CANNOT read Member A's thread under any query param -> 403
  const snoopingGet = await getDirectMsgs({
    request: makeReq('https://fh50/api/community/chat/direct?thread_id=mem_a', { token: tokMemB }),
    env,
  });
  assert.equal(snoopingGet.status, 403, 'Member B must get 403 trying to read Member A thread');

  // Member B's own threads list is still empty
  const threadsB = await (await getThreads({
    request: makeReq('https://fh50/api/community/chat/threads', { token: tokMemB }),
    env,
  })).json();
  assert.equal(threadsB.threads.length, 0);
  assert.equal(threadsB.unread.direct_unread, 0);

  // Member A sees 1 unread direct message in threads & today, reads it, and replies!
  const threadsA = await (await getThreads({
    request: makeReq('https://fh50/api/community/chat/threads', { token: tokMemA }),
    env,
  })).json();
  assertPrivacyClean(threadsA);
  assert.equal(threadsA.threads.length, 1);
  assert.equal(threadsA.threads[0].unread_count, 1);
  assert.equal(threadsA.threads[0].title, 'Pastor Dave');

  nowMs += 1000;
  const readDmA = await (await getDirectMsgs({
    request: makeReq('https://fh50/api/community/chat/direct', { token: tokMemA }),
    env,
  })).json();
  assert.equal(readDmA.messages.length, 1);
  assert.equal(readDmA.thread_started_by_admin, true);

  nowMs += 1000;
  const replyA = await postDirectMsg({
    request: makeReq('https://fh50/api/community/chat/direct', {
      method: 'POST',
      token: tokMemA,
      body: { text: 'Thank you Pastor Dave!' },
    }),
    env,
  });
  assert.equal(replyA.status, 201);

  // Admin checks threads -> sees Grace O. thread with unread_count = 1 and privacy-safe directory of 2 verified members
  const admThreads = await (await getThreads({
    request: makeReq('https://fh50/api/community/chat/threads', { token: tokAdminDave }),
    env,
  })).json();
  assertPrivacyClean(admThreads);
  assert.equal(admThreads.threads.length, 1);
  assert.equal(admThreads.threads[0].title, 'Grace O.');
  assert.equal(admThreads.threads[0].unread_count, 1);
  assert.equal(admThreads.directory.length, 2);

  console.log('  [PASS] Private admin<->member thread confidentiality, initiation guard, and per-thread unreads verified.');
}

// 5. Moderation: mute/unmute & soft-delete + deleted_ids sync + audit log
{
  // Member cannot mute or delete
  const nonAdminMute = await adminMute({
    request: makeReq('https://fh50/api/admin/community/chat/mute', {
      method: 'POST',
      token: tokMemA,
      body: { user_id: 'mem_b', action: 'mute' },
    }),
    env,
  });
  assert.equal(nonAdminMute.status, 403);

  const nonAdminDel = await adminDeleteMsg({
    request: makeReq(`https://fh50/api/admin/community/chat/messages/${firstMsgId}`, {
      method: 'DELETE',
      token: tokMemA,
    }),
    env,
  });
  assert.equal(nonAdminDel.status, 403);

  // Admin mutes Member B
  nowMs += 1000;
  const muteRes = await adminMute({
    request: makeReq('https://fh50/api/admin/community/chat/mute', {
      method: 'POST',
      token: tokAdminDave,
      body: { user_id: 'mem_b', action: 'mute' },
    }),
    env,
  });
  assert.equal(muteRes.status, 200);

  // Muted Member B can STILL read (200, is_muted: true)
  const mutedRead = await getGroupMsgs({
    request: makeReq('https://fh50/api/community/chat/messages', { token: tokMemB }),
    env,
  });
  assert.equal(mutedRead.status, 200);
  const mutedReadJson = await mutedRead.json();
  assert.equal(mutedReadJson.is_muted, true);

  // Muted Member B CANNOT post (403)
  const mutedPost = await postGroupMsg({
    request: makeReq('https://fh50/api/community/chat/messages', {
      method: 'POST',
      token: tokMemB,
      body: { text: 'Am I muted?' },
    }),
    env,
  });
  assert.equal(mutedPost.status, 403);

  // Unmute Member B -> can post again (201)
  nowMs += 1000;
  await adminMute({
    request: makeReq('https://fh50/api/admin/community/chat/mute', {
      method: 'POST',
      token: tokAdminDave,
      body: { user_id: 'mem_b', action: 'unmute' },
    }),
    env,
  });
  const unmutedPost = await postGroupMsg({
    request: makeReq('https://fh50/api/community/chat/messages', {
      method: 'POST',
      token: tokMemB,
      body: { text: 'Back online!' },
    }),
    env,
  });
  assert.equal(unmutedPost.status, 201);

  // Admin deletes firstMsgId -> Incremental ?since= poll returns deleted_ids containing firstMsgId,
  // and adminMsgId's reply_to gracefully shows "Message removed by moderator"!
  const beforeDeleteIso = new Date(nowMs).toISOString();
  nowMs += 1000;
  const delRes = await adminDeleteMsg({
    request: makeReq(`https://fh50/api/admin/community/chat/messages/${firstMsgId}`, {
      method: 'DELETE',
      token: tokAdminDave,
    }),
    env,
  });
  assert.equal(delRes.status, 200);

  const deltaAfterDel = await (await getGroupMsgs({
    request: makeReq(`https://fh50/api/community/chat/messages?since=${encodeURIComponent(beforeDeleteIso)}`, {
      token: tokMemA,
    }),
    env,
  })).json();
  assert.ok(deltaAfterDel.deleted_ids.includes(firstMsgId), 'deleted_ids must report soft-deleted message');

  const fullAfterDel = await (await getGroupMsgs({
    request: makeReq('https://fh50/api/community/chat/messages', { token: tokMemA }),
    env,
  })).json();
  assert.ok(!fullAfterDel.messages.some((m) => m.id === firstMsgId), 'Deleted message must not appear');
  const daveReplyMsg = fullAfterDel.messages.find((m) => m.id === adminMsgId);
  assert.equal(daveReplyMsg.reply_to.text, 'Message removed by moderator');

  console.log('  [PASS] Moderation (mute read-only 200 / post-blocked 403, unmute, soft-delete + deleted_ids) verified.');
}

// 6. Rate limiting: max 10 messages per 60 seconds
{
  nowMs += 120_000; // fresh 60s window
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
  assert.equal(r11.status, 429, '11th message within 60s must return 429');

  nowMs += 61_000;
  const rAfterWindow = await postGroupMsg({
    request: makeReq('https://fh50/api/community/chat/messages', {
      method: 'POST',
      token: tokMemB,
      body: { text: 'After cooldown' },
    }),
    env,
  });
  assert.equal(rAfterWindow.status, 201);
  console.log('  [PASS] Rate limit (10/60s -> 429, recovers after window) verified.');
}

console.log('ALL i9 COMMUNITY CHAT BACKEND TESTS PASSED!');
