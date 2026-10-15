// GET /api/auth/me — current session user (safe fields only).
import { json, unauthorized } from '../../lib/http.mjs';
import { getUser } from '../../lib/auth.mjs';
import { userAggregates, userBadges } from '../../lib/points.mjs';
import { refreshProgrammeState } from '../../lib/programme.mjs';

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return unauthorized();

  const programme = await refreshProgrammeState(env.DB);

  if (user.is_admin_credential) {
    return json({
      id: user.id,
      email: user.email,
      name: user.username,
      username: user.username,
      surname: '',
      avatar_url: null,
      avatar_id: null,
      role: 'admin',
      email_verified: true,
      created_at: new Date().toISOString(),
      stats: { total_points: 0, days_completed: 0, chapters_read: 0, reading_seconds: 0, current_streak: 0, longest_streak: 0, notes_total: 0 },
      badges: [],
      programme: {
        started: programme.started,
        concluded: !!programme.final_snapshot_at,
        programme_end_date: programme.programme_end_date,
      },
    });
  }

  const [stats, badges] = await Promise.all([userAggregates(env.DB, user.id), userBadges(env.DB, user.id)]);
  return json({
    id: user.id, email: user.email, name: user.name, surname: user.surname || '', avatar_url: user.avatar_url,
    avatar_id: user.avatar_id ?? null,
    picture_version: user.picture_version ?? null,
    role: user.role, email_verified: !!user.email_verified, created_at: user.created_at,
    stats, badges,
    programme: {
      started: programme.started,
      concluded: !!programme.final_snapshot_at,
      programme_end_date: programme.programme_end_date,
    },
  });
}
