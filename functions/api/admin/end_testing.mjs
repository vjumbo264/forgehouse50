// POST /api/admin/end_testing — "End Testing Phase & Reset".
//
// ops_batch_oct14_v1: GUARD THE RESET.
// Now that the programme has started, End Testing Phase & Reset MUST be blocked
// server-side (HTTP 409 conflict). Testing accounts and live participant data
// cannot be wiped once the run is active.

import { json, badRequest, unauthorized, forbidden, conflict, readJson } from '../../lib/http.mjs';
import { getUser } from '../../lib/auth.mjs';
import { getProgrammeConfig } from '../../lib/programme.mjs';

const CHILD_TABLES = [
  'reading_progress',
  'quiz_attempts',
  'user_reading_days',
  'audio_progress',
  'notes',
  'bookmarks',
  'highlights',
  'user_badges',
  'points',
  'sessions',
  'otp_codes',
  'leaderboard_snapshots',
  'final_rank_acks',
];

export async function onRequestPost({ request, env }) {
  const me = await getUser(request, env);
  if (!me) return unauthorized('Not signed in');
  if (me.role !== 'admin') return forbidden('Admin only');

  // Guard the reset: now that the programme has started, reset is blocked server-side (HTTP 409)
  const cfg = await getProgrammeConfig(env.DB);
  if (cfg.started) {
    return conflict('The programme has started; reset is disabled');
  }

  const body = await readJson(request);
  if (body?.confirm !== 'END_TESTING') {
    return badRequest("Confirmation required — resend with confirm: 'END_TESTING'. Nothing was deleted.");
  }

  const { results: targets } = await env.DB.prepare("SELECT id, email FROM profiles WHERE role != 'admin'").all();
  const stmts = [];
  const perUser = [];
  for (const t of targets || []) {
    for (const tbl of CHILD_TABLES) stmts.push(env.DB.prepare(`DELETE FROM ${tbl} WHERE user_id = ?`).bind(t.id));
    stmts.push(env.DB.prepare('DELETE FROM profiles WHERE id = ?').bind(t.id));
    perUser.push(t.email);
  }
  if (stmts.length) await env.DB.batch(stmts);

  const remaining = await env.DB.prepare("SELECT COUNT(*) AS c FROM profiles WHERE role != 'admin'").first();
  return json({
    ok: true,
    deleted_users: perUser.length,
    deleted_emails: perUser,
    non_admin_users_remaining: remaining?.c ?? 0,
    message: 'Testing phase ended — all non-admin accounts and their data were wiped. Programme start is unchanged and still a separate action.'
  });
}
