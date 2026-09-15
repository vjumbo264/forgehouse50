// GET /api/auth/me — current session user (safe fields only).
import { json, unauthorized } from '../../lib/http.mjs';
import { getUser } from '../../lib/auth.mjs';
import { userAggregates, userBadges } from '../../lib/points.mjs';
import { refreshProgrammeState } from '../../lib/programme.mjs';

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return unauthorized();
  // programme_launch_and_finale_v1: every authenticated page load pings /me,
  // so this is one of the lifecycle triggers (end-date compute at window
  // close, final snapshot at end date). Cheap: one config read when idle.
  const programme = await refreshProgrammeState(env.DB);
  const [stats, badges] = await Promise.all([userAggregates(env.DB, user.id), userBadges(env.DB, user.id)]);
  return json({
    id: user.id, email: user.email, name: user.name, surname: user.surname || '', avatar_url: user.avatar_url,
    avatar_id: user.avatar_id ?? null,
    role: user.role, email_verified: !!user.email_verified, created_at: user.created_at,
    stats, badges,
    programme: {
      started: programme.started,
      concluded: !!programme.final_snapshot_at,
      programme_end_date: programme.programme_end_date,
    },
  });
}
