// GET /api/translations — available Bible translations.
// The selector lists ONLY translations actually served by VerseWell's live
// static mirror (profile_content_cleanup_v1 / task-p04 removed the mock
// translation from this list entirely). If the mirror fetch fails, an empty
// list is returned with versewell_live=false so the frontend can show a
// clear "temporarily unavailable" state rather than a bogus option.
import { json } from '../lib/http.mjs';
import { versewellProvider, configureVersewell } from '../lib/versewell.mjs';

export async function onRequestGet({ env }) {
  configureVersewell(env);
  const live = await versewellProvider.listTranslations();
  if (!live || live.length === 0) {
    return json({ translations: [], versewell_live: false });
  }
  return json({ translations: live, versewell_live: true });
}
