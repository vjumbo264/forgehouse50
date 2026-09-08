// Shared HTTP helpers for Pages Functions (Workers runtime).

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

export function badRequest(message) { return json({ error: message }, 400); }
export function unauthorized(message = 'Not authenticated') { return json({ error: message }, 401); }
export function forbidden(message = 'Forbidden') { return json({ error: message }, 403); }
export function notFound(message = 'Not found') { return json({ error: message }, 404); }
export function conflict(message) { return json({ error: message }, 409); }
export function unavailable(message = 'Service temporarily unavailable') { return json({ error: message, unavailable: true }, 503); }

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export function uuid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

export function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

// RFC 6265 cookie helpers ----------------------------------------------------

export function setSessionCookie(token, expiresAt) {
  const expires = new Date(expiresAt).toUTCString();
  return `fh50_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires}`;
}

export function clearSessionCookie() {
  return 'fh50_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
}

export function getSessionToken(request) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)fh50_session=([a-f0-9]{64})/);
  return m ? m[1] : null;
}
