/* ============================================================================
   ForgeHouse 50 — Profile page (ui_overhaul_v1, task-u09)
   ----------------------------------------------------------------------------
   RECOVERY NOTE: public/profile.html was pushed by an earlier overhaul session
   referencing /js/profile.js, but that file never landed in the repo (HTTP
   404), so the live page rendered an empty shell. This module restores it on
   the v2 design system.

   API surface is UNCHANGED from the pre-overhaul build:

     GET  /api/auth/me                  (via FH.requireAuth)
     POST /api/auth/avatar    { avatar_id }
     POST /api/auth/logout

   /api/auth/avatar is deliberately the ONLY profile-editing call — email,
   password and name stay read-only outside the auth flow (see
   functions/api/auth/avatar.mjs). Nothing new is requested here.

   Avatar assets: the 41 committed square illustrations at
   /avatars/avatar-NN.png, enumerated by FH.AVATARS in app.js (mirrored by
   functions/lib/avatars.mjs). Filenames are reused exactly — no new art.

   Shell ids owned by public/profile.html: #top, #identity, #stats,
   #avatar-settings, #all-badges, #admin-link, #logout.
   ========================================================================== */
(async () => {
  'use strict';

  const me = await FH.requireAuth();
  if (!me) return;
  document.getElementById('top').innerHTML = FH.topbar('Your Profile');

  const s = me.stats || {};

  // ── Identity card ─────────────────────────────────────────────────────────
  const identityEl = document.getElementById('identity');
  identityEl.innerHTML = `
    <div class="card hero rise">
      <div class="row" style="gap:var(--s-4)">
        ${FH.avatarHtml(me.avatar_id, me.name, 68, 'ring-brand')}
        <div style="min-width:0">
          <h1 style="font-size:var(--t-xl)">${FH.esc(me.name || 'Member')}</h1>
          <div class="small muted" style="margin-top:2px">${FH.esc(me.email || '')}</div>
          <div class="row wrap" style="gap:var(--s-2);margin-top:var(--s-3)">
            <span class="pill onhero">${Number(s.points) || 0} points</span>
            ${me.role === 'admin' ? '<span class="pill onhero">Admin</span>' : ''}
            ${me.email_verified ? '' : '<span class="pill warn">Email unverified</span>'}
          </div>
        </div>
      </div>
    </div>`;

  // ── Programme progress + stats ────────────────────────────────────────────
  // Percentages are derived from the same aggregate fields the old page used;
  // no new endpoint is consulted.
  const statsEl = document.getElementById('stats');
  const days = Number(s.days_completed) || 0;
  const chapters = Number(s.chapters) || 0;
  const pct = Math.min(100, Math.round((days / 50) * 1000) / 10);

  statsEl.innerHTML = `
    <div class="card rise rise-1">
      <div class="prog-head">
        ${FH.ring(pct, pct + '%', 'Complete')}
        <div class="prog-copy">
          <div class="prog-t">${days} of 50 reading days</div>
          <div class="prog-s">${chapters} of 260 chapters read</div>
          ${FH.streakChip(s.streak_current)}
        </div>
      </div>
      <div class="bar" id="pf-bar" role="progressbar" aria-valuenow="${pct}"
           aria-valuemin="0" aria-valuemax="100" aria-label="Programme completion"><i></i></div>
      <div class="grid3" style="margin-top:var(--s-4)">
        <div class="stat brand"><div class="v">${chapters}</div><div class="l">Chapters</div></div>
        <div class="stat streak"><div class="v">${Number(s.streak_current) || 0}</div><div class="l">Streak</div></div>
        <div class="stat"><div class="v">${Number(s.streak_longest) || 0}</div><div class="l">Best</div></div>
      </div>
      <div class="grid3" style="margin-top:var(--s-3)">
        <div class="stat"><div class="v">${Number(s.observations) || 0}</div><div class="l">Observations</div></div>
        <div class="stat"><div class="v">${Number(s.questions) || 0}</div><div class="l">Questions</div></div>
        <div class="stat"><div class="v">${Number(s.audio_sessions) || 0}</div><div class="l">Audio</div></div>
      </div>
      <div class="prog-foot">${FH.ICONS.clock}
        <span>Total reading time: <strong>${FH.esc(FH.fmtTime(s.reading_seconds))}</strong></span>
      </div>
    </div>`;

  FH.animateRing(statsEl.querySelector('.ring'), pct);
  FH.animateBar(statsEl.querySelector('#pf-bar > i'), pct);

  // ── Avatar picker grid ────────────────────────────────────────────────────
  // Reuses the existing illustration asset paths (/avatars/{id}.png). Selection
  // posts the same { avatar_id } body the pre-overhaul page posted.
  const avatarEl = document.getElementById('avatar-settings');
  let selectedId = me.avatar_id || null;
  let saving = false;

  function renderPicker() {
    avatarEl.innerHTML = `
      <div class="section-title"><h2>Your avatar</h2>
        <span class="small muted">${FH.AVATARS.length} to choose from</span></div>
      <div class="card">
        <p class="small muted" style="margin:0 0 var(--s-2)">
          Tap an illustration to make it yours. It appears on the leaderboard beside your name.</p>
        <div class="avatar-picker" id="avatar-grid" role="radiogroup" aria-label="Choose your avatar">
          ${FH.AVATARS.map(a => `
            <button type="button" role="radio" data-aid="${FH.esc(a.id)}"
                    aria-checked="${a.id === selectedId ? 'true' : 'false'}"
                    class="${a.id === selectedId ? 'selected' : ''}"
                    title="${FH.esc(a.label)}" aria-label="${FH.esc(a.label)}">
              ${FH.avatarHtml(a.id, a.label, 56)}
            </button>`).join('')}
        </div>
      </div>`;
  }
  renderPicker();

  avatarEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-aid]');
    if (!btn || saving) return;
    const aid = btn.dataset.aid;
    if (aid === selectedId) return;

    const prev = selectedId;
    saving = true;
    // Optimistic selection so the tap feels instant; reverted on failure.
    selectedId = aid;
    avatarEl.querySelectorAll('button[data-aid]').forEach(b => {
      const on = b.dataset.aid === aid;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    if (!FH.reduceMotion()) {
      const av = btn.querySelector('.avatar');
      if (av) { av.classList.remove('pulse-once'); void av.offsetWidth; av.classList.add('pulse-once'); }
    }

    const { ok } = await FH.api('/api/auth/avatar', { method: 'POST', body: { avatar_id: aid } });
    saving = false;

    if (!ok) {
      selectedId = prev;
      renderPicker();
      FH.toast('Could not save your avatar. Try again.', 'bad');
      return;
    }
    // Keep the identity card in sync without a reload.
    const heroAvatar = identityEl.querySelector('.avatar');
    if (heroAvatar) {
      const fresh = FH.el(FH.avatarHtml(aid, me.name, 68, 'ring-brand'));
      heroAvatar.replaceWith(fresh);
    }
    me.avatar_id = aid;
    FH.toast('Avatar updated', 'ok');
  });

  // ── Full badge catalogue (earned + locked) ────────────────────────────────
  // Mirrors the badges table seed and the rule ids in functions/lib/points.mjs.
  // Display only: earning is decided server-side, never inferred here.
  const BADGE_CATALOGUE = [
    { id: 'streak-7',        name: '7-Day Streak',        icon: '🔥', how: 'Read 7 reading days in a row' },
    { id: 'streak-14',       name: '14-Day Streak',       icon: '🔥', how: 'Read 14 reading days in a row' },
    { id: 'streak-25',       name: '25-Day Streak',       icon: '🔥', how: 'Read 25 reading days in a row' },
    { id: 'finisher-50',     name: '50-Day Finisher',     icon: '🏁', how: 'Complete all 50 reading days' },
    { id: 'chapters-100',    name: '100 Chapters',        icon: '📖', how: 'Read 100 chapters' },
    { id: 'chapters-200',    name: '200 Chapters',        icon: '📖', how: 'Read 200 chapters' },
    { id: 'chapters-260',    name: 'Whole New Testament', icon: '👑', how: 'Read all 260 chapters' },
    { id: 'audio-50',        name: '50 Audio Sessions',   icon: '🎧', how: 'Finish 50 audio narrations' },
    { id: 'observations-25', name: '25 Observations',     icon: '💡', how: 'Save 25 observation notes' },
    { id: 'questions-25',    name: '25 Questions',        icon: '❓', how: 'Save 25 question notes' },
  ];

  const badgesEl = document.getElementById('all-badges');
  const earned = new Set((me.badges || []).map(b => b.id));
  const earnedCount = BADGE_CATALOGUE.filter(b => earned.has(b.id)).length;

  badgesEl.innerHTML = `
    <div class="section-title"><h2>Badges</h2>
      <span class="small muted">${earnedCount} of ${BADGE_CATALOGUE.length} earned</span></div>
    <div class="badge-grid">
      ${BADGE_CATALOGUE.map(b => {
        const got = earned.has(b.id);
        return `<div class="badge-tile ${got ? 'earned' : 'locked'}"
            title="${FH.esc(b.name)} — ${FH.esc(got ? 'earned' : b.how)}">
          <div class="bi" aria-hidden="true">${got ? b.icon : '🔒'}</div>
          <div class="bn">${FH.esc(b.name)}</div>
        </div>`;
      }).join('')}
    </div>`;

  // ── Admin link (only for admins) ──────────────────────────────────────────
  const adminEl = document.getElementById('admin-link');
  if (me.role === 'admin') {
    adminEl.innerHTML = `<a class="btn soft" href="/admin.html"
      style="margin-top:var(--s-4)">${FH.ICONS.shield}Admin dashboard</a>`;
  }

  // ── Log out (confirm first, matching the new modal component) ─────────────
  const logoutBtn = document.getElementById('logout');
  logoutBtn.innerHTML = FH.ICONS.logout + 'Log out';
  logoutBtn.addEventListener('click', async () => {
    const yes = await FH.confirmDialog({
      title: 'Log out of ForgeHouse 50?',
      body: 'Your progress is saved. You can log back in any time.',
      confirmLabel: 'Log out',
      cancelLabel: 'Stay signed in',
      danger: true,
    });
    if (!yes) return;
    FH.setLoading(logoutBtn, true);
    await FH.api('/api/auth/logout', { method: 'POST' });
    location.href = '/login.html';
  });
})();
