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

  // ── Preset profile avatars (profile_content_cleanup_v1 / task-p05) ───────
  // A fixed, curated set of initials-free icon glyphs on colored circles
  // (in the spirit of Google account avatars). Rendered as inline SVG — no
  // external image hosting, crisp at any size. `id` is what is stored in
  // profiles.avatar_id; the same ids drive signup + profile pickers.
  const AVATAR_ICONS = {
    dove:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 4c-3 0-5.5 1.6-6.6 4H9L3 3l2 5-2 2 4 1c0 5 4 9 9 9 1 0 2-.2 3-.5l-2-1.5h4c1 0 2-.8 2-2 0-.5-.2-1-.5-1.3C23 14.3 23 13.7 23 13V8l-2-4z"/></svg>',
    flame:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s1 3-1 6c-1.4 2.1-3 3.4-3 6a4 4 0 0 0 8 0c0-1.2-.4-2.2-1-3-1 1-2 1.5-2 1.5s1.5-2.5 1-5C13.5 5 12 2 12 2zm-2 14.5c0 1.9 1.1 3 2 3s2-1.1 2-3c0-1.5-1-2.5-2-4-1 1.5-2 2.5-2 4z"/></svg>',
    cross:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 3h4v5h5v4h-5v9h-4v-9H5V8h5z"/></svg>',
    fish:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5C7 5 3 8.5 1 12c2 3.5 6 7 11 7 1.5 0 3-.3 4.3-.8L20 21v-4.4c1.6-1.3 2.7-2.9 3-4.6-.3-1.7-1.4-3.3-3-4.6V3l-3.7 2.8C15 5.3 13.5 5 12 5zm-4 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z"/></svg>',
    book:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h12a2 2 0 0 1 2 2v16l-4-2-4 2-4-2-4 2V4a2 2 0 0 1 2-2zm2 5h8v2H8zm0 4h8v2H8z"/></svg>',
    star:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 16.2 6.2 19.8l1.6-6.6L2.6 8.8l6.8-.5z"/></svg>',
    heart:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21S3 14.5 3 8.9C3 5.6 5.5 3 8.5 3 10 3 11.3 3.6 12 4.6 12.7 3.6 14 3 15.5 3 18.5 3 21 5.6 21 8.9 21 14.5 12 21 12 21z"/></svg>',
    anchor:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a3 3 0 0 0-1 5.8V9H7v3h4v7.1c-2.9-.5-5-2.4-5.8-5.1H3c.9 4.3 4.7 7.5 9 8 4.3-.5 8.1-3.7 9-8h-2.2c-.8 2.7-2.9 4.6-5.8 5.1V12h4V9h-4V7.8A3 3 0 0 0 12 2zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/></svg>',
    sun:     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0-5 1.5 3h-3zm0 20 1.5-3h-3zM2 12l3-1.5v3zm20 0-3-1.5v3zM4.2 4.2l3.2 1.4-2.2 2.2zm15.6 15.6-3.2-1.4 2.2-2.2zm0-15.6-1.4 3.2-2.2-2.2zM4.2 19.8l1.4-3.2 2.2 2.2z"/></svg>',
    lamp:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 2h6l2 7H7zm2 9h2v9h-2zm-6 1h4l-1.5 4H5zm14 0h-4l1.5 4H19z"/></svg>',
    crown:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m3 8 4 4 5-7 5 7 4-4-1.5 11h-15zM4.5 21h15v1.5h-15z"/></svg>',
    shield:  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 4 5.5V11c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5.5zm-1.5 13.5-3.5-3.5 1.4-1.4 2.1 2.1 5.1-5.1 1.4 1.4z"/></svg>',
    olive:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4c-4 0-8 2-10.5 5.5C7 12.5 6 16 6 18c2 0 5.5-1 8.5-3.5C18 12 20 8 20 4zM7 14.5C8.5 11 11 8 14.5 6.5 12 10 9.5 12.5 7 14.5zM5 19c1-1 2.5-1.2 4-.5-1 .8-2.5 1-4 .5z"/></svg>',
    bread:   '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C6 4 2 7 2 10.5c0 1.8 1 3.4 2.5 4.2V20h15v-5.3C21 13.9 22 12.3 22 10.5 22 7 18 4 12 4zm-3 6.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zm6 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z"/></svg>',
    rainbow: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5C6.5 5 2 9.5 2 15v3h2v-3a8 8 0 0 1 16 0v3h2v-3c0-5.5-4.5-10-10-10zm0 4a6 6 0 0 0-6 6v3h2v-3a4 4 0 0 1 8 0v3h2v-3a6 6 0 0 0-6-6zm0 4a2 2 0 0 0-2 2v3h4v-3a2 2 0 0 0-2-2z"/></svg>',
    tree:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 20h2v-4.3c2.3-.4 4-1.6 5-3.7 1.3.6 3 .2 3.8-1 .9-1.4.3-3.3-1-4.2.4-1.7-.6-3.4-2.3-3.8C17.7 1.6 15.9.6 14.2 1 13 .1 11-.1 9.8 1 8.2.6 6.3 1.6 5.5 3.2 3.8 3.6 2.8 5.3 3.2 7c-1.3.9-1.9 2.8-1 4.2.8 1.2 2.5 1.6 3.8 1 1 2.1 2.7 3.3 5 3.7z"/></svg>',
    lion:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 1.5.4 2.9 1.2 4A5.5 5.5 0 0 0 5 16.5C5 19.5 8.1 22 12 22s7-2.5 7-5.5c0-1.3-.4-2.5-1.2-3.5A7 7 0 0 0 12 2zm0 4a3 3 0 0 1 3 3c0 .4 0 .8-.2 1.1A4 4 0 0 0 12 9a4 4 0 0 0-2.8 1.1A3 3 0 0 1 12 6zm-1.5 6h1a.75.75 0 1 1 0 1.5h-1a.75.75 0 1 1 0-1.5zM12 15a3.5 3.5 0 0 1 3.4 2.6c-.9.6-2.1 1-3.4 1s-2.5-.4-3.4-1A3.5 3.5 0 0 1 12 15z"/></svg>',
    lamb:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 3a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3h-.5c.3.6.5 1.3.5 2a6 6 0 0 1-6 6H9a5 5 0 0 1-5-5c0-2 1.2-3.7 3-4.4C7 7.6 8.6 6 10.5 6h.6A3 3 0 0 1 14 3zM9 12a2.5 2.5 0 0 0-2.5 2.5c0 .3 0 .5.1.8A2.5 2.5 0 0 0 11 14v-2zm9-7.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z"/></svg>',
    wave:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0v3c-2 2-4 2-6 0s-4-2-6 0-4 2-6 0zm0-6c2-2 4-2 6 0s4 2 6 0 4-2 6 0v3c-2 2-4 2-6 0s-4-2-6 0-4 2-6 0z"/></svg>',
    moon:    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
  };
  const AVATAR_COLORS = {
    amber: '#f59e0b', red: '#ef4444', rose: '#f43f5e', orange: '#f97316',
    green: '#22c55e', teal: '#14b8a6', cyan: '#06b6d4', blue: '#3b82f6',
    indigo: '#6366f1', violet: '#8b5cf6', purple: '#a855f7', slate: '#64748b',
  };
  const AVATARS = [
    { id: 'dove-amber',    icon: 'dove',    color: 'amber' },
    { id: 'dove-blue',     icon: 'dove',    color: 'blue' },
    { id: 'flame-red',     icon: 'flame',   color: 'red' },
    { id: 'flame-orange',  icon: 'flame',   color: 'orange' },
    { id: 'cross-violet',  icon: 'cross',   color: 'violet' },
    { id: 'cross-teal',    icon: 'cross',   color: 'teal' },
    { id: 'fish-cyan',     icon: 'fish',    color: 'cyan' },
    { id: 'fish-blue',     icon: 'fish',    color: 'blue' },
    { id: 'book-green',    icon: 'book',    color: 'green' },
    { id: 'book-indigo',   icon: 'book',    color: 'indigo' },
    { id: 'star-amber',    icon: 'star',    color: 'amber' },
    { id: 'star-violet',   icon: 'star',    color: 'violet' },
    { id: 'heart-rose',    icon: 'heart',   color: 'rose' },
    { id: 'heart-red',     icon: 'heart',   color: 'red' },
    { id: 'anchor-slate',  icon: 'anchor',  color: 'slate' },
    { id: 'anchor-blue',   icon: 'anchor',  color: 'blue' },
    { id: 'sun-orange',    icon: 'sun',     color: 'orange' },
    { id: 'sun-amber',     icon: 'sun',     color: 'amber' },
    { id: 'lamp-amber',    icon: 'lamp',    color: 'amber' },
    { id: 'lamp-teal',     icon: 'lamp',    color: 'teal' },
    { id: 'crown-purple',  icon: 'crown',   color: 'purple' },
    { id: 'crown-amber',   icon: 'crown',   color: 'amber' },
    { id: 'shield-green',  icon: 'shield',  color: 'green' },
    { id: 'shield-indigo', icon: 'shield',  color: 'indigo' },
    { id: 'olive-green',   icon: 'olive',   color: 'green' },
    { id: 'olive-teal',    icon: 'olive',   color: 'teal' },
    { id: 'bread-orange',  icon: 'bread',   color: 'orange' },
    { id: 'rainbow-cyan',  icon: 'rainbow', color: 'cyan' },
    { id: 'rainbow-violet',icon: 'rainbow', color: 'violet' },
    { id: 'tree-green',    icon: 'tree',    color: 'green' },
    { id: 'lion-amber',    icon: 'lion',    color: 'amber' },
    { id: 'lamb-slate',    icon: 'lamb',    color: 'slate' },
    { id: 'wave-cyan',     icon: 'wave',    color: 'cyan' },
    { id: 'moon-indigo',   icon: 'moon',    color: 'indigo' },
  ];
  const AVATAR_BY_ID = Object.fromEntries(AVATARS.map(a => [a.id, a]));

  // Render a user's avatar: preset icon when avatar_id is known, otherwise
  // the legacy first-initial fallback. size = pixel diameter.
  function avatarHtml(avatarId, name, size = 34) {
    const a = avatarId && AVATAR_BY_ID[avatarId];
    if (a) {
      const bg = AVATAR_COLORS[a.color] || 'var(--accent)';
      const fs = Math.round(size * 0.58);
      return `<div class="avatar" style="width:${size}px;height:${size}px;background:${bg};border:none;color:#fff">`
        + `<span style="width:${fs}px;height:${fs}px;display:inline-flex">${AVATAR_ICONS[a.icon]}</span></div>`;
    }
    const initial = esc(String(name || 'M').trim()[0]?.toUpperCase() || 'M');
    return `<div class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.43)}px">${initial}</div>`;
  }

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
