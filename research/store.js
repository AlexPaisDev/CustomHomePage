/* =====================================================================
   AVALON RESEARCH — in-memory model
   Holds the investigation list and the open investigation's records.
   Every change is written to R.db straight away, then announced with
   R.store.emit(kind, id, from) so views can re-render. Other tabs hear
   about it through a BroadcastChannel and reload.
   ===================================================================== */
'use strict';

R.store = (() => {
  const S = { invs: [], inv: null, sources: [], highlights: [] };
  const subs = new Set();
  let chan = null;
  try { chan = new BroadcastChannel('avalon_research'); } catch { }

  const now = () => new Date().toISOString();
  function emit(kind, id = null, from = '') {
    subs.forEach(f => { try { f(kind, id, from); } catch (e) { console.error(e); } });
  }
  const tell = invId => { try { chan?.postMessage({ inv: invId }); } catch { } };

  async function boot() {
    S.invs = await R.db.all('investigations');
    chan && (chan.onmessage = async e => {
      S.invs = await R.db.all('investigations');
      if (S.inv) {
        const fresh = S.invs.find(i => i.id === S.inv.id);
        if (!fresh) { S.inv = null; emit('closed'); return; }
        if (e.data?.inv === S.inv.id) await load(S.inv.id);
      }
      emit('external');
    });
  }

  /* ---------- investigations ---------- */
  async function load(id) {
    S.inv = S.invs.find(i => i.id === id) || null;
    if (!S.inv) { S.sources = []; S.highlights = []; return null; }
    [S.sources, S.highlights] = await Promise.all([
      R.db.where('sources', 'investigationId', id),
      R.db.where('highlights', 'investigationId', id),
    ]);
    return S.inv;
  }
  async function touch() {
    if (!S.inv) return;
    S.inv.updatedAt = now();
    await R.db.put('investigations', S.inv);
    tell(S.inv.id);
  }
  async function createInv(data) {
    const t = now();
    const inv = { id: uid(), title: '', type: 'topic', description: '', tags: [], status: 'active', summary: '', ...data, createdAt: t, updatedAt: t };
    await R.db.put('investigations', inv);
    S.invs.push(inv); tell(inv.id); emit('invs', inv.id);
    return inv;
  }
  async function updateInv(id, patch, from = '') {
    const inv = S.invs.find(i => i.id === id);
    if (!inv) return;
    Object.assign(inv, patch, { updatedAt: now() });
    await R.db.put('investigations', inv);
    tell(id); emit('inv', id, from);
  }
  /** Removes everything that belongs to the investigation. Entities shared with
      other investigations are only unlinked from this one. */
  async function deleteInv(id) {
    const inv = S.invs.find(i => i.id === id);
    if (!inv) return;
    const del = { investigations: [id] }, put = {};
    for (const s of ['sources', 'highlights', 'nodes', 'edges', 'notes', 'findings', 'tasks']) {
      const rows = await R.db.where(s, 'investigationId', id);
      del[s] = rows.map(r => r.id);
      if (s === 'sources') del.files = rows.map(r => r.fileId).filter(Boolean);
    }
    const ents = await R.db.where('entities', 'investigationIds', id);
    put.entities = []; del.entities = []; del.entityFields = [];
    for (const e of ents) {
      e.investigationIds = e.investigationIds.filter(x => x !== id);
      if (e.investigationIds.length) put.entities.push(e);
      else {
        del.entities.push(e.id);
        del.entityFields.push(...(await R.db.where('entityFields', 'entityId', e.id)).map(f => f.id));
      }
    }
    await R.db.batch({ put, del });
    S.invs = S.invs.filter(i => i.id !== id);
    if (S.inv?.id === id) { S.inv = null; S.sources = []; S.highlights = []; }
    tell(id); emit('invs', id);
  }

  /* ---------- sources ---------- */
  const SOURCE_DEFAULTS = {
    url: '', title: '', author: '', publisher: '', publishedAt: '', accessedAt: '', type: 'website',
    reliability: 0, notes: '', origin: 'manual', fileId: null, text: '', foundBy: [],
  };
  async function addSource(data) {
    const t = now();
    const src = { ...SOURCE_DEFAULTS, accessedAt: today(), ...data, id: uid(), investigationId: S.inv.id, createdAt: t, updatedAt: t };
    if (src.url) src.url = cleanUrl(src.url);
    src.normUrl = src.url ? normUrl(src.url) : '';
    await R.db.put('sources', src);
    S.sources.push(src);
    await touch(); emit('sources', src.id);
    return src;
  }
  async function updateSource(id, patch, from = '') {
    const src = S.sources.find(s => s.id === id);
    if (!src) return;
    Object.assign(src, patch, { updatedAt: now() });
    if ('url' in patch) src.normUrl = src.url ? normUrl(src.url) : '';
    await R.db.put('sources', src);
    await touch(); emit('sources', id, from);
  }
  async function deleteSource(id) {
    const src = S.sources.find(s => s.id === id);
    if (!src) return;
    const hl = S.highlights.filter(h => h.sourceId === id).map(h => h.id);
    await R.db.batch({ del: { sources: [id], highlights: hl, files: src.fileId ? [src.fileId] : [] } });
    S.sources = S.sources.filter(s => s.id !== id);
    S.highlights = S.highlights.filter(h => h.sourceId !== id);
    await touch(); emit('sources', id);
  }
  /** Where else this URL is saved: in this investigation and in others. */
  async function findUrl(url, exceptId = null) {
    const n = normUrl(url);
    if (!n) return { here: null, elsewhere: [] };
    const rows = (await R.db.where('sources', 'normUrl', n)).filter(s => s.id !== exceptId);
    const here = rows.find(s => s.investigationId === S.inv?.id) || null;
    const elsewhere = rows.filter(s => s.investigationId !== S.inv?.id)
      .map(s => ({ source: s, inv: S.invs.find(i => i.id === s.investigationId) })).filter(x => x.inv);
    return { here, elsewhere };
  }
  /** Groups of sources in the open investigation that share a URL. */
  function duplicates() {
    const by = new Map();
    for (const s of S.sources) if (s.normUrl) by.set(s.normUrl, [...(by.get(s.normUrl) || []), s.id]);
    const dup = new Set();
    for (const ids of by.values()) if (ids.length > 1) ids.forEach(i => dup.add(i));
    return dup;
  }

  /* ---------- highlights ---------- */
  async function addHighlight(sourceId, data) {
    const h = { quote: '', note: '', location: '', ...data, id: uid(), sourceId, investigationId: S.inv.id, createdAt: now() };
    await R.db.put('highlights', h);
    S.highlights.push(h);
    await touch(); emit('highlights', h.id);
    return h;
  }
  async function deleteHighlight(id) {
    await R.db.del('highlights', id);
    S.highlights = S.highlights.filter(h => h.id !== id);
    await touch(); emit('highlights', id);
  }

  /* ---------- files ---------- */
  async function saveFile(file) {
    const f = { id: uid(), name: file.name, mime: file.type || 'application/octet-stream', size: file.size, blob: file, createdAt: now() };
    await R.db.put('files', f);
    return f;
  }
  const getFile = id => R.db.get('files', id);

  return {
    S, boot, load, emit, on: f => (subs.add(f), () => subs.delete(f)),
    createInv, updateInv, deleteInv,
    addSource, updateSource, deleteSource, findUrl, duplicates,
    addHighlight, deleteHighlight,
    saveFile, getFile,
  };
})();
