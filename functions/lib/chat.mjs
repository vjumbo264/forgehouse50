// Shared helpers for Community Chat (group chat + private admin<->member threads).
// Privacy invariant: NEVER expose email, phone, full surname, or raw admin login usernames.

export const CHAT_MAX_MESSAGE_LENGTH = 1000;
export const CHAT_RATE_LIMIT_MAX_PER_MIN = 10;
export const CHAT_RATE_LIMIT_WINDOW_MS = 60_000;
export const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

export function formatMemberChatName(name, surname) {
  const given = String(name || '').trim();
  const sur = String(surname || '').trim();
  if (given && sur) {
    return `${given} ${sur[0].toUpperCase()}.`;
  }
  return given || 'Member';
}

export async function resolveSenderDisplayName(db, user) {
  if (user.role === 'admin') {
    const custom = await db
      .prepare("SELECT value FROM programme_config WHERE key = 'chat_admin_display_name'")
      .first('value');
    if (custom && String(custom).trim()) {
      return String(custom).trim();
    }
    const uname = String(user.username || user.name || '').toLowerCase();
    if (uname.includes('victor')) {
      return 'ForgeHouse Admin';
    }
    return 'Pastor Dave';
  }
  return formatMemberChatName(user.name, user.surname);
}

export function computeRowAuthorName(row) {
  if (row.sender_role === 'admin') {
    return row.sender_display_name || 'Pastor Dave';
  }
  if (row.profile_name) {
    return formatMemberChatName(row.profile_name, row.profile_surname);
  }
  return row.sender_display_name || 'Member';
}

export function serializeChatMessage(row, viewerUserId) {
  let replyTo = null;
  if (row.reply_to_message_id) {
    const replyDeleted = row.reply_is_deleted === 1 || row.reply_id == null;
    if (replyDeleted) {
      replyTo = {
        id: row.reply_to_message_id,
        author_name: 'Removed',
        author_role: 'member',
        text: 'Message removed by moderator',
      };
    } else {
      const replyAuthor =
        row.reply_sender_role === 'admin'
          ? row.reply_sender_display_name || 'Pastor Dave'
          : row.reply_profile_name
            ? formatMemberChatName(row.reply_profile_name, row.reply_profile_surname)
            : row.reply_sender_display_name || 'Member';
      replyTo = {
        id: row.reply_id,
        author_name: replyAuthor,
        author_role: row.reply_sender_role || 'member',
        text: String(row.reply_text || '').slice(0, 180),
      };
    }
  }

  const isAdminSender = row.sender_role === 'admin';
  return {
    id: row.id,
    channel_type: row.channel_type,
    thread_id: row.direct_thread_id || null,
    sender_id: row.sender_user_id,
    is_me: row.sender_user_id === viewerUserId,
    author_name: computeRowAuthorName(row),
    author_role: isAdminSender ? 'admin' : 'member',
    avatar_id: isAdminSender ? null : (row.profile_avatar_id || null),
    picture_version: isAdminSender ? null : (row.profile_picture_version ?? null),
    text: row.text,
    reply_to: replyTo,
    created_at: row.created_at,
  };
}

export const MESSAGE_SELECT_SQL = `
  SELECT
    m.id,
    m.channel_type,
    m.direct_thread_id,
    m.sender_user_id,
    m.sender_role,
    m.sender_display_name,
    m.reply_to_message_id,
    m.text,
    m.created_at,
    p.name AS profile_name,
    p.surname AS profile_surname,
    p.avatar_id AS profile_avatar_id,
    pic.version AS profile_picture_version,
    rm.id AS reply_id,
    rm.text AS reply_text,
    rm.is_deleted AS reply_is_deleted,
    rm.sender_role AS reply_sender_role,
    rm.sender_display_name AS reply_sender_display_name,
    rp.name AS reply_profile_name,
    rp.surname AS reply_profile_surname
  FROM community_chat_messages m
  LEFT JOIN profiles p ON p.id = m.sender_user_id
  LEFT JOIN profile_pictures pic ON pic.user_id = p.id
  LEFT JOIN community_chat_messages rm ON rm.id = m.reply_to_message_id
  LEFT JOIN profiles rp ON rp.id = rm.sender_user_id
`;

export async function isMemberMuted(db, userId) {
  const row = await db
    .prepare('SELECT is_muted FROM community_chat_members WHERE user_id = ?')
    .bind(userId)
    .first();
  return row?.is_muted === 1;
}

