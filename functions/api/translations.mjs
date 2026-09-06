// GET /api/translations — available Bible translations (multi-source shape).
import { json } from '../lib/http.mjs';
import { listTranslations } from '../lib/bible.mjs';

export async function onRequestGet() {
  return json({ translations: listTranslations() });
}
