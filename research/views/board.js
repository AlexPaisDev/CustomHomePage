/* =====================================================================
   AVALON RESEARCH — investigation board
   An infinite, pannable, zoomable corkboard. Nodes (entities, sticky
   notes, source cards, images, group frames) are absolutely positioned
   divs in a "world" layer moved with one CSS transform; connections are
   SVG lines in the same layer, with HTML labels.

   Mouse:  drag empty space to pan · wheel to zoom (trackpad: two fingers
           pan, pinch zooms) · Shift-drag to select an area · drag a node's
           dot onto another node to connect them · double-click to edit
   Keys:   Delete removes · Ctrl+Z / Ctrl+Y undo/redo · Ctrl+A all ·
           arrows nudge · F fit · 0 100% · N note · E entity · C connect two
   Every change is saved as it happens; undo keeps 100 steps per board.
   ===================================================================== */
'use strict';

R.views.board = (() => {
  const SIZES = { entity: [220, 80], note: [200, 150], source: [260, 100], image: [260, 190], group: [560, 360] };
  const MIN = { entity: [140, 56], note: [120, 80], source: [180, 70], image: [80, 60], group: [200, 140] };
  const SWATCHES = ['#e6bd4e', '#62e6f0', '#6fdca0', '#ffc857', '#ff6b6b', '#b27bff', '#9a94c9'];
  const LABELS = ['CEO of', 'founded', 'owns', 'works at', 'board member of', 'subsidiary of', 'funded by', 'invested in', 'partner of',
    'related to', 'married to', 'located in', 'met with', 'mentions', 'supports', 'contradicts', 'sued', 'acquired'];
  const ZMIN = .15, ZMAX = 2.5;

  let el, stage, world, nodesEl, linesEl, labelsEl, ghostEl, marquee;
  let view = { x: 0, y: 0, k: 1 };
  const sel = new Set();
  let selEdge = null, editing = null, popover = null;
  const fileUrls = new Map();          // fileId → object URL for image nodes
  const histories = new Map();         // investigation id → { undo, redo }

  /* ---------- helpers ---------- */
  const node = id => S.nodes.find(n => n.id === id);
  const ent = id => S.entities.find(e => e.id === id);
  const src = id => S.sources.find(s => s.id === id);
  const kindOf = n => R.ENTITY_KINDS[ent(n.refId)?.kind] || R.ENTITY_KINDS.other;
  const colorOf = n => n.color || (n.type === 'entity' ? kindOf(n).color : n.type === 'note' ? '#ffc857' : n.type === 'group' ? '#9a94c9' : '#62e6f0');
  const titleOf = n => n.type === 'entity' ? ent(n.refId)?.name || 'Entity' : n.type === 'source' ? src(n.refId)?.title || 'Source'
    : n.type === 'note' ? (n.text || 'Note').split('\n')[0].slice(0, 60) : n.type === 'group' ? n.text || 'Group' : 'Image';
  const toWorld = (sx, sy) => { const r = stage.getBoundingClientRect(); return [(sx - r.left - view.x) / view.k, (sy - r.top - view.y) / view.k]; };
  const center = () => { const r = stage.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };
  const inside = (n, g) => n.id !== g.id && n.x >= g.x && n.y >= g.y && n.x + n.w <= g.x + g.w && n.y + n.h <= g.y + g.h;

  /* ---------- undo / redo ---------- */
  const H = () => { if (!histories.has(S.inv.id)) histories.set(S.inv.id, { undo: [], redo: [] }); return histories.get(S.inv.id); };
  const snap = () => ({ nodes: structuredClone(S.nodes), edges: structuredClone(S.edges) });
  function checkpoint() { const h = H(); h.undo.push(snap()); if (h.undo.length > 100) h.undo.shift(); h.redo = []; tools(); }
  async function travel(from, to) {
    const h = H();
    if (!h[from].length) return;
    h[to].push(snap());
    const s = h[from].pop();
    await R.store.restoreBoard(s.nodes, s.edges, 'board');
    sel.clear(); selEdge = null;
    draw(); tools();
  }
  const undo = () => travel('undo', 'redo');
  const redo = () => travel('redo', 'undo');

  /* ---------- render ---------- */
  function render(root) {
    el = root;
    view = { x: 0, y: 0, k: 1, ...(R.ui.board?.[S.inv.id] || {}) };
    sel.clear(); selEdge = null; editing = null;
    el.innerHTML = `
      <div class="bd">
        <div class="bd-bar" role="toolbar" aria-label="Board tools">
          <div class="bd-tg">
            <button class="bd-btn" data-tool="entity" title="Add an entity (E)">${icon('users')}<span>Entity</span></button>
            <button class="bd-btn" data-tool="note" title="Add a sticky note (N)">${icon('sticky')}<span>Note</span></button>
            <button class="bd-btn" data-tool="source" title="Pin a source">${icon('link')}<span>Source</span></button>
            <button class="bd-btn" data-tool="image" title="Add an image">${icon('image')}<span>Image</span></button>
            <button class="bd-btn" data-tool="group" title="Frame the selection, or add an empty frame">${icon('frame')}<span>Group</span></button>
          </div>
          <div class="bd-tg bd-swatches" id="bd-swatches" hidden>
            ${SWATCHES.map(c => `<button class="bd-sw" data-color="${c}" style="--c:${c}" title="Colour"></button>`).join('')}
            <button class="bd-btn bd-icon" data-tool="delete" title="Delete selection (Del)">${icon('trash')}</button>
          </div>
          <div class="bd-tg bd-right">
            <button class="bd-btn bd-icon" data-tool="undo" title="Undo (Ctrl+Z)">${icon('undo')}</button>
            <button class="bd-btn bd-icon" data-tool="redo" title="Redo (Ctrl+Y)">${icon('redo')}</button>
            <span class="bd-sep"></span>
            <button class="bd-btn bd-icon" data-tool="out" title="Zoom out (-)">${icon('minus')}</button>
            <button class="bd-btn bd-zoom" data-tool="reset" title="Back to 100% (0)" id="bd-zoom">100%</button>
            <button class="bd-btn bd-icon" data-tool="in" title="Zoom in (+)">${icon('plus')}</button>
            <button class="bd-btn bd-icon" data-tool="fit" title="Fit everything (F)">${icon('fit')}</button>
            <button class="bd-btn bd-icon" data-tool="png" title="Export as PNG">${icon('download')}</button>
          </div>
        </div>
        <div class="bd-stage" id="bd-stage" tabindex="0" aria-label="Investigation board">
          <div class="bd-world" id="bd-world">
            <svg class="bd-lines" width="1" height="1" aria-hidden="true">
              <defs>
                <marker id="bd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#9a94c9" /></marker>
                <marker id="bd-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#f7dc84" /></marker>
              </defs>
              <g id="bd-edges"></g>
              <path class="bd-ghost" id="bd-ghost" d="" />
            </svg>
            <div class="bd-nodes" id="bd-nodes"></div>
            <div class="bd-labels" id="bd-labels"></div>
          </div>
          <div class="bd-marquee" id="bd-marquee" hidden></div>
          <div class="bd-empty" id="bd-empty" hidden>
            ${icon('board')}
            <p><b>An empty board.</b> Pin sources, add the people and companies involved, and draw the connections between them.</p>
            <div class="bd-empty-actions">
              <button class="btn btn-gold btn-sm" data-tool="entity">${icon('users')}Add an entity</button>
              <button class="btn btn-sm" data-tool="source">${icon('link')}Pin sources</button>
              <button class="btn btn-sm" data-tool="note">${icon('sticky')}Sticky note</button>
            </div>
            <small>Drag to pan · wheel to zoom · Shift-drag to select · drag a card's dot onto another to connect</small>
          </div>
        </div>
        <input type="file" id="bd-file" accept="image/*" hidden>
        <datalist id="bd-labels-list">${LABELS.map(l => `<option value="${esc(l)}">`).join('')}</datalist>
      </div>`;
    stage = $('#bd-stage', el); world = $('#bd-world', el); nodesEl = $('#bd-nodes', el);
    linesEl = $('#bd-edges', el); labelsEl = $('#bd-labels', el); ghostEl = $('#bd-ghost', el); marquee = $('#bd-marquee', el);
    bind();
    draw();
    if (!R.ui.board?.[S.inv.id] && S.nodes.length) requestAnimationFrame(() => fit());
  }

  function applyView() {
    world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`;
    stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
    stage.style.backgroundSize = `${24 * view.k}px ${24 * view.k}px`;
    const z = $('#bd-zoom', el); if (z) z.textContent = `${Math.round(view.k * 100)}%`;
    (R.ui.board ||= {})[S.inv.id] = { x: Math.round(view.x), y: Math.round(view.y), k: +view.k.toFixed(3) };
    R.saveUi();
  }

  function nodeHtml(n) {
    let inner = '';
    if (n.type === 'entity') {
      const e = ent(n.refId), k = kindOf(n);
      inner = `<div class="bd-ent">${icon(k.icon)}<div><b>${esc(e?.name || 'Unknown')}</b><small>${esc(k.label)}${e?.date ? ` · ${esc(fmtDate(e.date))}` : ''}</small>${e?.description ? `<p>${esc(e.description)}</p>` : ''}</div></div>`;
    } else if (n.type === 'note') {
      inner = `<div class="bd-note-text">${n.text ? esc(n.text) : '<span class="bd-ph">Double-click to write</span>'}</div>`;
    } else if (n.type === 'source') {
      const s = src(n.refId), t = R.SOURCE_TYPES[s?.type] || R.SOURCE_TYPES.other;
      inner = s ? `<div class="bd-src">
          <span class="bd-src-ic">${s.url ? `<img src="https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(host(s.url))}" alt="" onerror="this.remove()">` : icon(t.icon)}</span>
          <div><b>${esc(s.title || s.url || 'Untitled')}</b><small>${esc([s.publisher || host(s.url), fmtDate(s.publishedAt)].filter(Boolean).join(' · '))}</small></div>
        </div><div class="bd-src-foot"><span>${icon(t.icon)}${esc(t.label)}</span>${R.relBar(s.reliability)}</div>`
        : '<div class="bd-src"><div><b>Deleted source</b></div></div>';
    } else if (n.type === 'image') {
      inner = `<img class="bd-img" data-file="${esc(n.refId)}" alt="${esc(n.text || '')}" draggable="false">`;
    } else if (n.type === 'group') {
      inner = `<div class="bd-group-title">${esc(n.text || 'Group')}</div>`;
    }
    return `<div class="bd-node bd-${n.type} ${sel.has(n.id) ? 'sel' : ''}" data-id="${n.id}"
      style="left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;--c:${colorOf(n)};z-index:${n.type === 'group' ? 0 : sel.has(n.id) ? 3 : 1}">
      ${inner}${n.type === 'group' ? '' : '<span class="bd-port" title="Drag onto another card to connect"></span>'}<span class="bd-resize" title="Resize"></span></div>`;
  }

  function draw() {
    if (!nodesEl) return;
    const ordered = [...S.nodes].sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1) || (a.z || 0) - (b.z || 0));
    nodesEl.innerHTML = ordered.map(nodeHtml).join('');
    $$('img[data-file]', nodesEl).forEach(loadImage);
    drawEdges();
    applyView();
    $('#bd-empty', el).hidden = S.nodes.length > 0;
    tools();
  }

  async function loadImage(img) {
    const id = img.dataset.file;
    if (!fileUrls.has(id)) {
      const f = await R.store.getFile(id).catch(() => null);
      if (!f) return;
      fileUrls.set(id, URL.createObjectURL(f.blob));
    }
    img.src = fileUrls.get(id);
  }

  /** Where the line from n's centre towards (tx, ty) leaves n's box. */
  function anchor(n, tx, ty) {
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return [cx, cy];
    const s = Math.min(n.w / 2 / Math.abs(dx || 1e-9), n.h / 2 / Math.abs(dy || 1e-9));
    return [cx + dx * s, cy + dy * s];
  }
  function edgeGeom(e) {
    const a = node(e.fromNodeId), b = node(e.toNodeId);
    if (!a || !b) return null;
    const [x1, y1] = anchor(a, b.x + b.w / 2, b.y + b.h / 2), [x2, y2] = anchor(b, a.x + a.w / 2, a.y + a.h / 2);
    return { x1, y1, x2, y2, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
  }
  function drawEdges() {
    let lines = '', labels = '';
    for (const e of S.edges) {
      const g = edgeGeom(e);
      if (!g) continue;
      const on = selEdge === e.id, d = `M${g.x1.toFixed(1)} ${g.y1.toFixed(1)}L${g.x2.toFixed(1)} ${g.y2.toFixed(1)}`;
      lines += `<g class="bd-edge ${on ? 'sel' : ''}" data-edge="${e.id}" style="--c:${e.color || '#9a94c9'}"><path class="hit" d="${d}" /><path class="line" d="${d}" marker-end="url(#${on ? 'bd-arrow-sel' : 'bd-arrow'})" /></g>`;
      labels += `<span class="bd-label ${on ? 'sel' : ''} ${e.label ? '' : 'empty'}" data-edge="${e.id}" style="left:${g.mx}px;top:${g.my}px">${esc(e.label || '+ label')}</span>`;
    }
    linesEl.innerHTML = lines;
    labelsEl.innerHTML = labels;
  }

  /** Move node divs without a full redraw (during drags). */
  function place(ids) {
    for (const id of ids) {
      const n = node(id), d = nodesEl.querySelector(`[data-id="${id}"]`);
      if (n && d) { d.style.left = `${n.x}px`; d.style.top = `${n.y}px`; d.style.width = `${n.w}px`; d.style.height = `${n.h}px`; }
    }
    drawEdges();
  }

  function markSel() {
    $$('.bd-node', nodesEl).forEach(d => {
      const on = sel.has(d.dataset.id), n = node(d.dataset.id);
      d.classList.toggle('sel', on);
      d.style.zIndex = n?.type === 'group' ? 0 : on ? 3 : 1;
    });
    drawEdges();
    tools();
  }
  function tools() {
    if (!el) return;
    const h = S.inv ? H() : { undo: [], redo: [] };
    const u = $('[data-tool="undo"]', el), r = $('[data-tool="redo"]', el);
    if (u) u.disabled = !h.undo.length;
    if (r) r.disabled = !h.redo.length;
    const sw = $('#bd-swatches', el);
    if (sw) sw.hidden = !sel.size && !selEdge;
  }

  /* ---------- creating ---------- */
  /** Step down-right from a spot until the card no longer covers another one. */
  function freeSpot(x, y, w, h) {
    const hit = (px, py) => S.nodes.some(n => n.type !== 'group' && px < n.x + n.w && px + w > n.x && py < n.y + n.h && py + h > n.y);
    for (let i = 0; i < 40 && hit(x, y); i++) { x += 28; y += 28; if (i % 8 === 7) { x -= 28 * 8 - w - 24; y -= 28 * 8; } }
    return [x, y];
  }
  async function addNode(type, data = {}, at = center(), exact = false) {
    const w = data.w || SIZES[type][0], h = data.h || SIZES[type][1];
    let [x, y] = [Math.round(at[0] - w / 2), Math.round(at[1] - h / 2)];
    if (!exact && type !== 'group') [x, y] = freeSpot(x, y, w, h);
    checkpoint();
    const n = await R.store.create('nodes', { type, refId: null, text: '', color: '', x, y, w, h, z: Date.now() % 1e9, ...data, ...{ x, y, w, h } }, 'board');
    sel.clear(); sel.add(n.id); selEdge = null;
    draw();
    return n;
  }
  async function addEntity(kind, name) {
    const e = await R.store.create('entities', { kind, name, description: '', aliases: [], date: '' }, 'board');
    const n = await addNode('entity', { refId: e.id });
    R.agent.desk?.do('write'); R.agent.desk?.say(`${R.ENTITY_KINDS[kind].label} “${name}” is on the board.`);
    R.openEntity?.(e.id);
    return n;
  }
  async function pinSources(ids) {
    if (!ids.length) return;
    checkpoint();
    const [w, h] = SIZES.source, cols = Math.ceil(Math.sqrt(ids.length));
    let [cx, cy] = center();
    const occupied = S.nodes.filter(n => n.type !== 'group');
    if (occupied.length) { cx = Math.max(...occupied.map(n => n.x + n.w)) + 60 + (cols * (w + 24)) / 2; cy = Math.min(...occupied.map(n => n.y)) + h / 2; }
    const made = [];
    ids.forEach((id, i) => {
      const x = cx - (cols * (w + 24)) / 2 + (i % cols) * (w + 24), y = cy - h / 2 + Math.floor(i / cols) * (h + 24);
      made.push({ id: uid(), investigationId: S.inv.id, type: 'source', refId: id, text: '', color: '', x: Math.round(x), y: Math.round(y), w, h, z: Date.now() % 1e9 + i, createdAt: new Date().toISOString() });
    });
    await R.store.saveAll('nodes', made, 'board');
    sel.clear(); made.forEach(n => sel.add(n.id));
    draw();
    R.agent.desk?.do('write'); R.agent.desk?.say(`Pinned ${plural(made.length, 'source')} to the board.`);
  }
  async function addGroup() {
    const chosen = [...sel].map(node).filter(n => n && n.type !== 'group');
    if (!chosen.length) return addNode('group', { text: 'Group' });
    const pad = 36, x0 = Math.min(...chosen.map(n => n.x)) - pad, y0 = Math.min(...chosen.map(n => n.y)) - pad - 24;
    const x1 = Math.max(...chosen.map(n => n.x + n.w)) + pad, y1 = Math.max(...chosen.map(n => n.y + n.h)) + pad;
    checkpoint();
    const g = await R.store.create('nodes', { type: 'group', refId: null, text: 'Group', color: '', x: x0, y: y0, w: x1 - x0, h: y1 - y0, z: 0 }, 'board');
    sel.clear(); sel.add(g.id);
    draw();
    editGroupTitle(g.id);
  }
  async function connect(fromId, toId, label = '') {
    if (fromId === toId || S.edges.some(e => (e.fromNodeId === fromId && e.toNodeId === toId))) return null;
    checkpoint();
    const e = await R.store.create('edges', { fromNodeId: fromId, toNodeId: toId, label, color: '', directed: true }, 'board');
    selEdge = e.id; sel.clear();
    drawEdges(); markSel();
    editLabel(e.id);
    return e;
  }
  async function removeSelection() {
    if (!sel.size && !selEdge) return;
    checkpoint();
    const nodes = [...sel];
    const edges = S.edges.filter(e => e.id === selEdge || nodes.includes(e.fromNodeId) || nodes.includes(e.toNodeId)).map(e => e.id);
    sel.clear(); selEdge = null;
    await R.store.removeAll({ nodes, edges }, 'board');
    draw();
  }
  async function recolor(c) {
    checkpoint();
    if (selEdge) { const e = S.edges.find(x => x.id === selEdge); if (e) { e.color = c; await R.store.save('edges', e, 'board'); } }
    const ns = [...sel].map(node).filter(Boolean);
    ns.forEach(n => { n.color = c; });
    await R.store.saveAll('nodes', ns, 'board');
    draw();
  }

  /* ---------- editing text in place ---------- */
  function editNote(id) {
    const n = node(id), d = nodesEl.querySelector(`[data-id="${id}"]`);
    if (!n || !d) return;
    editing = id;
    const ta = document.createElement('textarea');
    ta.className = 'bd-note-edit'; ta.value = n.text || ''; ta.placeholder = 'Write…';
    d.querySelector('.bd-note-text').replaceWith(ta);
    ta.focus(); ta.select();
    let done = false;
    const finish = async keep => {
      if (done) return; done = true; editing = null;
      if (keep && ta.value !== (n.text || '')) { checkpoint(); n.text = ta.value; await R.store.save('nodes', n, 'board'); }
      draw();
    };
    ta.addEventListener('blur', () => finish(true));
    ta.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') finish(false);
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(true);
    });
    ta.addEventListener('pointerdown', e => e.stopPropagation());
  }
  function editGroupTitle(id) {
    const n = node(id), d = nodesEl.querySelector(`[data-id="${id}"] .bd-group-title`);
    if (!n || !d) return;
    inlineInput(d, n.text || 'Group', async v => { checkpoint(); n.text = v || 'Group'; await R.store.save('nodes', n, 'board'); draw(); });
  }
  function editLabel(edgeId) {
    const e = S.edges.find(x => x.id === edgeId), d = labelsEl.querySelector(`[data-edge="${edgeId}"]`);
    if (!e || !d) return;
    inlineInput(d, e.label || '', async v => { if (v !== (e.label || '')) { checkpoint(); e.label = v; await R.store.save('edges', e, 'board'); } drawEdges(); }, 'bd-labels-list');
  }
  function inlineInput(target, value, onDone, list = '') {
    const inp = document.createElement('input');
    inp.className = 'bd-inline'; inp.value = value; if (list) inp.setAttribute('list', list);
    target.textContent = ''; target.appendChild(inp); target.classList.add('editing');
    inp.focus(); inp.select();
    editing = 'inline';
    let done = false;
    const finish = keep => { if (done) return; done = true; editing = null; if (keep) onDone(inp.value.trim()); else draw(); };
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') finish(false); });
    inp.addEventListener('pointerdown', e => e.stopPropagation());
  }

  /* ---------- view ---------- */
  function zoomAt(k, sx, sy) {
    k = Math.min(ZMAX, Math.max(ZMIN, k));
    const r = stage.getBoundingClientRect();
    const px = (sx ?? r.left + r.width / 2) - r.left, py = (sy ?? r.top + r.height / 2) - r.top;
    view.x = px - (px - view.x) * (k / view.k);
    view.y = py - (py - view.y) * (k / view.k);
    view.k = k;
    applyView();
  }
  function fit() {
    if (!S.nodes.length) { view = { x: stage.clientWidth / 2, y: stage.clientHeight / 2, k: 1 }; return applyView(); }
    const x0 = Math.min(...S.nodes.map(n => n.x)), y0 = Math.min(...S.nodes.map(n => n.y));
    const x1 = Math.max(...S.nodes.map(n => n.x + n.w)), y1 = Math.max(...S.nodes.map(n => n.y + n.h));
    const pad = 60, W = stage.clientWidth, Hh = stage.clientHeight;
    const k = Math.min(1.2, Math.max(ZMIN, Math.min((W - pad * 2) / (x1 - x0 || 1), (Hh - pad * 2) / (y1 - y0 || 1))));
    view = { k, x: (W - (x1 - x0) * k) / 2 - x0 * k, y: (Hh - (y1 - y0) * k) / 2 - y0 * k };
    world.classList.add('bd-glide');
    applyView();
    setTimeout(() => world.classList.remove('bd-glide'), 350);
  }

  /* ---------- pointer interactions ---------- */
  let act = null;                     // current gesture
  const pointers = new Map();
  let space = false;

  function bind() {
    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('dblclick', dbl);
    stage.addEventListener('wheel', wheel, { passive: false });
    stage.addEventListener('contextmenu', e => { if (e.target.closest('.bd-node, [data-edge]')) e.preventDefault(); });
    el.addEventListener('click', toolClick);
    $('#bd-file', el).addEventListener('change', async e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      if (!f.type.startsWith('image/')) return toast('Choose an image file.', 'err');
      try {
        const saved = await R.store.saveFile(f);
        const img = new Image();
        img.onload = async () => {
          const ratio = img.naturalHeight / img.naturalWidth || .75, w = Math.min(360, img.naturalWidth || 260);
          await addNode('image', { refId: saved.id, text: f.name, w, h: Math.round(w * ratio) });
          URL.revokeObjectURL(img.src);
        };
        img.src = URL.createObjectURL(f);
      } catch (err) { toast(esc(err.message), 'err'); }
    });
    // stage resize keeps the board where it is (nothing to do); keep focus behaviour tidy
    stage.addEventListener('keydown', e => { if (e.key === ' ' && !editing) { space = true; stage.classList.add('panning'); e.preventDefault(); } });
    stage.addEventListener('keyup', e => { if (e.key === ' ') { space = false; stage.classList.remove('panning'); } });
  }

  function down(e) {
    if (editing && e.target.closest('.bd-inline, .bd-note-edit')) return;
    closePopover();
    stage.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { act = { kind: 'pinch', d0: dist(), k0: view.k }; return; }
    const port = e.target.closest('.bd-port'), rz = e.target.closest('.bd-resize'), nd = e.target.closest('.bd-node'), edge = e.target.closest('[data-edge]');
    try { stage.setPointerCapture(e.pointerId); } catch { }
    const start = { sx: e.clientX, sy: e.clientY, moved: false };
    if (e.button === 1 || (e.button === 0 && space)) { act = { kind: 'pan', ...start, vx: view.x, vy: view.y }; stage.classList.add('panning'); e.preventDefault(); return; }
    if (e.button !== 0) return;
    if (port && nd) { act = { kind: 'link', from: nd.dataset.id, ...start }; return; }
    if (rz && nd) { const n = node(nd.dataset.id); act = { kind: 'resize', id: n.id, w0: n.w, h0: n.h, ratio: n.h / n.w, ...start }; return; }
    if (nd) {
      const id = nd.dataset.id, multi = e.shiftKey || e.ctrlKey || e.metaKey;
      if (multi) { sel.has(id) ? sel.delete(id) : sel.add(id); }
      else if (!sel.has(id)) { sel.clear(); sel.add(id); }
      selEdge = null;
      markSel();
      // groups carry the cards inside them
      const moving = new Set(sel);
      [...sel].map(node).filter(n => n?.type === 'group').forEach(g => S.nodes.forEach(n => { if (inside(n, g)) moving.add(n.id); }));
      act = { kind: 'drag', id, multi, starts: [...moving].map(i => { const n = node(i); return n && [i, n.x, n.y]; }).filter(Boolean), ...start };
      return;
    }
    if (edge) { selEdge = edge.dataset.edge; sel.clear(); markSel(); act = { kind: 'edge', ...start }; return; }
    if (e.shiftKey) { const r = stage.getBoundingClientRect(); act = { kind: 'marquee', ox: e.clientX - r.left, oy: e.clientY - r.top, base: new Set(sel), ...start }; return; }
    act = { kind: 'pan', ...start, vx: view.x, vy: view.y };
  }
  const dist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };

  let frame = 0;
  function move(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!act) return;
    if (act.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      zoomAt(act.k0 * dist() / act.d0, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    const dx = e.clientX - act.sx, dy = e.clientY - act.sy;
    if (!act.moved && Math.hypot(dx, dy) < 3) return;
    const first = !act.moved;
    act.moved = true;
    if (act.kind === 'pan') { view.x = act.vx + dx; view.y = act.vy + dy; stage.classList.add('panning'); cancelAnimationFrame(frame); frame = requestAnimationFrame(applyView); return; }
    if (act.kind === 'drag') {
      if (first) checkpoint();
      for (const [id, x, y] of act.starts) { const n = node(id); n.x = Math.round(x + dx / view.k); n.y = Math.round(y + dy / view.k); }
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => place(act.starts.map(s => s[0])));
      return;
    }
    if (act.kind === 'resize') {
      if (first) checkpoint();
      const n = node(act.id), [mw, mh] = MIN[n.type];
      n.w = Math.max(mw, Math.round(act.w0 + dx / view.k));
      n.h = e.shiftKey || n.type === 'image' && !e.altKey ? Math.max(mh, Math.round(n.w * act.ratio)) : Math.max(mh, Math.round(act.h0 + dy / view.k));
      cancelAnimationFrame(frame); frame = requestAnimationFrame(() => place([n.id]));
      return;
    }
    if (act.kind === 'link') {
      const n = node(act.from), [wx, wy] = toWorld(e.clientX, e.clientY), [ax, ay] = anchor(n, wx, wy);
      ghostEl.setAttribute('d', `M${ax} ${ay}L${wx} ${wy}`);
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.bd-node');
      $$('.bd-node.target', nodesEl).forEach(d => d.classList.remove('target'));
      if (over && over.dataset.id !== act.from) over.classList.add('target');
      return;
    }
    if (act.kind === 'marquee') {
      const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const L = Math.min(x, act.ox), T = Math.min(y, act.oy), W = Math.abs(x - act.ox), Hh = Math.abs(y - act.oy);
      Object.assign(marquee.style, { left: `${L}px`, top: `${T}px`, width: `${W}px`, height: `${Hh}px` });
      marquee.hidden = false;
      const [wx0, wy0] = [(L - view.x) / view.k, (T - view.y) / view.k], [wx1, wy1] = [(L + W - view.x) / view.k, (T + Hh - view.y) / view.k];
      sel.clear(); act.base.forEach(i => sel.add(i));
      S.nodes.forEach(n => { if (n.x < wx1 && n.x + n.w > wx0 && n.y < wy1 && n.y + n.h > wy0) sel.add(n.id); });
      markSel();
    }
  }

  async function up(e) {
    pointers.delete(e.pointerId);
    const a = act;
    if (!a) return;
    if (a.kind === 'pinch') { if (pointers.size < 2) act = null; return; }
    act = null;
    stage.classList.remove('panning');
    try { stage.releasePointerCapture(e.pointerId); } catch { }
    if (a.kind === 'pan' && !a.moved) { if (sel.size || selEdge) { sel.clear(); selEdge = null; markSel(); } return; }
    if (a.kind === 'drag') {
      if (a.moved) return R.store.saveAll('nodes', a.starts.map(s => node(s[0])).filter(Boolean), 'board');
      // a click on a card: open what it stands for
      const n = node(a.id);
      if (!a.multi && n?.type === 'entity' && n.refId) R.openEntity?.(n.refId);
      if (!a.multi && n?.type === 'source' && n.refId) R.views.sources.openPanel(n.refId);
      return;
    }
    if (a.kind === 'resize' && a.moved) return R.store.save('nodes', node(a.id), 'board');
    if (a.kind === 'link') {
      ghostEl.setAttribute('d', '');
      $$('.bd-node.target', nodesEl).forEach(d => d.classList.remove('target'));
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.bd-node');
      if (over && over.dataset.id !== a.from) await connect(a.from, over.dataset.id);
      return;
    }
    if (a.kind === 'marquee') { marquee.hidden = true; return; }
  }

  function dbl(e) {
    const label = e.target.closest('.bd-label');
    if (label) return editLabel(label.dataset.edge);
    const edge = e.target.closest('[data-edge]');
    if (edge) return editLabel(edge.dataset.edge);
    const nd = e.target.closest('.bd-node');
    if (nd) {
      const n = node(nd.dataset.id);
      if (n.type === 'note') return editNote(n.id);
      if (n.type === 'group' && e.target.closest('.bd-group-title')) return editGroupTitle(n.id);
      if (n.type === 'entity') return R.openEntity?.(n.refId, { focus: true });
      if (n.type === 'source') return R.views.sources.openPanel(n.refId);
      return;
    }
    // double-click on empty board: a sticky note right there
    addNode('note', {}, toWorld(e.clientX, e.clientY), true).then(n => editNote(n.id));
  }

  function wheel(e) {
    e.preventDefault();
    const lines = e.deltaMode === 1;
    const zoom = e.ctrlKey || lines || (Math.abs(e.deltaY) >= 50 && !e.deltaX && Number.isInteger(e.deltaY));
    if (zoom) zoomAt(view.k * Math.pow(1.0018, -(lines ? e.deltaY * 33 : e.deltaY) * (e.ctrlKey ? 3 : 1)), e.clientX, e.clientY);
    else { view.x -= e.deltaX; view.y -= e.deltaY; applyView(); }
  }

  /* ---------- toolbar + pickers ---------- */
  function toolClick(e) {
    const sw = e.target.closest('[data-color]');
    if (sw) return recolor(sw.dataset.color);
    const t = e.target.closest('[data-tool]')?.dataset.tool;
    if (!t) return;
    const btn = e.target.closest('[data-tool]');
    ({
      entity: () => entityPicker(btn), source: () => sourcePicker(btn), image: () => $('#bd-file', el).click(),
      note: () => addNode('note').then(n => editNote(n.id)), group: addGroup, delete: removeSelection,
      undo, redo, in: () => zoomAt(view.k * 1.2), out: () => zoomAt(view.k / 1.2), reset: () => zoomAt(1), fit, png: exportPng,
    })[t]?.();
  }

  function closePopover() { popover?.remove(); popover = null; }
  function openPopover(anchorEl, html) {
    closePopover();
    popover = document.createElement('div');
    popover.className = 'bd-pop';
    popover.innerHTML = html;
    el.querySelector('.bd').appendChild(popover);
    const a = anchorEl.getBoundingClientRect(), host = el.querySelector('.bd').getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(a.left - host.left, host.width - popover.offsetWidth - 8))}px`;
    popover.style.top = `${a.bottom - host.top + 6}px`;
    popover.addEventListener('pointerdown', e => e.stopPropagation());
    popover.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closePopover(); });
    return popover;
  }
  document.addEventListener('pointerdown', e => { if (popover && !e.target.closest('.bd-pop, [data-tool]')) closePopover(); });

  function entityPicker(btn) {
    const onBoard = new Set(S.nodes.filter(n => n.type === 'entity').map(n => n.refId));
    const free = S.entities.filter(x => !onBoard.has(x.id));
    let kind = 'person';
    const p = openPopover(btn, `
      <form class="bd-pop-form">
        <div class="bd-kinds">${Object.entries(R.ENTITY_KINDS).map(([k, x]) => `<button type="button" data-kind="${k}" class="${k === kind ? 'on' : ''}" style="--c:${x.color}">${icon(x.icon)}${x.label}</button>`).join('')}</div>
        <div class="row"><input name="name" placeholder="Name" required maxlength="120"><button class="btn btn-gold btn-sm">Add</button></div>
      </form>
      ${free.length ? `<p class="bd-pop-h">Already in this investigation</p><ul class="bd-pop-list">${free.map(x => `<li><button type="button" data-ent="${x.id}">${icon((R.ENTITY_KINDS[x.kind] || R.ENTITY_KINDS.other).icon)}${esc(x.name)}</button></li>`).join('')}</ul>` : ''}`);
    const form = $('form', p);
    $('.bd-kinds', p).addEventListener('click', e => { const b = e.target.closest('[data-kind]'); if (!b) return; kind = b.dataset.kind; $$('[data-kind]', p).forEach(x => x.classList.toggle('on', x === b)); form.name.focus(); });
    form.addEventListener('submit', async e => { e.preventDefault(); const name = form.name.value.trim(); if (!name) return; closePopover(); await addEntity(kind, name); });
    p.addEventListener('click', async e => { const b = e.target.closest('[data-ent]'); if (!b) return; closePopover(); await addNode('entity', { refId: b.dataset.ent }); });
    form.name.focus();
  }

  function sourcePicker(btn) {
    const onBoard = new Set(S.nodes.filter(n => n.type === 'source').map(n => n.refId));
    const free = S.sources.filter(s => !onBoard.has(s.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!S.sources.length) { toast('No sources yet. Add some in Sources or Search first.'); return; }
    if (!free.length) { toast('Every source is already on the board.'); return; }
    const p = openPopover(btn, `
      <input class="bd-pop-filter" placeholder="Filter sources…" aria-label="Filter sources">
      <ul class="bd-pop-list bd-pop-src">${free.map(s => `<li><label><input type="checkbox" value="${s.id}"><span>${esc(s.title || s.url || 'Untitled')}<small>${esc(s.publisher || host(s.url) || '')}</small></span></label></li>`).join('')}</ul>
      <div class="bd-pop-foot"><button type="button" class="link-btn" data-all>Select all</button><button type="button" class="btn btn-gold btn-sm" data-pin>Pin to board</button></div>`);
    const filter = $('.bd-pop-filter', p);
    filter.addEventListener('input', () => { const q = filter.value.toLowerCase(); $$('li', p).forEach(li => { li.hidden = !li.textContent.toLowerCase().includes(q); }); });
    $('[data-all]', p).addEventListener('click', () => $$('li:not([hidden]) input', p).forEach(i => { i.checked = true; }));
    $('[data-pin]', p).addEventListener('click', () => { const ids = $$('input:checked', p).map(i => i.value); closePopover(); pinSources(ids); });
    filter.focus();
  }

  /* ---------- PNG export (drawn by hand: no screenshot library) ---------- */
  async function exportPng() {
    if (!S.nodes.length) return toast('The board is empty.');
    const pad = 48, x0 = Math.min(...S.nodes.map(n => n.x)) - pad, y0 = Math.min(...S.nodes.map(n => n.y)) - pad;
    const x1 = Math.max(...S.nodes.map(n => n.x + n.w)) + pad, y1 = Math.max(...S.nodes.map(n => n.y + n.h)) + pad;
    const scale = Math.min(2, 8000 / Math.max(x1 - x0, y1 - y0));
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((x1 - x0) * scale); cv.height = Math.ceil((y1 - y0) * scale);
    const c = cv.getContext('2d');
    c.scale(scale, scale); c.translate(-x0, -y0);
    const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#0b0d29'); g.addColorStop(1, '#1b1742');
    c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    const font = (w, s) => `${w} ${s}px Inter, "Segoe UI", system-ui, sans-serif`;
    const wrap = (text, x, y, maxW, lh, maxLines) => {
      const words = String(text || '').split(/\s+/); let line = '', n = 0;
      for (let i = 0; i < words.length; i++) {
        const t = line ? `${line} ${words[i]}` : words[i];
        if (c.measureText(t).width > maxW && line) { c.fillText(n === maxLines - 1 ? `${line}…` : line, x, y + n * lh); n++; line = words[i]; if (n >= maxLines) return; }
        else line = t;
      }
      if (line && n < maxLines) c.fillText(line, x, y + n * lh);
    };
    const rr = (x, y, w, h, r) => { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); };
    // frames first, then lines, then cards
    for (const n of S.nodes.filter(n => n.type === 'group')) {
      c.fillStyle = 'rgba(154,148,201,.06)'; c.strokeStyle = colorOf(n); c.setLineDash([6, 5]); c.lineWidth = 1.5;
      rr(n.x, n.y, n.w, n.h, 14); c.fill(); c.stroke(); c.setLineDash([]);
      c.fillStyle = colorOf(n); c.font = font(700, 13); c.fillText((n.text || 'Group').toUpperCase(), n.x + 14, n.y + 24);
    }
    for (const e of S.edges) {
      const gm = edgeGeom(e); if (!gm) continue;
      c.strokeStyle = e.color || '#9a94c9'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(gm.x1, gm.y1); c.lineTo(gm.x2, gm.y2); c.stroke();
      const ang = Math.atan2(gm.y2 - gm.y1, gm.x2 - gm.x1);
      c.fillStyle = e.color || '#9a94c9'; c.beginPath(); c.moveTo(gm.x2, gm.y2);
      c.lineTo(gm.x2 - 10 * Math.cos(ang - .4), gm.y2 - 10 * Math.sin(ang - .4)); c.lineTo(gm.x2 - 10 * Math.cos(ang + .4), gm.y2 - 10 * Math.sin(ang + .4)); c.fill();
    }
    const drawLabels = () => {
      for (const e of S.edges) {
        const gm = edgeGeom(e); if (!gm || !e.label) continue;
        c.font = font(600, 11); const w = c.measureText(e.label).width + 14;
        c.fillStyle = '#141538'; rr(gm.mx - w / 2, gm.my - 10, w, 20, 10); c.fill();
        c.strokeStyle = 'rgba(154,148,201,.5)'; c.lineWidth = 1; c.stroke();
        c.fillStyle = '#e9e6ff'; c.textAlign = 'center'; c.fillText(e.label, gm.mx, gm.my + 4); c.textAlign = 'left';
      }
    };
    for (const n of S.nodes.filter(n => n.type !== 'group')) {
      const col = colorOf(n);
      if (n.type === 'image') {
        const im = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); const id = n.refId; (fileUrls.get(id) ? Promise.resolve(fileUrls.get(id)) : R.store.getFile(id).then(f => { const u = URL.createObjectURL(f.blob); fileUrls.set(id, u); return u; })).then(u => { i.src = u; }).catch(() => res(null)); });
        c.save(); rr(n.x, n.y, n.w, n.h, 10); c.clip();
        if (im) c.drawImage(im, n.x, n.y, n.w, n.h); else { c.fillStyle = '#141538'; c.fillRect(n.x, n.y, n.w, n.h); }
        c.restore(); c.strokeStyle = col; c.lineWidth = 1.5; rr(n.x, n.y, n.w, n.h, 10); c.stroke();
        continue;
      }
      c.fillStyle = n.type === 'note' ? col : '#181b42';
      c.globalAlpha = n.type === 'note' ? .92 : 1;
      rr(n.x, n.y, n.w, n.h, n.type === 'note' ? 4 : 12); c.fill(); c.globalAlpha = 1;
      if (n.type !== 'note') { c.strokeStyle = col; c.lineWidth = 1.5; c.stroke(); c.fillStyle = col; c.fillRect(n.x, n.y + 10, 3, n.h - 20); }
      const pad2 = 14;
      if (n.type === 'note') { c.fillStyle = '#2a2210'; c.font = font(500, 13); wrap(n.text, n.x + pad2, n.y + 24, n.w - pad2 * 2, 18, Math.floor((n.h - 20) / 18)); continue; }
      const e = n.type === 'entity' ? ent(n.refId) : null, s = n.type === 'source' ? src(n.refId) : null;
      c.fillStyle = col; c.font = font(700, 10);
      c.fillText((e ? kindOf(n).label : (R.SOURCE_TYPES[s?.type] || R.SOURCE_TYPES.other).label).toUpperCase(), n.x + pad2, n.y + 22);
      c.fillStyle = '#e9e6ff'; c.font = font(600, 14);
      wrap(e ? e.name : s?.title || 'Source', n.x + pad2, n.y + 42, n.w - pad2 * 2, 18, 2);
      c.fillStyle = '#9a94c9'; c.font = font(400, 11);
      const sub = e ? e.description || '' : [s?.publisher || host(s?.url), fmtDate(s?.publishedAt)].filter(Boolean).join(' · ');
      if (n.h > 70) wrap(sub, n.x + pad2, n.y + 78, n.w - pad2 * 2, 15, Math.max(1, Math.floor((n.h - 84) / 15)));
    }
    drawLabels();                       // labels sit on top of the cards, like on screen
    c.fillStyle = 'rgba(247,220,132,.55)'; c.font = font(600, 10);
    c.fillText(`AVALON RESEARCH · ${S.inv.title.toUpperCase()} · ${today()}`, x0 + 16, y1 - 16);
    cv.toBlob(b => { download(`${slug(S.inv.title)}-board.png`, b); toast('Board exported as PNG.'); }, 'image/png');
  }

  /* ---------- keyboard (called by app.js before its own shortcuts) ---------- */
  function key(e) {
    if (!el || !document.body.contains(el) || editing) return false;
    const a = document.activeElement, typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(a?.tagName);
    if (typing) return false;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return true; }
    if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return true; }
    if (mod && k === 'a') { e.preventDefault(); S.nodes.forEach(n => sel.add(n.id)); markSel(); return true; }
    if (mod || e.altKey) return false;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelection(); return true; }
    if (e.key === 'Escape' && (sel.size || selEdge)) { sel.clear(); selEdge = null; markSel(); return true; }
    if (e.key.startsWith('Arrow') && sel.size) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (!e.repeat) checkpoint();
      const ns = [...sel].map(node).filter(Boolean);
      ns.forEach(n => { n.x += d[0]; n.y += d[1]; });
      place(ns.map(n => n.id)); saveNudge(ns);
      return true;
    }
    const act2 = {
      f: fit, 0: () => zoomAt(1), '=': () => zoomAt(view.k * 1.2), '+': () => zoomAt(view.k * 1.2), '-': () => zoomAt(view.k / 1.2),
      n: () => addNode('note').then(n => editNote(n.id)), e: () => entityPicker($('[data-tool="entity"]', el)),
      c: () => { const ids = [...sel]; if (ids.length === 2) connect(ids[0], ids[1]); else toast('Select two cards to connect them.'); },
    }[e.key];
    if (act2) { e.preventDefault(); act2(); return true; }
    return false;
  }
  const saveNudge = debounce(ns => R.store.saveAll('nodes', ns, 'board'), 400);

  /* ---------- data changes from elsewhere ---------- */
  function update(kind, id, from) {
    if (!el || !document.body.contains(el)) return false;
    if (from === 'board') return true;
    if (['nodes', 'edges', 'entities', 'sources', 'highlights', 'external', 'entityFields'].includes(kind)) { if (!editing) draw(); return true; }
    if (kind === 'selection' || kind === 'inv') return true;
    return false;
  }

  return { render, update, key, focusNode: id => { sel.clear(); sel.add(id); markSel(); } };
})();
