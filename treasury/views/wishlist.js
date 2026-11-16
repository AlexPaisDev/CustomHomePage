/* =====================================================================
   AVALON TREASURY — the Wishlist: things to buy, saved up for on purpose
   Each wish has a price (with its history), money set aside, a priority,
   an optional buy-by date, and a cool-off: new wishes wait a while before
   the accountant calls them ready.
   ===================================================================== */
'use strict';

T.views.wishlist = (() => {
  const f = () => (T.ui.wish ||= { status: 'active', prio: '', sort: 'priority' });
  const SORTS = {
    priority: ['Priority', (a, b) => T.PRIORITY[a.priority].rank - T.PRIORITY[b.priority].rank || T.progress(b) - T.progress(a)],
    funded: ['Closest to funded', (a, b) => T.progress(b) - T.progress(a)],
    cheap: ['Price, low to high', (a, b) => a.price - b.price],
    dear: ['Price, high to low', (a, b) => b.price - a.price],
    new: ['Newest', (a, b) => b.createdAt.localeCompare(a.createdAt)],
  };
  /** A stable hue per name, for wishes without a picture. */
  const hue = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

  function render(el) {
    const o = f(), st = T.state;
    const count = s => st.wishes.filter(w => w.status === s).length;
    const active = st.wishes.filter(w => w.status === 'active');
    const want = active.reduce((a, w) => a + w.price, 0), saved = active.reduce((a, w) => a + Math.min(w.saved || 0, w.price), 0);
    const list = st.wishes.filter(w => w.status === o.status && (!o.prio || w.priority === o.prio)).sort(o.status === 'bought' ? (a, b) => String(b.boughtAt).localeCompare(String(a.boughtAt)) : SORTS[o.sort][1]);
    const ready = active.filter(w => T.progress(w) >= 1 && !T.coolLeft(w)).length;

    el.innerHTML = `
      <header class="v-head">
        <div><p class="v-kicker">${icon('gift')}03 · Wishlist</p><h1 class="v-title">Wishlist</h1></div>
        <div class="v-totals">
          <span><small>Wanted</small><b data-count="${want}">${T.money(want)}</b></span>
          <span><small>Set aside</small><b class="amt income" data-count="${saved}">${T.money(saved)}</b></span>
          <span><small>To go</small><b data-count="${want - saved}">${T.money(want - saved)}</b></span>
          <button class="btn btn-gold" data-act="new">${icon('plus')}Wish</button>
        </div>
      </header>
      ${want ? `<div class="wl-meter" title="${Math.round(saved / want * 100)}% of everything on the list is set aside"><i style="--p:${(saved / want * 100).toFixed(1)}%"></i><span>${Math.round(saved / want * 100)}% funded${ready ? ` · ${plural(ready, 'wish')} ready` : ''}</span></div>` : ''}
      <div class="wl-bar">
        <div class="seg-tabs tr-seg3">${[['active', 'Wishing'], ['bought', 'Acquired'], ['dropped', 'Dropped']].map(([k, l]) => `<button type="button" data-status="${k}" class="${o.status === k ? 'on' : ''}">${l} <span>${count(k)}</span></button>`).join('')}</div>
        ${o.status === 'active' ? `
        <div class="chips">${[['', 'All'], ...Object.entries(T.PRIORITY).map(([k, p]) => [k, p.label])].map(([k, l]) => `<button type="button" class="cchip ${o.prio === k ? 'on' : ''} ${k ? `prio-${k}` : ''}" data-prio="${k}">${l}</button>`).join('')}</div>
        <label class="wl-sort">Sort <select id="wl-sort">${Object.entries(SORTS).map(([k, [l]]) => `<option value="${k}" ${o.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}
      </div>
      ${list.length ? (o.status === 'bought' ? `<ul class="acq">${list.map(acquired).join('')}</ul>` : `<div class="wgrid" id="wgrid">${list.map(card).join('')}</div>`)
        : `<div class="v-empty">${icon('gift')}<p>${o.status === 'active' ? `<b>Nothing on the list.</b> Add what you want to buy: type <code>wish Headphones 199</code> in the deck, or paste a product link with <b>+ Wish</b>.` : o.status === 'bought' ? 'Nothing acquired yet.' : 'Nothing dropped.'}</p></div>`}`;

    el.onclick = onClick;
    $('#wl-sort', el)?.addEventListener('change', e => { o.sort = e.target.value; T.saveUi(); T.render({ soft: true }); });
    const grid = $('#wgrid', el);
    if (grid && !matchMedia('(prefers-reduced-motion: reduce)').matches && matchMedia('(hover: hover)').matches) tilt(grid);
    if (T.ui.focusWish) {
      const c = $(`[data-w="${CSS.escape(T.ui.focusWish)}"]`, el);
      T.ui.focusWish = null;
      if (c) { setTimeout(() => c.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80); c.classList.add('flash'); }
    }
  }

  function card(w) {
    const pr = T.progress(w), cool = T.coolLeft(w), per = T.perMonth(w), ch = T.priceChange(w);
    const prices = (w.prices || []).map(p => p.price);
    const ready = pr >= 1 && !cool;
    const dropped = w.status === 'dropped';
    const daysTo = w.target ? dayDiff(today(), w.target) : null;
    return `<article class="wc ${ready ? 'ready' : ''} ${dropped ? 'dropped' : ''}" data-w="${w.id}" style="--h:${hue(w.name)}">
      <div class="wc-media">
        ${safeUrl(w.image) ? `<img src="${esc(w.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
        <span class="wc-glyph" aria-hidden="true">${esc((w.name.match(/[A-Za-z0-9À-ÿ]/) || ['?'])[0].toUpperCase())}</span>
        <span class="prio prio-${w.priority}">${T.PRIORITY[w.priority].label}</span>
        <div class="wc-flags">
          ${cool && !dropped ? `<span class="flag cool" title="New wishes cool off before they count as ready">${icon('snow')}${cool}d cool-off</span>` : ''}
          ${ready ? `<span class="flag ready">${icon('check')}Ready</span>` : ''}
          ${ch <= -.01 ? `<span class="flag drop">${icon('trend-down')}${Math.round(-ch * 100)}%</span>` : ch >= .01 ? `<span class="flag rise">${icon('trend-up')}${Math.round(ch * 100)}%</span>` : ''}
        </div>
        <i class="wc-holo" aria-hidden="true"></i>
      </div>
      <div class="wc-body">
        <h3 class="wc-name" title="${esc(w.name)}">${esc(w.name)}</h3>
        <div class="wc-line">
          <b class="wc-price">${T.money(w.price)}</b>
          ${prices.length > 1 ? T.charts.spark(prices, { w: 70, h: 22, cls: ch < 0 ? 'down' : ch > 0 ? 'up' : '' }) : ''}
          ${safeUrl(w.url) ? `<a class="wc-host" href="${esc(w.url)}" target="_blank" rel="noopener noreferrer" title="Open the product page">${esc(host(w.url))}${icon('external')}</a>` : ''}
        </div>
        <div class="wc-prog" style="--p:${(pr * 100).toFixed(1)}%"><i></i></div>
        <div class="wc-sub"><span>${T.money(w.saved || 0)} set aside</span><b>${Math.round(pr * 100)}%</b></div>
        ${w.target ? `<p class="wc-plan ${daysTo < 0 ? 'late' : ''}">${icon('calendar')}${daysTo < 0 ? `Was due ${fmtDay(w.target, { year: true }).toLowerCase()}` : per ? `${T.money(per)} a month to have it by ${fmtDay(w.target, { year: true })}` : `Funded for ${fmtDay(w.target, { year: true })}`}</p>` : ''}
        ${w.note ? `<p class="wc-note">${esc(w.note)}</p>` : ''}
        <div class="wc-acts">
          ${dropped ? `<button class="btn btn-sm" data-a="restore">${icon('repeat')}Restore</button><button class="btn btn-sm" data-a="edit">${icon('edit')}Edit</button>` : `
          <button class="btn btn-sm" data-a="fund" title="Set money aside for it">${icon('coins')}Set aside</button>
          <button class="btn btn-sm" data-a="price" title="Log today’s price">${icon('tag')}Price</button>
          <button class="btn btn-sm ${ready ? 'btn-gold' : ''}" data-a="buy" title="Mark it bought">${icon('check')}Acquire</button>
          <span class="wc-more">
            <button class="icon-btn sm" data-a="edit" title="Edit" aria-label="Edit">${icon('edit')}</button>
            <button class="icon-btn sm" data-a="drop" title="Drop it: you don’t want it any more" aria-label="Drop">${icon('x')}</button>
          </span>`}
        </div>
      </div>
    </article>`;
  }

  function acquired(w) {
    const diff = (w.price || 0) - (w.paid || 0);
    return `<li class="acq-i" data-w="${w.id}">
      <span class="acq-ic">${icon('check')}</span>
      <span class="acq-t"><b>${esc(w.name)}</b><small>${fmtDay(w.boughtAt, { year: true })}${w.expenseId ? ' · in the ledger' : ''}</small></span>
      <span class="acq-p"><b>${T.money(w.paid || 0)}</b>${diff > 0 ? `<small class="amt income">${T.money(diff)} under list</small>` : ''}</span>
      <button class="icon-btn sm" data-a="unbuy" title="Not bought after all: back to the wishlist" aria-label="Undo">${icon('repeat')}</button>
    </li>`;
  }

  async function onClick(e) {
    const t = e.target, o = f();
    if (t.closest('[data-act="new"]')) return T.edit.wish();
    const s = t.closest('[data-status]'); if (s) { o.status = s.dataset.status; T.saveUi(); return T.render({ soft: true }); }
    const p = t.closest('[data-prio]'); if (p) { o.prio = p.dataset.prio; T.saveUi(); return T.render({ soft: true }); }
    const a = t.closest('[data-a]');
    const w = T.state.wishes.find(x => x.id === t.closest('[data-w]')?.dataset.w);
    if (!a || !w) { if (w && !t.closest('a')) T.edit.wish(w); return; }
    const k = a.dataset.a;
    if (k === 'fund') return T.edit.fund(w, 'add');
    if (k === 'price') return T.edit.fund(w, 'price');
    if (k === 'buy') return T.edit.buy(w);
    if (k === 'edit') return T.edit.wish(w);
    if (k === 'drop') { w.status = 'dropped'; T.save('wishes'); return T.agent.on('say', { text: `Dropped ${w.name}. ${T.money(w.price)} you won’t spend.`, act: 'found' }); }
    if (k === 'restore') { w.status = 'active'; T.save('wishes'); return; }
    if (k === 'unbuy') {
      const ex = w.expenseId && T.state.expenses.find(x => x.id === w.expenseId);
      if (!await ask({ title: `Back on the wishlist?`, text: ex ? `The ${T.money(ex.amount)} entry in the ledger is removed too.` : '', ok: 'Undo purchase', danger: false })) return;
      if (ex) T.remove('expenses', ex.id);
      Object.assign(w, { status: 'active', boughtAt: null, paid: null, expenseId: null });
      T.save('wishes');
    }
  }

  /** Cards lean towards the pointer and catch a holographic glint. */
  function tilt(grid) {
    let raf = 0, cur = null;
    grid.addEventListener('pointermove', e => {
      const c = e.target.closest('.wc');
      if (cur && cur !== c) reset(cur);
      cur = c;
      if (!c) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        c.style.setProperty('--rx', `${((.5 - y) * 7).toFixed(2)}deg`);
        c.style.setProperty('--ry', `${((x - .5) * 9).toFixed(2)}deg`);
        c.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        c.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        c.classList.add('lean');
      });
    });
    const reset = c => { c.classList.remove('lean'); c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); };
    grid.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); if (cur) reset(cur); cur = null; });
  }

  return { render };
})();
