// GET /api/users/:id/picture?v=<version>
// Returns raw profile photo bytes with ETag and immutable caching.
// Authenticated participants and admins only (HTTP 401 if unauthenticated).
import { unauthorized, notFound } from '../../../lib/http.mjs';
import { getUser } from '../../../lib/auth.mjs';

export async function onRequestGet({ request, env, params }) {
  const user = await getUser(request, env);
  if (!user) {
    return unauthorized('Authentication required to view profile pictures');
  }

  const targetUserId = String(params.id || '').trim();
  if (!targetUserId) {
    return notFound('User ID required');
  }

  const row = await env.DB.prepare(
    'SELECT content_type, bytes, version FROM profile_pictures WHERE user_id = ?'
  ).bind(targetUserId).first();

  if (!row || !row.bytes) {
    return notFound('Profile picture not found');
  }

  const etag = `"w/pic-${targetUserId}-${row.version}"`;
  const clientEtag = request.headers.get('if-none-match');

  if (clientEtag && clientEtag === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        'ETag': etag,
        'Cache-Control': 'private, max-age=86400, immutable',
      },
    });
  }

  const bytes = row.bytes instanceof Uint8Array ? row.bytes : new Uint8Array(row.bytes);

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': row.content_type,
      'ETag': etag,
      'Cache-Control': 'private, max-age=86400, immutable',
    },
  });
}
