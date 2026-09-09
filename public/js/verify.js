/* ============================================================================
   ForgeHouse 50 — Verify email (ui_overhaul_v1, task-u10)
   ----------------------------------------------------------------------------
   Extracted from the pre-overhaul inline script in public/verify.html and moved
   onto the v2 design system. API surface UNCHANGED:

     POST /api/auth/verify   { email, code }
     POST /api/auth/resend   { email }

   Behaviour preserved exactly:
     * the email comes from ?email= and a missing one still bounces to /signup.html
     * a successful verify still lands on '/' (the API sets the session cookie)
     * the "Resend code" link still issues a NEW code for the same address

   Additions are presentational only: a loading state on the buttons, a tinted
   status message instead of overwriting the link's own label, a short cooldown
   so an impatient double-tap can't burn two codes, and digit-only input
   sanitising with auto-submit once six digits are present.
   ========================================================================== */
(() => {
  'use strict';

  document.getElementById('head').innerHTML = FH.authHead();

  // ── Address under verification ────────────────────────────────────────────
  // Same source and same missing-email redirect as the pre-overhaul script.
  const email = new URLSearchParams(location.search).get('email') || '';
  document.getElementById('em').textContent = email || 'your email';
  if (!email) { location.href = '/signup.html'; return; }

  const form = document.getElementById('verify-form');
  const codeEl = document.getElementById('code');
  const errEl = document.getElementById('err');
  const okEl = document.getElementById('ok');
  const btn = document.getElementById('submit-btn');
  const resend = document.getElementById('resend');

  // ── Input hygiene ─────────────────────────────────────────────────────────
  // Keep it to six digits; submit as soon as the sixth arrives (paste or SMS
  // autofill included) so the common path needs no button press at all.
  codeEl.addEventListener('input', () => {
    const cleaned = codeEl.value.replace(/\D/g, '').slice(0, 6);
    if (cleaned !== codeEl.value) codeEl.value = cleaned;
    if (cleaned.length) errEl.textContent = '';
    if (cleaned.length === 6) form.requestSubmit();
  });
  codeEl.focus();

  // ── Verify ────────────────────────────────────────────────────────────────
  let busy = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    errEl.textContent = '';
    okEl.textContent = '';

    const code = codeEl.value.trim();
    if (code.length !== 6) {
      errEl.textContent = 'Enter the 6-digit code from your email.';
      return;
    }

    busy = true;
    FH.setLoading(btn, true);
    const { ok, data } = await FH.api('/api/auth/verify', {
      method: 'POST',
      body: { email, code },
    });

    if (ok) {
      // Verified: a brief confirmation, then straight into the programme.
      FH.setLoading(btn, false, 'Verified \u2713');
      btn.classList.add('success');
      btn.disabled = true;
      FH.celebrate(btn);
      setTimeout(() => { location.href = '/'; }, 620);
      return;
    }

    busy = false;
    FH.setLoading(btn, false);
    errEl.textContent = data?.error || 'Verification failed';
    codeEl.select();
  });

  // ── Resend ────────────────────────────────────────────────────────────────
  // Unchanged endpoint and payload. The old version replaced the link text
  // permanently; this reports into the status region and re-arms after a
  // cooldown so the operator can ask again if the mail is genuinely slow.
  let cooling = false;

  resend.addEventListener('click', async (e) => {
    e.preventDefault();
    if (cooling) return;
    errEl.textContent = '';
    okEl.textContent = '';

    cooling = true;
    const label = resend.textContent;
    resend.textContent = 'Sending\u2026';
    resend.setAttribute('aria-busy', 'true');

    const { ok, data } = await FH.api('/api/auth/resend', {
      method: 'POST',
      body: { email },
    });

    resend.removeAttribute('aria-busy');

    if (ok) {
      okEl.textContent = 'A new code is on its way \u2014 check your inbox.';
      FH.toast('New code sent', 'ok');
      codeEl.value = '';
      codeEl.focus();
    } else {
      errEl.textContent = data?.error || 'Could not send a new code. Try again in a moment.';
    }

    // Re-arm after 30s; keep the link visibly inert until then.
    resend.textContent = 'Sent \u2014 wait 30s to retry';
    setTimeout(() => {
      resend.textContent = label;
      cooling = false;
    }, 30000);
  });
})();
