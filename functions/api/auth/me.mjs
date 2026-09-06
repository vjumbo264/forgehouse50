// GET /api/auth/me — current session user (safe fields only).
import { json, unauthorized } from '../../lib/http.mjs';
import { getUser } from '../../lib/auth.mjs';
import { userAggregates, userBadges } from '../../lib/points.mjs';

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return unauthorized();
  const [stats, badges] = await Promise.all([userAggregates(env.DB, user.id), userBadges(env.DB, user.id)]);
  return json({
    id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url,
    role: user.role, email_verified: !!user.email_verified, created_at: user.created_at,
    stats, badges,
  });
}
