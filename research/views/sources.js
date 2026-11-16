/* =====================================================================
   AVALON RESEARCH — sources manager
   Sortable, filterable table of the investigation's sources, a list of
   all highlights, the "Add source" dialog (link / file / text) with
   duplicate detection, and the source details panel.
   ===================================================================== */
'use strict';

R.views.sources = (() => {
  const COLS = [
    { k: 'title', label: 'Source' },
    { k: 'type', label: 'Type' },
    { k: 'publisher', label: 'Publisher / author', cls: 'c-pub' },
    { k: 'publishedAt', label: 'Published', cls: 'c-date' },
    { k: 'accessedAt', label: 'Accessed', cls: 'c-acc' },
    { k: 'reliability', label: 'Reliability' },
    { k: 'hl', label: 'Quotes', cls: 'c-hl', title: 'Highlights' },
  ];
  const f = () => (R.ui.sources ||= { q: '', type: '', rel: '', origin: '', sort: 'createdAt', dir: -1, tab: 'table' });
  let el = null, pending = null;

  const hlCount = id => S.highlights.filter(h => h.sourceId === id).length;
  const srcType = s => R.SOURCE_TYPES[s.type] || R.SOURCE_TYPES.other;
  const label = s => s.title || s.url || 'Untitled';

  /* ---------- filtering + sorting ---------- */
  function filtered() {
    const o = f(), q = o.q.trim().toLowerCase();
    const rows = S.sources.filter(s =>
      (!o.type || s.type === o.type) &&
      (o.rel === '' || (o.rel === 'u' ? !s.reliability : o.rel === 'hi' ? s.reliability >= 4 : o.rel === 'lo' ? s.reliability > 0 && s.reliability <= 2 : true)) &&
      (!o.origin || s.origin === o.origin) &&
      (!q || [s.title, s.url, s.author, s.publisher, s.notes, s.text].join(' ').toLowerCase().includes(q)));
    const key = o.sort, dir = o.dir;
    const val = s => key === 'hl' ? hlCount(s.id) : key === 'publisher' ? (s.publisher || s.author || host(s.url)) : key === 'title' ? label(s) : s[key];
    return rows.sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === 'number' || typeof y === 'number') return ((x || 0) - (y || 0)) * dir;
      if (!x && y) return 1; if (x && !y) return -1;     // blanks last either way
      return String(x || '').localeCompare(String(y || ''), undefined, { sensitivity: 'base', numeric: true }) * dir;
    });
  }
  R.visibleSources = () => filtered();

  /* ---------- render ---------- */
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  function render(root) {
    el = root;
    const o = f();
    el.innerHTML = `
      <header class="rx-head">
        <div><p class="rx-kicker">${icon('link')}Sources</p><h1 class="rx-title">${esc(S.inv.title)}</h1></div>
        <div class="p-actions">
          <button class="btn btn-sm" data-act="cite" ${S.sources.length ? '' : 'disabled'}>${icon('download')}Citations</button>
          <button class="btn btn-gold" data-act="add" title="Add source (A)">${icon('plus')}Add source</button>
        </div>
      </header>
      <div class="rx-toolbar">
        <label class="rx-search">${icon('search')}<input type="search" data-filter name="q" value="${esc(o.q)}" placeholder="Search titles, URLs, authors, notes" aria-label="Search sources"></label>
        <select name="type" aria-label="Type">${opt('', 'All types', o.type)}${Object.entries(R.SOURCE_TYPES).map(([k, t]) => opt(k, t.label, o.type)).join('')}</select>
        <select name="rel" aria-label="Reliability">${opt('', 'Any reliability', o.rel)}${opt('hi', 'Reliable or better', o.rel)}${opt('lo', 'Questionable or worse', o.rel)}${opt('u', 'Unverified', o.rel)}</select>
        <select name="origin" aria-label="Kind">${opt('', 'Links, files, text', o.origin)}${opt('manual', 'Links', o.origin)}${opt('search', 'From search', o.origin)}${opt('file', 'Files', o.origin)}${opt('text', 'Text', o.origin)}</select>
        <div class="seg-tabs rx-view-tabs" role="tablist">
          <button type="button" data-tab="table" class="${o.tab === 'table' ? 'on' : ''}">Sources</button>
          <button type="button" data-tab="quotes" class="${o.tab === 'quotes' ? 'on' : ''}">Highlights${S.highlights.length ? ` · ${S.highlights.length}` : ''}</button>
        </div>
      </div>
      <div id="src-body"></div>`;
    drawBody();
    $('.rx-toolbar', el).addEventListener('input', e => {
      if (!e.target.name) return;
      f()[e.target.name] = e.target.value; R.saveUi(); drawBody();
    });
    el.addEventListener('click', onClick);
    if (pending) { const id = pending; pending = null; select(id); }
  }

  function drawBody() {
    const body = $('#src-body', el);
    if (!body) return;
    if (f().tab === 'quotes') return drawQuotes(body);
    const rows = filtered(), o = f(), dup = R.store.duplicates();
    if (!S.sources.length) {
      body.innerHTML = `
        <div class="rx-empty-big">
          ${icon('link')}
          <p><b>No sources yet.</b> Add a link, upload a PDF or image, or paste text. Each source keeps its own notes,
          reliability rating and highlights.</p>
          <button class="btn btn-gold" data-act="add">${icon('plus')}Add the first source</button>
        </div>`;
      return;
    }
    const arrow = k => o.sort === k ? `<i class="sort">${o.dir > 0 ? '▲' : '▼'}</i>` : '';
    body.innerHTML = `
      <p class="rx-count">${rows.length === S.sources.length ? plural(rows.length, 'source') : `${rows.length} of ${S.sources.length} sources`}${dup.size ? ` · <span class="warn">${icon('alert')}${dup.size} share a URL</span>` : ''}</p>
      <div class="rx-table-wrap">
        <table class="rx-table">
          <thead><tr>${COLS.map(c => `<th class="${c.cls || ''}" aria-sort="${o.sort === c.k ? (o.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-sort="${c.k}" title="${c.title || c.label}">${c.label}${arrow(c.k)}</button></th>`).join('')}</tr></thead>
          <tbody>${rows.map(s => row(s, dup.has(s.id))).join('') || `<tr><td colspan="${COLS.length}" class="empty">No source matches these filters.</td></tr>`}</tbody>
        </table>
      </div>`;
    markSel();
  }

  function row(s, isDup) {
    const t = srcType(s), sub = s.url ? host(s.url) : s.fileId ? 'Uploaded file' : s.origin === 'text' ? 'Text' : '';
    const n = hlCount(s.id);
    return `
      <tr data-id="${s.id}" tabindex="0">
        <td class="c-title"><div class="rx-src">
          <span class="rx-src-ic">${s.url ? `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host(s.url))}&sz=32" alt="" loading="lazy">` : icon(s.fileId ? 'file' : 'text')}</span>
          <span class="rx-src-t"><b>${esc(label(s))}</b><small>${esc(sub)}${isDup ? ` <i class="warn" title="Another source has the same URL">${icon('alert')}duplicate</i>` : ''}</small></span>
        </div></td>
        <td><span class="rx-type">${icon(t.icon)}<span>${t.label}</span></span></td>
        <td class="c-pub">${esc(s.publisher || s.author || '')}${s.publisher && s.author ? `<small>${esc(s.author)}</small>` : ''}</td>
        <td class="c-date">${esc(fmtDate(s.publishedAt))}</td>
        <td class="c-acc">${esc(fmtDate(s.accessedAt))}</td>
        <td>${R.relBar(s.reliability)}</td>
        <td class="c-hl">${n || ''}</td>
      </tr>`;
  }

  function drawQuotes(body) {
    const q = f().q.trim().toLowerCase();
    const list = [...S.highlights].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter(h => !q || [h.quote, h.note].join(' ').toLowerCase().includes(q));
    body.innerHTML = list.length ? `<ul class="rx-quotes">${list.map(h => {
      const s = S.sources.find(x => x.id === h.sourceId);
      return `<li data-id="${h.sourceId}">
        <blockquote>${esc(h.quote)}</blockquote>
        ${h.note ? `<p>${esc(h.note)}</p>` : ''}
        <small>${icon('link')}${esc(s ? label(s) : 'Deleted source')}${h.location ? ` · ${esc(h.location)}` : ''}</small>
      </li>`;
    }).join('')}</ul>` : `<p class="empty">${S.highlights.length ? 'No highlight matches the search.' : 'No highlights yet. Open a source and save the passages that matter.'}</p>`;
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'add') return add();
    if (act === 'cite') return R.cite.open();
    const tab = e.target.closest('[data-tab]');
    if (tab) { f().tab = tab.dataset.tab; R.saveUi(); $$('[data-tab]', el).forEach(b => b.classList.toggle('on', b === tab)); return drawBody(); }
    const th = e.target.closest('[data-sort]');
    if (th) {
      const o = f(), k = th.dataset.sort;
      if (o.sort === k) o.dir = -o.dir; else { o.sort = k; o.dir = ['title', 'type', 'publisher'].includes(k) ? 1 : -1; }
      R.saveUi(); return drawBody();
    }
    const tr = e.target.closest('[data-id]');
    if (tr) select(tr.dataset.id);
  }

  /* ---------- selection + details panel ---------- */
  function markSel() {
    const id = R.panel.key?.startsWith('source:') ? R.panel.key.slice(7) : null;
    el && $$('tbody tr, .rx-quotes li', el).forEach(r => r.classList.toggle('sel', r.dataset.id === id));
  }
  function select(id) {
    if (!el || !document.body.contains(el)) { pending = id; return; }
    if (!S.sources.some(s => s.id === id)) return;
    R.panel.open(`source:${id}`, body => panel(body, id));
    markSel();
    $(`tbody tr[data-id="${id}"]`, el)?.scrollIntoView({ block: 'nearest' });
  }
  function step(d) {
    if (f().tab !== 'table') return;
    const rows = filtered();
    if (!rows.length) return;
    const cur = R.panel.key?.startsWith('source:') ? rows.findIndex(s => s.id === R.panel.key.slice(7)) : -1;
    select(rows[Math.max(0, Math.min(rows.length - 1, cur + d))].id);
    $(`tbody tr.sel`, el)?.focus({ preventScroll: true });
  }

  let objUrls = [];
  function panel(body, id) {
    const s = S.sources.find(x => x.id === id);
    objUrls.forEach(u => URL.revokeObjectURL(u)); objUrls = [];
    if (!s) return R.panel.close();
    const hls = S.highlights.filter(h => h.sourceId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const t = srcType(s);
    body.innerHTML = `
      <header class="rx-pane-head">
        <span class="rx-kicker">${icon(t.icon)}${t.label}</span>
        <button class="icon-btn sm" data-act="close" title="Close (Esc)" aria-label="Close">${icon('x')}</button>
      </header>
      <form class="rx-pane" id="pane-form" autocomplete="off">
        <textarea class="rx-pane-title" name="title" rows="2" placeholder="Title">${esc(s.title)}</textarea>
        ${s.origin === 'file' || s.fileId ? `<div class="rx-file" id="pane-file">${icon('file')}<span>Loading file…</span></div>` : ''}
        ${s.fileId ? '' : `
        <label class="field"><span>URL</span>
          <div class="row"><input name="url" type="text" inputmode="url" spellcheck="false" value="${esc(s.url)}" placeholder="https://…">
          ${s.url ? `<a class="icon-btn bordered" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer" title="Open">${icon('external')}</a>` : ''}</div>
        </label>
        <div class="rx-dup" id="pane-dup" hidden></div>`}
        ${s.origin === 'text' ? `<label class="field"><span>Text</span><textarea name="text" rows="7">${esc(s.text)}</textarea></label>` : ''}
        ${s.snippet ? `<div class="rx-snippet"><span>From search${s.searchQuery ? ` for “${esc(s.searchQuery)}”` : ''}</span><p>${esc(s.snippet)}</p></div>` : ''}
        <div class="rx-pane-grid">
          <label class="field"><span>Type</span><select name="type">${Object.entries(R.SOURCE_TYPES).map(([k, x]) => `<option value="${k}" ${k === s.type ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
          <label class="field"><span>Reliability</span><select name="reliability">${R.RELIABILITY.map((l, n) => `<option value="${n}" ${n === s.reliability ? 'selected' : ''}>${n ? `${n} · ` : ''}${l}</option>`).join('')}</select></label>
          <label class="field"><span>Author</span><input name="author" value="${esc(s.author)}" placeholder="Surname, A."></label>
          <label class="field"><span>Publisher / site</span><input name="publisher" value="${esc(s.publisher)}"></label>
          <label class="field"><span>Published</span><input name="publishedAt" value="${esc(s.publishedAt)}" placeholder="YYYY, YYYY-MM or YYYY-MM-DD"></label>
          <label class="field"><span>Accessed</span><input name="accessedAt" type="date" value="${esc(s.accessedAt)}"></label>
        </div>
        <label class="field"><span>Notes</span><textarea name="notes" rows="4" placeholder="Why it matters, what to verify…">${esc(s.notes)}</textarea></label>
        <p class="rx-pane-saved" id="pane-saved" aria-live="polite"></p>
      </form>

      <section class="rx-hl">
        <h3>${icon('quote')}Highlights <span>${hls.length || ''}</span></h3>
        <ul class="rx-hl-list">${hls.map(h => `
          <li>
            <blockquote>${esc(h.quote)}</blockquote>
            ${h.note ? `<p>${esc(h.note)}</p>` : ''}
            <div class="rx-hl-foot"><small>${esc(h.location || '')}</small>
              <button class="link-btn" data-copy="${h.id}">copy</button>
              <button class="link-btn danger" data-del-hl="${h.id}">delete</button></div>
          </li>`).join('')}</ul>
        <form class="rx-hl-form" id="hl-form">
          <textarea name="quote" rows="3" placeholder="Paste the exact words from the source…" required></textarea>
          <div class="row"><input name="location" placeholder="Page, section or timestamp"><input name="note" placeholder="Your note (optional)"></div>
          <button class="btn btn-sm">${icon('plus')}Save highlight</button>
        </form>
      </section>

      <footer class="rx-pane-foot">
        <small>Added ${esc(ago(s.createdAt))}${s.foundBy?.length ? ` from ${esc(s.foundBy.join(', '))}` : ''}</small>
        <button class="btn btn-sm btn-danger-ghost" data-act="delete">${icon('trash')}Delete source</button>
      </footer>`;

    const form = $('#pane-form', body);
    const saved = $('#pane-saved', body);
    const pendingPatch = {};
    const commit = debounce(async () => {
      const patch = { ...pendingPatch };
      for (const k in pendingPatch) delete pendingPatch[k];
      if (!Object.keys(patch).length) return;
      await R.store.updateSource(id, patch, 'panel');
      saved.textContent = 'Saved';
      drawBody();
    }, 400);
    form.addEventListener('input', e => {
      const n = e.target.name;
      if (!n) return;
      let v = e.target.value;
      if (n === 'publishedAt') {
        v = v.trim();
        e.target.classList.toggle('bad', !!v && !PARTIAL_DATE.test(v));
        if (v && !PARTIAL_DATE.test(v)) return;
      }
      if (n === 'reliability') v = +v;
      if (n === 'title') v = v.replace(/\s*\n\s*/g, ' ');
      pendingPatch[n] = v;
      saved.textContent = 'Editing…';
      commit();
      if (n === 'url') checkDup(v, $('#pane-dup', body), id);
    });
    form.addEventListener('focusout', () => commit.flush());
    form.addEventListener('submit', e => e.preventDefault());
    if (s.url) checkDup(s.url, $('#pane-dup', body), id);

    $('#hl-form', body).addEventListener('submit', async e => {
      e.preventDefault();
      const fm = e.target, quote = fm.quote.value.trim();
      if (!quote) return fm.quote.focus();
      await commit.flush();
      await R.store.addHighlight(id, { quote, note: fm.note.value.trim(), location: fm.location.value.trim() });
      toast('Highlight saved.');
      R.agent.event('quote');
      R.panel.refresh();
      $('#hl-form textarea', body)?.focus();
    });
    body.onclick = async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') return R.panel.close();
      if (act === 'delete') {
        const n = hls.length;
        if (await ask({ title: 'Delete this source?', text: `${esc(label(s))}${n ? ` and its ${plural(n, 'highlight')}` : ''} will be removed. This can't be undone.` })) {
          R.panel.close(); await R.store.deleteSource(id); toast('Source deleted.'); R.agent.event('unfiled');
        }
        return;
      }
      const c = e.target.closest('[data-copy]');
      if (c) { const h = hls.find(x => x.id === c.dataset.copy); if (h && await copyText(`“${h.quote}” — ${label(s)}${h.location ? `, ${h.location}` : ''}`)) toast('Quote copied.'); return; }
      const d = e.target.closest('[data-del-hl]');
      if (d) { await R.store.deleteHighlight(d.dataset.delHl); R.panel.refresh(); }
    };
    if (s.fileId) showFile($('#pane-file', body), s.fileId);
  }

  async function showFile(box, fileId) {
    const file = await R.store.getFile(fileId).catch(() => null);
    if (!box.isConnected) return;
    if (!file) { box.innerHTML = `${icon('alert')}<span>The uploaded file is missing.</span>`; return; }
    const url = URL.createObjectURL(file.blob);
    objUrls.push(url);
    const isImg = file.mime.startsWith('image/');
    box.innerHTML = `
      ${isImg ? `<img class="rx-file-img" src="${url}" alt="">` : ''}
      <div class="rx-file-row">${icon(isImg ? 'image' : 'file')}<span><b>${esc(file.name)}</b><small>${esc(file.mime)} · ${fmtSize(file.size)}</small></span>
        <a class="btn btn-sm" href="${url}" target="_blank" rel="noopener">${icon('external')}Open</a>
        <a class="icon-btn sm bordered" href="${url}" download="${esc(file.name)}" title="Download">${icon('download')}</a></div>`;
  }

  /* ---------- duplicate check ---------- */
  const dupRun = new WeakMap();
  async function checkDup(url, box, exceptId = null) {
    if (!box) return;
    const run = (dupRun.get(box) || 0) + 1; dupRun.set(box, run);
    if (!/^https?:\/\/\S+\.\S+/i.test(url.trim())) { box.hidden = true; return; }
    const { here, elsewhere } = await R.store.findUrl(url.trim(), exceptId);
    if (dupRun.get(box) !== run) return;
    const parts = [];
    if (here) parts.push(`<p class="warn">${icon('alert')}Already saved here as <button type="button" class="link-btn" data-goto="${here.id}">${esc(label(here))}</button>.</p>`);
    if (elsewhere.length) parts.push(`<p>${icon('link')}Also in ${elsewhere.slice(0, 3).map(x => `<a href="${R.invHash(x.inv.id, 'sources')}">${esc(x.inv.title)}</a>`).join(', ')}${elsewhere.length > 3 ? ` and ${elsewhere.length - 3} more` : ''}.</p>`);
    box.innerHTML = parts.join('');
    box.hidden = !parts.length;
    // in the add dialog, the investigator speaks up the first time a match appears
    const seen = here ? `h:${here.id}` : elsewhere.length ? `e:${elsewhere[0].source.id}` : '';
    if (box.id === 'src-dup' && seen && seen !== box.dataset.seen) R.agent.event(here ? 'dup' : 'elsewhere', here || elsewhere[0].inv);
    box.dataset.seen = seen;
    box.dataset.dup = here ? here.id : '';
    $('[data-goto]', box)?.addEventListener('click', e => { $('#src-dlg').open && $('#src-dlg').close(); select(e.target.dataset.goto); });
  }

  /* ---------- add source dialog ---------- */
  const dlg = $('#src-dlg'), form = $('#src-form');
  form.type.innerHTML = Object.entries(R.SOURCE_TYPES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('');
  form.reliability.innerHTML = R.RELIABILITY.map((l, n) => `<option value="${n}">${n ? `${n} · ` : ''}${l}</option>`).join('');
  let kind = 'url', file = null;
  const MAX_FILE = 100 * 1024 * 1024;

  function setKind(k) {
    kind = k;
    $$('#src-kinds button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
    $$('[data-for]', form).forEach(d => { d.hidden = d.dataset.for !== k; });
    if (k === 'file' && !form.type.dataset.touched) form.type.value = 'document';
    if (k === 'url' && !form.type.dataset.touched) form.type.value = 'website';
    if (k === 'text' && !form.type.dataset.touched) form.type.value = 'other';
    $('#src-err').hidden = true;
  }
  function setFile(fl) {
    file = fl || null;
    $('#src-file-txt').innerHTML = file ? `<b>${esc(file.name)}</b> · ${fmtSize(file.size)}` : 'Choose a PDF or image, or drop it here';
    $('#src-drop').classList.toggle('has', !!file);
    if (file && !form.title.value) form.title.placeholder = file.name.replace(/\.[a-z0-9]+$/i, '');
    if (file?.type.startsWith('image/') && !form.type.dataset.touched) form.type.value = 'other';
  }
  function add(prefill = {}) {
    if (!S.inv) return;
    form.reset();
    delete form.type.dataset.touched;
    form.title.placeholder = 'Filled in from the link or file if left empty';
    form.accessedAt.value = today();
    setFile(null);
    setKind(prefill.kind || 'url');
    $('#src-dup').hidden = true;
    $('#src-dup').dataset.seen = '';
    if (prefill.url) { form.url.value = prefill.url; checkDup(prefill.url, $('#src-dup')); }
    dlg.showModal();
    (kind === 'url' ? form.url : form.title).focus();
  }
  $('#src-kinds').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { setKind(b.dataset.k); (kind === 'url' ? form.url : kind === 'text' ? form.text : form.title).focus(); } });
  form.type.addEventListener('change', () => { form.type.dataset.touched = '1'; });
  form.url.addEventListener('input', debounce(() => checkDup(form.url.value, $('#src-dup')), 250));
  form.file.addEventListener('change', () => setFile(form.file.files[0]));
  const drop = $('#src-drop');
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, () => drop.classList.remove('over')));
  drop.addEventListener('drop', e => { e.preventDefault(); const fl = e.dataTransfer.files[0]; if (fl) setFile(fl); });
  // dropping a file anywhere on the dialog switches to the File tab
  dlg.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); if (kind !== 'file') setKind('file'); } });
  dlg.addEventListener('drop', e => { if (e.target.closest('#src-drop')) return; e.preventDefault(); const fl = e.dataTransfer.files[0]; if (fl) { setKind('file'); setFile(fl); } });

  const fail = msg => { const p = $('#src-err'); p.innerHTML = `${icon('alert')}${msg}`; p.hidden = false; };
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = n => form[n].value.trim();
    const published = v('publishedAt');
    if (published && !PARTIAL_DATE.test(published)) { form.publishedAt.focus(); return fail('Published date must look like 2024, 2024-03 or 2024-03-15.'); }
    const data = {
      title: v('title'), type: form.type.value, reliability: +form.reliability.value, author: v('author'), publisher: v('publisher'),
      publishedAt: published, accessedAt: form.accessedAt.value || today(), notes: v('notes'), origin: kind === 'url' ? 'manual' : kind,
    };
    const btn = $('#src-save'); btn.disabled = true;
    try {
      if (kind === 'url') {
        let url = v('url');
        if (url && !/^[a-z]+:\/\//i.test(url)) url = `https://${url}`;
        if (!/^https?:\/\/[^\s/]+\.[^\s]+/i.test(url)) { form.url.focus(); return fail('Enter a web address, like https://example.com/page.'); }
        const { here } = await R.store.findUrl(url);
        if (here) { dlg.close(); select(here.id); R.agent.event('dup', here); return toast('That link is already a source here, so it was opened instead.'); }
        data.url = url;
        if (!data.title) data.title = titleFromUrl(url);
        if (!data.publisher) data.publisher = host(url);
      } else if (kind === 'file') {
        if (!file) return fail('Choose a file first.');
        if (file.size > MAX_FILE) return fail(`That file is ${fmtSize(file.size)}; the limit is ${fmtSize(MAX_FILE)}.`);
        const saved = await R.store.saveFile(file);
        data.fileId = saved.id;
        if (!data.title) data.title = file.name.replace(/\.[a-z0-9]+$/i, '');
      } else {
        const text = form.text.value.trim();
        if (!text) { form.text.focus(); return fail('Write or paste the text first.'); }
        data.text = text;
        if (!data.title) data.title = text.split('\n')[0].slice(0, 80);
      }
      const src = await R.store.addSource(data);
      dlg.close();
      toast(`Saved <b>${esc(label(src))}</b>.`);
      R.agent.event('filed', src);
      if (R.route.view !== 'sources') R.go(R.invHash(S.inv.id, 'sources'));
      select(src.id);
    } catch (err) {
      fail(esc(err.message || String(err)));
    } finally { btn.disabled = false; }
  });

  /** "https://site.com/news/big-merger-announced" → "Big merger announced" */
  function titleFromUrl(u) {
    try {
      const x = new URL(u);
      const last = decodeURIComponent(x.pathname.split('/').filter(Boolean).pop() || '')
        .replace(/\.(html?|php|aspx?)$/i, '').replace(/[-_+]+/g, ' ')
        .replace(/\s+\d{4}(\s\d{1,2}){0,2}$/, '').replace(/\s+[a-z0-9]{8,}$/i, m => /\d/.test(m) ? '' : m).trim();
      if (!last || /^\d+$/.test(last)) return host(u);
      return last.charAt(0).toUpperCase() + last.slice(1);
    } catch { return u; }
  }

  // redraw quietly when the panel saved a change (keeps the panel's focus)
  function update(kind, id, from) {
    if (!el || !document.body.contains(el)) return false;
    if (kind === 'selection') { markSel(); return true; }
    if (from === 'panel') { drawBody(); return true; }
    if (kind === 'sources' || kind === 'highlights' || kind === 'external') {
      R.renderMain();
      if (R.panel.key?.startsWith('source:') && kind !== 'highlights') {
        const sid = R.panel.key.slice(7);
        if (S.sources.some(s => s.id === sid)) { if (kind === 'external') R.panel.refresh(); } else R.panel.close();
      }
      return true;
    }
    return false;
  }

  /** Show a source's details panel from anywhere (board, search, entities). */
  const openPanel = id => { if (S.sources.some(s => s.id === id)) R.panel.open(`source:${id}`, body => panel(body, id)); };
  return { render, update, add, select, step, openPanel };
})();
