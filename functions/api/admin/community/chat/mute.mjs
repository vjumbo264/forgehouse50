// POST /api/admin/community/chat/mute — mute or unmute a member (read-only mode when muted)
import { json, badRequest, forbidden, notFound, readJson, uuid } from '../../../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../../../lib/auth.mjs';
import { formatMemberChatName } from '../../../../lib/chat.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  const targetUserId = String(body?.user_id || '').trim();
  const action = String(body?.action || 'mute').trim().toLowerCase();
  if (!targetUserId) return badRequest('user_id is required');
  if (action !== 'mute' && action !== 'unmute') {
    return badRequest("action must be 'mute' or 'unmute'");
  }

  const member = await env.DB.prepare('SELECT id, name, surname FROM profiles WHERE id = ?')
    .bind(targetUserId)
    .first();
  if (!member) return notFound('Member not found');

  const isMuted = action === 'mute' ? 1 : 0;
  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
  const now = new Date(nowMs).toISOString();

  await env.DB.prepare(
    `INSERT INTO community_chat_members (user_id, is_muted, muted_at, muted_by, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       is_muted = excluded.is_muted,
       muted_at = excluded.muted_at,
       muted_by = excluded.muted_by,
       updated_at = excluded.updated_at`
  )
    .bind(targetUserId, isMuted, isMuted ? now : null, isMuted ? user.id : null, now)
    .run();

  await env.DB.prepare(
    'INSERT INTO admin_audit (id, admin_id, action, target_user_id, target_display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(
      uuid(),
      user.id,
      `chat_${action}`,
      targetUserId,
      formatMemberChatName(member.name, member.surname),
      now
    )
    .run();

  return json(
    { ok: true, user_id: targetUserId, is_muted: isMuted === 1 },
    200,
    { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
  );
}
