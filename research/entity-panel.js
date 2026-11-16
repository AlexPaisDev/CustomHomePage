/* =====================================================================
   AVALON RESEARCH — entity details panel
   Opened from the board, the Entities list, notes ([[Name]]) and the
   timeline. Shows and edits everything known about one entity:
   name, kind, date, aliases, description, key/value fields that each cite
   the sources backing them, its connections on the board, the sources
   and notes linked to it, and the other investigations it appears in.
   "Fill from Wikidata" adds facts as fields, citing the Wikidata page.
   ===================================================================== */
'use strict';

(() => {
  const SUGGEST = {
    organisation: ['Legal name', 'Founded', 'NIF / VAT', 'LEI', 'Headquarters', 'CEO', 'Chair', 'Website', 'Industry', 'Employees', 'Revenue', 'Parent company', 'Stock ticker'],
    person: ['Role', 'Employer', 'Born', 'Nationality', 'Education', 'Email', 'Phone', 'LinkedIn', 'Website'],
    place: ['Address', 'City', 'Country', 'Coordinates'],
    event: ['Date', 'Location', 'Outcome'],
    document: ['Author', 'Issued by', 'Date', 'Reference'],
    other: ['Notes', 'Website'],
  };
  const ent = id => S.entities.find(e => e.id === id);
  const fieldsOf = id => S.entityFields.filter(f => f.entityId === id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
  const nodesOf = id => S.nodes.filter(n => n.type === 'entity' && n.refId === id);
  const nodeTitle = n => !n ? '?' : n.type === 'entity' ? S.entities.find(e => e.id === n.refId)?.name || 'Entity'
    : n.type === 'source' ? S.sources.find(s => s.id === n.refId)?.title || 'Source' : n.type === 'note' ? (n.text || 'Note').split('\n')[0].slice(0, 50) : n.text || n.type;

  /** Everything that points at this entity, gathered from the board, fields, notes and findings. */
  function links(id) {
    const e = ent(id), mine = new Set(nodesOf(id).map(n => n.id));
    const edges = S.edges.filter(x => mine.has(x.fromNodeId) || mine.has(x.toNodeId)).map(x => {
      const out = mine.has(x.fromNodeId), other = S.nodes.find(n => n.id === (out ? x.toNodeId : x.fromNodeId));
      return { edge: x, out, other };
    });
    const srcIds = new Set();
    edges.forEach(l => { if (l.other?.type === 'source') srcIds.add(l.other.refId); });
    fieldsOf(id).forEach(f => (f.sourceIds || []).forEach(s => srcIds.add(s)));
    const names = [e.name, ...(e.aliases || [])].filter(Boolean).map(n => n.toLowerCase());
    const mentions = txt => names.some(n => String(txt || '').toLowerCase().includes(`[[${n}]]`));
    const notes = S.notes.filter(n => mentions(n.body));
    const stickies = edges.filter(l => l.other?.type === 'note').map(l => l.other);
    const findings = S.findings.filter(f => (f.entityIds || []).includes(id));
    return { edges, sources: [...srcIds].map(s => S.sources.find(x => x.id === s)).filter(Boolean), notes, stickies, findings };
  }

  function render(body, id, opts = {}) {
    const e = ent(id);
    if (!e) return R.panel.close();
    const k = R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other, L = links(id), fields = fieldsOf(id);
    const others = (e.investigationIds || []).filter(i => i !== S.inv.id).map(i => S.invs.find(v => v.id === i)).filter(Boolean);
    const linkable = S.invs.filter(i => !(e.investigationIds || []).includes(i.id));
    body.innerHTML = `
      <header class="rx-pane-head">
        <span class="rx-kicker" style="--c:${k.color}">${icon(k.icon)}${esc(k.label)}</span>
        <button class="icon-btn sm" data-act="close" title="Close (Esc)" aria-label="Close">${icon('x')}</button>
      </header>
      <form class="rx-pane" id="ent-form" autocomplete="off">
        <textarea class="rx-pane-title" name="name" rows="1" placeholder="Name">${esc(e.name)}</textarea>
        <div class="rx-pane-grid">
          <label class="field"><span>Kind</span><select name="kind">${Object.entries(R.ENTITY_KINDS).map(([kk, x]) => `<option value="${kk}" ${kk === e.kind ? 'selected' : ''}>${x.label}</option>`).join('')}</select></label>
          <label class="field"><span>${e.kind === 'person' ? 'Born' : e.kind === 'organisation' ? 'Founded' : 'Date'}</span><input name="date" value="${esc(e.date || '')}" placeholder="YYYY, YYYY-MM or YYYY-MM-DD"></label>
        </div>
        <label class="field"><span>Also known as</span><input name="aliases" value="${esc((e.aliases || []).join(', '))}" placeholder="Other names, comma separated"></label>
        <label class="field"><span>Description</span><textarea name="description" rows="3" placeholder="Who or what this is, in a sentence or two">${esc(e.description || '')}</textarea></label>
        <p class="rx-pane-saved" id="ent-saved" aria-live="polite"></p>
      </form>

      <section class="rx-hl">
        <h3>${icon('list')}Facts <span>${fields.length || ''}</span>
          <button class="link-btn rx-h3-act" data-act="wikidata" title="Look this name up on Wikidata and add its facts, citing the Wikidata page">Fill from Wikidata</button></h3>
        <ul class="ef-list">${fields.map(f => fieldRow(f)).join('')}</ul>
        <form class="ef-add" id="ef-add">
          <input name="key" list="ef-keys" placeholder="Field, e.g. ${esc((SUGGEST[e.kind] || SUGGEST.other)[0])}" required maxlength="60">
          <input name="value" placeholder="Value" maxlength="500">
          <button class="icon-btn sm bordered" title="Add fact">${icon('plus')}</button>
          <datalist id="ef-keys">${(SUGGEST[e.kind] || SUGGEST.other).map(x => `<option value="${esc(x)}">`).join('')}</datalist>
        </form>
      </section>

      ${L.edges.length ? `<section class="rx-hl"><h3>${icon('board')}Connections <span>${L.edges.length}</span></h3>
        <ul class="rx-links">${L.edges.map(l => `<li><button data-node="${l.other?.id || ''}">
          <span class="rx-link-dir">${l.out ? '→' : '←'}</span><i>${esc(l.edge.label || 'connected to')}</i><b>${esc(nodeTitle(l.other))}</b></button></li>`).join('')}</ul></section>` : ''}

      <section class="rx-hl"><h3>${icon('link')}Sources <span>${L.sources.length || ''}</span></h3>
        ${L.sources.length ? `<ul class="rx-links">${L.sources.map(s => `<li><button data-src="${s.id}">${R.relBar(s.reliability)}<b>${esc(s.title || s.url)}</b></button></li>`).join('')}</ul>`
        : '<p class="rx-pane-hint">Connect source cards to it on the board, or cite sources in its facts.</p>'}
      </section>

      ${L.notes.length || L.stickies.length || L.findings.length ? `<section class="rx-hl"><h3>${icon('pen')}Notes and findings</h3>
        <ul class="rx-links">
          ${L.notes.map(n => `<li><button data-note="${n.id}">${icon('pen')}<b>${esc(n.title || 'Untitled note')}</b></button></li>`).join('')}
          ${L.findings.map(f => `<li><button data-finding="${f.id}">${icon('check')}<b>${esc(f.claim)}</b></button></li>`).join('')}
          ${L.stickies.map(n => `<li><button data-node="${n.id}">${icon('sticky')}<b>${esc((n.text || 'Sticky note').slice(0, 80))}</b></button></li>`).join('')}
        </ul></section>` : ''}

      <section class="rx-hl"><h3>${icon('research')}Investigations</h3>
        <ul class="rx-links"><li><span class="rx-link-cur">${esc(S.inv.title)} <small>this one</small></span></li>
          ${others.map(i => `<li><a href="${R.invHash(i.id, 'entities')}">${icon((R.TYPES[i.type] || R.TYPES.custom).icon)}<b>${esc(i.title)}</b></a></li>`).join('')}</ul>
        ${linkable.length ? `<div class="row ent-link"><select id="ent-link-sel" aria-label="Investigation"><option value="">Add to another investigation…</option>${linkable.map(i => `<option value="${i.id}">${esc(i.title)}</option>`).join('')}</select></div>` : ''}
      </section>

      <footer class="rx-pane-foot">
        <small>${nodesOf(id).length ? `On the board${nodesOf(id).length > 1 ? ` ${nodesOf(id).length}×` : ''}` : 'Not on the board'}</small>
        <button class="btn btn-sm btn-danger-ghost" data-act="delete">${icon('trash')}${others.length ? 'Remove from this case' : 'Delete entity'}</button>
      </footer>`;

    // core fields autosave
    const form = $('#ent-form', body), saved = $('#ent-saved', body), patch = {};
    const commit = debounce(async () => {
      if (!Object.keys(patch).length) return;
      Object.assign(e, patch); for (const kk in patch) delete patch[kk];
      await R.store.save('entities', e, 'panel');
      saved.textContent = 'Saved';
    }, 400);
    form.addEventListener('input', ev => {
      const n = ev.target.name; if (!n) return;
      let v = ev.target.value;
      if (n === 'date') { v = v.trim(); ev.target.classList.toggle('bad', !!v && !PARTIAL_DATE.test(v)); if (v && !PARTIAL_DATE.test(v)) return; }
      if (n === 'aliases') v = v.split(',').map(x => x.trim()).filter(Boolean);
      if (n === 'name') v = v.replace(/\s*\n\s*/g, ' ');
      patch[n] = v; saved.textContent = 'Editing…'; commit();
    });
    form.addEventListener('change', ev => { if (ev.target.name === 'kind') commit.flush(); setTimeout(() => ev.target.name === 'kind' && R.panel.refresh(), 450); });
    form.addEventListener('focusout', () => commit.flush());
    form.addEventListener('submit', ev => ev.preventDefault());
    if (opts.focus) setTimeout(() => form.name.focus(), 50);

    // facts
    $('#ef-add', body).addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = ev.target, key = f.key.value.trim();
      if (!key) return;
      await R.store.create('entityFields', { entityId: id, key, value: f.value.value.trim(), sourceIds: [], order: fields.length }, 'panel');
      R.panel.refresh();
      $('#ef-add input[name="key"]', body)?.focus();
    });
    body.onchange = async ev => {
      const ef = ev.target.closest('[data-field]');
      if (ef && ev.target.matches('select.ef-cite') && ev.target.value) {
        const f = S.entityFields.find(x => x.id === ef.dataset.field);
        f.sourceIds = [...new Set([...(f.sourceIds || []), ev.target.value])];
        await R.store.save('entityFields', f, 'panel'); R.panel.refresh();
      }
      if (ev.target.id === 'ent-link-sel' && ev.target.value) {
        e.investigationIds = [...new Set([...(e.investigationIds || []), ev.target.value])];
        await R.store.save('entities', e, 'panel'); toast('Linked to the other investigation.'); R.panel.refresh();
      }
    };
    body.oninput = debounce(async ev => {
      const ef = ev.target.closest('[data-field]');
      if (!ef || !ev.target.matches('.ef-k, .ef-v')) return;
      const f = S.entityFields.find(x => x.id === ef.dataset.field);
      f[ev.target.matches('.ef-k') ? 'key' : 'value'] = ev.target.value.trim();
      await R.store.save('entityFields', f, 'panel');
    }, 400);
    body.onclick = async ev => {
      const t = ev.target, act = t.closest('[data-act]')?.dataset.act;
      if (act === 'close') return R.panel.close();
      if (act === 'delete') return remove(e, others.length);
      if (act === 'wikidata') return fillFromWikidata(e, t.closest('[data-act]'));
      const uncite = t.closest('[data-uncite]');
      if (uncite) {
        const f = S.entityFields.find(x => x.id === uncite.closest('[data-field]').dataset.field);
        f.sourceIds = (f.sourceIds || []).filter(s => s !== uncite.dataset.uncite);
        await R.store.save('entityFields', f, 'panel'); return R.panel.refresh();
      }
      const delF = t.closest('[data-del-field]');
      if (delF) { await R.store.removeAll({ entityFields: [delF.dataset.delField] }, 'panel'); return R.panel.refresh(); }
      const nd = t.closest('[data-node]');
      if (nd?.dataset.node) { R.go(R.invHash(S.inv.id, 'board')); setTimeout(() => R.views.board.focusNode?.(nd.dataset.node), 60); return; }
      const sb = t.closest('[data-src]');
      if (sb) return R.views.sources.openPanel(sb.dataset.src);
      const nb = t.closest('[data-note]');
      if (nb) { R.go(R.invHash(S.inv.id, 'notes')); setTimeout(() => R.views.notes?.open?.(nb.dataset.note), 60); return; }
      const fb = t.closest('[data-finding]');
      if (fb) { R.go(R.invHash(S.inv.id, 'findings')); setTimeout(() => R.views.findings?.focus?.(fb.dataset.finding), 60); }
    };
  }

  function fieldRow(f) {
    const cited = (f.sourceIds || []).map(s => S.sources.find(x => x.id === s)).filter(Boolean);
    const free = S.sources.filter(s => !(f.sourceIds || []).includes(s.id));
    return `<li class="ef" data-field="${f.id}">
      <div class="ef-kv"><input class="ef-k" value="${esc(f.key)}" aria-label="Field"><input class="ef-v" value="${esc(f.value)}" placeholder="—" aria-label="Value">
        <button class="icon-btn sm" data-del-field="${f.id}" title="Remove fact">${icon('x')}</button></div>
      <div class="ef-cites">
        ${cited.map(s => `<span class="ef-cite" title="${esc(s.title)}">${R.relBar(s.reliability)}${esc((s.title || s.url || '').slice(0, 34))}<button data-uncite="${s.id}" aria-label="Remove citation">×</button></span>`).join('')}
        ${free.length ? `<select class="ef-cite" aria-label="Cite a source"><option value="">${cited.length ? '+ cite' : 'Cite a source…'}</option>${free.map(s => `<option value="${s.id}">${esc((s.title || s.url || '').slice(0, 60))}</option>`).join('')}</select>` : cited.length ? '' : '<small>No sources yet to cite</small>'}
      </div>
    </li>`;
  }

  async function remove(e, shared) {
    const ok = await ask({
      title: shared ? `Remove “${e.name}” from this case?` : `Delete “${e.name}”?`,
      text: shared ? 'It stays in the other investigations. Its cards on this board go.' : 'Its facts and its cards on the board go too. This can\'t be undone.',
      ok: shared ? 'Remove' : 'Delete',
    });
    if (!ok) return;
    const nodes = nodesOf(e.id).map(n => n.id);
    const edges = S.edges.filter(x => nodes.includes(x.fromNodeId) || nodes.includes(x.toNodeId)).map(x => x.id);
    R.panel.close();
    if (shared) {
      e.investigationIds = e.investigationIds.filter(i => i !== S.inv.id);
      await R.store.save('entities', e);
      S.entities = S.entities.filter(x => x.id !== e.id);
      await R.store.removeAll({ nodes, edges });
    } else {
      await R.store.removeAll({ nodes, edges, entityFields: fieldsOf(e.id).map(f => f.id), entities: [e.id] });
      S.findings.forEach(f => { if ((f.entityIds || []).includes(e.id)) f.entityIds = f.entityIds.filter(i => i !== e.id); });
      S.tasks.forEach(t => { if ((t.entityIds || []).includes(e.id)) t.entityIds = t.entityIds.filter(i => i !== e.id); });
    }
    toast(shared ? 'Removed from this investigation.' : 'Entity deleted.');
  }

  /** Look the entity up on Wikidata and add its facts, each citing the Wikidata page (saved as a source). */
  async function fillFromWikidata(e, btn) {
    const AS = window.AvalonSearch;
    if (!AS) return;
    btn.disabled = true; btn.textContent = 'Looking it up…';
    R.agent.desk?.do('search', { hold: true }); R.agent.desk?.say(`Checking Wikidata for “${e.name}”…`);
    try {
      const L = AS.config.wikiLang;
      const d = await AS.getJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(e.name)}&language=${L}&uselang=${L}&limit=1&format=json&origin=*`);
      const hit = d.search?.[0];
      if (!hit) throw new Error('nothing on Wikidata by that name');
      const facts = await AS.wikidataFacts(hit.id, L);
      let src = S.sources.find(s => s.normUrl === normUrl(facts.url));
      if (!src) src = await R.store.addSource({ url: facts.url, title: `${facts.title} — Wikidata`, publisher: 'Wikidata', type: 'website', reliability: 3, origin: 'search', foundBy: ['Wikidata'], snippet: facts.text });
      const have = new Set(fieldsOf(e.id).map(f => f.key.toLowerCase()));
      const add = facts.facts.filter(f => f.value && !have.has(f.label.toLowerCase()));
      let order = fieldsOf(e.id).length;
      for (const f of add) await R.store.create('entityFields', { entityId: e.id, key: f.label, value: f.value, sourceIds: [src.id], order: order++ }, 'panel');
      if (!e.description && facts.text) { e.description = facts.text; await R.store.save('entities', e, 'panel'); }
      R.agent.desk?.do('found'); R.agent.desk?.say(add.length ? `Added ${plural(add.length, 'fact')} from Wikidata (${hit.id}), each citing it.` : 'Wikidata had nothing new.');
      toast(add.length ? `Added ${plural(add.length, 'fact')} from Wikidata.` : 'No new facts on Wikidata.');
    } catch (err) {
      R.agent.desk?.do('think'); R.agent.desk?.mood('warn', 4000); R.agent.desk?.say(`Wikidata: ${err.message}.`);
      toast(`Wikidata: ${esc(err.message)}`, 'err');
    }
    R.panel.refresh();
  }

  R.openEntity = (id, opts = {}) => {
    if (!ent(id)) return;
    R.panel.open(`entity:${id}`, body => render(body, id, opts));
    R.store.emit('selection');
  };
  R.entityLinks = links;
})();
