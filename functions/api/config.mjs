// GET /api/config — public runtime config for the frontend (no secrets).

import { json } from '../lib/http.mjs';
import { getProgrammeConfig, getJoinWindowDetails } from '../lib/programme.mjs';

export async function onRequestGet({ env }) {
  const prog = await getProgrammeConfig(env.DB);
  const details = getJoinWindowDetails(prog);

  return json({
    whatsapp_group_url: env.WHATSAPP_GROUP_URL || '',
    programme_start: env.PROGRAMME_START_DATE || '2026-09-07',
    app_name: 'ForgeHouse 50',
    email_provider: 'Brevo',
    programme: {
      started: prog.started,
      start_at: prog.start_at,
      programme_end_date: prog.programme_end_date,
      concluded: !!prog.final_snapshot_at,
      ...details,
    },
  });
}
