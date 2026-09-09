/* ============================================================================
   ForgeHouse 50 — Log in (ui_overhaul_v1, task-u10)
   ----------------------------------------------------------------------------
   Extracted from the pre-overhaul inline script in public/login.html and moved
   onto the v2 design system. API surface UNCHANGED:

     POST /api/auth/login   { email, password }

   Response handling is identical to before, including the
   `needs_verification` redirect to /verify.html?email=… and the deliberately
   non-enumerating error message passthrough from the API.
   ========================================================================== */
(() => {
  'use strict';

  document.getElementById('head').innerHTML = FH.authHead();

  const form = document.getElementById('login-form');
  const errEl = document.getElementById('err');
  const btn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    if (!email || !password) {
      errEl.textContent = 'Enter your email and password.';
      return;
    }

    FH.setLoading(btn, true);
    const { ok, data } = await FH.api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });

    if (ok) { location.href = '/'; return; }              // session cookie is set by the API

    if (data?.needs_verification) {
      location.href = '/verify.html?email=' + encodeURIComponent(data.email);
      return;
    }

    FH.setLoading(btn, false);
    errEl.textContent = data?.error || 'Login failed';
  });
})();
