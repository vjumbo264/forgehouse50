// GET  /api/final_results — the permanent final rankings for this programme
//      run (authenticated, like the in-progress leaderboard). Full list —
//      every finisher, not just the top 3. Includes the caller's own
//      placement and whether their one-time top-3 celebration is pending.
// POST /api/final_results { ack: true } — acknowledge the one-time top-3
//      celebration banner (stored per user per run; never shown again).
//
// programme_launch_and_finale_v1 / tasks-l05+l06. Aggregate data only —
// never note content, never emails.
import { json, badRequest, readJson } from '../lib/http.mjs';
import { requireUser } from '../lib/auth.mjs';
import { refreshProgrammeState } from '../lib/programme.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const cfg = await refreshProgrammeState(env.DB);
  if (!cfg.final_snapshot_at) {
    return json({
      concluded: false,
      started: cfg.started,
      programme_end_date: cfg.programme_end_date,
    });
  }

  const runId = cfg.start_at.slice(0, 10);
  const { results: rankings } = await env.DB.prepare(
    'SELECT rank, user_id, display_name, avatar_id, total_points, finished_at FROM final_rankings WHERE run_id = ? ORDER BY rank'
  ).bind(runId).all();

  const mine = (rankings || []).find(r => r.user_id === user.id) || null;
  let celebrationPending = false;
  if (mine && mine.rank <= 3) {
    const ack = await env.DB.prepare(
      'SELECT 1 FROM final_rank_acks WHERE user_id = ? AND run_id = ?'
    ).bind(user.id, runId).first();
    celebrationPending = !ack;
  }

  return json({
    concluded: true,
    run_id: runId,
    snapshot_at: cfg.final_snapshot_at,
    programme_end_date: cfg.programme_end_date,
    rankings: rankings || [],
    me: mine ? { rank: mine.rank, total_points: mine.total_points, celebration_pending: celebrationPending } : null,
  });
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const body = await readJson(request);
  if (!body?.ack) return badRequest('ack: true is required');

  const cfg = await refreshProgrammeState(env.DB);
  if (!cfg.final_snapshot_at) return badRequest('No final snapshot exists yet');
  const runId = cfg.start_at.slice(0, 10);
  await env.DB.prepare(
    'INSERT OR IGNORE INTO final_rank_acks (user_id, run_id) VALUES (?, ?)'
  ).bind(user.id, runId).run();
  return json({ ok: true });
}
