/* =====================================================================
   AVALON RESEARCH — export and reporting
   - Report as Markdown (download or copy) or PDF (the browser's print
     dialog, "Save as PDF"): summary, findings, timeline, entities with
     their facts, open questions, notes and a numbered source list that
     findings and facts cite as [n].
   - Backup as JSON (optionally with uploaded files) and import of such a
     backup as a new investigation (all ids renewed, so it never clashes).
   - Board as PNG (drawn by the board view) and citations (cite.js).
   ===================================================================== */
'use strict';

R.exporter = (() => {
  const FORMAT = 'avalon-research', VERSION = 1;

  /* ---------- the report ---------- */
  function report() {
    const i = S.inv, t = R.TYPES[i.type] || R.TYPES.custom, st = R.STATUS[i.status] || R.STATUS.active;
    const sources = [...S.sources].sort((a, b) => (a.title || a.url || '').localeCompare(b.title || b.url || '', undefined, { sensitivity: 'base' }));
    const num = new Map(sources.map((s, n) => [s.id, n + 1]));
    const cite = ids => (ids || []).map(id => num.get(id)).filter(Boolean).sort((a, b) => a - b).map(n => `[${n}]`).join('');
    const flat = s => R.md.plainText(s).replace(/\n+/g, ' ');
    const L = [];
    L.push(`# ${i.title}`, '', `_${t.label} investigation · ${st.label}${i.tags.length ? ` · ${i.tags.map(x => `#${x}`).join(' ')}` : ''} · report of ${fmtDate(today())}_`, '');
    if (i.description) L.push(i.description, '');
    L.push('## Summary', '', i.summary?.trim() || '_No summary written yet._', '');

    L.push('## Findings', '');
    if (!S.findings.length) L.push('_No findings recorded._', '');
    for (const [k, c] of Object.entries(R.CONFIDENCE)) {
      const fs = S.findings.filter(f => f.confidence === k);
      if (!fs.length) continue;
      L.push(`### ${c.label}`, '');
      fs.forEach(f => {
        const about = (f.entityIds || []).map(id => S.entities.find(e => e.id === id)?.name).filter(Boolean);
        const parts = [f.date && fmtDate(f.date), cite(f.supportIds) && `supported by ${cite(f.supportIds)}`, cite(f.contradictIds) && `contradicted by ${cite(f.contradictIds)}`, about.length && `about ${about.join(', ')}`].filter(Boolean);
        L.push(`- ${f.claim}${parts.length ? ` — ${parts.join(' · ')}` : ''}`);
      });
      L.push('');
    }

    const tl = R.views.timeline.items().sort((a, b) => a.date.localeCompare(b.date));
    if (tl.length) {
      L.push('## Timeline', '');
      tl.forEach(x => L.push(`- **${fmtDate(x.date)}** — ${x.kind === 'finding' ? flat(x.title) : x.title}${x.kind === 'source' && x.open?.source ? ` ${cite([x.open.source])}` : ''}`));
      L.push('');
    }

    if (S.entities.length) {
      L.push('## Entities', '');
      for (const e of [...S.entities].sort((a, b) => a.name.localeCompare(b.name))) {
        const k = R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other;
        L.push(`### ${e.name} (${k.label})`, '');
        if (e.aliases?.length) L.push(`_Also known as ${e.aliases.join(', ')}_`, '');
        if (e.description) L.push(e.description, '');
        const fields = S.entityFields.filter(f => f.entityId === e.id);
        fields.forEach(f => L.push(`- **${f.key}:** ${f.value || '—'} ${cite(f.sourceIds)}`.trimEnd()));
        const links = R.entityLinks(e.id).edges.filter(x => x.other);
        links.forEach(x => {
          const other = x.other.type === 'entity' ? S.entities.find(y => y.id === x.other.refId)?.name : x.other.type === 'source' ? `${S.sources.find(y => y.id === x.other.refId)?.title || 'a source'} ${cite([x.other.refId])}` : flat(x.other.text || x.other.type);
          L.push(`- ${x.out ? `${e.name} → ${x.edge.label || 'connected to'} → ${other}` : `${other} → ${x.edge.label || 'connected to'} → ${e.name}`}`);
        });
        if (fields.length || links.length) L.push('');
      }
    }

    const open = S.tasks.filter(x => !['done', 'dropped'].includes(x.status));
    if (open.length) {
      L.push('## Open questions and leads', '');
      open.forEach(x => {
        const about = (x.entityIds || []).map(id => S.entities.find(e => e.id === id)?.name).filter(Boolean);
        L.push(`- [ ] ${(R.TASK_KINDS[x.kind] || R.TASK_KINDS.todo).label}: ${x.text}${about.length ? ` (${about.join(', ')})` : ''}${cite(x.sourceIds) ? ` ${cite(x.sourceIds)}` : ''}`);
      });
      L.push('');
    }

    if (S.notes.length) {
      L.push('## Notes', '');
      for (const n of [...S.notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        L.push(`### ${n.title || 'Untitled note'}`, '');
        // [[Entity]] → Entity, @[Source title] → Source title [n]
        L.push(String(n.body || '').replace(/^#{1,4}\s/gm, '#### ').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/@\[([^\]]+)\]/g, (_, ttl) => { const s = R.md.sourceByTitle(ttl); return s ? `${ttl} ${cite([s.id])}` : ttl; }), '');
      }
    }

    L.push('## Sources', '');
    if (!sources.length) L.push('_No sources._');
    sources.forEach((s, n) => {
      const meta = [s.author, s.publisher || host(s.url), fmtDate(s.publishedAt), (R.SOURCE_TYPES[s.type] || R.SOURCE_TYPES.other).label, `reliability: ${R.RELIABILITY[s.reliability]}`].filter(Boolean).join(' · ');
      L.push(`${n + 1}. ${s.url ? `[${(s.title || s.url).replace(/[[\]]/g, '')}](${s.url})` : `**${s.title || 'Untitled'}**`} — ${meta}${s.accessedAt ? ` · accessed ${fmtDate(s.accessedAt)}` : ''}`);
    });
    L.push('', '---', `_Exported from Avalon Research on ${fmtDate(today())}._`);
    return L.join('\n');
  }

  /** PDF: render the report into a print-only container and open the print dialog. */
  function print() {
    document.getElementById('rx-print')?.remove();
    const box = document.createElement('article');
    box.id = 'rx-print'; box.className = 'rx-print md';
    box.innerHTML = R.md.render(report());
    document.body.appendChild(box);
    const done = () => { box.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 60);
  }

  /* ---------- backup ---------- */
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  async function backup(withFiles) {
    const files = [];
    if (withFiles) for (const s of S.sources.filter(x => x.fileId)) {
      const f = await R.store.getFile(s.fileId).catch(() => null);
      if (f) files.push({ id: f.id, name: f.name, mime: f.mime, size: f.size, data: await toB64(f.blob) });
    }
    for (const n of S.nodes.filter(x => x.type === 'image' && withFiles)) {
      if (files.some(f => f.id === n.refId)) continue;
      const f = await R.store.getFile(n.refId).catch(() => null);
      if (f) files.push({ id: f.id, name: f.name, mime: f.mime, size: f.size, data: await toB64(f.blob) });
    }
    return {
      format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), app: 'Avalon Research',
      investigation: S.inv, sources: S.sources, highlights: S.highlights, nodes: S.nodes, edges: S.edges,
      notes: S.notes, findings: S.findings, tasks: S.tasks, entities: S.entities, entityFields: S.entityFields, files,
    };
  }

  /** Import a backup as a new investigation: every id is renewed and references are rewritten. */
  async function importBackup(data) {
    if (data?.format !== FORMAT || !data.investigation) throw new Error('This is not an Avalon Research backup');
    if (data.version > VERSION) throw new Error('This backup comes from a newer version of Avalon Research');
    const ids = new Map(), nid = old => { if (!old) return old; if (!ids.has(old)) ids.set(old, uid()); return ids.get(old); };
    const arr = k => Array.isArray(data[k]) ? data[k] : [];
    const t = new Date().toISOString();
    const inv = { ...data.investigation, id: nid(data.investigation.id), updatedAt: t };
    if (S.invs.some(x => x.title === inv.title)) inv.title = `${inv.title} (imported)`;
    const files = [];
    for (const f of arr('files')) {
      try {
        const bin = atob(f.data), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        files.push({ id: nid(f.id), name: f.name, mime: f.mime, size: f.size, blob: new Blob([bytes], { type: f.mime }), createdAt: t });
      } catch { }
    }
    const haveFile = new Set(files.map(f => f.id));
    const sources = arr('sources').map(s => ({ ...s, id: nid(s.id), investigationId: inv.id, fileId: s.fileId && haveFile.has(nid(s.fileId)) ? nid(s.fileId) : null }));
    const highlights = arr('highlights').map(h => ({ ...h, id: nid(h.id), sourceId: nid(h.sourceId), investigationId: inv.id }));
    const entities = arr('entities').map(e => ({ ...e, id: nid(e.id), investigationIds: [inv.id] }));
    const entityFields = arr('entityFields').map(f => ({ ...f, id: nid(f.id), entityId: nid(f.entityId), sourceIds: (f.sourceIds || []).map(nid) }));
    const nodes = arr('nodes').filter(n => n.type !== 'image' || haveFile.has(nid(n.refId))).map(n => ({ ...n, id: nid(n.id), investigationId: inv.id, refId: n.refId ? nid(n.refId) : null }));
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = arr('edges').map(e => ({ ...e, id: nid(e.id), investigationId: inv.id, fromNodeId: nid(e.fromNodeId), toNodeId: nid(e.toNodeId) })).filter(e => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId));
    const notes = arr('notes').map(n => ({ ...n, id: nid(n.id), investigationId: inv.id }));
    const findings = arr('findings').map(f => ({ ...f, id: nid(f.id), investigationId: inv.id, supportIds: (f.supportIds || []).map(nid), contradictIds: (f.contradictIds || []).map(nid), entityIds: (f.entityIds || []).map(nid) }));
    const tasks = arr('tasks').map(x => ({ ...x, id: nid(x.id), investigationId: inv.id, entityIds: (x.entityIds || []).map(nid), sourceIds: (x.sourceIds || []).map(nid) }));
    if (files.length && R.db.mode !== 'idb') throw new Error('This backup has files, and uploads need IndexedDB, which this browser blocked here');
    await R.db.batch({ put: { investigations: [inv], sources, highlights, entities, entityFields, nodes, edges, notes, findings, tasks, ...(files.length ? { files } : {}) } });
    S.invs.push(inv);
    R.store.emit('invs', inv.id);
    return { inv, counts: { sources: sources.length, entities: entities.length, findings: findings.length, notes: notes.length } };
  }
  async function importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const { inv, counts } = await importBackup(data);
      toast(`Imported <b>${esc(inv.title)}</b>: ${plural(counts.sources, 'source')}, ${plural(counts.entities, 'entity').replace('entitys', 'entities')}.`);
      R.agent.desk?.do('found'); R.agent.desk?.say(`Case files restored: “${inv.title}”.`);
      R.go(R.invHash(inv.id));
    } catch (e) { toast(esc(e.message || 'Could not read that file'), 'err'); }
  }

  /* ---------- the export dialog ---------- */
  const dlg = $('#exp-dlg');
  function open() {
    if (!S.inv) return;
    const nFiles = S.sources.filter(s => s.fileId).length + S.nodes.filter(n => n.type === 'image').length;
    $('#exp-title').textContent = `Export “${S.inv.title}”`;
    $('#exp-files').closest('label').hidden = !nFiles;
    $('#exp-files-n').textContent = nFiles ? `(${plural(nFiles, 'file')})` : '';
    $('#exp-files').checked = nFiles > 0;
    $('#exp-png').disabled = !S.nodes.length;
    dlg.showModal();
  }
  dlg.addEventListener('click', async e => {
    const a = e.target.closest('[data-exp]')?.dataset.exp;
    if (!a) return;
    const name = slug(S.inv.title);
    if (a === 'md') { download(`${name}-report.md`, report(), 'text/markdown'); R.agent.desk?.do('write'); R.agent.desk?.say('Report written up.'); }
    if (a === 'copy') { if (await copyText(report())) toast('Report copied as Markdown.'); }
    if (a === 'pdf') { dlg.close(); print(); }
    if (a === 'json') {
      const data = await backup($('#exp-files').checked);
      download(`${name}.avalon-research.json`, JSON.stringify(data, null, 1), 'application/json');
      toast('Backup saved.');
    }
    if (a === 'png') { dlg.close(); R.views.board.exportPng(); }
    if (a === 'cite') { dlg.close(); R.cite.open(); }
  });
  // import from the home screen (and the welcome screen)
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json,.json'; input.hidden = true;
  document.body.appendChild(input);
  input.addEventListener('change', () => { const f = input.files[0]; input.value = ''; if (f) importFile(f); });

  return { report, print, backup, importBackup, open, pickImport: () => input.click() };
})();
