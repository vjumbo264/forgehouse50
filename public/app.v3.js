/* ForgeHouse 50 — shared frontend helpers */
const FH = (() => {
  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-json */ }
    return { ok: res.ok, status: res.status, data };
  }

  function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
    read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></svg>',
    notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h11l3 3v15H5z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4M17 4H7v5a5 5 0 0 0 10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>',
    // UI action icons (revert_and_v2_redesign Part D: no emojis anywhere —
    // every former emoji glyph is replaced by one of these consistent SVGs).
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    back5: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
    fwd5: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12"/><path d="m6 11 6 6 6-6"/><path d="M4 21h16"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12.5 9.5 18 20 6.5"/></svg>',
  };

  function nav(active) {
    const items = [
      ['home', '/', 'Home'], ['read', '/read', 'Read'], ['notes', '/notes', 'Notes'],
      ['progress', '/progress', 'Progress'], ['board', '/leaderboard', 'Leaders'], ['profile', '/profile', 'Profile'],
    ];
    const bar = document.createElement('nav');
    bar.className = 'bottom';
    bar.innerHTML = items.map(([k, href, label]) =>
      `<a href="${href}" class="${k === active ? 'active' : ''}">${ICONS[k]}${label}</a>`).join('');
    document.body.appendChild(bar);
  }

  // Theming is automatic via prefers-color-scheme (CSS media query) — there
  // is deliberately no manual toggle and no stored preference.
  // initTheme() only removes any legacy stored theme / data-theme attribute
  // left over from the pre-v3 builds so old visitors migrate cleanly.
  function initTheme() {
    try { localStorage.removeItem('fh50_theme'); } catch { /* private mode */ }
    document.documentElement.removeAttribute('data-theme');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const meta = document.querySelector('meta[name="theme-color"]');
    const apply = () => { if (meta) meta.setAttribute('content', mq.matches ? '#171614' : '#faf9f6'); };
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
  }

  async function requireAuth() {
    const { ok, data } = await api('/api/auth/me');
    if (!ok) { location.href = '/login'; return null; }
    return data;
  }

  function fmtTime(seconds) {
    const m = Math.round((seconds || 0) / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }

  function topbar(title, extra = '') {
    return `<div class="topbar"><div><div class="brand">ForgeHouse <span>50</span></div>
      <div class="tagline">${esc(title)}</div></div><div class="row">${extra}
    </div></div>`;
  }

  // ── Illustration profile avatars (pwa_and_avatars_v1 Part B / task-w06..w09)
  // Square scene/subject illustration PNGs committed at /avatars/avatar-NN.png
  // (fetched from the operator's Drive folder, validated square/no-text/no
  // pre-cropped-circle). The circular crop users see is CSS-only
  // (.avatar { border-radius: 50% } + object-fit: cover); the source images
  // stay full squares. `id` is what is stored in profiles.avatar_id; the same
  // ids drive signup + profile pickers. Backend mirror: functions/lib/avatars.mjs.
  const AVATAR_LABELS = [
    'Gecko', 'Chameleon', 'Terrarium crystal', 'Octopus', 'Phoenix',
    'Robot gardener', 'Black cat', 'Astronaut helmet', 'Chameleon on branch',
    'Anglerfish', 'Hot air balloon', 'Compass', 'Glowing mushroom',
    'Key lime pie', 'Fox with sunglasses', 'Cosmic crystal', 'Cookie',
    'Toadstool', 'Fox by campfire', 'Beanstalk planet', 'Sleepy cloud star',
    'Ringed planet', 'Penguin', 'Desert llama', 'Bike helmet',
    'Rocket launch', 'Paper plane satellite', 'Robot with plant',
    'Lighthouse', 'Crystal cactus', 'Robot with lantern', 'Sea turtle',
    'Night owl', 'Ringed planet at dusk', 'Moon rocket', 'Rocket trail',
    'Astronaut suit', 'Pumpkin bot', 'Chameleon leaves', 'Robot head',
    'Sleeping fox',
  ];
  const AVATARS = AVATAR_LABELS.map((label, i) =>
    ({ id: `avatar-${String(i + 1).padStart(2, '0')}`, label }));
  const AVATAR_BY_ID = Object.fromEntries(AVATARS.map(a => [a.id, a]));

  // Render a user's avatar: the illustration image when avatar_id is known
  // (with a broken-image-proof fallback to the initial tile if the file is
  // missing), otherwise the legacy first-initial fallback. size = diameter.
  function avatarHtml(avatarId, name, size = 34, eager = false) {
    if (avatarId && AVATAR_BY_ID[avatarId]) {
      const initial = esc(String(name || 'M').trim()[0]?.toUpperCase() || 'M');
      return `<div class="avatar" style="width:${size}px;height:${size}px">`
        + `<img src="/avatars/${esc(avatarId)}.png" alt="" ${eager ? '' : 'loading="lazy" '}`
        + `onerror="this.remove()">`
        + `<span class="avatar-fallback" style="font-size:${Math.round(size * 0.43)}px">${initial}</span></div>`;
    }
    const initial = esc(String(name || 'M').trim()[0]?.toUpperCase() || 'M');
    return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.43)}px">${initial}</div>`;
  }

  // Old inline-SVG preset definitions removed in Part B (dead code).
  return { api, el, esc, nav, initTheme, requireAuth, fmtTime, topbar, ICONS, AVATARS, avatarHtml };
})();
FH.initTheme();

/* PWA: register the service worker (app-shell cache + installability).
   Registered from app.js so every page opts in; failures are non-fatal. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline-capable enhancement only */ });
  });
}
