/* ============================================================================
   ForgeHouse 50 — Reading page (ui_overhaul_v1)
   ----------------------------------------------------------------------------
   Ported from the pre-overhaul inline script in public/read.html (commit
   3089b94) onto the v2 design system. EVERY API call is byte-identical to the
   original — same paths, methods, query params and body keys:

     GET  /api/auth/me                     (via FH.requireAuth)
     GET  /api/read/day?n=
     GET  /api/translations
     GET  /api/read/passage?book=&chapter_start=&chapter_end=&translation=
     GET  /api/read/highlights?book=&chapter=
     GET  /api/read/audio_availability?book=&chapter_start=&chapter_end=&translation=
     POST /api/read/audio            { day_number }
     POST /api/read/highlight        { book, chapter, verse_start, verse_end, color }
     DELETE /api/read/highlight      { id }
     POST /api/read/bookmark         { book, chapter, day_number }
     POST /api/read/time             { day_number, seconds }
     POST /api/read/complete         { day_number }

   FOOTNOTE FIX (in scope for task-u05): a verse with N footnotes now renders
   exactly ONE tappable marker (with a small count badge when N > 1). Tapping
   it opens a single inline panel listing all of that verse's footnotes
   together. Only one panel is open anywhere in the chapter at a time.
   ========================================================================== */
