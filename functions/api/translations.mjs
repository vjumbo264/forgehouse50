// GET /api/translations — available Bible translations (multi-source shape).
// Live list comes from VerseWell's static mirror (task-v03); the mock
// provider is always appended as the fallback option. If the VerseWell
// fetch fails entirely, the mock list alone is returned so the selector
// still works.
import { json } from '../lib/http.mjs';
import { listTranslations } from '../lib/bible.mjs';
import { versewellProvider, configureVersewell } from '../lib/versewell.mjs';

export async function onRequestGet({ env }) {
  configureVersewell(env);
  const mock = listTranslations();
  const live = await versewellProvider.listTranslations();
  if (!live || live.length === 0) {
    return json({ translations: mock, versewell_live: false });
  }
  return json({ translations: [...live, ...mock], versewell_live: true });
}
