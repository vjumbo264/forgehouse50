// POST /api/community/chat/read — mark group or direct thread read up to timestamp (used by screen & notification actions)
import { json, badRequest, forbidden, readJson } from '../../../lib/http.mjs';
import { requireUser } from '../../../lib/auth.mjs';
import { markDirectThreadReadIfNewer, markGroupReadIfNewer } from '../../../lib/chat.mjs';

const NO_CACHE = { 'Cache-Control': 'no-cache, no-store, must-revalidate' };

export async function onRequestPost({ request, env }) {
  const { user, response } = await requireUser(request, env);
  if (response) return response;

  const isAdmin = user.role === 'admin';
  const body = await readJson(request);
  const channelType = String(body?.channel_type || '').trim();
  const threadIdParam = String(body?.thread_id || '').trim();
  const nowMs = typeof env.NOW_MS === 'number' ? env.NOW_MS : Date.now();
  const nowStr = new Date(nowMs).toISOString();
  const ts = String(body?.timestamp || nowStr).trim();

  if (channelType === 'group') {
    await markGroupReadIfNewer(env.DB, user.id, ts, nowStr);
    return json({ ok: true }, 200, NO_CACHE);
  }

  if (channelType === 'direct') {
    const threadId = isAdmin ? threadIdParam : user.id;
    if (!threadId) return badRequest('thread_id is required for admin');
    if (!isAdmin && threadIdParam && threadIdParam !== user.id) {
      return forbidden('Cannot mark another member thread read');
    }
    await markDirectThreadReadIfNewer(env.DB, user.id, threadId, ts, nowStr);
    return json({ ok: true }, 200, NO_CACHE);
  }

  return badRequest("channel_type must be 'group' or 'direct'");
}
