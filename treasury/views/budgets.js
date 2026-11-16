/* =====================================================================
   AVALON TREASURY — Budgets: a monthly limit per category
   Each card shows the month against its budget with an "even pace"
   marker, the last six months, and takes a new budget inline.
   ===================================================================== */
'use strict';

T.views.budgets = (() => {
  function render(el) {
    const st = T.state, m = T.month(), isNow = m === thisMonth();
    const exp = T.inMonth(m), n = daysIn(m), day = isNow ? new Date().getDate() : m < thisMonth() ? n : 0;
    const pace = day / n;
    const total = T.budget(), spent = T.sum(exp);
    const loose = T.sum(exp.filter(e => !T.cat(e.categoryId)));
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(m, i - 5));
    const auto = !st.settings.budget;

    el.innerHTML = `
      <header class="v-head">
        <div><p class="v-kicker">${icon('pie')}04 · Budgets</p>
          <div class="month-nav">
            <button class="icon-btn" data-m="-1" title="Previous month ([)" aria-label="Previous month">${icon('left')}</button>
            <h1 class="v-title">${fmtMonth(m)}</h1>
            <button class="icon-btn" data-m="1" title="Next month (])" aria-label="Next month" ${isNow ? 'disabled' : ''}>${icon('right')}</button>
          </div>
        </div>
        <div class="v-totals">
          <span><small>Spent</small><b data-count="${spent}">${T.money(spent)}</b></span>
          <span><small>Budget${auto ? ' · sum' : ''}</small><b>${total ? T.money(total) : '—'}</b></span>
          <button class="btn" data-act="total" title="One monthly budget for everything">${icon('gear')}Total</button>
          <button class="btn btn-gold" data-act="new">${icon('plus')}Category</button>
        </div>
      </header>

      ${total ? `<section class="hud bd-total ${spent > total ? 'hot' : spent > total * pace + 1 && isNow ? 'warn' : 'ok'}">
        <div class="bd-track" style="--p:${Math.min(100, spent / total * 100).toFixed(1)}%;--pace:${(pace * 100).toFixed(1)}%"><i></i><em title="Even pace: where spending would be today if spread evenly"></em></div>
        <div class="bd-total-t"><b>${Math.round(spent / total * 100)}%</b> of the month’s budget used, ${Math.round(pace * 100)}% of the month gone. ${spent > total ? `${T.money(spent - total)} over.` : `${T.money(total - spent)} left.`}</div>
      </section>` : `<p class="v-note">${icon('sparkle')}Type a budget into any card below. The accountant keeps the pace and warns you at 80%.</p>`}

      <div class="bgrid">${st.categories.map(c => {
        const s = T.sum(exp.filter(e => e.categoryId === c.id)), b = c.budget || 0;
        const hist = months.map(k => T.sum(T.inMonth(k).filter(e => e.categoryId === c.id)));
        const state = !b ? '' : s > b ? 'hot' : s > b * .8 ? 'warn' : 'ok';
        const left = b - s;
        return `<article class="hud bc ${state}" style="--c:${c.color}" data-c="${esc(c.id)}">
          <header class="bc-h">
            <span class="hex">${icon(c.icon)}</span>
            <span class="bc-t"><b>${esc(c.name)}</b><small>${b ? (left >= 0 ? `${T.money(left)} left${isNow && n - day > 0 ? ` · ${T.money(Math.floor(left / (n - day + 1)))}/day` : ''}` : `${T.money(-left)} over`) : 'No budget'}</small></span>
            <button class="icon-btn sm" data-edit title="Edit category" aria-label="Edit ${esc(c.name)}">${icon('edit')}</button>
          </header>
          <div class="bc-num"><b>${T.money(s)}</b><span>/</span>
            <input class="bc-in" id="bc-in-${esc(c.id)}" data-budget inputmode="decimal" value="${b ? T.plainAmount(b) : ''}" placeholder="budget" aria-label="Monthly budget for ${esc(c.name)}" title="Monthly budget">
          </div>
          <div class="bd-track sm" style="--p:${b ? Math.min(100, s / b * 100).toFixed(1) : 0}%;--pace:${(pace * 100).toFixed(1)}%"><i></i>${b ? '<em></em>' : ''}</div>
          <footer class="bc-f">${T.charts.spark(hist, { w: 120, h: 26 }) || '<span></span>'}<small>${hist.some(Boolean) ? `avg ${T.money(Math.round(hist.slice(0, 5).reduce((a, v) => a + v, 0) / 5), { compact: true })}` : 'no history'}</small></footer>
        </article>`;
      }).join('')}
        <button class="bc-add" data-act="new">${icon('plus')}<span>New category</span></button>
      </div>
      ${loose ? `<p class="v-note">${icon('alert')}${T.money(loose)} this month has no category. <a href="#/ledger">Sort it in the ledger</a>.</p>` : ''}`;

    el.onclick = e => {
      const t = e.target;
      const mv = t.closest('[data-m]'); if (mv) return T.setMonth(shiftMonth(m, +mv.dataset.m));
      if (t.closest('[data-act="new"]')) return T.edit.cat();
      if (t.closest('[data-act="total"]')) return T.edit.settings();
      const c = T.cat(t.closest('[data-c]')?.dataset.c);
      if (c && t.closest('[data-edit]')) return T.edit.cat(c);
    };
    el.onchange = e => {
      if (!e.target.matches('[data-budget]')) return;
      const c = T.cat(e.target.closest('[data-c]').dataset.c), v = e.target.value.trim() ? T.toCents(e.target.value) : 0;
      if (Number.isNaN(v)) { e.target.classList.add('bad'); return; }
      c.budget = v;
      T.save('categories');
      T.agent.on('say', { text: v ? `${c.name}: ${T.money(v)} a month.` : `${c.name}: no budget.`, act: 'write' });
    };
    el.onkeydown = e => { if (e.key === 'Enter' && e.target.matches('[data-budget]')) e.target.blur(); };
  }
  function key(e) {
    if (e.key === '[') T.setMonth(shiftMonth(T.month(), -1));
    if (e.key === ']') T.setMonth(shiftMonth(T.month(), 1));
  }
  return { render, key };
})();
