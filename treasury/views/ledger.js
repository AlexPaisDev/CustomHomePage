/* =====================================================================
   AVALON TREASURY — the Ledger: every entry of a month
   Month switcher · totals · filters · entries by day · heat calendar ·
   where the money went
   ===================================================================== */
'use strict';

T.views.ledger = (() => {
  const f = () => (T.ui.ledger ||= { kind: '', cat: '', q: '', day: '' });

  function render(el) {
    const o = f(), m = T.month(), st = T.state;
    const all = st.expenses.filter(e => monthKey(e.date) === m);
    if (o.day && monthKey(o.day) !== m) o.day = '';
    const q = fold(o.q.trim());
    const list = all.filter(e => (!o.kind || e.kind === o.kind) && (!o.cat || (e.kind === 'expense' && (e.categoryId || '') === o.cat)) && (!o.day || e.date === o.day)
      && (!q || fold(`${e.note} ${T.catOf(e).name} ${T.plainAmount(e.amount)}`).includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const out = T.sum(all.filter(e => e.kind === 'expense')), inn = T.sum(all.filter(e => e.kind === 'income'));
    const byDay = new Map();
    list.forEach(e => { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); });
    const cats = [...T.byCat(all.filter(e => e.kind === 'expense'))].sort((a, b) => b[1] - a[1]);
    const isNow = m === thisMonth();

    el.innerHTML = `
      <header class="v-head">
        <div><p class="v-kicker">${icon('receipt')}02 · Ledger</p>
          <div class="month-nav">
            <button class="icon-btn" data-m="-1" title="Previous month ([)" aria-label="Previous month">${icon('left')}</button>
            <h1 class="v-title">${fmtMonth(m)}</h1>
            <button class="icon-btn" data-m="1" title="Next month (])" aria-label="Next month" ${isNow ? 'disabled' : ''}>${icon('right')}</button>
            ${isNow ? '' : '<button class="link-btn" data-m="0">Back to this month</button>'}
          </div>
        </div>
        <div class="v-totals">
          <span><small>Out</small><b class="amt expense" data-count="${-out}">${T.money(-out)}</b></span>
          <span><small>In</small><b class="amt income" data-count="${inn}" data-sign="1">${T.money(inn, { sign: true })}</b></span>
          <span><small>Net</small><b class="amt ${inn - out >= 0 ? 'income' : 'expense'}" data-count="${inn - out}" data-sign="1">${T.money(inn - out, { sign: true })}</b></span>
          <button class="btn btn-gold" data-act="new">${icon('plus')}Entry</button>
        </div>
      </header>

      <div class="lg-grid">
        <section class="lg-main">
          <div class="lg-filters">
            <div class="seg-tabs tr-seg3" role="tablist">${[['', 'All'], ['expense', 'Out'], ['income', 'In']].map(([k, l]) => `<button type="button" data-kind="${k}" class="${o.kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
            <label class="lg-search">${icon('search')}<input type="search" id="lg-q" placeholder="Search this month" value="${esc(o.q)}" aria-label="Search entries"></label>
          </div>
          ${cats.length ? `<div class="chips">${cats.map(([id, v]) => { const c = T.cat(id) || { name: 'Uncategorised', color: '#5d5887', icon: 'dots' }; return `<button type="button" class="cchip ${o.cat === id ? 'on' : ''}" style="--c:${c.color}" data-cat="${esc(id)}">${icon(c.icon)}${esc(c.name)}<b>${T.money(v, { compact: true })}</b></button>`; }).join('')}</div>` : ''}
          ${o.day ? `<p class="lg-dayf">${icon('calendar')}Showing ${fmtDay(o.day)} only <button class="link-btn" data-day="">Show the whole month</button></p>` : ''}
          ${list.length ? [...byDay].map(([d, items]) => {
            const dt = T.sum(items.filter(e => e.kind === 'expense')), di = T.sum(items.filter(e => e.kind === 'income'));
            return `<section class="day">
              <header class="day-h"><b>${fmtDay(d)}</b><span>${parseDay(d).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</span><i></i><em>${dt ? T.money(-dt) : ''}${di ? ` ${T.money(di, { sign: true })}` : ''}</em></header>
              <ul class="rows">${items.map(row).join('')}</ul></section>`;
          }).join('') : `<div class="v-empty">${icon('receipt')}<p>${all.length ? 'Nothing matches these filters.' : `<b>Nothing logged in ${fmtMonth(m)}.</b> Type <code>12.50 lunch</code> in the deck above, or add one with the full form.`}</p></div>`}
        </section>

        <aside class="lg-side">
          <section class="hud">
            <header class="hud-h"><span>Heat</span><b>${fmtMonth(m, true)}</b></header>
            ${heat(m, all)}
          </section>
          <section class="hud">
            <header class="hud-h"><span>Where it went</span><b>${T.money(out, { compact: true })}</b></header>
            ${cats.length ? `<ul class="split">${cats.map(([id, v]) => { const c = T.cat(id) || { name: 'Uncategorised', color: '#5d5887' }; return `<li style="--c:${c.color};--w:${Math.round(v / cats[0][1] * 100)}%"><span>${esc(c.name)}</span><b>${T.money(v, { compact: true })}</b><small>${Math.round(v / out * 100)}%</small><i></i></li>`; }).join('')}</ul>` : '<p class="hud-empty">No spending this month.</p>'}
          </section>
        </aside>
      </div>`;

    el.onclick = e => {
      const t = e.target;
      const mv = t.closest('[data-m]'); if (mv) return T.setMonth(+mv.dataset.m ? shiftMonth(m, +mv.dataset.m) : thisMonth());
      if (t.closest('[data-act="new"]')) return T.edit.expense(null, { date: isNow ? today() : `${m}-01` });
      const k = t.closest('[data-kind]'); if (k) { o.kind = k.dataset.kind; T.saveUi(); return T.render({ soft: true }); }
      const c = t.closest('[data-cat]'); if (c) { o.cat = o.cat === c.dataset.cat ? '' : c.dataset.cat; T.saveUi(); return T.render({ soft: true }); }
      const d = t.closest('[data-day]'); if (d) { o.day = o.day === d.dataset.day ? '' : d.dataset.day; T.saveUi(); return T.render({ soft: true }); }
      const x = t.closest('[data-exp]'); if (x) return T.edit.expense(T.state.expenses.find(e => e.id === x.dataset.exp));
    };
    $('#lg-q', el).addEventListener('input', debounce(e => { o.q = e.target.value; T.saveUi(); T.render({ soft: true }); }, 160));
  }

  function row(e) {
    const c = T.catOf(e);
    return `<li><button type="button" class="row" data-exp="${e.id}" style="--c:${c.color}">
      <span class="row-ic">${icon(c.icon)}</span>
      <span class="row-t"><b>${esc(e.note || c.name)}</b><small>${esc(c.name)}${e.recurringId ? ` · ${icon('repeat')}recurring` : ''}${e.wishId ? ` · ${icon('gift')}wish` : ''}</small></span>
      <span class="amt ${e.kind}">${T.money(e.kind === 'income' ? e.amount : -e.amount, { sign: true })}</span>
    </button></li>`;
  }

  /** A calendar of the month, each day lit by how much went out. */
  function heat(m, all) {
    const n = daysIn(m), first = (parseDay(`${m}-01`).getDay() + 6) % 7;   // Monday first
    const per = Array.from({ length: n }, (_, i) => T.sum(all.filter(e => e.kind === 'expense' && +e.date.slice(8) === i + 1)));
    const max = Math.max(...per, 1), t = today(), o = f();
    return `<div class="heat">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="heat-h">${d}</span>`).join('')}
      ${'<span></span>'.repeat(first)}
      ${per.map((v, i) => {
        const d = `${m}-${pad(i + 1)}`, future = d > t;
        return `<button type="button" class="heat-d ${v && v / max > .5 ? 'lit' : ''} ${d === t ? 'now' : ''} ${o.day === d ? 'on' : ''} ${future ? 'future' : ''}" data-day="${d}" style="--a:${v ? (.18 + v / max * .82).toFixed(2) : 0}" title="${fmtDay(d)}: ${T.money(v)}" ${future ? 'disabled' : ''}>${i + 1}</button>`;
      }).join('')}</div>`;
  }

  function key(e) {
    if (e.key === '[') T.setMonth(shiftMonth(T.month(), -1));
    if (e.key === ']') T.setMonth(shiftMonth(T.month(), 1));
  }
  return { render, key };
})();