(async () => {
  'use strict';

  const me = await FH.requireAuth();
  if (!me) return;
  document.getElementById('top').innerHTML = FH.topbar('Daily Reading');

  const params = new URLSearchParams(location.search);
  const dayN = parseInt(params.get('day') || '1', 10);

  const passageEl = document.getElementById('passage');
  const attribEl = document.getElementById('attrib');
  const sel = document.getElementById('translation');

  // ── Load day + translations (unchanged shapes) ─────────────────────────────
  const [{ data: day }, { data: tr }] = await Promise.all([
    FH.api('/api/read/day?n=' + dayN),
    FH.api('/api/translations'),
  ]);
  if (!day) {
    passageEl.innerHTML = FH.empty(FH.ICONS.book, 'Could not load this reading day',
      'Check your connection and try again.');
    return;
  }

  const assignText = day.assignments.map(a =>
    a.chapter_start === a.chapter_end
      ? `${a.book} ${a.chapter_start}`
      : `${a.book} ${a.chapter_start}–${a.chapter_end}`).join(' · ');

  document.getElementById('day-head').innerHTML = `
    <div class="day-hero">
      <span class="pill">Reading Day ${day.day_number}</span>
      <h1>${FH.esc(assignText)}</h1>
      <div class="day-hero-meta">
        <span class="mi">${FH.ICONS.clock}${day.est_minutes} min</span>
        <span class="mi">${FH.ICONS.book}${day.chapter_count} chapters</span>
        <span class="mi">${FH.esc(FH.fmtDate(day.date))}</span>
      </div>
    </div>`;

  // ── Translation selector ───────────────────────────────────────────────────
  const trList = tr?.translations || [];
  sel.innerHTML = trList.map(t =>
    `<option value="${FH.esc(t.id)}">${FH.esc(t.name)}</option>`).join('');

  // Prefer a sensible live default (CEV reads naturally aloud and carries
  // intros + footnotes), then any live version. Remember the user's last pick.
  const savedTr = localStorage.getItem('fh50_translation');
  const ids = trList.map(t => t.id);
  const defaultTr = (savedTr && ids.includes(savedTr)) ? savedTr
    : (ids.find(i => i === 'versewell-cev') || ids.find(i => i.startsWith('versewell-')) || ids[0]);
  if (defaultTr) sel.value = defaultTr;

  if (!trList.length || tr?.versewell_live === false) {
    passageEl.innerHTML = FH.empty(FH.ICONS.book, 'Scripture is temporarily unavailable',
      'Please try again shortly.');
    attribEl.textContent = '';
    sel.disabled = true;
    return;
  }

  let currentParts = [];
  let highlights = [];

  // ── Highlights ─────────────────────────────────────────────────────────────
  async function loadHighlights() {
    const first = day.assignments[0];
    const { data } = await FH.api(
      `/api/read/highlights?book=${encodeURIComponent(first.book)}&chapter=${first.chapter_start}`);
    highlights = data?.highlights || [];
  }

  // ── Passage rendering ──────────────────────────────────────────────────────
  function skeleton() {
    return '<div class="skeleton line"></div><div class="skeleton line w60"></div>'
      + '<div class="skeleton line"></div><div class="skeleton line w40"></div>'
      + '<div class="skeleton line w60"></div>';
  }

  async function loadPassage() {
    const translation = sel.value;
    localStorage.setItem('fh50_translation', translation);
    closeFootnote();
    passageEl.innerHTML = skeleton();
    const parts = [];
    let failed = false;
    for (const a of day.assignments) {
      const { ok, data } = await FH.api(
        `/api/read/passage?book=${encodeURIComponent(a.book)}&chapter_start=${a.chapter_start}`
        + `&chapter_end=${a.chapter_end}&translation=${encodeURIComponent(translation)}`);
      // Never swallow a failure silently: if VerseWell is unreachable or a
      // chapter is missing, show a clear unavailable state (no mock fallback).
      if (!ok || !data || !Array.isArray(data.verses) || data.verses.length === 0) { failed = true; break; }
      parts.push(data);
    }
    if (failed) {
      currentParts = [];
      passageEl.innerHTML = FH.empty(FH.ICONS.book,
        'Scripture is temporarily unavailable for this passage', 'Please try again shortly.');
      attribEl.textContent = '';
      loadAudio();
      return;
    }
    currentParts = parts;
    renderPassage(parts);
    loadAudio(); // re-check audio for the newly selected translation
  }

  function renderIntroBlock(intro) {
    // Visually separated, always-expanded block — never merged into verse text.
    return `<div class="intro-block"><div class="intro-label">Introduction</div>`
      + `<p>${FH.esc(intro.text)}</p></div>`;
  }

  // Footnotes are stashed on the verse element via a registry rather than in
  // data attributes, so multi-footnote verses need no encoding tricks.
  let fnStore = new Map(); // key "ch:v" → [{marker, text}]

  function renderPassage(parts) {
    fnStore = new Map();
    passageEl.innerHTML = parts.map(p => {
      let curCh = null;
      const intros = Array.isArray(p.intros) ? p.intros : [];
      const introForCh = (ch) => intros.filter(i => i.chapter === ch);
      const bookName = p.reference.replace(/\s+\d.*$/, '');
      return p.verses.map(v => {
        const hl = highlights.find(h =>
          h.chapter === v.chapter && v.verse >= h.verse_start && v.verse <= h.verse_end);
        let head = '';
        if (v.chapter !== curCh) {
          head = `<h3 class="ch-head">${FH.esc(bookName)} ${v.chapter}</h3>`;
          for (const intro of introForCh(v.chapter)) head += renderIntroBlock(intro);
          curCh = v.chapter;
        }

        // ── ONE marker per verse, whatever the footnote count ──────────────
        const notes = Array.isArray(v.footnotes) ? v.footnotes.filter(f => f && f.text) : [];
        let fn = '';
        if (notes.length) {
          const key = `${v.chapter}:${v.verse}`;
          fnStore.set(key, notes);
          const count = notes.length > 1 ? `<span class="fn-count">${notes.length}</span>` : '';
          fn = `<button type="button" class="fn-marker" data-fnkey="${key}"`
            + ` aria-expanded="false"`
            + ` aria-label="${notes.length} footnote${notes.length > 1 ? 's' : ''} for verse ${v.verse}">`
            + `<span aria-hidden="true">*</span>${count}</button>`;
        }

        return `${head}<p class="v ${hl ? 'hl-' + hl.color : ''}" data-ch="${v.chapter}"`
          + ` data-v="${v.verse}"><span class="vn">${v.verse}</span>${FH.esc(v.text)}${fn}</p>`;
      }).join('');
    }).join('');
    attribEl.textContent = parts[0]?.attribution || '';
  }

  // ── Footnote panel: exactly one open at a time ─────────────────────────────
  let openMarker = null;
  let openPanel = null;

  function closeFootnote() {
    if (openPanel) openPanel.remove();
    if (openMarker) openMarker.setAttribute('aria-expanded', 'false');
    openPanel = null;
    openMarker = null;
  }

  function openFootnote(marker) {
    const verse = marker.closest('p.v');
    const notes = fnStore.get(marker.dataset.fnkey) || [];
    if (!verse || !notes.length) return;
    const panel = document.createElement('aside');
    panel.className = 'fn-panel' + (notes.length === 1 ? ' single' : '');
    panel.setAttribute('role', 'note');
    const items = notes.map(f =>
      `<li>${f.marker ? `<span class="fn-mk">${FH.esc(f.marker)}</span>` : ''}`
      + `${FH.esc(f.text)}</li>`).join('');
    panel.innerHTML =
      `<div class="fn-head"><span>Footnote${notes.length > 1 ? `s · ${notes.length}` : ''}</span></div>`
      + `<ol>${items}</ol>`;
    verse.after(panel);
    marker.setAttribute('aria-expanded', 'true');
    openPanel = panel;
    openMarker = marker;
  }

  // ── Single delegated click handler for the reader body ─────────────────────
  // Footnote taps and verse-highlight taps previously lived in two separate
  // listeners on the same node; merged here so ordering is explicit.
  passageEl.addEventListener('click', async (e) => {
    const marker = e.target.closest('.fn-marker');
    if (marker) {
      e.stopPropagation();
      const wasOpen = marker === openMarker;
      closeFootnote();            // guarantees only one panel in the chapter
      if (!wasOpen) openFootnote(marker);
      return;
    }
    if (e.target.closest('.fn-panel')) return; // taps inside the panel do nothing

    // Tap a verse to highlight (cycles amber → none) — simple, mobile-friendly
    const p = e.target.closest('p.v');
    if (!p) return;
    const ch = parseInt(p.dataset.ch, 10), v = parseInt(p.dataset.v, 10);
    const book = day.assignments[0].book;
    const existing = highlights.find(h =>
      h.chapter === ch && v >= h.verse_start && v <= h.verse_end);
    if (existing) {
      await FH.api('/api/read/highlight', { method: 'DELETE', body: { id: existing.id } });
      highlights = highlights.filter(h => h.id !== existing.id);
      p.className = 'v';
    } else {
      await FH.api('/api/read/highlight', {
        method: 'POST',
        body: { book, chapter: ch, verse_start: v, verse_end: v, color: 'amber' },
      });
      highlights.push({ chapter: ch, verse_start: v, verse_end: v, color: 'amber' });
      p.className = 'v hl-amber';
    }
  });

  // ── Audio (live VerseWell per-chapter files; disabled stub otherwise) ──────
  const audioEl = new Audio();
  let audioQueue = [];   // [{chapter, url}]
  let audioIdx = -1;
  const playBtn = document.getElementById('audio-play');
  const barEl = document.getElementById('audio-bar');
  const noteEl = document.getElementById('audio-note');
  const doneBtn = document.getElementById('audio-done');
  const chapRow = document.getElementById('audio-chapters');
  const audioLabel = document.getElementById('audio-label');
  if (audioLabel) audioLabel.innerHTML = FH.ICONS.sound + 'Audio';

  const PLAY = '<span aria-hidden="true">▶</span>';
  const PAUSE = '<span aria-hidden="true">❚❚</span>';

  function setAudioState() {
    if (audioQueue.length > 0) {
      playBtn.disabled = false;
      playBtn.setAttribute('aria-label', 'Play narration');
      noteEl.textContent =
        `${audioQueue.length} chapter${audioQueue.length > 1 ? 's' : ''} narrated (VerseWell)`;
      chapRow.style.display = audioQueue.length > 1 ? 'flex' : 'none';
      chapRow.innerHTML = audioQueue.map((a, i) =>
        `<button type="button" class="chip" data-ai="${i}">Ch ${a.chapter}</button>`).join('');
    } else {
      playBtn.disabled = true;
      playBtn.innerHTML = PLAY;
      noteEl.textContent = 'Not yet available — narration is being generated by VerseWell';
      chapRow.style.display = 'none';
    }
  }

  async function loadAudio() {
    // One request-time check per passage load (server caches short-TTL); no polling.
    const translation = sel.value;
    audioQueue = [];
    audioIdx = -1;
    audioEl.pause();
    const first = day.assignments[0];
    const { data } = await FH.api(
      `/api/read/audio_availability?book=${encodeURIComponent(first.book)}`
      + `&chapter_start=${first.chapter_start}&chapter_end=${first.chapter_end}`
      + `&translation=${encodeURIComponent(translation)}`);
    if (data && Array.isArray(data.available)) audioQueue = data.available;
    setAudioState();
  }

  function playIdx(i) {
    if (i < 0 || i >= audioQueue.length) return;
    audioIdx = i;
    audioEl.src = audioQueue[i].url;
    audioEl.play().catch(() => {});
    playBtn.innerHTML = PAUSE;
    playBtn.setAttribute('aria-label', 'Pause narration');
    chapRow.querySelectorAll('button').forEach((b, j) =>
      b.classList.toggle('is-active', j === i));
  }

  playBtn.onclick = () => {
    if (!audioQueue.length) return;
    if (audioEl.paused) {
      if (audioIdx < 0) playIdx(0);
      else {
        audioEl.play().catch(() => {});
        playBtn.innerHTML = PAUSE;
        playBtn.setAttribute('aria-label', 'Pause narration');
      }
    } else {
      audioEl.pause();
      playBtn.innerHTML = PLAY;
      playBtn.setAttribute('aria-label', 'Play narration');
    }
  };
  chapRow.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-ai]');
    if (b) playIdx(parseInt(b.dataset.ai, 10));
  });
  audioEl.addEventListener('timeupdate', () => {
    if (audioEl.duration) barEl.style.width = (100 * audioEl.currentTime / audioEl.duration) + '%';
  });
  audioEl.addEventListener('ended', () => {
    if (audioIdx + 1 < audioQueue.length) playIdx(audioIdx + 1);
    else {
      playBtn.innerHTML = PLAY;
      playBtn.setAttribute('aria-label', 'Play narration');
      barEl.style.width = '100%';
      doneBtn.style.display = '';
    }
  });
  doneBtn.onclick = async () => {
    FH.setLoading(doneBtn, true);
    await FH.api('/api/read/audio', { method: 'POST', body: { day_number: dayN } });
    FH.setLoading(doneBtn, false, 'Audio complete');
    doneBtn.classList.add('is-done');
    doneBtn.disabled = true;
    FH.toast('Audio marked complete', 'ok');
  };

  await loadHighlights();
  await loadPassage();
  sel.addEventListener('change', loadPassage);

  // ── Font size ──────────────────────────────────────────────────────────────
  const sizes = ['fs-small', 'fs-medium', 'fs-large', 'fs-xlarge'];
  let fsIdx = +(localStorage.getItem('fh50_fs') ?? 1);
  if (!(fsIdx >= 0 && fsIdx < sizes.length)) fsIdx = 1;
  function applyFs() {
    passageEl.classList.remove(...sizes);
    passageEl.classList.add(sizes[fsIdx]);
    localStorage.setItem('fh50_fs', fsIdx);
    document.getElementById('fs-dec').disabled = fsIdx === 0;
    document.getElementById('fs-inc').disabled = fsIdx === sizes.length - 1;
  }
  applyFs();
  document.getElementById('fs-dec').onclick = () => { fsIdx = Math.max(0, fsIdx - 1); applyFs(); };
  document.getElementById('fs-inc').onclick = () => { fsIdx = Math.min(sizes.length - 1, fsIdx + 1); applyFs(); };

  // ── Bookmark (first verse of passage) ──────────────────────────────────────
  const bmBtn = document.getElementById('bookmark-btn');
  bmBtn.innerHTML = FH.ICONS.bookmark;
  bmBtn.onclick = async () => {
    const a = day.assignments[0];
    FH.setLoading(bmBtn, true);
    await FH.api('/api/read/bookmark', {
      method: 'POST', body: { book: a.book, chapter: a.chapter_start, day_number: dayN },
    });
    FH.setLoading(bmBtn, false, FH.ICONS.bookmark);
    bmBtn.classList.add('is-on');
    FH.toast('Passage bookmarked', 'ok');
  };

  // ── Reading-time heartbeat (30s) ───────────────────────────────────────────
  setInterval(() => {
    if (document.visibilityState === 'visible')
      FH.api('/api/read/time', { method: 'POST', body: { day_number: dayN, seconds: 30 } });
  }, 30000);

  // ── Mark complete ──────────────────────────────────────────────────────────
  const markArea = document.getElementById('mark-area');

  function renderMarkArea() {
    const done = !!day.progress.completed;
    markArea.innerHTML = done
      ? `<div class="done-card">
           <div class="done-ico">${FH.ICONS.check}</div>
           <div class="done-t">Reading complete</div>
           <div class="done-s">Points awarded. Well done.</div>
           <a class="btn soft" href="/notes.html?day=${dayN}&book=${encodeURIComponent(day.assignments[0].book)}&chapter=${day.assignments[0].chapter_start}">Write a note ${FH.ICONS.arrow}</a>
         </div>`
      : `<button class="btn big" id="mark-btn">${FH.ICONS.check}Mark Complete · Day ${dayN}</button>`;

    if (!done) {
      document.getElementById('mark-btn').onclick = async (ev) => {
        const btn = ev.currentTarget;
        FH.setLoading(btn, true);
        const { ok } = await FH.api('/api/read/complete', {
          method: 'POST', body: { day_number: dayN },
        });
        if (ok) {
          day.progress.completed = 1;
          FH.celebrate(btn);
          renderMarkArea();
          FH.toast('Day ' + dayN + ' complete — well done.', 'ok');
        } else {
          FH.setLoading(btn, false);
          FH.toast('Could not mark complete. Try again.', 'bad');
        }
      };
    }
    markArea.appendChild(navRow());
  }

  // ── Prev / next day navigation ─────────────────────────────────────────────
  function navRow() {
    const row = document.createElement('div');
    row.className = 'daynav';
    row.innerHTML =
      `${dayN > 1 ? `<a class="btn ghost small" href="/read.html?day=${dayN - 1}">← Day ${dayN - 1}</a>` : '<span></span>'}`
      + `${dayN < 50 ? `<a class="btn ghost small" href="/read.html?day=${dayN + 1}">Day ${dayN + 1} →</a>` : '<span></span>'}`;
    return row;
  }

  renderMarkArea();
})();
