/* =====================================================================
   AVALON TREASURY — the Vault: the month at a glance
   Ticker of insights · vault core ring · pace tiles · burn chart ·
   six months · next acquisitions · coming up · latest entries
   ===================================================================== */
'use strict';

T.views.vault = (() => {
  /** Short observations for the ticker, most useful first. */
  function insights() {
    const st = T.state, m = thisMonth(), out = [];
    const now = T.inMonth(m), prevKey = shiftMonth(m, -1), d = new Date().getDate();
    const prevToDay = T.inMonth(prevKey).filter(e => +e.date.slice(8) <= d);
    const a = T.sum(now), b = T.sum(prevToDay);
    if (b) { const ch = (a - b) / b; out.push({ t: `Spending ${ch <= 0 ? 'down' : 'up'} ${Math.abs(Math.round(ch * 100))}% on this point last month`, k: ch <= 0 ? 'ok' : 'warn' }); }
    for (const c of st.categories) {
      if (!c.budget) continue;
      const s = T.sum(now.filter(e => e.categoryId === c.id));
      if (s > c.budget) out.push({ t: `${c.name} over budget by ${T.money(s - c.budget)}`, k: 'hot' });
      else if (s > c.budget * .8) out.push({ t: `${c.name} at ${Math.round(s / c.budget * 100)}% of budget`, k: 'warn' });
    }
    const top = [...T.byCat(now)].sort((x, y) => y[1] - x[1])[0];
    if (top && T.cat(top[0])) out.push({ t: `Most of it went to ${T.cat(top[0]).name}: ${T.money(top[1])}`, k: '' });
    const big = [...now].sort((x, y) => y.amount - x.amount)[0];
    if (big) out.push({ t: `Largest this month: ${T.money(big.amount)}${big.note ? ` · ${big.note}` : ''}`, k: '' });
    const days = new Set(now.map(e => e.date)), noSpend = Array.from({ length: d }, (_, i) => `${m}-${pad(i + 1)}`).filter(x => !days.has(x)).length;
    if (now.length && noSpend) out.push({ t: `${plural(noSpend, 'no-spend day')} this month`, k: 'ok' });
    st.recurring.filter(r => r.active && r.next && dayDiff(today(), r.next) <= 7).forEach(r => out.push({ t: `${r.name} renews ${fmtDay(r.next).toLowerCase()} · ${T.money(r.amount)}`, k: '' }));
    st.wishes.filter(w => w.status === 'active').forEach(w => {
      if (T.progress(w) >= 1 && !T.coolLeft(w)) out.push({ t: `${w.name} is funded and past its cool-off`, k: 'ok' });
      const ch = T.priceChange(w);
      if (ch <= -.05) out.push({ t: `${w.name} is ${Math.round(-ch * 100)}% cheaper than when you added it`, k: 'ok' });
    });
    const inc = T.sum(T.inMonth(m, 'income'));
    if (inc) out.push({ t: `Net this month ${T.money(inc - a, { sign: true })}`, k: inc >= a ? 'ok' : 'warn' });
    return out;
  }

  function render(el) {
    const st = T.state, m = thisMonth(), p = T.pace(m), b = p.budget;
    const exp = T.inMonth(m), inc = T.sum(T.inMonth(m, 'income'));
    const cats = [...T.byCat(exp)].map(([id, v]) => ({ c: T.cat(id) || { name: 'Uncategorised', color: '#5d5887', icon: 'dots' }, v })).sort((x, y) => y.v - x.v);
    const prev = T.sum(T.inMonth(shiftMonth(m, -1)));
    const left = b - p.spent, perDay = b ? Math.floor(left / Math.max(1, p.left)) : 0;
    const pctUsed = b ? Math.round(p.spent / b * 100) : 0;
    const state = !b ? '' : left < 0 ? 'hot' : p.projected > b ? 'warn' : 'ok';
    const daily = Array.from({ length: p.days }, (_, i) => T.sum(exp.filter(e => +e.date.slice(8) === i + 1)));
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(m, i - 5)).map(k => ({ label: fmtMonth(k, true).slice(0, 3), value: T.sum(T.inMonth(k)), hi: k === m, title: `${fmtMonth(k)}: ${T.money(T.sum(T.inMonth(k)))}` }));
    const wishes = st.wishes.filter(w => w.status === 'active')
      .sort((x, y) => T.PRIORITY[x.priority].rank - T.PRIORITY[y.priority].rank || T.progress(y) - T.progress(x)).slice(0, 3);
    const upcoming = st.recurring.filter(r => r.active && r.next && dayDiff(today(), r.next) <= 31).sort((x, y) => x.next.localeCompare(y.next)).slice(0, 5);
    const recent = [...st.expenses].sort((x, y) => y.date.localeCompare(x.date) || y.createdAt.localeCompare(x.createdAt)).slice(0, 6);
    const ins = insights();

    el.innerHTML = `
      ${ins.length ? `<div class="ticker" aria-label="Insights" style="--dur:${Math.max(26, ins.length * 7)}s"><div class="ticker-track">${[0, 1].map(n => `<div class="ticker-run" ${n ? 'aria-hidden="true"' : ''}>${ins.map(i => `<span class="tk-i ${i.k}">${icon('sparkle')}${esc(i.t)}</span>`).join('')}</div>`).join('')}</div></div>` : ''}

      <div class="vault-grid">
        <section class="hud vault ${state}">
          <header class="hud-h"><span>01 · Vault core</span><b>${fmtMonth(m)}</b></header>
          <div class="core">
            ${T.charts.ring(cats.map(x => ({ value: x.v, color: x.c.color, label: `${x.c.name}: ${T.money(x.v)}` })), b, { size: 280, stroke: 18 })}
            <div class="core-c">
              <span class="core-k">Spent</span>
              <b class="core-v" data-count="${p.spent}">${T.money(p.spent)}</b>
              <span class="core-s">${b ? `of ${T.money(b, { compact: true })} · ${pctUsed}%` : 'no budget set'}</span>
              ${b ? `<span class="core-left ${state}">${left >= 0 ? `${T.money(left, { compact: true })} left` : `${T.money(-left, { compact: true })} over`}</span>` : `<button class="link-btn" data-go="budgets">Set a budget</button>`}
            </div>
          </div>
          <ul class="legend">${cats.slice(0, 6).map(x => `<li style="--c:${x.c.color}"><i></i>${esc(x.c.name)}<b>${T.money(x.v, { compact: true })}</b></li>`).join('') || '<li class="empty">Nothing spent yet this month.</li>'}</ul>
        </section>

        <div class="kpis">
          <div class="hud kpi ${state}">
            <span class="kpi-k">${icon('flag')}Month end, at this pace</span>
            <b class="kpi-v" data-count="${p.projected}">${T.money(p.projected)}</b>
            <span class="kpi-s">${b ? (p.projected > b ? `${T.money(p.projected - b, { compact: true })} over budget` : `${T.money(b - p.projected, { compact: true })} under budget`) : `${plural(p.left, 'day')} to go`}</span>
          </div>
          <div class="hud kpi">
            <span class="kpi-k">${icon('clock')}${b ? 'Allowance per day' : 'Average per day'}</span>
            <b class="kpi-v" data-count="${b ? Math.max(0, perDay) : (p.day ? Math.round(p.spent / p.day) : 0)}">${T.money(b ? Math.max(0, perDay) : (p.day ? Math.round(p.spent / p.day) : 0))}</b>
            <span class="kpi-s">${b ? `for the ${plural(p.left, 'day')} left` : `over ${plural(p.day, 'day')}`}</span>
          </div>
          <div class="hud kpi">
            <span class="kpi-k">${icon(p.spent <= prev ? 'trend-down' : 'trend-up')}Last month</span>
            <b class="kpi-v" data-count="${prev}">${T.money(prev)}</b>
            <span class="kpi-s">${prev ? `${p.spent <= prev ? `${T.money(prev - p.spent, { compact: true })} to go before you match it` : `already ${T.money(p.spent - prev, { compact: true })} past it`}` : 'nothing logged'}</span>
          </div>
          <div class="hud kpi ${inc ? (inc >= p.spent ? 'ok' : 'warn') : ''}">
            <span class="kpi-k">${icon('wallet')}Net this month</span>
            <b class="kpi-v" data-count="${inc - p.spent}" data-sign="1">${T.money(inc - p.spent, { sign: true })}</b>
            <span class="kpi-s">${inc ? `${T.money(inc, { compact: true })} in, ${T.money(p.spent, { compact: true })} out` : 'log income with “+1200 salary”'}</span>
          </div>
        </div>

        <section class="hud burn-box ${state}">
          <header class="hud-h"><span>02 · Burn</span><b>${p.day}/${p.days}</b></header>
          ${T.charts.burn(daily, { budget: b, day: p.day })}
          <div class="burn-key"><span class="k-line">Spent so far</span><span class="k-proj">At this pace</span>${b ? '<span class="k-pace">Even pace to budget</span>' : ''}</div>
        </section>

        <section class="hud months-box">
          <header class="hud-h"><span>03 · Six months</span><b>${T.money(months.reduce((t, x) => t + x.value, 0), { compact: true })}</b></header>
          ${T.charts.bars(months, { cap: b })}
        </section>

        <section class="hud mini-wish">
          <header class="hud-h"><span>04 · Next acquisitions</span><a href="#/wishlist">Wishlist</a></header>
          ${wishes.length ? `<ul class="mw-list">${wishes.map(w => {
            const pr = T.progress(w), cool = T.coolLeft(w);
            return `<li><button type="button" data-wish="${w.id}">
              <span class="mw-ring" style="--p:${Math.round(pr * 100)}"><span>${Math.round(pr * 100)}%</span></span>
              <span class="mw-t"><b>${esc(w.name)}</b><small>${T.money(w.saved || 0, { compact: true })} of ${T.money(w.price, { compact: true })}${cool ? ` · ${icon('snow')}${cool}d` : ''}</small></span>
              <span class="prio prio-${w.priority}">${T.PRIORITY[w.priority].label}</span></button></li>`;
          }).join('')}</ul>` : `<p class="hud-empty">Nothing on the wishlist. Try <code>wish Headphones 199</code> in the deck.</p>`}
        </section>

        <section class="hud mini-up">
          <header class="hud-h"><span>05 · Coming up</span><a href="#/recurring">Recurring</a></header>
          ${upcoming.length ? `<ul class="up-list">${upcoming.map(r => {
            const c = T.cat(r.categoryId), n = dayDiff(today(), r.next);
            return `<li style="--c:${c?.color || 'var(--text-3)'}"><span class="up-d"><b>${parseDay(r.next).getDate()}</b>${fmtMonth(monthKey(r.next), true).slice(0, 3)}</span>
              <span class="up-t"><b>${esc(r.name)}</b><small>${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</small></span><span class="up-a">${T.money(r.amount)}</span></li>`;
          }).join('')}</ul>` : `<p class="hud-empty">No recurring payments in the next month. Add rent, subscriptions and bills under Recurring and they log themselves.</p>`}
        </section>

        <section class="hud mini-recent">
          <header class="hud-h"><span>06 · Latest entries</span><a href="#/ledger">Ledger</a></header>
          ${recent.length ? `<ul class="rc-list">${recent.map(e => { const c = T.catOf(e); return `<li><button type="button" data-exp="${e.id}" style="--c:${c.color}">
              <span class="rc-ic">${icon(c.icon)}</span><span class="rc-t"><b>${esc(e.note || c.name)}</b><small>${fmtDay(e.date)} · ${esc(c.name)}</small></span>
              <span class="amt ${e.kind}">${T.money(e.kind === 'income' ? e.amount : -e.amount, { sign: true })}</span></button></li>`; }).join('')}</ul>` : `<p class="hud-empty">The ledger is empty. The deck above takes <code>4.20 coffee</code>, <code>+1200 salary</code>, <code>38 fuel yesterday</code>.</p>`}
        </section>
      </div>`;

    el.onclick = e => {
      const g = e.target.closest('[data-go]'); if (g) return T.go(g.dataset.go);
      const w = e.target.closest('[data-wish]'); if (w) { T.ui.focusWish = w.dataset.wish; return T.go('wishlist'); }
      const x = e.target.closest('[data-exp]'); if (x) return T.edit.expense(T.state.expenses.find(e => e.id === x.dataset.exp));
    };
  }
  return { render };
})();
