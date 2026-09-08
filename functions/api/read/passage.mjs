// GET /api/read/passage?book=&chapter_start=&chapter_end=&translation=
// Serves Bible text. VerseWell (live static mirror) is tried first for
// versewell-* translation ids; on any failure or missing data the mock
// provider is used so the Reading page never breaks (task-v04).
import { json, badRequest } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { getProvider } from '../../lib/bible.mjs';
import { isVersewellId, versewellCode, versewellProvider, configureVersewell } from '../../lib/versewell.mjs';

export async function onRequestGet({ request, env }) {
  configureVersewell(env);
  const { response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const book = url.searchParams.get('book') || '';
  const cs = parseInt(url.searchParams.get('chapter_start') || '0', 10);
  const ce = parseInt(url.searchParams.get('chapter_end') || '0', 10);
  const translation = url.searchParams.get('translation') || 'mock-web';
  if (!book || !cs || !ce || ce < cs) return badRequest('book, chapter_start, chapter_end are required');

  if (isVersewellId(translation)) {
    const passage = await versewellProvider.getPassage(versewellCode(translation), book, cs, ce);
    if (passage) return json(passage);
    // fall through to mock — VerseWell unavailable for this version/passage
  }

  const provider = getProvider(translation);
  const passage = await provider.getPassage(book, cs, ce);
  passage.source = 'mock';
  passage.intros = [];
  passage.audio_path = null;
  return json(passage);
}
