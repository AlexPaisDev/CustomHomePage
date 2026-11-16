/* =====================================================================
   AVALON TREASURY — the shell: rail, routing, command deck, the
   accountant, keyboard, and redraws when the books change.
   Routes are hashes (#/vault, #/ledger …) so file:// keeps one storage.
   ===================================================================== */
'use strict';

T.SECTIONS = [
  { k: 'vault', label: 'Vault', icon: 'gauge', n: '01' },
  { k: 'ledger', label: 'Ledger', icon: 'receipt', n: '02' },
  { k: 'wishlist', label: 'Wishlist', icon: 'gift', n: '03' },
  { k: 'budgets', label: 'Budgets', icon: 'pie', n: '04' },
  { k: 'recurring', label: 'Recurring', icon: 'repeat', n: '05' },
];

/* ---------- per-viewer UI memory (month shown, filters) ---------- */
const UI_KEY = 'avalon_treasury_ui';
T.ui = (() => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch { return {}; } })();
T.saveUi = debounce(() => { try { localStorage.setItem(UI_KEY, JSON.stringify(T.ui)); } catch { } }, 200);
T.month = () => T.ui.month || thisMonth();
T.setMonth = key => { T.ui.month = key > thisMonth() ? thisMonth() : key; T.saveUi(); T.render(); };

