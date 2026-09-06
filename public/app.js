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

  return { api, el, esc, nav, initTheme, toggleTheme, requireAuth, fmtTime, topbar, ICONS };
})();
FH.initTheme();
