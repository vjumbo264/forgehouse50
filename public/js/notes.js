/* ============================================================================
   ForgeHouse 50 — Notes page (ui_overhaul_v1)
   ----------------------------------------------------------------------------
   Ported from the pre-overhaul inline script in public/notes.html (commit
   3089b94). API surface unchanged:

     GET    /api/notes?q=&type=
     POST   /api/notes    { note_type, book, chapter, verse, day_number, body }
     PUT    /api/notes/:id { body, note_type }
     DELETE /api/notes/:id

   The note-type selector is now an expressive tile grid (.type-grid /
   .type-opt), but the value actually posted still comes from the canonical
   <select id="n-type">, which the tiles keep in sync — so the request body is
   byte-identical to the old form.
   ========================================================================== */
(async () => {
  'use strict';

  const me = await FH.requireAuth();
  if (!me) return;
  document.getElementById('top').innerHTML = FH.topbar('My Notes — private to you');

  const $ = (id) => document.getElementById(id);
  const listEl = $('list');
  const typeSel = $('n-type');

  // ── Note types: label + glyph + accent class ───────────────────────────────
  const TYPES = [
    { v: 'observation',          label: 'Observation', ti: '👁' },
    { v: 'question',             label: 'Question',    ti: '?' },
    { v: 'scripture_connection', label: 'Connection',  ti: '🔗' },
    { v: 'application',          label: 'Application', ti: '✓' },
    { v: 'prayer',               label: 'Prayer',      ti: '🙏' },
  ];
  const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.v, t.label]));

  // ── Prefill from the Reading page hand-off (?day=&book=&chapter=) ──────────
  const params = new URLSearchParams(location.search);
  if (params.get('day')) $('n-day').value = params.get('day');
  if (params.get('book')) $('n-book').value = params.get('book');
  if (params.get('chapter')) $('n-chapter').value = params.get('chapter');

  // ── Type tile grid, kept in sync with the canonical select ────────────────
  const grid = $('n-type-grid');
  grid.innerHTML = TYPES.map((t, i) =>
    `<button type="button" class="type-opt${i === 0 ? ' selected' : ''}" role="radio"`
    + ` aria-checked="${i === 0 ? 'true' : 'false'}" data-v="${t.v}">`
    + `<span class="ti" aria-hidden="true">${t.ti}</span><span>${FH.esc(t.label)}</span></button>`).join('');
  typeSel.value = TYPES[0].v;

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.type-opt');
    if (!b) return;
    grid.querySelectorAll('.type-opt').forEach(x => {
      const on = x === b;
      x.classList.toggle('selected', on);
      x.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    typeSel.value = b.dataset.v;   // the value that gets posted
  });

  // ── List / search / filter ────────────────────────────────────────────────
  let notesCache = [];

  async function load() {
    const q = $('q').value.trim();
    const type = $('f-type').value;
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (type) qs.set('type', type);

    listEl.setAttribute('aria-busy', 'true');
    const { data } = await FH.api('/api/notes?' + qs);
    listEl.removeAttribute('aria-busy');

    const notes = data?.notes || [];
    notesCache = notes;
    $('n-count').textContent = notes.length
      ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : '';

    if (!notes.length) {
      listEl.innerHTML = FH.empty(FH.ICONS.notes,
        q || type ? 'No notes match that search' : 'No notes yet',
        q || type ? 'Try a different word or clear the filter.'
                  : 'Your observations and questions appear here.');
      return;
    }

    listEl.innerHTML = notes.map(n => `
      <article class="note-card t-${FH.esc(n.note_type)}" data-id="${FH.esc(n.id)}">
        <header class="note-foot">
          <span class="pill">${FH.esc(TYPE_LABEL[n.note_type] || String(n.note_type).replace(/_/g, ' '))}</span>
          <span>${FH.esc(n.book)} ${n.chapter}${n.verse ? ':' + n.verse : ''}${n.day_number ? ' · Day ' + n.day_number : ''}</span>
        </header>
        <p class="note-body">${FH.esc(n.body)}</p>
        <footer class="note-foot">
          <span>${FH.esc(new Date(n.updated_at).toLocaleDateString())}</span>
          <span class="note-actions">
            <button type="button" class="iconbtn small edit" aria-label="Edit note">Edit</button>
            <button type="button" class="iconbtn small del" aria-label="Delete note">Delete</button>
          </span>
        </footer>
      </article>`).join('');
  }

  // Delegated actions so re-rendering never leaves stale handlers behind.
  listEl.addEventListener('click', async (e) => {
    const card = e.target.closest('.note-card');
    if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest('.del')) {
      const yes = await FH.confirmDialog({
        title: 'Delete this note?',
        body: 'This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!yes) return;
      await FH.api('/api/notes/' + id, { method: 'DELETE' });
      FH.toast('Note deleted');
      load();
      return;
    }

    if (e.target.closest('.edit')) {
      if (card.querySelector('.note-edit')) return; // already editing
      const bodyEl = card.querySelector('.note-body');
      const old = bodyEl.textContent;
      const wrap = document.createElement('div');
      wrap.className = 'note-edit-wrap';
      wrap.innerHTML = `<textarea class="note-edit" rows="4" aria-label="Edit note">${FH.esc(old)}</textarea>
        <div class="row" style="gap:var(--s-2);margin-top:var(--s-2)">
          <button type="button" class="btn small save-edit">Save</button>
          <button type="button" class="btn ghost small cancel-edit">Cancel</button>
        </div>`;
      bodyEl.replaceWith(wrap);
      wrap.querySelector('.note-edit').focus();

      wrap.querySelector('.cancel-edit').onclick = () => load();
      wrap.querySelector('.save-edit').onclick = async (ev) => {
        const btn = ev.currentTarget;
        FH.setLoading(btn, true);
        // note_type must be preserved on PUT (same contract as before); read it
        // from the cached list instead of re-fetching every note.
        const prev = notesCache.find(x => String(x.id) === String(id));
        const { ok } = await FH.api('/api/notes/' + id, {
          method: 'PUT',
          body: {
            body: wrap.querySelector('.note-edit').value,
            note_type: prev?.note_type || 'observation',
          },
        });
        if (ok) { FH.toast('Note updated', 'ok'); load(); }
        else { FH.setLoading(btn, false); FH.toast('Could not update note', 'bad'); }
      };
    }
  });

  // ── Create ────────────────────────────────────────────────────────────────
  $('n-save').onclick = async (ev) => {
    const btn = ev.currentTarget;
    const err = $('n-err');
    err.textContent = '';
    const body = {
      note_type: typeSel.value,
      book: $('n-book').value.trim(),
      chapter: parseInt($('n-chapter').value || '0', 10),
      verse: $('n-verse').value ? parseInt($('n-verse').value, 10) : null,
      day_number: $('n-day').value ? parseInt($('n-day').value, 10) : null,
      body: $('n-body').value.trim(),
    };
    FH.setLoading(btn, true);
    const { ok, data } = await FH.api('/api/notes', { method: 'POST', body });
    FH.setLoading(btn, false);
    if (!ok) {
      err.textContent = data?.error || 'Could not save note';
      return;
    }
    $('n-body').value = '';
    FH.celebrate(btn);
    FH.toast('Note saved', 'ok');
    load();
  };

  // ── Search (debounced) + filter ───────────────────────────────────────────
  let t;
  $('q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 300); });
  $('f-type').addEventListener('change', load);

  load();
})();
