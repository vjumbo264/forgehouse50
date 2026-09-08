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
  };

  function nav(active) {
    const items = [
      ['home', '/', 'Home'], ['read', '/read.html', 'Read'], ['notes', '/notes.html', 'Notes'],
      ['progress', '/progress.html', 'Progress'], ['board', '/leaderboard.html', 'Leaders'], ['profile', '/profile.html', 'Profile'],
    ];
    const bar = document.createElement('nav');
    bar.className = 'bottom';
    bar.innerHTML = items.map(([k, href, label]) =>
      `<a href="${href}" class="${k === active ? 'active' : ''}">${ICONS[k]}${label}</a>`).join('');
    document.body.appendChild(bar);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('fh50_theme', theme);
  }
  function initTheme() { applyTheme(localStorage.getItem('fh50_theme') || 'dark'); }
  function toggleTheme() { applyTheme((localStorage.getItem('fh50_theme') || 'dark') === 'dark' ? 'light' : 'dark'); }

  async function requireAuth() {
    const { ok, data } = await api('/api/auth/me');
    if (!ok) { location.href = '/login.html'; return null; }
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
      <button class="iconbtn" onclick="FH.toggleTheme()" title="Toggle theme">◐</button></div></div>`;
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
  function avatarHtml(avatarId, name, size = 34) {
    if (avatarId && AVATAR_BY_ID[avatarId]) {
      const initial = esc(String(name || 'M').trim()[0]?.toUpperCase() || 'M');
      return `<div class="avatar" style="width:${size}px;height:${size}px">`
        + `<img src="/avatars/${esc(avatarId)}.png" alt="" loading="lazy" `
        + `onerror="this.remove()">`
        + `<span class="avatar-fallback" style="font-size:${Math.round(size * 0.43)}px">${initial}</span></div>`;
    }
    const initial = esc(String(name || 'M').trim()[0]?.toUpperCase() || 'M');
    return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.43)}px">${initial}</div>`;
  }

  // Old inline-SVG preset definitions removed in Part B (dead code).
  return { api, el, esc, nav, initTheme, toggleTheme, requireAuth, fmtTime, topbar, ICONS, AVATARS, avatarHtml };
})();
FH.initTheme();

/* PWA: register the service worker (app-shell cache + installability).
   Registered from app.js so every page opts in; failures are non-fatal. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline-capable enhancement only */ });
  });
}
