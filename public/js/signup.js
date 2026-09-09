/* ============================================================================
   ForgeHouse 50 — Create account (ui_overhaul_v1, task-u10)
   ----------------------------------------------------------------------------
   Extracted from the pre-overhaul inline script in public/signup.html and
   moved onto the v2 design system. API surface UNCHANGED:

     POST /api/auth/signup   { name, email, password, avatar_id }

   The avatar step stays OPTIONAL and non-blocking exactly as before: a valid
   default (FH.AVATARS[0].id) is pre-selected so signup can never fail on this
   field, and the backend re-normalises anything unexpected
   (functions/lib/avatars.mjs normalizeAvatarId).

   On success the user is sent to /verify.html?email=… — same as before.
   ========================================================================== */
(() => {
  'use strict';

  document.getElementById('head').innerHTML = FH.authHead();

  // ── Avatar picker (optional) ──────────────────────────────────────────────
  // Reuses the committed illustration assets at /avatars/{id}.png via
  // FH.AVATARS — no new artwork, no new asset paths.
  let chosenAvatar = FH.AVATARS[0].id;
  const picker = document.getElementById('avatar-picker');

  picker.innerHTML = FH.AVATARS.map(a =>
    `<button type="button" role="radio" data-avatar="${FH.esc(a.id)}"
             aria-checked="${a.id === chosenAvatar ? 'true' : 'false'}"
             class="${a.id === chosenAvatar ? 'selected' : ''}"
             title="${FH.esc(a.label)}" aria-label="${FH.esc(a.label)}">
       ${FH.avatarHtml(a.id, a.label, 52)}
     </button>`).join('');

  picker.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-avatar]');
    if (!b) return;
    chosenAvatar = b.dataset.avatar;
    picker.querySelectorAll('button[data-avatar]').forEach(x => {
      const on = x.dataset.avatar === chosenAvatar;
      x.classList.toggle('selected', on);
      x.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    if (!FH.reduceMotion()) {
      const av = b.querySelector('.avatar');
      if (av) { av.classList.remove('pulse-once'); void av.offsetWidth; av.classList.add('pulse-once'); }
    }
  });

  // ── Submit ────────────────────────────────────────────────────────────────
  const form = document.getElementById('signup-form');
  const errEl = document.getElementById('err');
  const btn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email) { errEl.textContent = 'Enter your email address.'; return; }
    if (!password || password.length < 8) {
      errEl.textContent = 'Choose a password of at least 8 characters.';
      return;
    }

    FH.setLoading(btn, true);
    const { ok, data } = await FH.api('/api/auth/signup', {
      method: 'POST',
      body: { name, email, password, avatar_id: chosenAvatar },
    });

    if (ok) { location.href = '/verify.html?email=' + encodeURIComponent(email); return; }

    FH.setLoading(btn, false);
    errEl.textContent = data?.error || 'Signup failed';
  });
})();
