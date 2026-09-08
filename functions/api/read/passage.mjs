// GET /api/read/passage?book=&chapter_start=&chapter_end=&translation=
// Serves Bible text from VerseWell's live static mirror only (the mock
// fallback layer was removed in profile_content_cleanup_v1 / task-p04).
// If VerseWell is unreachable, the version is unknown, or any chapter in
// the range is missing, this returns a clear 503 "scripture temporarily
// unavailable" instead of falling back to placeholder content.
import { json, badRequest, unavailable } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { isVersewellId, versewellCode, versewellProvider, configureVersewell } from '../../lib/versewell.mjs';

export async function onRequestGet({ request, env }) {
  configureVersewell(env);
  const { response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const book = url.searchParams.get('book') || '';
  const cs = parseInt(url.searchParams.get('chapter_start') || '0', 10);
  const ce = parseInt(url.searchParams.get('chapter_end') || '0', 10);
  const translation = url.searchParams.get('translation') || '';
  if (!book || !cs || !ce || ce < cs) return badRequest('book, chapter_start, chapter_end are required');

  if (!isVersewellId(translation)) {
    return badRequest('Unknown translation. Only translations provided by VerseWell are available.');
  }

  const passage = await versewellProvider.getPassage(versewellCode(translation), book, cs, ce);
  if (!passage) {
    // VerseWell unreachable, or this version/chapter is not in the mirror —
    // surface a clear unavailable state; never serve mock/placeholder text.
    return unavailable('Scripture is temporarily unavailable for this passage. Please try again shortly.');
  }
  return json(passage);
}
