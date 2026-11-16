/* =====================================================================
   AVALON RESEARCH — shell
   Hash routes (never query strings: on file:// Firefox can give a URL with
   a query string its own separate storage):
     #/                         all investigations
     #/inv/<id>/<section>       one investigation
   Layout: sidebar | main view | details panel. Views live in views/*.js
   and register themselves on R.views.
   ===================================================================== */
'use strict';

const { S } = R.store;

R.SECTIONS = [
  { k: 'overview', label: 'Overview', icon: 'layout' },
  { k: 'search', label: 'Search', icon: 'search', phase: 3 },
  { k: 'board', label: 'Board', icon: 'board', phase: 4 },
  { k: 'sources', label: 'Sources', icon: 'link' },
  { k: 'entities', label: 'Entities', icon: 'users', phase: 5 },
  { k: 'notes', label: 'Notes', icon: 'pen', phase: 5 },
  { k: 'findings', label: 'Findings', icon: 'check', phase: 5 },
  { k: 'timeline', label: 'Timeline', icon: 'timeline', phase: 5 },
  { k: 'tasks', label: 'Tasks', icon: 'list', phase: 6 },
];
const BUILT = new Set(['overview', 'search', 'board', 'sources']);

/* ---------- the investigator (os/investigator.js) narrates what happens ---------- */
R.agent = (() => {
  const d = window.AvalonInvestigator?.desk($('#rx-agent'), { text: 'Ready when you are.' });
  if (!d) return { event() { }, next: null };
  const q = t => `“${String(t || 'Untitled').length > 46 ? String(t).slice(0, 45) + '…' : t || 'Untitled'}”`;
  const EV = {
    home: n => ['idle', n ? `${plural(n, 'case')} on file. Pick one, or press N to open another.` : 'No cases yet. Press N to open one.'],
    open: inv => ['wave', `On the case: ${q(inv.title)}. ${S.sources.length ? `${plural(S.sources.length, 'source')} on file.` : 'No sources yet. Press A to add one.'}`],
    created: inv => ['found', `New case opened: ${q(inv.title)}. Add a first source with A.`],
    deleted: () => ['think', 'Case removed from the files.'],
    filed: src => ['write', `Filed ${q(src.title || src.url)}.`],
    dup: src => ['found', `Already on file: ${q(src.title || src.url)}.`, 'warn'],
    elsewhere: inv => ['think', `I have seen this link before, in ${q(inv.title)}.`],
    quote: () => ['write', 'Quote noted in the margin.'],
    unfiled: () => ['think', 'Source removed.'],
    cite: n => ['write', `References ready: ${plural(n, 'source')}.`],
  };
  return {
    desk: d,
    next: null,                       // an event to tell instead of the next route's default line
    event(kind, arg) {
      const e = EV[kind]?.(arg);
      if (!e) return;
      d.do(e[0]);
      if (e[2]) d.mood(e[2], 5000);
      d.say(e[1]);
    },
  };
})();

const rx = $('#rx'), main = $('#rx-main');
const narrowSide = matchMedia('(max-width: 760px)');
const narrowPanel = matchMedia('(max-width: 1100px)');

/* ---------- routing ---------- */
R.route = { view: 'home', inv: null, section: null };
R.go = hash => { if (location.hash !== hash) location.hash = hash; else route(); };
const routeWaiters = [];
/** Navigate and resolve once that screen has rendered. */
R.goAndWait = (hash, { replace = false } = {}) => new Promise(res => {
  routeWaiters.push(res);
  if (replace) { history.replaceState(null, '', hash); route(); }   // no new history entry (keeps Back pointing where you came from)
  else R.go(hash);
});
R.invHash = (id, section = 'overview') => `#/inv/${id}/${section}`;

