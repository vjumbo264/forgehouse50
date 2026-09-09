/* ============================================================================
   ForgeHouse 50 — Admin dashboard (ui_overhaul_v1, task-u10)
   ----------------------------------------------------------------------------
   Extracted from the pre-overhaul inline script in public/admin.html and moved
   onto the v2 design system. Every API call is UNCHANGED in endpoint, method
   and body shape:

     GET  /api/auth/me                    (via FH.requireAuth)
     GET  /api/admin/stats
     GET  /api/admin/participants
     POST /api/admin/adjust   { action:'points',     user_id, points, reason }
     POST /api/admin/adjust   { action:'completion', user_id, day_number, completed }
     POST /api/admin/manage   { action:'badge',      user_id, badge_id, grant }
     POST /api/admin/manage   { action:'assignment', day_number, book,
                                chapter_start, chapter_end }

   Behaviour preserved: admin-role gating with a clear refusal for non-admins,
   every original control present (points adjust + reason, completion
   correction both ways, badge grant/revoke, day-assignment replacement), and
   the deliberate absence of any note *content* — the roster shows aggregate
   counts only, exactly as the admin queries return them.

   Changed only in presentation: KPI tiles, .data-row participant records with
   a .disclosure action panel, a client-side roster filter, confirmation
   dialogs on the destructive corrections, toasts + inline errors instead of a
   full location.reload() after every action, and loading states on buttons.
   ========================================================================== */
