// GET /api/read/passage?book=&chapter_start=&chapter_end=&translation=
// Serves Bible text from the content-service abstraction (mock provider now).
import { json, badRequest } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { getProvider } from '../../lib/bible.mjs';

export async function onRequestGet({ request, env }) {
  const { response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const book = url.searchParams.get('book') || '';
  const cs = parseInt(url.searchParams.get('chapter_start') || '0', 10);
  const ce = parseInt(url.searchParams.get('chapter_end') || '0', 10);
  const translation = url.searchParams.get('translation') || 'mock-web';
  if (!book || !cs || !ce || ce < cs) return badRequest('book, chapter_start, chapter_end are required');

  const provider = getProvider(translation);
  const passage = await provider.getPassage(book, cs, ce);
  return json(passage);
}
