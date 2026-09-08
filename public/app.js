/* ============================================================================
   ForgeHouse 50 — shared frontend helpers (ui_overhaul_v1)
   ----------------------------------------------------------------------------
   THEMING: there is no theme toggle and nothing is persisted. Both palettes
   live in app.css behind prefers-color-scheme, so the OS/browser setting is the
   single source of truth and changes apply live without a reload. The only JS
   involvement is keeping <meta name="theme-color"> in sync with the active
   palette (a browser-chrome nicety, not app state) — see syncThemeColor().

   API SURFACE IS UNCHANGED. Every endpoint, method, and request/response shape
   used here is identical to the pre-overhaul build.
   ========================================================================== */
const FH = (() => {
  'use strict';

  // ── Networking ───────────────────────────────────────────────────────────
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

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const reduceMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Icon set (stroked, rounded — matches the new visual language) ────────
  const ICONS = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.6 12 3.8l8.5 6.8"/><path d="M5.6 9.6V20h12.8V9.6"/><path d="M9.8 20v-5.2h4.4V20"/></svg>',
    read: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 6.5C10.6 5 8.8 4.3 6 4.3H4v14h2c2.8 0 4.6.7 6 2.2"/><path d="M12 6.5c1.4-1.5 3.2-2.2 6-2.2h2v14h-2c-2.8 0-4.6.7-6 2.2z"/><path d="M12 6.5v14"/></svg>',
    notes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 3.5H6.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V7z"/><path d="M15 3.6V7h4"/><path d="M8.6 12h6.8M8.6 15.6h4.4"/></svg>',
    progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V13M9.3 19.5V7.5M14.7 19.5v-4.2M20 19.5V4.5"/></svg>',
    board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8.2 4h7.6v5.2a3.8 3.8 0 0 1-7.6 0z"/><path d="M15.8 5.2h2.9v1.6a2.9 2.9 0 0 1-2.9 2.9M8.2 5.2H5.3v1.6a2.9 2.9 0 0 0 2.9 2.9"/><path d="M12 13v3.6M8.8 20.2h6.4l-.6-3.6H9.4z"/></svg>',
    profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.4" r="3.9"/><path d="M4.6 20.4c1.2-3.7 4-5.6 7.4-5.6s6.2 1.9 7.4 5.6"/></svg>',
    flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.6 2.2c.3 2.4-.7 3.7-1.9 5-1.4 1.5-3 3.1-3 6 0 3.4 2.8 6.1 6.2 6.1 3.4 0 6.1-2.7 6.1-6.1 0-4.6-3.6-7.2-4.7-10.6-.9 1.1-1.1 2.4-1 3.6-.6-1.4-1-2.7-1.7-4z" transform="translate(-2 1)"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.8l4.7 4.6L19.5 6.9"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v12.5H7.5A2.5 2.5 0 0 1 5 17z"/><path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H17"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 2"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.6h3l4-3.2v11.2l-4-3.2H4z"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.8a7.6 7.6 0 0 1 0 10.4"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.8h11v16.4L12 16l-5.5 4.2z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="17.6" cy="5.8" r="2.6"/><circle cx="6.4" cy="12" r="2.6"/><circle cx="17.6" cy="18.2" r="2.6"/><path d="M15.3 7.1 8.7 10.7M8.7 13.3l6.6 3.6"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.4 11.6c0 4-3.8 7.2-8.4 7.2-1 0-2-.2-2.9-.5L4.4 20l1.3-3.6a6.8 6.8 0 0 1-2.1-4.8c0-4 3.8-7.2 8.4-7.2s8.4 3.2 8.4 7.2z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M12.6 6l6 6-6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5.5v13M5.5 12h13"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.4"/><path d="M15.8 15.8 20.5 20.5"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.4 5.2 6v5.4c0 4 2.8 7.6 6.8 9.2 4-1.6 6.8-5.2 6.8-9.2V6z"/><path d="M9.2 12.2l2 2 3.6-3.8"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M14.4 8V5.6a1.6 1.6 0 0 0-1.6-1.6H6.2A1.6 1.6 0 0 0 4.6 5.6v12.8A1.6 1.6 0 0 0 6.2 20h6.6a1.6 1.6 0 0 0 1.6-1.6V16"/><path d="M9.6 12h10M16.6 8.8 19.8 12l-3.2 3.2"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l1.9 5.5 5.5 1.9-5.5 1.9L12 17.4l-1.9-5.5L4.6 10l5.5-1.9z"/></svg>',
  };

  // The ForgeHouse mark used in the brand lockup (house + flame).
  const MARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.6 10.4 12 3.6l8.4 6.8"/><path d="M5.8 9.5V20h12.4V9.5"/><path d="M12 17.6c-1.5 0-2.6-1.1-2.6-2.5 0-1.6 1.6-2.3 1.9-4.1.9 1.1 3.3 2.2 3.3 4.1 0 1.4-1.1 2.5-2.6 2.5z" fill="currentColor" stroke="none"/></svg>';

  // ── Bottom navigation ────────────────────────────────────────────────────
  function nav(active) {
    const items = [
      ['home', '/', 'Home'],
      ['read', '/read.html', 'Read'],
      ['notes', '/notes.html', 'Notes'],
      ['progress', '/progress.html', 'Progress'],
      ['board', '/leaderboard.html', 'Leaders'],
      ['profile', '/profile.html', 'Profile'],
    ];
    if (document.querySelector('nav.bottom')) return;
    const bar = document.createElement('nav');
    bar.className = 'bottom';
    bar.setAttribute('aria-label', 'Main navigation');
    bar.innerHTML = items.map(([k, href, label]) => {
      const isActive = k === active;
      return `<a href="${href}" class="${isActive ? 'active' : ''}"`
        + `${isActive ? ' aria-current="page"' : ''}>`
        + `${ICONS[k]}<span>${label}</span></a>`;
    }).join('');
    document.body.appendChild(bar);
  }

  // ── Theme: automatic only ────────────────────────────────────────────────
  // Keeps the browser-chrome colour matched to the active palette. No user
  // preference is read or written; the media query is the only input, and the
  // listener makes live OS changes take effect with no reload.
  const THEME_COLORS = { light: '#f4f7fc', dark: '#0a1220' };
  function syncThemeColor() {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', dark ? THEME_COLORS.dark : THEME_COLORS.light);
  }
  function initTheme() {
    // Legacy cleanup: earlier builds persisted a manual choice and set
    // data-theme on <html>. Both are now meaningless — remove them so an
    // upgrading user is never stuck on a stale forced palette.
    try { localStorage.removeItem('fh50_theme'); } catch { /* private mode */ }
    document.documentElement.removeAttribute('data-theme');
    syncThemeColor();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', syncThemeColor);
    else if (mq.addListener) mq.addListener(syncThemeColor);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  async function requireAuth() {
    const { ok, data } = await api('/api/auth/me');
    if (!ok) { location.href = '/login.html'; return null; }
    return data;
  }

  // ── Formatting ───────────────────────────────────────────────────────────
  function fmtTime(seconds) {
    const m = Math.round((seconds || 0) / 60);
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso + (String(iso).length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // ── App bar ──────────────────────────────────────────────────────────────
  // Same call signature as before: topbar(title, extraHtml). The old theme
  // toggle button that used to be appended here is gone for good.
  function topbar(title, extra = '') {
    return `<header class="appbar">
      <div class="appbar-l">
        <span class="brand-mark" aria-hidden="true">${MARK}</span>
        <div class="appbar-title">
          <div class="brand">ForgeHouse <span>50</span></div>
          <div class="tagline">${esc(title)}</div>
        </div>
      </div>
      <div class="appbar-r">${extra}</div>
    </header>`;
  }

  function authHead(sub = 'Read the New Testament in 50 Reading Days') {
    return `<div class="auth-head">
      <span class="brand-mark" aria-hidden="true">${MARK}</span>
      <div class="brand">ForgeHouse <span>50</span></div>
      <div class="tagline">${esc(sub)}</div>
    </div>`;
  }

  // ── Buttons: loading state helper ────────────────────────────────────────
  function setLoading(btn, on, labelWhenDone) {
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.dataset.label || btn.innerHTML;
      btn.classList.add('is-loading');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    } else {
      btn.classList.remove('is-loading');
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (labelWhenDone !== undefined) btn.innerHTML = labelWhenDone;
      else if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
    }
  }

  // ── Toasts ───────────────────────────────────────────────────────────────
  function toastHost() {
    let host = document.querySelector('.toast-host');
    if (!host) {
      host = document.createElement('div');
      host.className = 'toast-host';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      document.body.appendChild(host);
    }
    return host;
  }
  function toast(message, kind = '', ms = 2600) {
    const host = toastHost();
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = message;
    host.appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 260);
    }, ms);
    return t;
  }

  // ── Confirm modal (replaces window.confirm for destructive actions) ──────
  function confirmDialog({ title, body = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    return new Promise(resolve => {
      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';
      backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="fh-modal-t">
        <h3 id="fh-modal-t">${esc(title)}</h3>
        ${body ? `<div class="modal-body">${esc(body)}</div>` : ''}
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-act="cancel">${esc(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'danger' : ''}" data-act="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
      const close = (val) => {
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        resolve(val);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) return close(false);
        const b = e.target.closest('button[data-act]');
        if (b) close(b.dataset.act === 'ok');
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(backdrop);
      backdrop.querySelector('[data-act="ok"]').focus();
    });
  }

  // ── Celebration: brief, restrained bloom (skipped under reduced motion) ──
  function celebrate(origin) {
    if (reduceMotion()) return;
    const layer = document.createElement('div');
    layer.className = 'celebrate';
    const colors = ['var(--brand-500)', 'var(--brand-600)', 'var(--ok)', 'var(--streak)', 'var(--purple)'];
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight * 0.42;
    if (origin && origin.getBoundingClientRect) {
      const r = origin.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    }
    for (let i = 0; i < 18; i++) {
      const p = document.createElement('i');
      const ang = (Math.PI * 2 * i) / 18 + Math.random() * 0.3;
      const dist = 70 + Math.random() * 90;
      p.style.left = cx + 'px';
      p.style.top = cy + 'px';
      p.style.background = colors[i % colors.length];
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.style.setProperty('--rot', Math.round(Math.random() * 320) + 'deg');
      p.style.animationDelay = (i * 8) + 'ms';
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1400);
  }

  // Animate a progress bar/ring from 0 to its value so the fill is felt.
  function animateBar(node, percent) {
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    if (!node) return;
    if (reduceMotion()) { node.style.width = pct + '%'; return; }
    node.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { node.style.width = pct + '%'; }));
  }
  function animateRing(node, percent) {
    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    if (!node) return;
    if (reduceMotion()) { node.style.setProperty('--p', pct); return; }
    node.style.setProperty('--p', 0);
    requestAnimationFrame(() => requestAnimationFrame(() => node.style.setProperty('--p', pct)));
  }

  // Progress ring markup. value/label are display-only.
  function ring(percent, value, label, cls = '') {
    return `<div class="ring ${cls}" style="--p:${Math.max(0, Math.min(100, Number(percent) || 0))}"
      role="img" aria-label="${esc(label)}: ${esc(String(value))}">
      <span class="ring-in"><span class="ring-v">${esc(String(value))}</span>
      <span class="ring-l">${esc(label)}</span></span></div>`;
  }

  function streakChip(current) {
    const n = Number(current) || 0;
    return `<span class="streak-chip ${n > 0 ? '' : 'is-cold'}">${ICONS.flame}
      <span class="num">${n}</span> day${n === 1 ? '' : 's'}</span>`;
  }

  function empty(icon, title, sub = '') {
    return `<div class="empty"><div class="ei">${icon}</div>
      <div class="et">${esc(title)}</div>
      ${sub ? `<div class="small">${esc(sub)}</div>` : ''}</div>`;
  }

  function skeletonCard(lines = 3) {
    let s = '';
    for (let i = 0; i < lines; i++) s += `<div class="skeleton line ${i === lines - 1 ? 'w40' : (i ? 'w60' : '')}"></div>`;
    return `<div class="card">${s}</div>`;
  }

  // ── Illustration profile avatars (pwa_and_avatars_v1 Part B) ─────────────
  // Square scene/subject illustration PNGs committed at /avatars/avatar-NN.png.
  // The circular crop is CSS-only; the sources stay full squares. `id` is what
  // is stored in profiles.avatar_id. Backend mirror: functions/lib/avatars.mjs.
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
  // (with a broken-image-proof fallback to the initial tile), otherwise the
  // legacy first-initial fallback. size = diameter in px.
  function avatarHtml(avatarId, name, size = 38, extraClass = '') {
    const initial = esc(String(name || 'M').trim()[0]?.toUpperCase() || 'M');
    const cls = ('avatar ' + extraClass).trim();
    if (avatarId && AVATAR_BY_ID[avatarId]) {
      return `<div class="${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">`
        + `<img src="/avatars/${esc(avatarId)}.png" alt="" loading="lazy" onerror="this.remove()">`
        + `<span class="avatar-fallback">${initial}</span></div>`;
    }
    return `<div class="${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px">${initial}</div>`;
  }

  return {
    api, el, esc, nav, initTheme, requireAuth, fmtTime, fmtDate, topbar, authHead,
    ICONS, MARK, AVATARS, avatarHtml, setLoading, toast, confirmDialog, celebrate,
    animateBar, animateRing, ring, streakChip, empty, skeletonCard, reduceMotion,
  };
})();
FH.initTheme();

/* PWA: register the service worker (app-shell cache + installability).
   Registered from app.js so every page opts in; failures are non-fatal. */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* enhancement only */ });
  });
}
