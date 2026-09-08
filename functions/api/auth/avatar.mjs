// POST /api/auth/avatar — change the current user's preset avatar.
// This is the ONLY profile-editing capability exposed: email, password, and
// name remain read-only outside the original auth flow (per operator scope).
import { json, badRequest, readJson, nowIso } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { isValidAvatarId } from '../../lib/avatars.mjs';

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  const avatarId = String(body?.avatar_id || '').trim();
  if (!isValidAvatarId(avatarId)) return badRequest('Unknown avatar. Choose one of the preset avatars.');

  await env.DB.prepare('UPDATE profiles SET avatar_id = ?, updated_at = ? WHERE id = ?')
    .bind(avatarId, nowIso(), user.id).run();
  return json({ ok: true, avatar_id: avatarId });
}
