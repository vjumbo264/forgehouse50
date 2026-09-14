// GET  /api/admin/programme — global programme-run launch state. Admin only.
// POST /api/admin/programme { action: 'start' } — start the run (IDEMPOTENT).
//
// programme_launch_and_finale_v1 / task-l02: pressing Start stores the one
// global start timestamp plus the (exclusive) join-window close date. A
// second press is a safe no-op: it returns already_started with the STORED
// timestamp untouched — it can never reset or corrupt the run's anchor.
import { json, badRequest, forbidden, readJson, nowIso } from '../../lib/http.mjs';
import { requireUser, requireAdmin } from '../../lib/auth.mjs';
import {
  getProgrammeConfig, registrationOpen, computeProgrammeEndDate,
  refreshProgrammeState, JOIN_WINDOW_DAYS, addDays,
} from '../../lib/programme.mjs';
import { utcToday } from '../../lib/calendar.mjs';

export async function onRequestGet({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const cfg = await refreshProgrammeState(env.DB);
  const eligible = await env.DB.prepare(
    "SELECT COUNT(*) AS c FROM profiles WHERE email_verified = 1 AND role != 'admin'"
  ).first();

  // Preview only: what the end date would compute to if the window were
  // already closed now. Shown in the dashboard so the operator can see the
  // shape of the run; the STORED end date is computed once, at window close.
  let endDatePreview = null;
  if (cfg.started && !cfg.programme_end_date) {
    endDatePreview = await computeProgrammeEndDate(env.DB, cfg);
  }

  return json({
    ...cfg,
    today: utcToday(),
    join_window_days: JOIN_WINDOW_DAYS,
    registration_open: registrationOpen(cfg),
    eligible_participants: eligible?.c ?? 0,
    end_date_preview: endDatePreview,
  });
}

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;
  if (!requireAdmin(user)) return forbidden('Admin access required');

  const body = await readJson(request);
  const action = String(body?.action || '');
  if (action !== 'start') return badRequest("action must be 'start'");

  // admin_reset_and_start_guardrail_v1: server-side confirmation guard —
  // the run only starts when the request carries the exact confirmation
  // token the dashboard's type-to-confirm UI sends. A plain/accidental
  // POST {action:'start'} is rejected and changes nothing.
  if (body?.confirm !== 'START') {
    return badRequest("Confirmation required — resend with confirm: 'START'. The programme was NOT started.");
  }

  const cfg = await getProgrammeConfig(env.DB);
  if (cfg.started) {
    return json({
      ok: true,
      already_started: true,
      start_at: cfg.start_at,
      join_window_closes_at: cfg.join_window_closes_at,
      message: 'Programme already started — the stored start timestamp was left unchanged.',
    });
  }

  const now = nowIso();
  const today = now.slice(0, 10);
  const close = addDays(today, JOIN_WINDOW_DAYS); // EXCLUSIVE close date
  const ts = nowIso();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO programme_config (key, value, updated_at) VALUES (?, ?, ?)').bind('start_at', now, ts),
    env.DB.prepare('INSERT INTO programme_config (key, value, updated_at) VALUES (?, ?, ?)').bind('join_window_closes_at', close, ts),
  ]);

  return json({ ok: true, already_started: false, start_at: now, join_window_closes_at: close, join_window_days: JOIN_WINDOW_DAYS });
}