let routeRun = 0;
async function route() {
  const run = ++routeRun;
  const m = location.hash.match(/^#\/inv\/([^/]+)(?:\/([a-z]+))?/);
  closeDrawers();
  if (m) {
    const id = decodeURIComponent(m[1]);
    const section = R.SECTIONS.some(s => s.k === m[2]) ? m[2] : 'overview';
    if (S.inv?.id !== id) { R.panel.close(); await R.store.load(id); }
    if (run !== routeRun) return;
    if (!S.inv) { toast('That investigation no longer exists.', 'err'); return R.go('#/'); }
    R.route = { view: section, inv: id, section };
    R.ui.last = id; R.saveUi();
  } else {
    if (S.inv) { R.panel.close(); S.inv = null; }
    R.route = { view: 'home', inv: null, section: null };
  }
  const prevInv = lastInv, first = !routed;
  lastInv = R.route.inv; routed = true;
  renderSide();
  enter = true;
  renderMain();
  main.scrollTop = 0;
  // the investigator's line for this screen
  if (R.agent.next) { R.agent.event(...R.agent.next); R.agent.next = null; }
  else if (!R.route.inv) { if (prevInv || first) R.agent.event('home', S.invs.length); }
  else if (R.route.inv !== prevInv) R.agent.event('open', S.inv);
  routeWaiters.splice(0).forEach(f => f());
}
let lastInv = null, routed = false, enter = false;
window.addEventListener('hashchange', route);

/* ---------- main view ---------- */
function renderMain() {
  const v = R.route.view;
  document.title = S.inv ? `${S.inv.title} · Research` : 'Avalon Research';
  // each render gets a fresh element, so listeners a view adds die with it
  const el = document.createElement('div');
  el.className = `rx-view rx-v-${v}${enter ? ' rx-enter' : ''}`;   // only navigation animates, not data refreshes
  enter = false;
  main.replaceChildren(el);
  main.classList.toggle('rx-full', v === 'board');     // the board fills the whole area
  if (v !== 'home' && !BUILT.has(v)) return renderSoon(el, v);
  R.views[v].render(el);
}
R.renderMain = renderMain;
function renderSoon(el, k) {
  const s = R.SECTIONS.find(x => x.k === k);
  el.innerHTML = `
    <div class="rx-soon">
      ${icon(s.icon)}
      <h1>${esc(s.label)}</h1>
      <p>This section arrives in phase ${s.phase} of the Research build.</p>
      <a class="btn" href="${R.invHash(S.inv.id, 'sources')}">${icon('link')}Go to Sources</a>
    </div>`;
}

/* ---------- sidebar ---------- */
const typeIcon = t => icon((R.TYPES[t] || R.TYPES.custom).icon);
function renderSide() {
  const cur = $('#rx-current');
  if (S.inv) {
    const i = S.inv, st = R.STATUS[i.status] || R.STATUS.active;
    const counts = { sources: S.sources.length };
    cur.innerHTML = `
      <a class="rx-cur" href="${R.invHash(i.id)}">
        <span class="rx-cur-type">${typeIcon(i.type)}${esc(R.TYPES[i.type]?.label || 'Custom')}<i class="st ${st.cls}">${st.label}</i></span>
        <span class="rx-cur-title">${esc(i.title)}</span>
      </a>
      <nav class="rx-nav" aria-label="Sections">
        ${R.SECTIONS.map((s, n) => `
          <a href="${R.invHash(i.id, s.k)}" class="${R.route.section === s.k ? 'on' : ''} ${BUILT.has(s.k) ? '' : 'soon'}" title="${esc(s.label)} (Alt ${n + 1})">
            ${icon(s.icon)}<span>${esc(s.label)}</span>${counts[s.k] ? `<b>${counts[s.k]}</b>` : ''}${BUILT.has(s.k) ? '' : '<small>soon</small>'}
          </a>`).join('')}
      </nav>`;
  } else cur.innerHTML = '';

  const q = $('#rx-side-filter').value.trim().toLowerCase();
  const list = [...S.invs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter(i => !q || i.title.toLowerCase().includes(q) || i.tags.some(t => t.toLowerCase().includes(q)));
  $('#rx-count').textContent = S.invs.length || '';
  $('#rx-inv-list').innerHTML = list.map(i => `
    <li><a href="${R.invHash(i.id)}" class="${S.inv?.id === i.id ? 'on' : ''}">
      <i class="dot ${(R.STATUS[i.status] || R.STATUS.active).cls}"></i>${typeIcon(i.type)}<span>${esc(i.title)}</span>
    </a></li>`).join('') || `<li class="empty">${S.invs.length ? 'No match.' : 'None yet.'}</li>`;
}
$('#rx-side-filter').addEventListener('input', renderSide);

async function renderFoot() {
  const used = await R.db.usage();
  const where = R.db.mode === 'idb' ? 'Saved in this browser' : 'Basic storage: uploads are off';
  $('#rx-foot').innerHTML = `
    <span class="${R.db.mode === 'idb' ? '' : 'warn'}" title="${R.db.mode === 'idb' ? 'IndexedDB, private to this browser profile' : 'IndexedDB could not be opened, so Research is using localStorage'}">
      ${icon(R.db.mode === 'idb' ? 'database' : 'alert')}${where}${used != null ? ` · ${fmtSize(used)}` : ''}
    </span>`;
}

/* ---------- details panel ---------- */
R.panel = (() => {
  const body = $('#rx-panel-body');
  let key = null, draw = null;
  const placeholder = () => {
    body.innerHTML = `<div class="rx-panel-empty">${icon('panel-right')}<p>Select a source to see its details, notes and highlights here.</p></div>`;
  };
  placeholder();
  return {
    get key() { return key; },
    open(k, fn) {
      if (k !== key) { body.classList.remove('rx-pane-in'); void body.offsetWidth; body.classList.add('rx-pane-in'); }
      key = k; draw = fn;
      rx.classList.remove('no-panel');
      if (narrowPanel.matches) { rx.classList.add('panel-open'); showScrim(); }
      fn(body);
    },
    refresh() { if (draw) draw(body); },
    close() {
      key = null; draw = null; placeholder();
      rx.classList.remove('panel-open');
      if (!rx.classList.contains('side-open')) hideScrim();
      R.store.emit('selection');
    },
  };
})();

/* ---------- layout: drawers, toggles, resizing ---------- */
const scrim = $('#rx-scrim');
const showScrim = () => { scrim.hidden = false; };
const hideScrim = () => { scrim.hidden = true; };
function closeDrawers() { rx.classList.remove('side-open', 'panel-open'); hideScrim(); }
scrim.addEventListener('click', () => { if (rx.classList.contains('panel-open')) R.panel.close(); closeDrawers(); });

function toggleSide() {
  if (narrowSide.matches) { const on = rx.classList.toggle('side-open'); on ? showScrim() : hideScrim(); return; }
  R.ui.sideHidden = rx.classList.toggle('no-side'); R.saveUi();
}
function togglePanel() {
  if (narrowPanel.matches) {
    if (rx.classList.contains('panel-open')) { rx.classList.remove('panel-open'); hideScrim(); }
    else { rx.classList.add('panel-open'); showScrim(); }
    return;
  }
  R.ui.panelHidden = rx.classList.toggle('no-panel'); R.saveUi();
}
$('#rx-menu').addEventListener('click', toggleSide);
$('#rx-panel-btn').addEventListener('click', togglePanel);
$('#rx-inv-list').addEventListener('click', e => { if (e.target.closest('a') && narrowSide.matches) closeDrawers(); });
$('#rx-current').addEventListener('click', e => { if (e.target.closest('a') && narrowSide.matches) closeDrawers(); });

function applyLayout() {
  if (R.ui.side) rx.style.setProperty('--rx-side', `${R.ui.side}px`);
  if (R.ui.panel) rx.style.setProperty('--rx-panel', `${R.ui.panel}px`);
  rx.classList.toggle('no-side', !!R.ui.sideHidden);
  rx.classList.toggle('no-panel', !!R.ui.panelHidden);
}
$$('.rx-resize').forEach(h => h.addEventListener('pointerdown', e => {
  const which = h.dataset.resize, start = e.clientX;
  const startW = which === 'side' ? $('#rx-side').offsetWidth : $('#rx-panel').offsetWidth;
  const [min, max] = which === 'side' ? [200, 420] : [300, 620];
  h.setPointerCapture(e.pointerId);
  document.body.classList.add('rx-resizing');
  const move = ev => {
    const w = Math.round(Math.min(max, Math.max(min, startW + (which === 'side' ? ev.clientX - start : start - ev.clientX))));
    rx.style.setProperty(`--rx-${which}`, `${w}px`);
    R.ui[which] = w;
  };
  const up = () => { h.removeEventListener('pointermove', move); document.body.classList.remove('rx-resizing'); R.saveUi(); };
  h.addEventListener('pointermove', move);
  h.addEventListener('pointerup', up, { once: true });
  h.addEventListener('pointercancel', up, { once: true });
}));

/* ---------- investigation dialog ---------- */
const invDlg = $('#inv-dlg'), invForm = $('#inv-form');
invForm.type.innerHTML = Object.entries(R.TYPES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('');
invForm.status.innerHTML = Object.entries(R.STATUS).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('');
let editingInv = null;
R.allTags = () => [...new Set(S.invs.flatMap(i => i.tags))].sort((a, b) => a.localeCompare(b));
R.editInv = (inv = null) => {
  editingInv = inv;
  $('#inv-dlg-title').textContent = inv ? 'Edit investigation' : 'New investigation';
  invForm.title.value = inv?.title || '';
  invForm.type.value = inv?.type || 'topic';
  invForm.status.value = inv?.status || 'active';
  invForm.description.value = inv?.description || '';
  invForm.tags.value = (inv?.tags || []).join(', ');
  $('#rx-tag-list').innerHTML = R.allTags().map(t => `<option value="${esc(t)}">`).join('');
  invDlg.showModal();
  invForm.title.focus();
};
invForm.addEventListener('submit', async e => {
  e.preventDefault();
  const data = {
    title: invForm.title.value.trim().slice(0, 140),
    type: invForm.type.value, status: invForm.status.value,
    description: invForm.description.value.trim(),
    tags: [...new Set(invForm.tags.value.split(',').map(t => t.trim()).filter(Boolean))].slice(0, 20),
  };
  if (!data.title) return invForm.title.focus();
  invDlg.close();
  if (editingInv) { await R.store.updateInv(editingInv.id, data); toast('Investigation updated.'); }
  else { const inv = await R.store.createInv(data); R.agent.next = ['created', inv]; R.go(R.invHash(inv.id)); toast(`Created <b>${esc(inv.title)}</b>.`); }
});
R.deleteInv = async inv => {
  const n = await R.db.count('sources', 'investigationId', inv.id);
  const ok = await ask({
    title: `Delete “${inv.title}”?`,
    text: `This removes the investigation${n ? ` and its ${plural(n, 'source')}, highlights and uploaded files` : ''}. It can't be undone.`,
  });
  if (!ok) return;
  R.agent.next = ['deleted'];
  await R.store.deleteInv(inv.id);
  toast('Investigation deleted.');
  R.go('#/');
};
$('#rx-new').addEventListener('click', () => { closeDrawers(); R.editInv(); });

document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]');
  if (c) c.closest('dialog')?.close();
});