(() => {
  'use strict';

  // Badge catalogue — mirrors the ten rule ids in functions/lib/points.mjs and
  // the ten <option>s the pre-overhaul page hardcoded. Ids must match exactly.
  const BADGES = [
    ['streak-7', '7-Day Streak'],
    ['streak-14', '14-Day Streak'],
    ['streak-25', '25-Day Streak'],
    ['finisher-50', '50-Day Finisher'],
    ['chapters-100', '100 Chapters'],
    ['chapters-200', '200 Chapters'],
    ['chapters-260', '260 Chapters'],
    ['audio-50', '50 Audio Sessions'],
    ['observations-25', '25 Observations'],
    ['questions-25', '25 Questions'],
  ];

  const $ = (id) => document.getElementById(id);
  const gate = $('gate');
  const main = $('admin-main');
  const statsEl = $('stats');
  const rosterEl = $('participants');
  const countEl = $('participant-count');
  const searchEl = $('participant-search');

  let participants = [];   // last fetched roster
  let openUid = null;      // which action panel is expanded, so a re-render keeps it

  /* ---------------------------------------------------------------- boot -- */
  (async () => {
    const me = await FH.requireAuth();
    if (!me) return;                                  // FH.requireAuth redirects

    $('top').innerHTML = FH.topbar('Admin Dashboard',
      `<a class="iconbtn" href="/profile.html" aria-label="Back to profile">${FH.ICONS.profile}</a>`);
    FH.nav('profile');

    if (me.role !== 'admin') {
      gate.innerHTML = `<div class="card accented rise" style="border-left-color:var(--danger)">
        <div class="row" style="gap:var(--s-3);align-items:flex-start">
          <span class="pill danger">Restricted</span>
        </div>
        <h2 style="margin:var(--s-3) 0 var(--s-2)">Admin access required</h2>
        <p class="small muted" style="margin:0">
          This dashboard is limited to programme administrators. If you believe you
          should have access, ask an existing admin to grant it.</p>
        <a class="btn soft" href="/" style="margin-top:var(--s-4)">Back to today's reading</a>
      </div>`;
      return;
    }

    main.hidden = false;
    statsEl.innerHTML = FH.skeletonCard(2);
    rosterEl.innerHTML = FH.skeletonCard(3);

    await Promise.all([loadStats(), loadParticipants()]);
    wireAssignmentEditor();
  })();

  /* --------------------------------------------------------------- stats -- */
  async function loadStats() {
    const { data: s } = await FH.api('/api/admin/stats');
    if (!s) {
      statsEl.innerHTML = FH.empty(FH.ICONS.shield, 'Statistics unavailable',
        'The stats endpoint did not return data. Try reloading.');
      return;
    }

    // Same six figures the pre-overhaul page showed, same field names.
    const kpis = [
      ['Participants', s.total_participants, 'brand'],
      ['Active', s.active_participants, ''],
      ['Read today', s.completed_today, ''],
      ['Avg completion', s.average_completion_percent + '%', 'brand'],
      ['Chapters read', s.total_chapters_completed, ''],
      ['Behind schedule', s.users_behind_schedule, ''],
    ];
    statsEl.innerHTML = `<div class="kpi-grid">${kpis.map(([label, value, cls]) =>
      `<div class="kpi ${cls}"><div class="kv">${FH.esc(String(value ?? '—'))}</div>
       <div class="kl">${FH.esc(label)}</div></div>`).join('')}</div>`;
  }

  /* -------------------------------------------------------- participants -- */
  async function loadParticipants() {
    const { data: p } = await FH.api('/api/admin/participants');
    participants = p?.participants || [];
    countEl.textContent = participants.length
      ? participants.length + (participants.length === 1 ? ' member' : ' members')
      : 'none yet';
    renderRoster();
  }

  function renderRoster() {
    const q = (searchEl.value || '').trim().toLowerCase();
    const rows = q
      ? participants.filter(u =>
          String(u.name || '').toLowerCase().includes(q) ||
          String(u.email || '').toLowerCase().includes(q))
      : participants;

    if (!participants.length) {
      rosterEl.innerHTML = FH.empty(FH.ICONS.profile, 'No participants yet',
        'Members appear here as soon as they verify their email.');
      return;
    }
    if (!rows.length) {
      rosterEl.innerHTML = FH.empty(FH.ICONS.search, 'No match',
        'No participant matches that name or email.');
      return;
    }

    rosterEl.innerHTML = rows.map(u => participantRow(u)).join('');
  }

  function participantRow(u) {
    const uid = FH.esc(String(u.id));
    const pct = Math.round(((Number(u.days_completed) || 0) / 50) * 100);
    const isOpen = openUid === String(u.id);

    return `<article class="data-row" data-row="${uid}">
      <div class="dr-head">
        ${FH.avatarHtml(u.avatar_id, u.name, 40)}
        <div style="flex:1;min-width:0">
          <div style="font-weight:750;letter-spacing:-.01em;overflow:hidden;
                      text-overflow:ellipsis;white-space:nowrap">
            ${FH.esc(u.name || 'Member')}</div>
          <div class="tiny muted" style="overflow:hidden;text-overflow:ellipsis;
                      white-space:nowrap">${FH.esc(u.email)}</div>
        </div>
        <span class="pill solid">${FH.esc(String(u.points ?? 0))} pts</span>
      </div>

      <div class="dr-meta">
        <span><b>${FH.esc(String(u.days_completed ?? 0))}</b>/50 days</span>
        <span><b>${FH.esc(String(u.chapters ?? 0))}</b> chapters</span>
        <span><b>${FH.esc(FH.fmtTime(u.reading_seconds))}</b> reading</span>
        <span><b>${FH.esc(String(u.notes_count ?? 0))}</b> notes</span>
      </div>

      <div class="bar thin" style="margin-top:var(--s-3)"
           role="img" aria-label="${FH.esc(u.name || 'Member')} has completed ${pct}% of the programme">
        <i style="width:${pct}%"></i></div>

      <details class="disclosure" data-uid="${uid}"${isOpen ? ' open' : ''}>
        <summary>Admin actions</summary>
        <div class="panel">

          <div>
            <label for="pts-${uid}">Adjust points</label>
            <div class="control-row">
              <input type="number" id="pts-${uid}" class="input-sm" placeholder="+/− pts" style="flex:0 0 96px">
              <input type="text" id="rsn-${uid}" class="input-sm" placeholder="Reason (required)">
              <button class="btn ghost small" data-act="points" data-uid="${uid}">Apply</button>
            </div>
          </div>

          <div>
            <label for="day-${uid}">Correct a reading day</label>
            <div class="control-row">
              <input type="number" min="1" max="50" id="day-${uid}" class="input-sm"
                     placeholder="Day" style="flex:0 0 90px">
              <button class="btn ghost small" data-act="complete" data-uid="${uid}">Mark complete</button>
              <button class="btn ghost small" data-act="uncomplete" data-uid="${uid}">Mark incomplete</button>
            </div>
          </div>

          <div>
            <label for="bdg-${uid}">Badge</label>
            <div class="control-row">
              <select id="bdg-${uid}" class="input-sm">
                ${BADGES.map(([id, label]) =>
                  `<option value="${FH.esc(id)}">${FH.esc(label)}</option>`).join('')}
              </select>
              <button class="btn ghost small" data-act="badge-grant" data-uid="${uid}">Grant</button>
              <button class="btn ghost small" data-act="badge-revoke" data-uid="${uid}">Revoke</button>
            </div>
          </div>

          <div class="error" id="err-${uid}" role="alert"></div>
        </div>
      </details>
    </article>`;
  }

  /* ------------------------------------------------------------ handlers -- */
  searchEl.addEventListener('input', renderRoster);

  // Remember which panel is open so a post-action re-render doesn't collapse it.
  rosterEl.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.dataset.uid) return;
    if (d.open) {
      openUid = d.dataset.uid;
      rosterEl.querySelectorAll('details.disclosure[open]').forEach(other => {
        if (other !== d) other.open = false;
      });
    } else if (openUid === d.dataset.uid) {
      openUid = null;
    }
  }, true);

  // Delegated so the roster can re-render freely without rebinding listeners.
  rosterEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;

    const uid = btn.dataset.uid;
    const act = btn.dataset.act;
    const errEl = $('err-' + uid);
    const who = participants.find(u => String(u.id) === String(uid));
    const name = who?.name || 'this member';
    if (errEl) errEl.textContent = '';

    let body;

    if (act === 'points') {
      const points = parseInt($('pts-' + uid).value || '0', 10);
      const reason = $('rsn-' + uid).value;
      if (!points) { if (errEl) errEl.textContent = 'Enter a non-zero points adjustment.'; return; }
      if (!reason.trim()) { if (errEl) errEl.textContent = 'A reason is required for a points adjustment.'; return; }
      const okGo = await FH.confirmDialog({
        title: (points > 0 ? 'Award ' : 'Deduct ') + Math.abs(points) + ' points?',
        body: `${name} — reason: "${reason.trim()}". This is recorded against their points history.`,
        confirmLabel: points > 0 ? 'Award points' : 'Deduct points',
        danger: points < 0,
      });
      if (!okGo) return;
      // Same endpoint + body as the pre-overhaul page.
      body = { endpoint: '/api/admin/adjust', payload: { action: 'points', user_id: uid, points, reason } };

    } else if (act === 'complete' || act === 'uncomplete') {
      const day_number = parseInt($('day-' + uid).value || '0', 10);
      if (!day_number || day_number < 1 || day_number > 50) {
        if (errEl) errEl.textContent = 'Enter a reading day between 1 and 50.';
        return;
      }
      const completing = act === 'complete';
      const okGo = await FH.confirmDialog({
        title: (completing ? 'Mark day ' : 'Un-mark day ') + day_number + '?',
        body: completing
          ? `Day ${day_number} will be recorded as completed for ${name}.`
          : `Day ${day_number} will be recorded as NOT completed for ${name}. Points already awarded are handled by the points logic, not by this correction.`,
        confirmLabel: completing ? 'Mark complete' : 'Mark incomplete',
        danger: !completing,
      });
      if (!okGo) return;
      body = { endpoint: '/api/admin/adjust',
               payload: { action: 'completion', user_id: uid, day_number, completed: completing } };

    } else {
      const badge_id = $('bdg-' + uid).value;
      const granting = act === 'badge-grant';
      const label = (BADGES.find(b => b[0] === badge_id) || [, badge_id])[1];
      const okGo = await FH.confirmDialog({
        title: (granting ? 'Grant ' : 'Revoke ') + '"' + label + '"?',
        body: `${granting ? 'Grants' : 'Revokes'} the ${label} badge for ${name}.`,
        confirmLabel: granting ? 'Grant badge' : 'Revoke badge',
        danger: !granting,
      });
      if (!okGo) return;
      body = { endpoint: '/api/admin/manage',
               payload: { action: 'badge', user_id: uid, badge_id, grant: granting } };
    }

    FH.setLoading(btn, true);
    const res = await FH.api(body.endpoint, { method: 'POST', body: body.payload });
    FH.setLoading(btn, false);

    if (!res.ok) {
      if (errEl) errEl.textContent = res.data?.error || 'Action failed';
      FH.toast('Action failed', 'bad');
      return;
    }

    // The pre-overhaul page did a full location.reload() here. Re-fetching the
    // two admin GETs has the same effect on displayed data without throwing the
    // admin back to the top of the page or losing their filter.
    FH.toast('Saved', 'ok');
    if (act === 'badge-grant') FH.celebrate(btn);
    await Promise.all([loadStats(), loadParticipants()]);
  });

  /* -------------------------------------------------- assignment editor -- */
  function wireAssignmentEditor() {
    const saveBtn = $('as-save');
    const errEl = $('as-err');
    const okEl = $('as-ok');

    saveBtn.addEventListener('click', async () => {
      errEl.textContent = '';
      okEl.textContent = '';

      const day_number = parseInt($('as-day').value || '0', 10);
      const book = $('as-book').value.trim();
      const chapter_start = parseInt($('as-cs').value || '0', 10);
      const chapter_end = parseInt($('as-ce').value || '0', 10);

      // Client-side guards only; the API remains the authority and its error
      // text is still surfaced verbatim below.
      if (!day_number || day_number < 1 || day_number > 50) {
        errEl.textContent = 'Enter a reading day between 1 and 50.'; return;
      }
      if (!book) { errEl.textContent = 'Enter the book name, e.g. Matthew.'; return; }
      if (!chapter_start || !chapter_end || chapter_end < chapter_start) {
        errEl.textContent = 'Enter a valid chapter range (From must not exceed To).'; return;
      }

      const okGo = await FH.confirmDialog({
        title: 'Replace day ' + day_number + '?',
        body: `Day ${day_number} becomes ${book} ${chapter_start}–${chapter_end} for every participant. `
            + 'The previous assignment for that day is overwritten.',
        confirmLabel: 'Replace assignment',
        danger: true,
      });
      if (!okGo) return;

      FH.setLoading(saveBtn, true);
      // Same endpoint + body as the pre-overhaul page.
      const res = await FH.api('/api/admin/manage', {
        method: 'POST',
        body: { action: 'assignment', day_number, book, chapter_start, chapter_end },
      });
      FH.setLoading(saveBtn, false);

      if (!res.ok) {
        errEl.textContent = res.data?.error || 'Save failed';
        FH.toast('Save failed', 'bad');
        return;
      }

      okEl.textContent = `Day ${day_number} is now ${book} ${chapter_start}–${chapter_end}.`;
      FH.toast('Assignment replaced', 'ok');
      FH.celebrate(saveBtn);
    });
  }
})();
