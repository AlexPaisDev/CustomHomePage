/* =====================================================================
   AVALON RESEARCH — timeline
   Built automatically from everything dated in the investigation:
   entity dates (founded, born, events), facts whose value is a date,
   source publish dates and dated findings. Grouped by year; filter by
   kind; click an item to open it.
   ===================================================================== */
'use strict';

R.views.timeline = (() => {
  const KINDS = {
    event: { label: 'Entities & events', color: '#ffc857' },
    fact: { label: 'Facts', color: '#62e6f0' },
    source: { label: 'Sources', color: '#9a94c9' },
    finding: { label: 'Findings', color: '#6fdca0' },
  };
  let el = null;
  const f = () => (R.ui.timeline ||= { off: [], desc: false });

  /** Every dated thing in the investigation, as timeline items. */
  function items() {
    const out = [], seen = new Set();
    for (const e of S.entities) {
      if (!e.date || !PARTIAL_DATE.test(e.date)) continue;
      const verb = { person: 'born', organisation: 'founded', event: '', document: 'issued' }[e.kind] ?? '';
      out.push({ date: e.date, kind: 'event', title: verb ? `${e.name} ${verb}` : e.name, sub: (R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other).label, open: { entity: e.id } });
      seen.add(`${e.id}|${e.date}`);
    }
    for (const fd of S.entityFields) {
      const v = String(fd.value || '').trim(), e = S.entities.find(x => x.id === fd.entityId);
      if (!e || !PARTIAL_DATE.test(v) || seen.has(`${e.id}|${v}`)) continue;
      seen.add(`${e.id}|${v}`);
      out.push({ date: v, kind: 'fact', title: `${e.name}: ${fd.key}`, sub: (fd.sourceIds || []).length ? `cited by ${plural(fd.sourceIds.length, 'source')}` : 'no source cited', open: { entity: e.id } });
    }
    for (const s of S.sources) if (s.publishedAt && PARTIAL_DATE.test(s.publishedAt)) out.push({ date: s.publishedAt, kind: 'source', title: s.title || s.url, sub: [s.publisher || host(s.url), (R.SOURCE_TYPES[s.type] || R.SOURCE_TYPES.other).label].filter(Boolean).join(' · '), rel: s.reliability, open: { source: s.id } });
    for (const x of S.findings) if (x.date && PARTIAL_DATE.test(x.date)) out.push({ date: x.date, kind: 'finding', title: x.claim, sub: (R.CONFIDENCE[x.confidence] || R.CONFIDENCE.unverified).label, conf: x.confidence, open: { finding: x.id } });
    return out;
  }

  function render(root) {
    el = root;
    const o = f(), all = items();
    const shown = all.filter(i => !o.off.includes(i.kind)).sort((a, b) => o.desc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    const byYear = new Map();
    shown.forEach(i => { const y = i.date.slice(0, 4); byYear.set(y, [...(byYear.get(y) || []), i]); });
    const undated = S.sources.filter(s => !s.publishedAt).length + S.findings.filter(x => !x.date).length;
    el.innerHTML = `
      <header class="rx-head">
        <div><p class="rx-kicker">${icon('timeline')}Timeline</p><h1 class="rx-title">${esc(S.inv.title)}</h1></div>
        <div class="p-actions"><button class="btn btn-sm" data-act="order">${o.desc ? 'Newest first' : 'Oldest first'}</button></div>
      </header>
      <div class="tl-filters">
        ${Object.entries(KINDS).map(([k, x]) => `<button type="button" data-kind="${k}" class="${o.off.includes(k) ? '' : 'on'}" style="--c:${x.color}"><i></i>${x.label} <span>${all.filter(i => i.kind === k).length}</span></button>`).join('')}
      </div>
      ${shown.length ? `<div class="tl">${[...byYear].map(([y, list]) => `
        <section class="tl-year"><h2>${esc(y)}</h2>
          <ol>${list.map(i => `
            <li class="tl-item tl-${i.kind} ${i.conf ? `c-${i.conf}` : ''}" style="--c:${KINDS[i.kind].color}">
              <span class="tl-date">${esc(fmtDate(i.date).replace(/, \d{4}$|^\d{4}$| \d{4}$/, '') || '')}</span>
              <button type="button" class="tl-card" data-open='${esc(JSON.stringify(i.open))}'>
                <b>${esc(i.title)}</b>
                <small>${i.rel != null ? R.relBar(i.rel) : ''}${esc(i.sub || '')}</small>
              </button>
            </li>`).join('')}</ol>
        </section>`).join('')}</div>`
      : `<div class="rx-empty-big">${icon('timeline')}<p><b>Nothing dated yet.</b> The timeline fills itself from publish dates on sources, dates on entities and facts (founded, born, events), and dated findings.</p></div>`}
      ${undated ? `<p class="muted tl-note">${plural(undated, 'source or finding')} without a date ${undated === 1 ? 'is' : 'are'} not shown.</p>` : ''}`;
    el.addEventListener('click', onClick);
  }

  function onClick(e) {
    const t = e.target;
    if (t.closest('[data-act="order"]')) { f().desc = !f().desc; R.saveUi(); return R.renderMain(); }
    const k = t.closest('[data-kind]');
    if (k) { const o = f(); o.off = o.off.includes(k.dataset.kind) ? o.off.filter(x => x !== k.dataset.kind) : [...o.off, k.dataset.kind]; R.saveUi(); return R.renderMain(); }
    const c = t.closest('[data-open]');
    if (!c) return;
    const o = JSON.parse(c.dataset.open);
    if (o.entity) R.openEntity(o.entity);
    if (o.source) R.views.sources.openPanel(o.source);
    if (o.finding) { R.go(R.invHash(S.inv.id, 'findings')); setTimeout(() => R.views.findings.focus(o.finding), 60); }
  }

  function update(kind) {
    if (!el || !document.body.contains(el)) return false;
    if (['entities', 'entityFields', 'sources', 'findings', 'external'].includes(kind)) { R.renderMain(); return true; }
    return ['selection', 'inv', 'highlights', 'nodes', 'edges', 'notes', 'tasks'].includes(kind);
  }

  return { render, update, items };
})();
