/* =====================================================================
   AVALON RESEARCH — findings
   Discrete claims, each with a confidence level (Confirmed / Likely /
   Unverified / Disproven), an optional date (for the timeline), the
   sources that support or contradict it, and the entities it is about.
   An evidence line weighs supporting against contradicting sources by
   their reliability.
   ===================================================================== */
'use strict';

R.CONFIDENCE = {
  confirmed: { label: 'Confirmed', cls: 'c-ok', icon: 'check' },
  likely: { label: 'Likely', cls: 'c-likely', icon: 'check' },
  unverified: { label: 'Unverified', cls: 'c-unv', icon: 'help' },
  disproven: { label: 'Disproven', cls: 'c-no', icon: 'x' },
};

R.views.findings = (() => {
  let el = null, focusId = null;
  const f = () => (R.ui.findings ||= { conf: '', q: '' });

  /** Supporting minus contradicting, each weighted by reliability (unverified counts as 1). */
  function evidence(fd) {
    const w = id => { const s = S.sources.find(x => x.id === id); return s ? Math.max(1, s.reliability) : 0; };
    const sup = (fd.supportIds || []).reduce((a, id) => a + w(id), 0), con = (fd.contradictIds || []).reduce((a, id) => a + w(id), 0);
    return { sup, con, n: (fd.supportIds || []).length + (fd.contradictIds || []).length };
  }

  function render(root) {
    el = root;
    const o = f();
    const counts = Object.fromEntries(Object.keys(R.CONFIDENCE).map(k => [k, S.findings.filter(x => x.confidence === k).length]));
    el.innerHTML = `
      <header class="rx-head">
        <div><p class="rx-kicker">${icon('check')}Findings</p><h1 class="rx-title">${esc(S.inv.title)}</h1></div>
        <div class="p-actions"><span class="p-meta">${plural(S.findings.length, 'finding')}</span></div>
      </header>
      <form class="fd-new" id="fd-new" autocomplete="off">
        <textarea name="claim" rows="2" placeholder="A claim you can stand behind, e.g. “Galp sold its Area 4 stake to ADNOC in 2024 for $650M.”" required maxlength="1000"></textarea>
        <div class="fd-new-row">
          <select name="confidence" aria-label="Confidence">${Object.entries(R.CONFIDENCE).map(([k, c]) => `<option value="${k}" ${k === 'unverified' ? 'selected' : ''}>${c.label}</option>`).join('')}</select>
          <input name="date" placeholder="Date it happened (optional)" aria-label="Date" maxlength="10">
          <button class="btn btn-gold">${icon('plus')}Add finding</button>
        </div>
      </form>
      <div class="rx-toolbar">
        <label class="rx-search">${icon('search')}<input type="search" data-filter name="q" value="${esc(o.q)}" placeholder="Search findings" aria-label="Search findings"></label>
        <div class="fd-filters" role="tablist">
          <button type="button" data-conf="" class="${!o.conf ? 'on' : ''}">All <span>${S.findings.length}</span></button>
          ${Object.entries(R.CONFIDENCE).map(([k, c]) => `<button type="button" data-conf="${k}" class="${o.conf === k ? 'on' : ''} ${c.cls}">${c.label} <span>${counts[k]}</span></button>`).join('')}
        </div>
      </div>
      <ul class="fd-list" id="fd-list"></ul>`;
    drawList();
    $('#fd-new', el).addEventListener('submit', add);
    $('[name="q"]', el).addEventListener('input', e => { f().q = e.target.value; R.saveUi(); drawList(); });
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
  }

  function drawList() {
    const o = f(), q = o.q.trim().toLowerCase();
    const order = { confirmed: 0, likely: 1, unverified: 2, disproven: 3 };
    const list = S.findings.filter(x => (!o.conf || x.confidence === o.conf) && (!q || x.claim.toLowerCase().includes(q)))
      .sort((a, b) => order[a.confidence] - order[b.confidence] || b.updatedAt.localeCompare(a.updatedAt));
    $('#fd-list', el).innerHTML = list.map(card).join('') ||
      `<li class="rx-empty-big">${icon('check')}<p>${S.findings.length ? 'No finding matches.' : '<b>No findings yet.</b> A finding is one claim plus the sources for and against it. Add the first one above.'}</p></li>`;
    if (focusId) { $(`[data-fd="${focusId}"]`, el)?.scrollIntoView({ block: 'center' }); $(`[data-fd="${focusId}"]`, el)?.classList.add('flash'); focusId = null; }
  }

  function chips(ids, kind) {
    return ids.map(id => S.sources.find(s => s.id === id)).filter(Boolean).map(s => `
      <span class="fd-chip ${kind}">${R.relBar(s.reliability)}<button type="button" data-open-src="${s.id}">${esc((s.title || s.url || '').slice(0, 48))}</button><button type="button" class="x" data-unlink="${kind}:${s.id}" aria-label="Remove">×</button></span>`).join('');
  }
  function srcSelect(kind, exclude) {
    const free = S.sources.filter(s => !exclude.includes(s.id));
    return free.length ? `<select data-link="${kind}" aria-label="${kind === 'sup' ? 'Add supporting source' : 'Add contradicting source'}"><option value="">+ ${kind === 'sup' ? 'supporting' : 'contradicting'} source</option>${free.map(s => `<option value="${s.id}">${esc((s.title || s.url || '').slice(0, 70))}</option>`).join('')}</select>` : '';
  }

  function card(x) {
    const c = R.CONFIDENCE[x.confidence] || R.CONFIDENCE.unverified, ev = evidence(x);
    const used = [...(x.supportIds || []), ...(x.contradictIds || [])];
    const ents = (x.entityIds || []).map(id => S.entities.find(e => e.id === id)).filter(Boolean);
    const freeEnts = S.entities.filter(e => !(x.entityIds || []).includes(e.id));
    const total = ev.sup + ev.con, pct = total ? Math.round(ev.sup / total * 100) : 0;
    return `<li class="fd ${c.cls}" data-fd="${x.id}">
      <div class="fd-top">
        <select class="fd-conf" data-field="confidence" aria-label="Confidence">${Object.entries(R.CONFIDENCE).map(([k, cc]) => `<option value="${k}" ${k === x.confidence ? 'selected' : ''}>${cc.label}</option>`).join('')}</select>
        <input class="fd-date" data-field="date" value="${esc(x.date || '')}" placeholder="date" aria-label="Date" title="When it happened (YYYY, YYYY-MM or YYYY-MM-DD), for the timeline">
        <button class="icon-btn sm fd-del" data-del="${x.id}" title="Delete finding">${icon('trash')}</button>
      </div>
      <textarea class="fd-claim" data-field="claim" rows="2" aria-label="Claim">${esc(x.claim)}</textarea>
      <div class="fd-ev" title="Supporting vs contradicting sources, weighted by reliability">
        <span class="fd-bar"><i style="width:${pct}%"></i></span>
        <small>${ev.n ? `${(x.supportIds || []).length} for · ${(x.contradictIds || []).length} against` : 'No sources yet'}${ev.n && x.confidence === 'confirmed' && !(x.supportIds || []).length ? ' · confirmed without a source?' : ''}</small>
      </div>
      <div class="fd-row"><span class="fd-lab">For</span>${chips(x.supportIds || [], 'sup')}${srcSelect('sup', used)}</div>
      <div class="fd-row"><span class="fd-lab">Against</span>${chips(x.contradictIds || [], 'con')}${srcSelect('con', used)}</div>
      <div class="fd-row"><span class="fd-lab">About</span>
        ${ents.map(e => `<span class="fd-chip ent" style="--c:${(R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other).color}"><button type="button" data-open-ent="${e.id}">${icon((R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other).icon)}${esc(e.name)}</button><button type="button" class="x" data-unlink="ent:${e.id}" aria-label="Remove">×</button></span>`).join('')}
        ${freeEnts.length ? `<select data-link="ent" aria-label="Link an entity"><option value="">+ entity</option>${freeEnts.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>` : ''}
      </div>
    </li>`;
  }

  async function add(e) {
    e.preventDefault();
    const fm = e.target, claim = fm.claim.value.trim(), date = fm.date.value.trim();
    if (!claim) return fm.claim.focus();
    if (date && !PARTIAL_DATE.test(date)) { fm.date.classList.add('bad'); return fm.date.focus(); }
    await R.store.create('findings', { claim, confidence: fm.confidence.value, date, supportIds: [], contradictIds: [], entityIds: [] }, 'findings');
    fm.reset(); fm.date.classList.remove('bad');
    R.agent.desk?.do('write'); R.agent.desk?.say('Finding recorded. Back it with sources: two independent ones are best.');
    R.renderMain();
    setTimeout(() => $('#fd-new textarea', el)?.focus(), 30);
  }
  const byEl = t => S.findings.find(x => x.id === t.closest('[data-fd]')?.dataset.fd);

  async function onChange(e) {
    const x = byEl(e.target);
    if (!x) return;
    const link = e.target.dataset.link;
    if (link && e.target.value) {
      const key = { sup: 'supportIds', con: 'contradictIds', ent: 'entityIds' }[link];
      x[key] = [...new Set([...(x[key] || []), e.target.value])];
      await R.store.save('findings', x, 'findings');
      if (link === 'sup' && x.confidence === 'unverified' && x.supportIds.length >= 2) {
        R.agent.desk?.do('found'); R.agent.desk?.say('Two sources now back this. Ready to mark it Likely or Confirmed?');
      }
      return redraw(x.id);
    }
    if (e.target.dataset.field === 'confidence') { x.confidence = e.target.value; await R.store.save('findings', x, 'findings'); redraw(x.id); }
  }
  const saveField = debounce(async (x, k, v) => { x[k] = v; await R.store.save('findings', x, 'findings'); }, 450);
  function onInput(e) {
    const x = byEl(e.target), k = e.target.dataset.field;
    if (!x || !k || k === 'confidence') return;
    if (k === 'date') { const v = e.target.value.trim(); const bad = !!v && !PARTIAL_DATE.test(v); e.target.classList.toggle('bad', bad); if (!bad) saveField(x, k, v); return; }
    if (k === 'claim' && e.target.value.trim()) saveField(x, k, e.target.value.trim());
  }
  function redraw(id) {
    const li = $(`[data-fd="${id}"]`, el), x = S.findings.find(f2 => f2.id === id);
    if (li && x) li.outerHTML = card(x);
  }

  async function onClick(e) {
    const t = e.target;
    const cf = t.closest('[data-conf]');
    if (cf) { f().conf = cf.dataset.conf; R.saveUi(); $$('[data-conf]', el).forEach(b => b.classList.toggle('on', b === cf)); return drawList(); }
    const del = t.closest('[data-del]');
    if (del) {
      const x = S.findings.find(f2 => f2.id === del.dataset.del);
      if (x && await ask({ title: 'Delete this finding?', text: esc(x.claim.slice(0, 160)) })) { await R.store.removeAll({ findings: [x.id] }, 'findings'); R.renderMain(); }
      return;
    }
    const un = t.closest('[data-unlink]');
    if (un) {
      const x = byEl(un), [kind, id] = un.dataset.unlink.split(':'), key = { sup: 'supportIds', con: 'contradictIds', ent: 'entityIds' }[kind];
      x[key] = (x[key] || []).filter(i => i !== id);
      await R.store.save('findings', x, 'findings');
      return redraw(x.id);
    }
    const os = t.closest('[data-open-src]');
    if (os) return R.views.sources.openPanel(os.dataset.openSrc);
    const oe = t.closest('[data-open-ent]');
    if (oe) return R.openEntity(oe.dataset.openEnt);
  }

  function update(kind, id, from) {
    if (!el || !document.body.contains(el)) return false;
    if (from === 'findings') return true;
    if (['findings', 'sources', 'entities', 'external'].includes(kind)) { if (!el.contains(document.activeElement) || document.activeElement === document.body) R.renderMain(); return true; }
    return ['selection', 'inv', 'highlights', 'entityFields', 'nodes', 'edges', 'notes'].includes(kind);
  }

  return { render, update, evidence, focus: id => { focusId = id; if (el && document.body.contains(el)) drawList(); } };
})();
