// GET /api/programme — PUBLIC global programme-run status (no auth, no
// private data: lifecycle dates and flags only). Drives the signup page's
// closed-registration state and acts as one of the lifecycle triggers
// (end-date computation at window close, snapshot at end date).

import { json } from '../lib/http.mjs';
import { refreshProgrammeState, getJoinWindowDetails, computeProgrammeEndDate } from '../lib/programme.mjs';
import { utcToday } from '../lib/calendar.mjs';

export async function onRequestGet({ env }) {
  const cfg = await refreshProgrammeState(env.DB);
  const details = getJoinWindowDetails(cfg);

  let endDatePreview = cfg.programme_end_date;
  if (cfg.started && !endDatePreview) {
    endDatePreview = await computeProgrammeEndDate(env.DB, cfg);
  }

  return json({
    ...cfg,
    ...details,
    programme_end_date: endDatePreview,
    concluded: !!cfg.final_snapshot_at,
    final_snapshot_at: cfg.final_snapshot_at,
    today: utcToday(),
  });
}