export async function checkChatRateLimit(db, userId, nowMs = Date.now()) {
  const windowStartIso = new Date(nowMs - CHAT_RATE_LIMIT_WINDOW_MS).toISOString();
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS cnt FROM community_chat_messages WHERE sender_user_id = ? AND created_at > ?'
    )
    .bind(userId, windowStartIso)
    .first();
  const count = Number(row?.cnt ?? 0);
  return {
    allowed: count < CHAT_RATE_LIMIT_MAX_PER_MIN,
    count,
  };
}

// Writes to D1 ONLY when latestMsgTimestamp strictly advances last_read_group_at.
export async function markGroupReadIfNewer(db, userId, latestMsgTimestamp, nowStr) {
  if (!latestMsgTimestamp) return false;
  const member = await db
    .prepare('SELECT last_read_group_at FROM community_chat_members WHERE user_id = ?')
    .bind(userId)
    .first();
  const prev = member?.last_read_group_at || null;
  if (prev && prev >= latestMsgTimestamp) {
    return false;
  }
  await db
    .prepare(
      `INSERT INTO community_chat_members (user_id, last_read_group_at, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         last_read_group_at = excluded.last_read_group_at,
         updated_at = excluded.updated_at`
    )
    .bind(userId, latestMsgTimestamp, nowStr)
    .run();
  return true;
}

// Writes to D1 ONLY when latestMsgTimestamp strictly advances last_read_at for (readerId, threadId).
export async function markDirectThreadReadIfNewer(db, readerId, threadId, latestMsgTimestamp, nowStr) {
  if (!latestMsgTimestamp) return false;
  const row = await db
    .prepare('SELECT last_read_at FROM community_chat_thread_reads WHERE reader_id = ? AND thread_id = ?')
    .bind(readerId, threadId)
    .first();
  const prev = row?.last_read_at || null;
  if (prev && prev >= latestMsgTimestamp) {
    return false;
  }
  await db
    .prepare(
      `INSERT INTO community_chat_thread_reads (reader_id, thread_id, last_read_at, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(reader_id, thread_id) DO UPDATE SET
         last_read_at = excluded.last_read_at,
         updated_at = excluded.updated_at`
    )
    .bind(readerId, threadId, latestMsgTimestamp, nowStr)
    .run();
  return true;
}

export async function getChatUnreadSummary(db, user) {
  const memberRow = await db
    .prepare('SELECT last_read_group_at FROM community_chat_members WHERE user_id = ?')
    .bind(user.id)
    .first();
  const lastReadGroup = memberRow?.last_read_group_at || EPOCH_ISO;

  const groupRow = await db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM community_chat_messages
       WHERE channel_type = 'group'
         AND is_deleted = 0
         AND sender_user_id != ?
         AND created_at > ?`
    )
    .bind(user.id, lastReadGroup)
    .first();
  const groupUnread = Number(groupRow?.c ?? 0);

  let directUnread = 0;
  if (user.role === 'admin') {
    const dRow = await db
      .prepare(
        `SELECT COUNT(*) AS c
         FROM community_chat_messages m
         LEFT JOIN community_chat_thread_reads tr
           ON tr.reader_id = ? AND tr.thread_id = m.direct_thread_id
         WHERE m.channel_type = 'direct'
           AND m.is_deleted = 0
           AND m.sender_user_id != ?
           AND m.created_at > COALESCE(tr.last_read_at, ?)`
      )
      .bind(user.id, user.id, EPOCH_ISO)
      .first();
    directUnread = Number(dRow?.c ?? 0);
  } else {
    const trRow = await db
      .prepare('SELECT last_read_at FROM community_chat_thread_reads WHERE reader_id = ? AND thread_id = ?')
      .bind(user.id, user.id)
      .first();
    const lastReadDirect = trRow?.last_read_at || EPOCH_ISO;
    const dRow = await db
      .prepare(
        `SELECT COUNT(*) AS c
         FROM community_chat_messages
         WHERE channel_type = 'direct'
           AND direct_thread_id = ?
           AND is_deleted = 0
           AND sender_user_id != ?
           AND created_at > ?`
      )
      .bind(user.id, user.id, lastReadDirect)
      .first();
    directUnread = Number(dRow?.c ?? 0);
  }

  return {
    group_unread: groupUnread,
    direct_unread: directUnread,
    total_unread: groupUnread + directUnread,
  };
}
