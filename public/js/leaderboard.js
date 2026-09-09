/* ============================================================================
   ForgeHouse 50 — Leaderboard page (ui_overhaul_v1, task-u08)
   ----------------------------------------------------------------------------
   RECOVERY NOTE: public/leaderboard.html was pushed by an earlier overhaul
   session referencing /js/leaderboard.js, but that file never landed in the
   repo (HTTP 404), so the live page rendered an empty shell. This module
   restores it on the v2 design system.

   API surface is UNCHANGED from the pre-overhaul build:

     GET /api/auth/me                    (via FH.requireAuth)
     GET /api/leaderboard?category=overall|consistency|chapters|reading_time|
                                   observations|questions

   Response shape consumed (see functions/api/leaderboard.mjs +
   functions/lib/points.mjs leaderboard()):
     { category, entries: [ { rank, user_id, display_name, avatar_url,
                              avatar_id, value,
                              streak_current?, streak_longest? } ] }
   `streak_current` / `streak_longest` are attached by the API for the
   consistency category only — exactly as before.

   PRIVACY: aggregate values only. No emails, no note bodies. This module never
   requests or renders anything else.

   Shell ids owned by public/leaderboard.html: #top, #tabs, #board,
   #badges-section.
   ========================================================================== */
(async () => {
  'use strict';

  const me = await FH.requireAuth();
  if (!me) return;
  document.getElementById('top').innerHTML = FH.topbar('Leaderboard');

  const tabsEl = document.getElementById('tabs');
  const boardEl = document.getElementById('board');
  const badgesEl = document.getElementById('badges-section');

  // ── Categories ────────────────────────────────────────────────────────────
  // `id` values are the exact query strings the API validates against.
  const CATEGORIES = [
    { id: 'overall',      label: 'Overall',   unit: 'pts',      noun: 'points' },
    { id: 'consistency',  label: 'Streaks',   unit: 'days',     noun: 'reading days' },
    { id: 'chapters',     label: 'Chapters',  unit: 'ch',       noun: 'chapters' },
    { id: 'reading_time', label: 'Time',      unit: 'time',     noun: 'reading time' },
    { id: 'observations', label: 'Insights',  unit: 'notes',    noun: 'observations' },
    { id: 'questions',    label: 'Questions', unit: 'notes',    noun: 'questions' },
  ];

  const MEDALS = ['🥇', '🥈', '🥉'];

  // Format a raw aggregate for display. reading_time arrives in seconds.
  function fmtValue(cat, entry) {
    const v = Number(entry.value) || 0;
    if (cat.unit === 'time') return FH.fmtTime(v);
    if (cat.unit === 'pts') return v.toLocaleString() + ' pts';
    if (cat.unit === 'ch') return v.toLocaleString() + ' ch';
    if (cat.unit === 'days') return v + (v === 1 ? ' day' : ' days');
    return v.toLocaleString();
  }

  // Secondary line under a name. Consistency shows the streaks the API attached.
  function subLine(cat, entry) {
    if (cat.id === 'consistency') {
      const c = Number(entry.streak_current) || 0;
      const l = Number(entry.streak_longest) || 0;
      return `Current streak ${c} · best ${l}`;
    }
    return '';
  }

  function rankCell(rank) {
    const r = Number(rank) || 0;
    if (r >= 1 && r <= 3) {
      return `<div class="rank top"><span class="medal" aria-hidden="true">${MEDALS[r - 1]}</span>`
        + `<span class="sr-only">Rank ${r}</span></div>`;
    }
    return `<div class="rank">${r}</div>`;
  }

  function renderBoard(cat, entries) {
    if (!entries.length) {
      boardEl.innerHTML = FH.empty(FH.ICONS.board, 'No scores yet',
        'As members complete reading days, this board fills up.');
      return;
    }
    boardEl.innerHTML = '<div class="board">' + entries.map(e => {
      const isMe = e.user_id === me.id;
      const sub = subLine(cat, e);
      return `<div class="lrow ${isMe ? 'is-me' : ''} ${e.rank <= 3 ? 'podium' : ''}">
        ${rankCell(e.rank)}
        ${FH.avatarHtml(e.avatar_id, e.display_name, 38, isMe ? 'ring-brand' : '')}
        <div class="who">
          <div class="n">${FH.esc(e.display_name)}${isMe ? ' <span class="pill">You</span>' : ''}</div>
          ${sub ? `<div class="s">${FH.esc(sub)}</div>` : ''}
        </div>
        <div class="val num">${FH.esc(fmtValue(cat, e))}</div>
      </div>`;
    }).join('') + '</div>';
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  let activeId = CATEGORIES[0].id;
  let inFlight = 0;

  async function load(catId) {
    const cat = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];
    activeId = cat.id;
    paintTabs();

    const token = ++inFlight;
    boardEl.innerHTML = `<div style="padding:var(--s-4)">${
      '<div class="skeleton line"></div><div class="skeleton line w60"></div>'
      + '<div class="skeleton line"></div><div class="skeleton line w40"></div>'}</div>`;

    const { ok, data } = await FH.api('/api/leaderboard?category=' + encodeURIComponent(cat.id));
    if (token !== inFlight) return; // a newer tab press won

    if (!ok || !data || !Array.isArray(data.entries)) {
      boardEl.innerHTML = FH.empty(FH.ICONS.board, 'Could not load the leaderboard',
        'Check your connection and try again.');
      return;
    }
    renderBoard(cat, data.entries);
    if (!FH.reduceMotion()) {
      boardEl.querySelectorAll('.lrow').forEach((row, i) => {
        if (i > 11) return;                     // only animate what's plausibly on screen
        row.style.animationDelay = (i * 26) + 'ms';
        row.classList.add('rise');
      });
    }
  }

  function paintTabs() {
    tabsEl.innerHTML = CATEGORIES.map(c =>
      `<button type="button" data-cat="${c.id}" class="${c.id === activeId ? 'active' : ''}"`
      + `${c.id === activeId ? ' aria-current="true"' : ''}>${FH.esc(c.label)}</button>`).join('');
  }

  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cat]');
    if (b && b.dataset.cat !== activeId) load(b.dataset.cat);
  });

  // ── Your badges (earned + locked), from /api/auth/me ──────────────────────
  // BADGE_CATALOGUE mirrors the badges table seed (schema.sql) and the rule
  // ids in functions/lib/points.mjs checkBadges(). Display only — earning is
  // decided server-side and never inferred here.
  const BADGE_CATALOGUE = [
    { id: 'streak-7',        name: '7-Day Streak',      icon: '🔥' },
    { id: 'streak-14',       name: '14-Day Streak',     icon: '🔥' },
    { id: 'streak-25',       name: '25-Day Streak',     icon: '🔥' },
    { id: 'finisher-50',     name: '50-Day Finisher',   icon: '🏁' },
    { id: 'chapters-100',    name: '100 Chapters',      icon: '📖' },
    { id: 'chapters-200',    name: '200 Chapters',      icon: '📖' },
    { id: 'chapters-260',    name: 'Whole New Testament', icon: '👑' },
    { id: 'audio-50',        name: '50 Audio Sessions', icon: '🎧' },
    { id: 'observations-25', name: '25 Observations',   icon: '💡' },
    { id: 'questions-25',    name: '25 Questions',      icon: '❓' },
  ];

  function renderBadges() {
    const earned = new Set((me.badges || []).map(b => b.id));
    const earnedCount = BADGE_CATALOGUE.filter(b => earned.has(b.id)).length;
    badgesEl.innerHTML = `
      <div class="section-title">
        <h2>Your badges</h2>
        <span class="small muted">${earnedCount} of ${BADGE_CATALOGUE.length}</span>
      </div>
      <div class="badge-grid">
        ${BADGE_CATALOGUE.map(b => {
          const got = earned.has(b.id);
          return `<div class="badge-tile ${got ? 'earned' : 'locked'}"
              title="${FH.esc(b.name)}${got ? ' — earned' : ' — not yet earned'}">
            <div class="bi" aria-hidden="true">${got ? b.icon : '🔒'}</div>
            <div class="bn">${FH.esc(b.name)}</div>
          </div>`;
        }).join('')}
      </div>`;
  }

  renderBadges();
  await load(activeId);
})();