/* ---------- routing ---------- */
T.section = () => {
  const k = (location.hash.match(/^#\/([a-z]+)/) || [])[1];
  return T.SECTIONS.some(s => s.k === k) ? k : 'vault';
};
T.go = k => { if (location.hash !== `#/${k}`) location.hash = `#/${k}`; else T.render(); };
window.addEventListener('hashchange', () => T.render());

/* ---------- rail ---------- */
function buildRail() {
  $('#tr-rail').innerHTML = `
    <ul class="rail-list">${T.SECTIONS.map(s => `
      <li><a class="rail-a" href="#/${s.k}" data-k="${s.k}" title="${s.label} (${s.n.slice(1)})">
        <span class="rail-ic">${icon(s.icon)}</span><span class="rail-n">${s.n}</span><span class="rail-l">${s.label}</span><b class="rail-b" data-b="${s.k}"></b>
      </a></li>`).join('')}
    </ul>
    <div class="rail-agent" id="tr-agent"></div>
    <div class="rail-foot" id="tr-foot"></div>`;
}
function updateRail() {
  const k = T.section();
  $$('.rail-a').forEach(a => a.classList.toggle('on', a.dataset.k === k));
  $$('.rail-a').forEach(a => a.toggleAttribute('aria-current', a.dataset.k === k));
  const m = thisMonth(), st = T.state;
  const over = st.categories.filter(c => c.budget && T.sum(T.inMonth(m).filter(e => e.categoryId === c.id)) > c.budget).length;
  const soon = st.recurring.filter(r => r.active && r.next && dayDiff(today(), r.next) <= 7).length;
  const badge = {
    ledger: T.inMonth(m).length || '',
    wishlist: st.wishes.filter(w => w.status === 'active').length || '',
    budgets: over ? `${over}!` : '',
    recurring: soon || '',
  };
  $$('.rail-b').forEach(b => { b.textContent = badge[b.dataset.b] ?? ''; b.classList.toggle('hot', b.dataset.b === 'budgets' && !!over); });
  const n = st.expenses.length;
  $('#tr-foot').innerHTML = T.storage === 'ok'
    ? `<span class="dot ok"></span>Saved in this browser · ${plural(n, 'entry')}`
    : `<span class="dot warn"></span>${T.storage === 'full' ? 'Storage is full' : 'Not saved: storage is blocked'}`;
  $('#tr-month').textContent = fmtMonth(m, true);
}

/* ---------- drawing the current section ---------- */
let lastKey = '';
T.render = ({ soft = false } = {}) => {
  const k = T.section(), view = T.views[k], el = $('#tr-view');
  // keep the caret where it was when a redraw comes in while typing in the view
  const a = document.activeElement, keep = a && el.contains(a) && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
  const enter = !soft || k !== lastKey;
  const y = $('#tr-main').scrollTop;
  el.className = `tr-view v-${k}`;
  el.innerHTML = '';
  el.onclick = el.onchange = el.onkeydown = el.oninput = null;
  view.render(el);
  updateRail();
  if (enter) {
    el.classList.add('tr-enter');
    if (k !== lastKey) $('#tr-main').scrollTop = 0;
    T.charts.countUp(el);
    setTimeout(() => el.classList.remove('tr-enter'), 900);
  } else $('#tr-main').scrollTop = y;
  if (keep) { const n = document.getElementById(keep.id); if (n) { n.focus(); try { n.setSelectionRange(keep.s, keep.e); } catch { } } }
  if (k !== lastKey) { document.title = `${T.SECTIONS.find(s => s.k === k).label} · Avalon Treasury`; if (lastKey) T.agent.brief(); }
  lastKey = k;
};
let redraw = 0;
T.changed = (what, local) => {
  cancelAnimationFrame(redraw);
  redraw = requestAnimationFrame(() => {
    T.render({ soft: true });
    deckPreview();
    if (!local) T.agent.brief();
  });
};

/* ---------- the accountant ---------- */
T.agent = (() => {
  let desk = null;
  function coins() {
    const act = T.state.wishes.filter(w => w.status === 'active' && w.price);
    const want = T.sum(act.map(w => ({ amount: w.price }))), saved = act.reduce((a, w) => a + Math.min(w.saved || 0, w.price), 0);
    desk?.coins(want ? Math.ceil(saved / want * 4) : 0);
  }
  /** The state of the month in one line, and a mood to match. */
  function brief() {
    if (!desk) return;
    coins();
    const p = T.pace(), b = p.budget, st = T.state;
    if (!st.expenses.length && !st.wishes.length) { desk.mood('ok'); return desk.say('Ledger’s open. Type “4.20 coffee” in the deck above and I’ll file it.'); }
    if (!b) { desk.mood('ok'); return desk.say(`${T.money(p.spent)} out this month. Give me a budget (Budgets) and I’ll keep the pace.`); }
    const left = b - p.spent;
    if (left < 0) { desk.mood('hot'); desk.do('think'); return desk.say(`Over budget by ${T.money(-left)} with ${plural(p.left, 'day')} to go.`); }
    if (p.projected > b) {
      desk.mood('warn');
      return desk.say(`At this pace you’ll end on ${T.money(p.projected, { compact: true })}. ${T.money(Math.floor(left / Math.max(1, p.left)))} a day keeps you on budget.`);
    }
    desk.mood('ok');
    desk.say(`${T.money(left)} left for ${plural(p.left, 'day')}: ${T.money(Math.floor(left / Math.max(1, p.left)))} a day. On track.`);
  }
  /** Reacts to what you just did; budget warnings win over pleasantries. */
  function on(evt, x = {}) {
    if (!desk) return;
    coins();
    if (evt === 'expense') {
      const c = T.cat(x.categoryId), m = monthKey(x.date);
      if (c?.budget && m === thisMonth()) {
        const spent = T.sum(T.inMonth(m).filter(e => e.categoryId === c.id));
        if (spent > c.budget) { desk.do('think'); desk.mood('hot', 6000); return desk.say(`${c.name} is over budget by ${T.money(spent - c.budget)}.`); }
        if (spent > c.budget * .8) { desk.do('write'); desk.mood('warn', 5000); return desk.say(`Logged. ${c.name} is at ${Math.round(spent / c.budget * 100)}% of its budget.`); }
      }
      desk.do('write');
      return desk.say(`Logged ${T.money(x.amount)}${c ? ` under ${c.name}` : ''}${x.date !== today() ? `, ${fmtDay(x.date).toLowerCase()}` : ''}.`);
    }
    if (evt === 'income') { desk.do('found'); return desk.say(`Income in: ${T.money(x.amount, { sign: true })}. The vault approves.`); }
    if (evt === 'wish') {
      desk.do('think');
      const cool = T.state.settings.coolOff;
      return desk.say(cool ? `On the list. Cool-off ends ${fmtDay(addDays(today(), cool)).toLowerCase()}: if you still want it then, it’s a real want.` : 'On the list.');
    }
    if (evt === 'fund') {
      const pct = Math.round(T.progress(x) * 100);
      desk.do(pct >= 100 ? 'found' : 'count');
      if (pct < 100) setTimeout(() => desk.do('idle'), 1400);
      return desk.say(pct >= 100 ? `Fully funded: ${x.name}. Ready when you are.` : `${T.money(x.saved)} set aside: ${pct}% of the way to ${x.name}.`);
    }
    if (evt === 'price') {
      const ch = T.priceChange(x);
      if (ch < 0) { desk.do('found'); return desk.say(`Price down ${Math.round(-ch * 100)}% on ${x.name} since you started watching.`); }
      desk.do('write'); return desk.say(ch > 0 ? `Noted. ${x.name} is up ${Math.round(ch * 100)}%. Patience.` : `Price noted for ${x.name}.`);
    }
    if (evt === 'bought') { desk.do('found'); return desk.say(`Acquired: ${x.name}. ${x.paid < x.price ? `${T.money(x.price - x.paid)} under the list price.` : 'Enjoy it.'}`); }
    if (evt === 'posted') { desk.do('write'); return desk.say(`Posted ${plural(x.n, 'recurring payment')} that came due.`); }
    if (evt === 'deleted') { desk.do('idle'); return desk.say('Struck from the books.'); }
    if (evt === 'say') { desk.do(x.act || 'idle'); return desk.say(x.text); }
  }
  return {
    mount(el) { desk = AvalonAccountant.desk(el, { name: 'Accountant', text: 'Counting…' }); desk.do('count'); },
    brief, on,
    get desk() { return desk; },
  };
})();

/* ---------- command deck ---------- */
let deckCat = null;   // category picked by hand in the preview
function deckParse() {
  const p = T.parse($('#deck-in').value);
  if (deckCat !== null && !p.wish && p.kind === 'expense') { p.categoryId = deckCat; p.how = 'picked'; }
  return p;
}
function deckPreview() {
  const box = $('#deck-preview'), v = $('#deck-in').value;
  if (!v.trim()) { box.innerHTML = ''; $('#deck').classList.remove('has'); return; }
  $('#deck').classList.add('has');
  const p = deckParse();
  const partial = (v.match(/#(\S*)$/) || [])[1];
  if (partial !== undefined) {
    const q = fold(partial);
    const hits = T.state.categories.filter(c => fold(c.name).replace(/\s|&/g, '').startsWith(q) || fold(c.name).includes(q)).slice(0, 8);
    box.innerHTML = `<span class="dp-k">Category</span>${hits.map(c => `<button type="button" class="dp-chip dp-cat" style="--c:${c.color}" data-fill="${esc(c.id)}">${icon(c.icon)}${esc(c.name)}</button>`).join('') || '<span class="dp-none">No category starts like that</span>'}`;
    return;
  }
  if (p.wish) {
    box.innerHTML = `<span class="dp-chip dp-wish">${icon('gift')}Wishlist</span>
      ${p.note ? `<span class="dp-chip">${esc(p.note)}</span>` : '<span class="dp-none">name it</span>'}
      ${Number.isNaN(p.amount) ? '<span class="dp-none">price?</span>' : `<span class="dp-chip dp-amt">${T.money(p.amount)}</span>`}
      ${p.url ? `<span class="dp-chip">${icon('external')}${esc(host(p.url))}</span>` : ''}
      <span class="dp-hint">Enter to add</span>`;
    return;
  }
  const c = T.cat(p.categoryId);
  const how = { history: 'as before', keyword: 'guessed', name: 'guessed', tag: '', picked: '' }[p.how] || '';
  box.innerHTML = `
    ${Number.isNaN(p.amount) ? '<span class="dp-none">start with an amount</span>' : `<span class="dp-chip dp-amt ${p.kind}">${T.money(p.kind === 'income' ? p.amount : -p.amount, { sign: true })}</span>`}
    ${p.kind === 'income' ? `<span class="dp-chip dp-cat" style="--c:var(--green)">${icon('trend-up')}Income</span>` : `
    <label class="dp-chip dp-cat dp-sel" style="--c:${c ? c.color : 'var(--text-3)'}">${icon(c ? c.icon : 'tag')}
      <select id="deck-cat" aria-label="Category">${[`<option value="">No category</option>`, ...T.state.categories.map(x => `<option value="${esc(x.id)}" ${x.id === p.categoryId ? 'selected' : ''}>${esc(x.name)}</option>`)].join('')}</select>
      ${how ? `<small>${how}</small>` : ''}</label>`}
    <span class="dp-chip">${icon('calendar')}${fmtDay(p.date)}</span>
    ${p.note ? `<span class="dp-chip dp-note">${esc(p.note)}</span>` : ''}
    <span class="dp-hint">Enter to log</span>`;
}
function wireDeck() {
  const input = $('#deck-in'), form = $('#deck');
  input.addEventListener('input', () => { if (!input.value.trim()) deckCat = null; deckPreview(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; deckCat = null; deckPreview(); input.blur(); }
    if (e.key === 'Tab' && /#\S*$/.test(input.value)) { const b = $('[data-fill]', $('#deck-preview')); if (b) { e.preventDefault(); b.click(); } }
  });
  $('#deck-preview').addEventListener('click', e => {
    const b = e.target.closest('[data-fill]');
    if (!b) return;
    input.value = input.value.replace(/#\S*$/, '').trimEnd() + ' ';
    deckCat = b.dataset.fill;
    deckPreview(); input.focus();
  });
  $('#deck-preview').addEventListener('change', e => { if (e.target.id === 'deck-cat') { deckCat = e.target.value; deckPreview(); input.focus(); } });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const p = deckParse();
    if (p.wish) {
      if (!p.note) return nudge('Give the wish a name: “wish Headphones 199”.');
      const w = T.add('wishes', { name: p.note, url: p.url, image: '', price: Number.isNaN(p.amount) ? 0 : p.amount, priority: 'want', saved: 0, target: '', status: 'active', note: '', prices: Number.isNaN(p.amount) ? [] : [{ date: today(), price: p.amount }] });
      T.save('wishes');
      T.agent.on('wish', w);
      toast(`Wished for <b>${esc(w.name)}</b> <button class="link-btn" data-open-wish>Open</button>`).querySelector('[data-open-wish]').onclick = () => T.go('wishlist');
    } else {
      if (Number.isNaN(p.amount) || !p.amount) return nudge('Start with an amount: “12.50 lunch”.');
      const x = T.add('expenses', { kind: p.kind, amount: p.amount, categoryId: p.kind === 'income' ? '' : p.categoryId, note: p.note, date: p.date });
      T.save('expenses');
      T.agent.on(p.kind, x);
      const t = toast(`${p.kind === 'income' ? 'Income' : 'Logged'} <b>${T.money(x.amount)}</b>${T.cat(x.categoryId) ? ` · ${esc(T.cat(x.categoryId).name)}` : ''} <button class="link-btn" data-undo>Undo</button>`);
      t.querySelector('[data-undo]').onclick = () => { T.remove('expenses', x.id); T.save('expenses'); t.remove(); T.agent.brief(); };
    }
    input.value = ''; deckCat = null; deckPreview();
    form.classList.remove('pulse'); void form.offsetWidth; form.classList.add('pulse');
  });
}
function nudge(msg) {
  const f = $('#deck');
  f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
  T.agent.on('say', { text: msg, act: 'think' });
}
T.focusDeck = (text = '') => { const i = $('#deck-in'); if (text) { i.value = text; deckPreview(); } i.focus(); i.setSelectionRange(i.value.length, i.value.length); };

/* ---------- dialogs and segmented controls ---------- */
document.addEventListener('click', e => {
  const c = e.target.closest('[data-close]');
  if (c) c.closest('dialog')?.close();
  const seg = e.target.closest('.seg-tabs [data-k]');
  if (seg && seg.closest('dialog')) {
    $$('[data-k]', seg.parentElement).forEach(b => b.classList.toggle('on', b === seg));
    seg.parentElement.onseg?.(seg.dataset.k);
  }
});
// clicking the dimmed backdrop closes a dialog
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

/* ---------- keyboard ---------- */
window.addEventListener('keydown', e => {
  const a = document.activeElement;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(a?.tagName) || a?.isContentEditable;
  if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
  const k = e.key;
  if (k === '/' || k === 'n' || k === 'N') { e.preventDefault(); return T.focusDeck(); }
  if (/^[1-5]$/.test(k)) return T.go(T.SECTIONS[+k - 1].k);
  if (k === '?') return $('#help-dlg').showModal();
  if (k === 'w' || k === 'W') return T.edit.wish();
  if (k === 'e' || k === 'E') return T.edit.expense();
  T.views[T.section()].key?.(e);
});

/* ---------- boot ---------- */
(function boot() {
  buildRail();
  T.agent.mount($('#tr-agent'));
  wireDeck();
  $('#tr-help-btn').addEventListener('click', () => $('#help-dlg').showModal());
  $('#tr-set-btn').addEventListener('click', () => T.edit.settings());
  T.ui.month = thisMonth();   // a new visit starts on this month
  const posted = T.postDue();
  T.render();
  setTimeout(() => posted.length ? T.agent.on('posted', { n: posted.length }) : T.agent.brief(), AvalonOS?.arrival?.from != null ? 900 : 500);
  if (T.isNew) T.save('init');   // write the default categories so other tabs see the same ids
})();
