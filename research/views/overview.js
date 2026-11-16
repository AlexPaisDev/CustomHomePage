/* =====================================================================
   AVALON RESEARCH — investigation overview
   Header, description, counts, an autosaving working summary and the
   most recent sources.
   ===================================================================== */
'use strict';

R.views.overview = (() => {
  function stats() {
    const src = S.sources;
    return [
      ['Sources', src.length, 'link'],
      ['Highlights', S.highlights.length, 'quote'],
      ['Reliable', src.filter(s => s.reliability >= 4).length, 'check'],
      ['Unverified', src.filter(s => !s.reliability).length, 'alert'],
    ];
  }

  function render(el) {
    const i = S.inv, st = R.STATUS[i.status] || R.STATUS.active, t = R.TYPES[i.type] || R.TYPES.custom;
    const recent = [...S.sources].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
    el.innerHTML = `
      <header class="rx-head">
        <div class="rx-head-main">
          <p class="rx-kicker">${icon(t.icon)}${t.label}<i class="st ${st.cls}">${st.label}</i><span>created ${esc(fmtDate(i.createdAt.slice(0, 10)))}</span></p>
          <h1 class="rx-title">${esc(i.title)}</h1>
          ${i.tags.length ? `<div class="rx-tags">${i.tags.map(x => `<span class="rx-tag">${esc(x)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="p-actions">
          <select class="rx-status-sel" aria-label="Status">${Object.entries(R.STATUS).map(([k, s]) => `<option value="${k}" ${k === i.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
          <button class="btn btn-sm" data-act="edit">${icon('edit')}Edit</button>
          <button class="icon-btn sm bordered" data-act="delete" title="Delete investigation" aria-label="Delete investigation">${icon('trash')}</button>
        </div>
      </header>
      ${i.description ? `<p class="rx-desc">${esc(i.description)}</p>` : `<p class="rx-desc muted">No description yet. <button class="link-btn" data-act="edit">Add one</button></p>`}

      <div class="rx-stats">
        ${stats().map(([l, n, ic]) => `<div class="rx-stat">${icon(ic)}<b>${n}</b><span>${l}</span></div>`).join('')}
      </div>

      <div class="rx-cols">
        <section class="panel">
          <header class="p-head"><h2>Working summary</h2><span class="p-meta" id="ov-saved"></span></header>
          <textarea class="rx-summary" id="ov-summary" rows="9" placeholder="What do you know so far? Write your current understanding here and keep it up to date as the investigation moves.">${esc(i.summary || '')}</textarea>
        </section>
        <section class="panel">
          <header class="p-head"><h2>Recent sources</h2>
            <div class="p-actions"><button class="btn btn-sm" data-act="add">${icon('plus')}Add</button></div>
          </header>
          ${recent.length ? `<ul class="rx-mini">${recent.map(s => `
            <li><a href="${R.invHash(i.id, 'sources')}" data-src="${s.id}">
              ${icon((R.SOURCE_TYPES[s.type] || R.SOURCE_TYPES.other).icon)}
              <span><b>${esc(s.title || s.url || 'Untitled')}</b><small>${esc([s.publisher || host(s.url), fmtDate(s.publishedAt)].filter(Boolean).join(' · '))}</small></span>
              ${R.relBar(s.reliability)}
            </a></li>`).join('')}</ul>
            <a class="link-btn rx-more" href="${R.invHash(i.id, 'sources')}">All ${plural(S.sources.length, 'source')} →</a>`
        : `<p class="empty">No sources yet. Add a link, a PDF or a note, or save results from Search once it arrives.</p>`}
        </section>
      </div>`;

    const saveSummary = debounce(async v => { await R.store.updateInv(i.id, { summary: v }, 'overview'); $('#ov-saved', el).textContent = 'saved'; }, 500);
    $('#ov-summary', el).addEventListener('input', e => { $('#ov-saved', el).textContent = 'editing…'; saveSummary(e.target.value); });
    $('#ov-summary', el).addEventListener('blur', e => saveSummary.flush(e.target.value));
    $('.rx-status-sel', el).addEventListener('change', e => R.store.updateInv(i.id, { status: e.target.value }));
    el.addEventListener('click', e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'edit') R.editInv(i);
      if (act === 'delete') R.deleteInv(i);
      if (act === 'add') R.views.sources.add();
      const src = e.target.closest('[data-src]');
      if (src) { e.preventDefault(); R.go(R.invHash(i.id, 'sources')); setTimeout(() => R.views.sources.select(src.dataset.src), 0); }
    });
  }

  // summary edits come from this view; everything else redraws it
  return { render };
})();
