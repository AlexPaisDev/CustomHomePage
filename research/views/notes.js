/* =====================================================================
   AVALON RESEARCH — notes
   Markdown notes per investigation. Type [[ to link an entity and @ to
   cite a source: a picker completes the name. Write, Split and Preview
   modes; everything autosaves. Unknown [[names]] can become entities
   with one click.
   ===================================================================== */
'use strict';

R.views.notes = (() => {
  let el = null, cur = null, mode = null, ac = null;
  const sorted = () => [...S.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function render(root) {
    el = root;
    mode = R.ui.noteMode || 'split';
    if (!cur || !S.notes.some(n => n.id === cur)) cur = sorted()[0]?.id || null;
    el.innerHTML = `
      <header class="rx-head">
        <div><p class="rx-kicker">${icon('pen')}Notes</p><h1 class="rx-title">${esc(S.inv.title)}</h1></div>
        <div class="p-actions"><button class="btn btn-gold" data-act="new" title="New note (Shift+N)">${icon('plus')}New note</button></div>
      </header>
      ${S.notes.length ? `
      <div class="nt">
        <aside class="nt-list">
          <input type="search" data-filter class="nt-filter" placeholder="Filter notes…" aria-label="Filter notes">
          <ul id="nt-items"></ul>
        </aside>
        <section class="nt-doc" id="nt-doc"></section>
      </div>` : `
      <div class="rx-empty-big">
        ${icon('pen')}
        <p><b>No notes yet.</b> Write what you're finding as you go. Link people and companies with <code>[[Name]]</code>
        and cite sources with <code>@</code>; they turn into clickable chips.</p>
        <button class="btn btn-gold" data-act="new">${icon('plus')}Write the first note</button>
      </div>`}`;
    el.addEventListener('click', onClick);
    if (!S.notes.length) return;
    drawList();
    drawDoc();
    $('.nt-filter', el).addEventListener('input', drawList);
  }

  function drawList() {
    const q = ($('.nt-filter', el)?.value || '').toLowerCase();
    $('#nt-items', el).innerHTML = sorted().filter(n => !q || `${n.title} ${n.body}`.toLowerCase().includes(q)).map(n => `
      <li><button data-note="${n.id}" class="${n.id === cur ? 'on' : ''}">
        <b>${esc(n.title || 'Untitled note')}</b>
        <small>${esc(R.md.plainText(n.body).slice(0, 90) || 'Empty')}</small>
        <i>${esc(ago(n.updatedAt))}</i>
      </button></li>`).join('') || '<li class="empty">No match.</li>';
  }

  function drawDoc() {
    const n = S.notes.find(x => x.id === cur), box = $('#nt-doc', el);
    if (!box) return;
    if (!n) { box.innerHTML = '<p class="empty">Pick a note.</p>'; return; }
    box.innerHTML = `
      <div class="nt-bar">
        <input class="nt-title" id="nt-title" value="${esc(n.title)}" placeholder="Title" maxlength="200" aria-label="Title">
        <div class="seg-tabs nt-modes" role="tablist">
          ${['write', 'split', 'preview'].map(m => `<button type="button" data-mode="${m}" class="${m === mode ? 'on' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
        </div>
        <span class="p-meta" id="nt-saved">${esc(ago(n.updatedAt))}</span>
        <button class="icon-btn sm" data-act="delete" title="Delete note">${icon('trash')}</button>
      </div>
      <div class="nt-panes nt-${mode}">
        <div class="nt-edit-wrap">
          <textarea class="nt-body" id="nt-body" spellcheck="true" placeholder="Write in Markdown.  [[ links an entity · @ cites a source · - [ ] makes a checkbox">${esc(n.body)}</textarea>
          <div class="nt-hint">**bold** · *italic* · # heading · - list · &gt; quote · [[Entity]] · @[Source]</div>
        </div>
        <article class="nt-view md" id="nt-preview">${R.md.render(n.body) || '<p class="empty">Nothing to preview yet.</p>'}</article>
      </div>`;
    const ta = $('#nt-body', box), title = $('#nt-title', box);
    const save = debounce(async () => {
      n.title = title.value.trim(); n.body = ta.value;
      await R.store.save('notes', n, 'notes');
      $('#nt-saved', box).textContent = 'saved';
      drawList();
    }, 450);
    const preview = debounce(() => { $('#nt-preview', box).innerHTML = R.md.render(ta.value) || '<p class="empty">Nothing to preview yet.</p>'; }, 150);
    title.addEventListener('input', () => { $('#nt-saved', box).textContent = 'editing…'; save(); });
    ta.addEventListener('input', () => { $('#nt-saved', box).textContent = 'editing…'; save(); preview(); complete(ta); });
    ta.addEventListener('keydown', e => acKey(e, ta));
    ta.addEventListener('blur', () => { setTimeout(closeAc, 150); save.flush(); });
    title.addEventListener('blur', () => save.flush());
  }

  /* ---------- [[ and @ completion ---------- */
  function complete(ta) {
    const upto = ta.value.slice(0, ta.selectionStart);
    const m = upto.match(/\[\[([^\]\n]{0,40})$/) || upto.match(/(?:^|\s)@\[?([^\]\n]{0,40})$/);
    if (!m) return closeAc();
    const isEnt = m[0].includes('[['), q = m[1].toLowerCase();
    const items = isEnt
      ? S.entities.filter(e => !q || e.name.toLowerCase().includes(q) || (e.aliases || []).some(a => a.toLowerCase().includes(q))).slice(0, 8)
        .map(e => ({ label: e.name, sub: (R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other).label, ic: (R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other).icon, insert: `[[${e.name}]]` }))
      : S.sources.filter(s => !q || (s.title || '').toLowerCase().includes(q)).slice(0, 8)
        .map(s => ({ label: s.title || s.url, sub: s.publisher || host(s.url), ic: (R.SOURCE_TYPES[s.type] || R.SOURCE_TYPES.other).icon, insert: `@[${s.title}]` }));
    if (isEnt && q && !items.some(i => i.label.toLowerCase() === q)) items.push({ label: `Link “${m[1]}”`, sub: 'new name', ic: 'plus', insert: `[[${m[1]}]]` });
    if (!items.length) return closeAc();
    const start = ta.selectionStart - m[0].length + (m[0].startsWith(' ') || m[0].startsWith('\n') ? 1 : 0);
    ac = { ta, items, sel: 0, start };
    drawAc();
  }
  function drawAc() {
    let box = $('#nt-ac', el);
    if (!box) { box = document.createElement('ul'); box.id = 'nt-ac'; box.className = 'nt-ac'; $('.nt-edit-wrap', el).appendChild(box); }
    box.innerHTML = ac.items.map((it, i) => `<li class="${i === ac.sel ? 'on' : ''}" data-i="${i}">${icon(it.ic)}<b>${esc(it.label)}</b><small>${esc(it.sub || '')}</small></li>`).join('');
    // place the list under the caret line (approximate: by line number)
    const before = ac.ta.value.slice(0, ac.ta.selectionStart).split('\n').length;
    const lh = parseFloat(getComputedStyle(ac.ta).lineHeight) || 21;
    box.style.top = `${Math.min(ac.ta.clientHeight - 40, 12 + before * lh - ac.ta.scrollTop)}px`;
    box.onmousedown = e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); pick(+li.dataset.i); } };
  }
  function acKey(e, ta) {
    if (!ac) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ac.sel = (ac.sel + (e.key === 'ArrowDown' ? 1 : -1) + ac.items.length) % ac.items.length; drawAc(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(ac.sel); }
    else if (e.key === 'Escape') { e.stopPropagation(); closeAc(); }
  }
  function pick(i) {
    const { ta, items, start } = ac, it = items[i];
    const end = ta.selectionStart;
    ta.setRangeText(it.insert + ' ', start, end, 'end');
    closeAc();
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  }
  function closeAc() { ac = null; $('#nt-ac', el)?.remove(); }

  /* ---------- actions ---------- */
  async function create(text = '') {
    const n = await R.store.create('notes', { title: '', body: text }, 'notes');
    cur = n.id;
    R.renderMain();
    setTimeout(() => $('#nt-title', el)?.focus(), 30);
    R.agent.desk?.do('write'); R.agent.desk?.say('New page in the notebook.');
    return n;
  }
  async function onClick(e) {
    const t = e.target, act = t.closest('[data-act]')?.dataset.act;
    if (act === 'new') return create();
    if (act === 'delete') {
      const n = S.notes.find(x => x.id === cur);
      if (n && await ask({ title: 'Delete this note?', text: `“${esc(n.title || 'Untitled note')}” will be removed. This can't be undone.` })) {
        await R.store.removeAll({ notes: [n.id] }, 'notes'); cur = null; R.renderMain();
      }
      return;
    }
    const nb = t.closest('[data-note]');
    if (nb) { cur = nb.dataset.note; drawList(); drawDoc(); return; }
    const mb = t.closest('[data-mode]');
    if (mb) { mode = R.ui.noteMode = mb.dataset.mode; R.saveUi(); drawDoc(); return; }
    const ent = t.closest('[data-entity]');
    if (ent) return R.openEntity(ent.dataset.entity);
    const src = t.closest('[data-source]');
    if (src) return R.views.sources.openPanel(src.dataset.source);
    const nw = t.closest('[data-new-entity]');
    if (nw) {
      const name = nw.dataset.newEntity.replace(/&amp;/g, '&');
      const e2 = await R.store.create('entities', { kind: 'other', name, description: '', aliases: [], date: '' });
      toast(`Created entity <b>${esc(name)}</b>. Set its kind in the panel.`);
      R.agent.event('filed', { title: name });
      drawDoc();
      R.openEntity(e2.id, { focus: false });
    }
  }

  function key(e) {
    if (!el || !document.body.contains(el)) return false;
    const a = document.activeElement;
    if (['INPUT', 'TEXTAREA'].includes(a?.tagName)) return false;
    if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); create(); return true; }
    return false;
  }

  function update(kind, id, from) {
    if (!el || !document.body.contains(el)) return false;
    if (from === 'notes') return true;
    if (kind === 'notes' || kind === 'external') { R.renderMain(); return true; }
    if (['entities', 'sources'].includes(kind)) { const p = $('#nt-preview', el), ta = $('#nt-body', el); if (p && ta) p.innerHTML = R.md.render(ta.value); return true; }
    if (['selection', 'inv', 'highlights', 'entityFields', 'nodes', 'edges'].includes(kind)) return true;
    return false;
  }

  return { render, update, key, create, open: id => { cur = id; if (el && document.body.contains(el)) { drawList(); drawDoc(); } } };
})();
