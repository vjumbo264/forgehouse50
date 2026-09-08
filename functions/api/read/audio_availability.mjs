// GET /api/read/audio_availability?book=&chapter_start=&chapter_end=&translation=
// Reports which chapters of the requested range currently have a real
// VerseWell audio file. Availability is a live, growing dataset on
// VerseWell's side, so this is a request-time (short-TTL-cached) existence
// check per chapter — never a hardcoded list. No polling: the frontend
// calls this once per passage load.
import { json, badRequest } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { isVersewellId, versewellCode, versewellProvider } from '../../lib/versewell.mjs';

export async function onRequestGet({ request, env }) {
  const { response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const book = url.searchParams.get('book') || '';
  const cs = parseInt(url.searchParams.get('chapter_start') || '0', 10);
  const ce = parseInt(url.searchParams.get('chapter_end') || '0', 10);
  const translation = url.searchParams.get('translation') || '';
  if (!book || !cs || !ce || ce < cs) return badRequest('book, chapter_start, chapter_end are required');

  if (!isVersewellId(translation)) {
    return json({ source: 'mock', available: [], note: 'No live audio for this translation yet.' });
  }
  const code = versewellCode(translation);
  const available = [];
  for (let ch = cs; ch <= ce; ch++) {
    const u = await versewellProvider.getAudioUrl(code, book, ch);
    if (u) available.push({ chapter: ch, url: u });
  }
  return json({ source: 'versewell', translation: code, available });
}
