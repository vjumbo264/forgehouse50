// GET /api/read/audio_proxy?book=&chapter=&translation=
//
// Streams a VerseWell chapter audio file through THIS origin with real HTTP
// Range (206) support. VerseWell is a static Cloudflare Pages site and does
// not honour Range requests; an <audio> element playing such a source cannot
// seek — every currentTime change triggers a full refetch and playback
// restarts from 0 (operator-reported bug, fixed in revert_and_v2_redesign).
//
// The proxy forwards the browser's Range header when present; if the upstream
// ignores it and returns the full body we still answer 200 with
// Accept-Ranges: bytes so the browser's media stack switches to its own
// range-based fetching against us (our responses are byte-consistent, so
// subsequent range reads slice correctly).
import { badRequest } from '../../lib/http.mjs';
import { requireUser } from '../../lib/auth.mjs';
import { isVersewellId, versewellCode, versewellProvider, configureVersewell } from '../../lib/versewell.mjs';

export async function onRequestGet({ request, env }) {
  configureVersewell(env);
  const { response } = await requireUser(request, env);
  if (response) return response;

  const url = new URL(request.url);
  const book = url.searchParams.get('book') || '';
  const chapter = parseInt(url.searchParams.get('chapter') || '0', 10);
  const translation = url.searchParams.get('translation') || '';
  if (!book || !chapter || !isVersewellId(translation))
    return badRequest('book, chapter and a VerseWell translation are required');

  const audioUrl = await versewellProvider.getAudioUrl(versewellCode(translation), book, chapter);
  if (!audioUrl) return new Response('Audio not available for this chapter yet', { status: 404 });

  const range = request.headers.get('range');
  const upstream = await fetch(audioUrl, range ? { headers: { range } } : {});
  if (!upstream.ok && upstream.status !== 206)
    return new Response('Upstream audio fetch failed', { status: 502 });

  const h = new Headers();
  const ct = upstream.headers.get('content-type') || '';
  h.set('Content-Type', ct.toLowerCase().startsWith('audio') ? ct : 'audio/mp4');
  for (const k of ['content-length', 'content-range', 'etag', 'last-modified']) {
    const v = upstream.headers.get(k);
    if (v) h.set(k, v);
  }
  h.set('Accept-Ranges', 'bytes');
  // Narration set grows over time; one hour is a safe freshness window.
  h.set('Cache-Control', 'public, max-age=3600');
  const status = upstream.status === 206 ? 206 : 200;
  return new Response(upstream.body, { status, headers: h });
}
