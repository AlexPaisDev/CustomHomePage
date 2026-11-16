/* =====================================================================
   AVALON RESEARCH — storage
   IndexedDB database "avalon_research". Every store exists from version 1
   (even ones later phases fill), so adding features never needs a
   migration. If IndexedDB can't be opened (some file:// setups, private
   windows) it falls back to localStorage, without file uploads.
   ===================================================================== */
'use strict';

R.db = (() => {
  const NAME = 'avalon_research', VER = 1, LS_KEY = 'avalon_research_ls';
  // store → indexes. [name, options] for multi-entry indexes.
  const SCHEMA = {
    investigations: [],
    sources: ['investigationId', 'normUrl'],
    highlights: ['investigationId', 'sourceId'],
    files: [],
    entities: [['investigationIds', { multiEntry: true }]],
    entityFields: ['entityId'],
    nodes: ['investigationId'],
    edges: ['investigationId'],
    notes: ['investigationId'],
    findings: ['investigationId'],
    tasks: ['investigationId'],
  };
  const STORES = Object.keys(SCHEMA);
  let idb = null;
  let mode = 'none';                    // 'idb' | 'local'

  const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  function openIdb() {
    return new Promise((res, rej) => {
      let r;
      try { r = indexedDB.open(NAME, VER); } catch (e) { return rej(e); }
      const t = setTimeout(() => rej(new Error('timed out')), 5000);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const [name, indexes] of Object.entries(SCHEMA)) {
          const os = db.objectStoreNames.contains(name) ? r.transaction.objectStore(name) : db.createObjectStore(name, { keyPath: 'id' });
          for (const i of indexes) {
            const [n, o] = Array.isArray(i) ? i : [i, {}];
            if (!os.indexNames.contains(n)) os.createIndex(n, n, o);
          }
        }
      };
      r.onsuccess = () => { clearTimeout(t); res(r.result); };
      r.onerror = () => { clearTimeout(t); rej(r.error); };
      r.onblocked = () => { clearTimeout(t); rej(new Error('blocked by another tab')); };
    });
  }

  /* ---------- localStorage fallback (same API) ---------- */
  let ls = null;
  const lsLoad = () => {
    if (ls) return ls;
    try { ls = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { ls = {}; }
    for (const s of STORES) ls[s] ||= {};
    return ls;
  };
  const lsSave = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(ls)); } catch (e) { throw new Error('Browser storage is full'); } };
  const lsMatch = (o, index, v) => Array.isArray(o[index]) ? o[index].includes(v) : o[index] === v;

  async function init() {
    try {
      if (!window.indexedDB) throw new Error('IndexedDB unavailable');
      idb = await openIdb();
      idb.onversionchange = () => { idb.close(); toast('Research was updated in another tab — reload this one.', 'err'); };
      mode = 'idb';
    } catch (e) {
      console.warn('Avalon Research: IndexedDB unavailable, using localStorage', e);
      lsLoad();
      mode = 'local';
    }
    return mode;
  }

  const tx = (stores, rw) => idb.transaction(stores, rw ? 'readwrite' : 'readonly');
  const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted')); });
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));

  async function get(store, id) {
    if (mode === 'local') return clone(lsLoad()[store][id]);
    return wrap(tx(store).objectStore(store).get(id));
  }
  async function all(store) {
    if (mode === 'local') return Object.values(lsLoad()[store]).map(clone);
    return wrap(tx(store).objectStore(store).getAll());
  }
  async function where(store, index, value) {
    if (mode === 'local') return Object.values(lsLoad()[store]).filter(o => lsMatch(o, index, value)).map(clone);
    return wrap(tx(store).objectStore(store).index(index).getAll(value));
  }
  async function count(store, index, value) {
    if (mode === 'local') return Object.values(lsLoad()[store]).filter(o => lsMatch(o, index, value)).length;
    return wrap(tx(store).objectStore(store).index(index).count(value));
  }
  async function put(store, obj) {
    if (store === 'files' && mode === 'local') throw new Error('File uploads need IndexedDB, which this browser blocked for this page');
    if (mode === 'local') { lsLoad()[store][obj.id] = clone(obj); lsSave(); return obj; }
    const t = tx(store, true); t.objectStore(store).put(obj); await done(t); return obj;
  }
  /** Several writes and deletes in one transaction: { put: {store: [objs]}, del: {store: [ids]} } */
  async function batch({ put: puts = {}, del: dels = {} }) {
    const names = [...new Set([...Object.keys(puts), ...Object.keys(dels)])];
    if (!names.length) return;
    if (mode === 'local') {
      const d = lsLoad();
      for (const [s, objs] of Object.entries(puts)) for (const o of objs) d[s][o.id] = clone(o);
      for (const [s, ids] of Object.entries(dels)) for (const id of ids) delete d[s][id];
      lsSave(); return;
    }
    const t = tx(names, true);
    for (const [s, objs] of Object.entries(puts)) for (const o of objs) t.objectStore(s).put(o);
    for (const [s, ids] of Object.entries(dels)) for (const id of ids) t.objectStore(s).delete(id);
    await done(t);
  }
  const del = (store, id) => batch({ del: { [store]: [id] } });

  /** Rough usage for the footer; null when the browser can't tell. */
  async function usage() {
    try { const e = await navigator.storage?.estimate?.(); return e ? e.usage : null; } catch { return null; }
  }

  return { init, get, all, where, count, put, batch, del, usage, STORES, get mode() { return mode; } };
})();
