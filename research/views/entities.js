/* =====================================================================
   AVALON RESEARCH — entities
   The people, organisations, places, events and documents of an
   investigation. Entities can belong to several investigations.
   "Mentioned but not filed" suggests new entities found in the work:
   [[names]] in notes that don't exist yet, and names inside facts
   (a CEO, a parent company, a headquarters city…). Accepting one creates
   it and, when its relative is on the board, puts it there connected.
   ===================================================================== */
'use strict';

R.views.entities = (() => {
  let el = null;
  const f = () => (R.ui.entities ||= { kind: '', q: '' });
  // fact key → [kind of the new entity, connection label, direction]
  // 'to-parent': new → parent ("CEO of"); 'from-parent': parent → new ("based in")
  const RELATIONS = {
    'ceo': ['person', 'CEO of', 'to-parent'], 'chair': ['person', 'chair of', 'to-parent'], 'founded by': ['person', 'founded', 'to-parent'],
    'parent': ['organisation', 'parent of', 'to-parent'], 'parent company': ['organisation', 'parent of', 'to-parent'],
    'subsidiaries': ['organisation', 'subsidiary of', 'to-parent'], 'employer': ['organisation', 'works at', 'from-parent'],
    'educated at': ['organisation', 'studied at', 'from-parent'], 'education': ['organisation', 'studied at', 'from-parent'],
    'headquarters': ['place', 'headquartered in', 'from-parent'], 'birthplace': ['place', 'born in', 'from-parent'],
    'stock exchange': ['organisation', 'listed on', 'from-parent'], 'location': ['place', 'located in', 'from-parent'],
  };
  const norm = s => String(s || '').trim().toLowerCase();
  const exists = name => S.entities.some(e => norm(e.name) === norm(name) || (e.aliases || []).some(a => norm(a) === norm(name)));

  function suggestions() {
    const out = new Map();
    for (const n of S.notes) for (const name of R.md.mentions(n.body)) {
      if (!exists(name) && !out.has(norm(name))) out.set(norm(name), { name, kind: 'other', why: `mentioned in “${n.title || 'a note'}”` });
    }
    for (const fd of S.entityFields) {
      const rel = RELATIONS[norm(fd.key)], parent = S.entities.find(e => e.id === fd.entityId);
      if (!rel || !parent) continue;
      for (const v of String(fd.value || '').split(/\s*,\s*/).filter(x => x && x.length < 80 && !/^https?:/i.test(x) && !PARTIAL_DATE.test(x))) {
        if (exists(v) || out.has(norm(v))) continue;
        out.set(norm(v), { name: v, kind: rel[0], why: `${fd.key} of ${parent.name}`, parent: parent.id, label: rel[1], dir: rel[2], cite: fd.sourceIds || [] });
      }
    }
    return [...out.values()].slice(0, 12);
  }

  function render(root) {
    el = root;
    const o = f(), q = o.q.trim().toLowerCase();
    const list = S.entities.filter(e => (!o.kind || e.kind === o.kind) && (!q || [e.name, ...(e.aliases || []), e.description].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    const sugg = suggestions();
    el.innerHTML = `
      <header class="rx-head">
        <div><p class="rx-kicker">${icon('users')}Entities</p><h1 class="rx-title">${esc(S.inv.title)}</h1></div>
        <div class="p-actions">
          <button class="btn btn-sm" data-act="link" title="Bring in an entity from another investigation">${icon('link')}From another case</button>
        </div>
      </header>
      <form class="en-new" id="en-new" autocomplete="off">
        <select name="kind" aria-label="Kind">${Object.entries(R.ENTITY_KINDS).map(([k, x]) => `<option value="${k}">${x.label}</option>`).join('')}</select>
        <input name="name" placeholder="Add a person, organisation, place, event…" required maxlength="120" aria-label="Name">
        <button class="btn btn-gold">${icon('plus')}Add</button>
      </form>
      ${sugg.length ? `<section class="en-sugg">
        <h2>${icon('search')}Mentioned but not filed <span>${sugg.length}</span></h2>
        <ul>${sugg.map((s, i) => `<li><span class="en-sugg-ic" style="--c:${(R.ENTITY_KINDS[s.kind] || R.ENTITY_KINDS.other).color}">${icon((R.ENTITY_KINDS[s.kind] || R.ENTITY_KINDS.other).icon)}</span>
          <span class="en-sugg-t"><b>${esc(s.name)}</b><small>${esc(s.why)}</small></span>
          <button class="btn btn-sm" data-sugg="${i}">${icon('plus')}Add</button></li>`).join('')}</ul>
      </section>` : ''}
      <div class="rx-toolbar">
        <label class="rx-search">${icon('search')}<input type="search" data-filter name="q" value="${esc(o.q)}" placeholder="Search entities" aria-label="Search entities"></label>
        <div class="fd-filters">
          <button type="button" data-kind="" class="${!o.kind ? 'on' : ''}">All <span>${S.entities.length}</span></button>
          ${Object.entries(R.ENTITY_KINDS).filter(([k]) => S.entities.some(e => e.kind === k)).map(([k, x]) => `<button type="button" data-kind="${k}" class="${o.kind === k ? 'on' : ''}">${x.label} <span>${S.entities.filter(e => e.kind === k).length}</span></button>`).join('')}
        </div>
      </div>
      ${list.length ? `<ul class="en-grid">${list.map(card).join('')}</ul>`
        : `<div class="rx-empty-big">${icon('users')}<p>${S.entities.length ? 'No entity matches.' : '<b>No entities yet.</b> Add the people, companies, places and events this case is about. Each one can hold facts that cite their sources, and appear on the board.'}</p></div>`}`;
    window.__enSugg = sugg;
    $('#en-new', el).addEventListener('submit', add);
    $('[name="q"]', el).addEventListener('input', e => { f().q = e.target.value; R.saveUi(); R.renderMain(); setTimeout(() => { const i = $('[name="q"]', $('#rx-main')); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); });
    el.addEventListener('click', onClick);
  }

  function card(e) {
    const k = R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other, L = R.entityLinks(e.id);
    const facts = S.entityFields.filter(x => x.entityId === e.id).length, onBoard = S.nodes.some(n => n.type === 'entity' && n.refId === e.id);
    const others = (e.investigationIds || []).filter(i => i !== S.inv.id).length;
    return `<li><button class="en-card" data-ent="${e.id}" style="--c:${k.color}">
      <span class="en-top">${icon(k.icon)}<small>${esc(k.label)}${e.date ? ` · ${esc(fmtDate(e.date))}` : ''}</small>${onBoard ? `<i title="On the board">${icon('board')}</i>` : ''}</span>
      <b>${esc(e.name)}</b>
      ${e.description ? `<p>${esc(e.description)}</p>` : ''}
      <span class="en-stats"><span>${plural(facts, 'fact')}</span><span>${plural(L.sources.length, 'source')}</span>${L.edges.length ? `<span>${plural(L.edges.length, 'link')}</span>` : ''}${others ? `<span class="gold">+${others} case${others > 1 ? 's' : ''}</span>` : ''}</span>
    </button>${onBoard ? '' : `<button class="en-board" data-to-board="${e.id}" title="Put on the board">${icon('board')}</button>`}</li>`;
  }

  async function add(ev) {
    ev.preventDefault();
    const fm = ev.target, name = fm.name.value.trim();
    if (!name) return;
    if (exists(name)) { toast(`<b>${esc(name)}</b> is already an entity here.`, 'err'); return; }
    const e = await R.store.create('entities', { kind: fm.kind.value, name, description: '', aliases: [], date: '' }, 'entities');
    R.agent.desk?.do('write'); R.agent.desk?.say(`${(R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other).label} “${name}” filed.`);
    R.renderMain();
    R.openEntity(e.id);
    setTimeout(() => $('#en-new input[name="name"]', $('#rx-main'))?.focus(), 30);
  }

  /** Put an entity's card on the board, to the right of what is there (or next to a given node). */
  async function toBoard(entityId, near = null) {
    const [w, h] = [220, 80];
    let x = 0, y = 0;
    if (near) { x = near.x + near.w + 80; y = near.y + (S.nodes.filter(n => n.x > near.x + near.w && Math.abs(n.y - near.y) < 400).length) * 100; }
    else if (S.nodes.length) { x = Math.max(...S.nodes.map(n => n.x + n.w)) + 60; y = Math.min(...S.nodes.map(n => n.y)); }
    return R.store.create('nodes', { type: 'entity', refId: entityId, text: '', color: '', x: Math.round(x), y: Math.round(y), w, h, z: Date.now() % 1e9 }, 'entities');
  }

  async function accept(s) {
    const e = await R.store.create('entities', { kind: s.kind, name: s.name, description: '', aliases: [], date: '' }, 'entities');
    let note = '';
    if (s.parent) {
      const pn = S.nodes.find(n => n.type === 'entity' && n.refId === s.parent);
      if (pn) {
        const nn = await toBoard(e.id, pn);
        const [from, to] = s.dir === 'to-parent' ? [nn.id, pn.id] : [pn.id, nn.id];
        await R.store.create('edges', { fromNodeId: from, toNodeId: to, label: s.label, color: '', directed: true }, 'entities');
        note = ' and connected on the board';
      }
    }
    toast(`Added <b>${esc(s.name)}</b>${note}.`);
    R.agent.desk?.do('found'); R.agent.desk?.say(`New ${(R.ENTITY_KINDS[s.kind] || R.ENTITY_KINDS.other).label.toLowerCase()} on file: “${s.name}”${note}.`);
    R.renderMain();
  }

  async function linkPicker() {
    const all = await R.db.all('entities');
    const others = all.filter(e => !(e.investigationIds || []).includes(S.inv.id));
    if (!others.length) return toast('No entities in other investigations yet.');
    const dlg = $('#pick-dlg');
    $('#pick-title').textContent = 'Bring in an entity from another case';
    $('#pick-list').innerHTML = others.sort((a, b) => a.name.localeCompare(b.name)).map(e => {
      const k = R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other, cases = (e.investigationIds || []).map(i => S.invs.find(v => v.id === i)?.title).filter(Boolean);
      return `<li><button type="button" data-pick="${e.id}">${icon(k.icon)}<span><b>${esc(e.name)}</b><small>${esc(k.label)} · ${esc(cases.join(', '))}</small></span></button></li>`;
    }).join('');
    $('#pick-filter').value = '';
    $('#pick-filter').oninput = () => { const q = $('#pick-filter').value.toLowerCase(); $$('#pick-list li').forEach(li => { li.hidden = !li.textContent.toLowerCase().includes(q); }); };
    dlg.showModal();
    $('#pick-filter').focus();
    $('#pick-list').onclick = async ev => {
      const b = ev.target.closest('[data-pick]');
      if (!b) return;
      dlg.close();
      const e = others.find(x => x.id === b.dataset.pick);
      e.investigationIds = [...new Set([...(e.investigationIds || []), S.inv.id])];
      await R.store.save('entities', e, 'entities');
      S.entityFields.push(...(await R.db.where('entityFields', 'entityId', e.id)).filter(x => !S.entityFields.some(y => y.id === x.id)));
      toast(`<b>${esc(e.name)}</b> now belongs to this investigation too.`);
      R.renderMain(); R.openEntity(e.id);
    };
  }

  async function onClick(ev) {
    const t = ev.target;
    if (t.closest('[data-act="link"]')) return linkPicker();
    const k = t.closest('[data-kind]');
    if (k) { f().kind = k.dataset.kind; R.saveUi(); return R.renderMain(); }
    const sg = t.closest('[data-sugg]');
    if (sg) { sg.disabled = true; return accept(window.__enSugg[+sg.dataset.sugg]); }
    const tb = t.closest('[data-to-board]');
    if (tb) { await toBoard(tb.dataset.toBoard); toast('Put on the board.'); return R.renderMain(); }
    const c = t.closest('[data-ent]');
    if (c) R.openEntity(c.dataset.ent);
  }

  function update(kind, id, from) {
    if (!el || !document.body.contains(el)) return false;
    if (from === 'entities') return true;
    if (['entities', 'entityFields', 'nodes', 'edges', 'notes', 'sources', 'external'].includes(kind)) {
      if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || !el.contains(document.activeElement)) R.renderMain();
      return true;
    }
    return ['selection', 'inv', 'highlights', 'findings', 'tasks'].includes(kind);
  }

  return { render, update, toBoard };
})();
