/* ============================================================================
   ForgeHouse 50 — Progress page (ui_overhaul_v1)
   ----------------------------------------------------------------------------
   Ported from the pre-overhaul inline script in public/progress.html (commit
   3089b94). API surface unchanged:

     GET /api/auth/me   (via FH.requireAuth)
     GET /api/progress

   Every field read from the response is one the old page already read:
   totals.{reading_days_completed, percent_completed, chapters_completed,
   streak_current, streak_longest, reading_seconds_total} and days[].{day_number,
   assignment, date, chapter_count, notes_count, reading_seconds, completed}.
   ========================================================================== */
(async () => {
  'use strict';

  const me = await FH.requireAuth();
  if (!me) return;
  document.getElementById('top').innerHTML = FH.topbar('Your Progress');

  const totalsEl = document.getElementById('totals');
  const daysEl = document.getElementById('days');

  totalsEl.innerHTML = FH.skeletonCard(3);

  const { data } = await FH.api('/api/progress');
  if (!data) {
    totalsEl.innerHTML = FH.empty(FH.ICONS.progress, 'Could not load your progress',
      'Check your connection and try again.');
    return;
  }
  const t = data.totals;
  const pct = Math.min(100, Number(t.percent_completed) || 0);

  // ── Totals: progress ring + supporting stats ──────────────────────────────
  totalsEl.innerHTML = `
    <div class="card">
      <div class="prog-head">
        ${FH.ring(pct, pct + '%', 'Complete')}
        <div class="prog-copy">
          <div class="prog-t">${t.reading_days_completed} of 50 reading days</div>
          <div class="prog-s">${t.chapters_completed} of 260 chapters read</div>
          ${FH.streakChip(t.streak_current)}
        </div>
      </div>
      <div class="bar" id="prog-bar" role="progressbar" aria-valuenow="${pct}"
           aria-valuemin="0" aria-valuemax="100"
           aria-label="Programme completion"><i></i></div>
      <div class="grid3" style="margin-top:var(--s-4)">
        <div class="stat brand"><div class="v">${t.chapters_completed}</div><div class="l">Chapters</div></div>
        <div class="stat streak"><div class="v">${t.streak_current}</div><div class="l">Streak</div></div>
        <div class="stat"><div class="v">${t.streak_longest}</div><div class="l">Best streak</div></div>
      </div>
      <div class="prog-foot">${FH.ICONS.clock}
        <span>Total reading time: <strong>${FH.esc(FH.fmtTime(t.reading_seconds_total))}</strong></span>
      </div>
    </div>`;

  // Animate the ring + bar fill so the progress is felt (no-ops under
  // prefers-reduced-motion — both helpers check it).
  FH.animateRing(totalsEl.querySelector('.ring'), pct);
  FH.animateBar(totalsEl.querySelector('#prog-bar > i'), pct);

  // ── Day 1–50 breakdown ────────────────────────────────────────────────────
  const todayISO = new Date().toISOString().slice(0, 10);
  const doneCount = data.days.filter(d => d.completed).length;
  const notesNote = document.getElementById('days-note');
  if (notesNote) notesNote.textContent = `${doneCount} complete`;

  daysEl.innerHTML = data.days.map(d => {
    const sub = [
      FH.fmtDate(d.date),
      `${d.chapter_count} ch`,
      d.notes_count ? `${d.notes_count} note${d.notes_count > 1 ? 's' : ''}` : '',
      d.reading_seconds ? FH.fmtTime(d.reading_seconds) : '',
    ].filter(Boolean).join(' · ');
    const isToday = d.date === todayISO;
    return `<a class="dayrow ${d.completed ? 'done' : ''} ${isToday && !d.completed ? 'today' : ''}"
       href="/read.html?day=${d.day_number}"
       aria-label="Reading day ${d.day_number}: ${FH.esc(d.assignment)}${d.completed ? ' (complete)' : ''}">
      <div class="daynum">${d.day_number}</div>
      <div class="meta">
        <div class="t">${FH.esc(d.assignment)}</div>
        <div class="s">${FH.esc(sub)}</div>
      </div>
      <div class="tail">${d.completed
        ? `<span class="check" aria-hidden="true">${FH.ICONS.check}</span>`
        : `<span class="muted" aria-hidden="true">${FH.ICONS.arrow}</span>`}</div>
    </a>`;
  }).join('');
})();
