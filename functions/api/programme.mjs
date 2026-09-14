// GET /api/programme — PUBLIC global programme-run status (no auth, no
// private data: lifecycle dates and flags only). Drives the signup page's
// closed-registration state and acts as one of the lifecycle triggers
// (end-date computation at window close, snapshot at end date).
import { json } from '../lib/http.mjs';
import { refreshProgrammeState, registrationOpen, JOIN_WINDOW_DAYS } from '../lib/programme.mjs';
import { utcToday } from '../lib/calendar.mjs';

export async function onRequestGet({ env }) {
  const cfg = await refreshProgrammeState(env.DB);
  return json({
    started: cfg.started,
    start_at: cfg.start_at,
    join_window_days: JOIN_WINDOW_DAYS,
    join_window_closes_at: cfg.join_window_closes_at, // EXCLUSIVE
    registration_open: registrationOpen(cfg),
    programme_end_date: cfg.programme_end_date,
    concluded: !!cfg.final_snapshot_at,
    final_snapshot_at: cfg.final_snapshot_at,
    today: utcToday(),
  });
}
