// GET /api/config — public runtime config for the frontend (no secrets).
import { json } from '../lib/http.mjs';

export async function onRequestGet({ env }) {
  return json({
    whatsapp_group_url: env.WHATSAPP_GROUP_URL || '',
    programme_start: env.PROGRAMME_START_DATE || '2026-09-07',
    app_name: 'ForgeHouse 50',
    email_provider: 'Brevo',
  });
}
