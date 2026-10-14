// GET  /api/admin/programme — global programme-run launch state. Admin only.
// POST /api/admin/programme { action: 'start' } — start the run (IDEMPOTENT).
//
// programme_launch_and_finale_v1 + ops_batch_oct14_v1:
// Pressing Start stores the one global start timestamp plus the (exclusive) join-window close date.
// A second press is an idempotent no-op: it returns already_started: true with the STORED
// timestamp untouched — it can never reset or corrupt the run's anchor.

import { json, badRequest, forbidden, readJson, nowIso } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';
import {
  getProgrammeConfig, computeProgrammeEndDate,
  refreshProgrammeState, JOIN_WINDOW_DAYS, addDays,
  getJoinWindowDetails,
} from '../../lib/programme.mjs';
import { utcToday, watDateOf } from '../../lib/calendar.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const cfg = await refreshProgrammeState(env.DB);
  const eligible = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM profiles WHERE email_verified = 1 AND role != 'admin'"
  ).first();

  let endDatePreview = null;
  if (cfg.started && !cfg.programme_end_date) {
    endDatePreview = await computeProgrammeEndDate(env.DB, cfg);
  }

  const details = getJoinWindowDetails(cfg);

  return json({
    ...cfg,
    ...details,
    today: utcToday(),
    eligible_participants: eligible?.c ?? 0,
    end_date_preview: endDatePreview,
    reset_enabled: !cfg.started,
    reset_disabled_reason: cfg.started ? 'The programme has started; reset is disabled' : null,
  });
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  const action = String(body?.action || '');
  if (action !== 'start') return badRequest("action must be 'start'");

  const cfg = await getProgrammeConfig(env.DB);
  if (cfg.started) {
    const details = getJoinWindowDetails(cfg);
    return json({
      ok: true,
      already_started: true,
      start_at: cfg.start_at,
      join_window_closes_at: cfg.join_window_closes_at,
      ...details,
      message: 'Programme already started — the stored start timestamp was left unchanged.',
    });
  }

  // Server-side confirmation guard on initial start
  if (body?.confirm !== 'START') {
    return badRequest("Confirmation required — resend with confirm: 'START'. The programme was NOT started.");
  }

  const now = nowIso();
  const startWat = watDateOf(now);
  const close = addDays(startWat, JOIN_WINDOW_DAYS); // EXCLUSIVE close date
  const ts = nowIso();

  await env.DB.batch([
    env.DB.prepare('INSERT INTO programme_config (key, value, updated_at) VALUES (?, ?, ?)').bind('start_at', now, ts),
    env.DB.prepare('INSERT INTO programme_config (key, value, updated_at) VALUES (?, ?, ?)').bind('join_window_closes_at', close, ts),
  ]);

  const freshCfg = { started: true, start_at: now, join_window_closes_at: close };
  const details = getJoinWindowDetails(freshCfg);

  return json({
    ok: true,
    already_started: false,
    start_at: now,
    join_window_closes_at: close,
    join_window_days: JOIN_WINDOW_DAYS,
    ...details,
  });
}