/* ---------- reacting to data changes ---------- */
R.store.on((kind, id, from) => {
  if (['invs', 'inv', 'sources', 'external', 'closed'].includes(kind)) renderSide();
  if (kind === 'closed') { toast('This investigation was deleted in another tab.', 'err'); return R.go('#/'); }
  if (R.route.inv && !S.inv) return R.go('#/');      // the open investigation was just deleted
  if (kind === 'sources' || kind === 'highlights') renderFoot();
  if (kind === 'external' && R.panel.key) R.panel.refresh();
  // a view can handle a change itself (update returns true); changes a view made
  // itself (from === view) don't redraw it, so a field being typed in keeps focus
  const view = R.route.view, v = R.views[view];
  if (!v || !(view === 'home' || BUILT.has(view))) return;
  if (v.update && v.update(kind, id, from)) return;
  if (kind !== 'selection' && from !== view) renderMain();
});

/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  if (document.querySelector('dialog[open]')) return;
  const a = document.activeElement;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(a?.tagName) || a?.isContentEditable;
  if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key) && S.inv) {
    e.preventDefault();
    return R.go(R.invHash(S.inv.id, R.SECTIONS[+e.key - 1].k));
  }
  if (e.key === 'Escape') {
    if (typing) return a.blur();
    if (rx.classList.contains('side-open')) return closeDrawers();
    if (R.panel.key) return R.panel.close();
    return;
  }
  if (R.views[R.route.view]?.key?.(e)) return;        // the board handles its own keys first
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const act = {
    n: () => R.editInv(),
    a: () => { if (S.inv) R.views.sources.add(); },
    h: () => R.go('#/'),
    '/': () => $('[data-filter]', main)?.focus(),
    '[': toggleSide,
    ']': togglePanel,
    '?': () => $('#help-dlg').showModal(),
    s: () => R.views[R.route.view]?.save?.(),
    o: () => R.views[R.route.view]?.open?.(),
    j: () => R.views[R.route.view]?.step?.(1),
    k: () => R.views[R.route.view]?.step?.(-1),
  }[e.key.toLowerCase()];
  if (act) { e.preventDefault(); act(); }
});
$('#rx-help-btn').addEventListener('click', () => $('#help-dlg').showModal());

/* ---------- boot ---------- */
(async () => {
  applyLayout();
  await R.db.init();
  await R.store.boot();
  renderFoot();
  if (!location.hash && R.ui.last && S.invs.some(i => i.id === R.ui.last)) history.replaceState(null, '', R.invHash(R.ui.last));
  await route();
  R.incoming.check();                  // a result handed over from Avalon Search
})().catch(err => {
  console.error(err);
  main.innerHTML = `<div class="rx-soon">${icon('alert')}<h1>Research couldn't start</h1><p>${esc(err.message || err)}</p></div>`;
});
