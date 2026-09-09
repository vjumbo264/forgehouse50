/* ============================================================================
   ForgeHouse 50 — Home / Dashboard (ui_overhaul_v1)
   ----------------------------------------------------------------------------
   Rebuilt against the redesigned shell in public/index.html, which provides:
     #top #today-banner #cta #progress-card #stats #next-day #whatsapp

   API SURFACE UNCHANGED: GET /api/auth/me, GET /api/today, GET /api/config.
   Every field read here exists in the pre-overhaul build.

   IMPORTANT (regression guard, carried over from task-p02/p03): the today
   banner MUST be built with lazy per-status builder functions. An eager object
   literal evaluates every branch, and the `reading` branch dereferences
   data.today, which is null on Tue/Fri/rest days -> TypeError that aborts the
   whole module and renders an empty homepage.
   ========================================================================== */
(async () => {
  'use strict';

  const me = await FH.requireAuth();
  if (!me) return;

  const $ = (id) => document.getElementById(id);
  $('top').innerHTML = FH.topbar('Read the New Testament in 50 Reading Days');

  // Skeletons while /api/today resolves.
  $('progress-card').innerHTML = FH.skeletonCard(2);

  const { data } = await FH.api('/api/today');
  if (!data) {
    $('today-banner').innerHTML =
      `<div class="card calm">${FH.empty(FH.ICONS.clock, 'Could not load today',
        'Please check your connection and refresh.')}</div>`;
    $('progress-card').innerHTML = '';
    return;
  }
  const s = data.stats || {};

  // ── Today banner ─────────────────────────────────────────────────────────
  // Lazy builders only (see the regression guard above).
  const dayNum = () => data.today ? data.today.day_number : '';
  const banners = {
    reading: () => {
      const a = data.today.assignment || {};
      const done = !!data.today.completed;
      return `<div class="card hero rise">
        <div class="between" style="align-items:flex-start">
          <div style="min-width:0">
            <span class="pill onhero">Reading Day ${dayNum()}</span>
            <h1 style="margin:var(--s-3) 0 var(--s-1)">${FH.esc(a.summary || '')}</h1>
            <div class="small muted">${a.chapter_count || 0} chapters · about ${a.est_minutes || 0} min</div>
          </div>
          ${done ? `<span class="pill onhero">${FH.ICONS.check} Done</span>` : ''}
        </div>
        ${done ? `<div class="small muted" style="margin-top:var(--s-3)">Points awarded. Well done today.</div>` : ''}
      </div>`;
    },
    tuesday_prayer: () => `<div class="card calm rise">
      <span class="pill teal">Tuesday</span>
      <h1 style="margin:var(--s-3) 0 var(--s-1)">Fasting &amp; Prayer</h1>
      <div class="small muted">No reading today — see you on the next reading day.</div>
    </div>`,
    friday_prayer_study: () => `<div class="card calm rise">
      <span class="pill teal">Friday</span>
      <h1 style="margin:var(--s-3) 0 var(--s-1)">Fasting &amp; Prayer + Bible Study</h1>
      <div class="small muted">No reading today — see you on the next reading day.</div>
    </div>`,
    rest: () => `<div class="card calm rise">
      <span class="pill gray">Rest day</span>
      <h1 style="margin:var(--s-3) 0 var(--s-1)">No reading scheduled today</h1>
      <div class="small muted">Rest well — the next reading day is below.</div>
    </div>`,
  };
  const bannerFor = banners[data.status];
  $('today-banner').innerHTML = bannerFor ? bannerFor() : '';

  // ── Primary CTA ──────────────────────────────────────────────────────────
  const ctaDay = data.is_reading_day && data.today
    ? data.today.day_number
    : (data.next_reading_day?.day_number || 1);
  const ctaLabel = data.is_reading_day && data.today && !data.today.completed
    ? 'Continue Reading'
    : (data.is_reading_day ? 'Review Today’s Reading' : 'Read Next Assignment');
  $('cta').innerHTML =
    `<a class="btn rise rise-1" href="/read.html?day=${ctaDay}">${FH.esc(ctaLabel)} ${FH.ICONS.arrow}</a>`;

  // ── Programme progress (ring + bar) ──────────────────────────────────────
  const daysDone = Number(s.days_completed) || 0;
  const pct = Math.min(100, Math.round((daysDone / 50) * 100));
  $('progress-card').innerHTML = `<div class="card rise rise-2">
    <div class="row" style="gap:var(--s-5)">
      ${FH.ring(pct, pct + '%', 'Programme', 'sm')}
      <div style="flex:1;min-width:0">
        <div class="between">
          <h3 style="margin:0">Programme progress</h3>
          ${FH.streakChip(s.streak_current)}
        </div>
        <div class="small muted" style="margin:var(--s-1) 0 var(--s-2)">
          ${daysDone} of 50 reading days · ${Number(s.chapters) || 0} of 260 chapters
        </div>
        <div class="bar" id="home-bar"><i></i></div>
      </div>
    </div>
  </div>`;
  FH.animateRing($('progress-card').querySelector('.ring'), pct);
  FH.animateBar($('home-bar')?.querySelector('i'), pct);

  // ── Stats grid ───────────────────────────────────────────────────────────
  $('stats').innerHTML = `<div class="grid3 rise rise-3">
    <div class="stat brand"><div class="v">${Number(s.chapters) || 0}</div><div class="l">Chapters</div></div>
    <div class="stat ok"><div class="v">${daysDone}</div><div class="l">Days done</div></div>
    <div class="stat streak"><div class="v">${Number(s.streak_current) || 0}</div><div class="l">Streak</div></div>
    <div class="stat"><div class="v">${FH.fmtTime(s.reading_seconds)}</div><div class="l">Reading</div></div>
    <div class="stat"><div class="v">${Number(s.notes_total) || 0}</div><div class="l">Notes</div></div>
    <div class="stat"><div class="v">${Number(s.questions) || 0}</div><div class="l">Questions</div></div>
  </div>`;

  // ── Next reading day ─────────────────────────────────────────────────────
  if (data.next_reading_day) {
    const n = data.next_reading_day;
    $('next-day').innerHTML = `<a class="dayrow today rise rise-4" href="/read.html?day=${n.day_number}">
      <div class="daynum">${n.day_number}</div>
      <div class="meta">
        <div class="t">${FH.esc(n.assignment?.summary || '')}</div>
        <div class="s">Next reading day · ${FH.esc(FH.fmtDate(n.date))} · ${n.assignment?.chapter_count || 0} ch</div>
      </div>
      <div class="tail">${FH.ICONS.arrow}</div>
    </a>`;
  }

  // ── Community: WhatsApp join + share ─────────────────────────────────────
  const cfg = await FH.api('/api/config');
  const groupUrl = cfg.data?.whatsapp_group_url || '';
  const shareText = encodeURIComponent(
    'Join me in ForgeHouse 50 — read the whole New Testament in 50 reading days! ' + location.origin);
  $('whatsapp').innerHTML = `<div class="card flat">
    <h3 style="margin:0 0 var(--s-1)">Read together</h3>
    <p class="small muted">Encourage the house — share the programme or join the group chat.</p>
    <div class="stack" style="margin-top:var(--s-4)">
      ${groupUrl ? `<a class="btn soft" href="${FH.esc(groupUrl)}" target="_blank" rel="noopener">
        ${FH.ICONS.chat} Join ForgeHouse WhatsApp Group</a>` : ''}
      <a class="btn ghost" href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener">
        ${FH.ICONS.share} Share the programme</a>
    </div>
  </div>`;
})();
