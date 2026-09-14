// GET /api/config — public runtime config for the frontend (no secrets).
import { json } from '../lib/http.mjs';
import { getProgrammeConfig, registrationOpen } from '../lib/programme.mjs';

export async function onRequestGet({ env }) {
  // programme_launch_and_finale_v1: expose the global run lifecycle alongside
  // the legacy env-based start date (kept for backwards compatibility).
  const prog = await getProgrammeConfig(env.DB);
  return json({
    whatsapp_group_url: env.WHATSAPP_GROUP_URL || '',
    programme_start: env.PROGRAMME_START_DATE || '2026-09-07',
    app_name: 'ForgeHouse 50',
    email_provider: 'Brevo',
    programme: {
      started: prog.started,
      start_at: prog.start_at,
      join_window_closes_at: prog.join_window_closes_at,
      registration_open: registrationOpen(prog),
      programme_end_date: prog.programme_end_date,
      concluded: !!prog.final_snapshot_at,
    },
  });
}
