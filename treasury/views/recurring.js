/* =====================================================================
   AVALON TREASURY — Recurring: rent, bills and subscriptions
   Active items log themselves into the ledger when they come due
   (checked each time the Treasury opens). The orbit strip shows the
   next 30 days.
   ===================================================================== */
'use strict';

T.views.recurring = (() => {
  const EVERY = { week: 'Weekly', month: 'Monthly', year: 'Yearly' };

  function render(el) {
    const st = T.state, t = today();
    const list = [...st.recurring].sort((a, b) => (b.active - a.active) || String(a.next).localeCompare(String(b.next)));
    const act = list.filter(r => r.active);
    const perMonth = act.reduce((a, r) => a + T.monthly(r), 0);
    const soon = act.filter(r => dayDiff(t, r.next) <= 30);

    el.innerHTML = `
      <header class="v-head">
        <div><p class="v-kicker">${icon('repeat')}05 · Recurring</p><h1 class="v-title">Recurring</h1></div>
        <div class="v-totals">
          <span><small>A month</small><b data-count="${perMonth}">${T.money(perMonth)}</b></span>
          <span><small>A year</small><b data-count="${perMonth * 12}">${T.money(perMonth * 12)}</b></span>
          <button class="btn btn-gold" data-act="new">${icon('plus')}Recurring</button>
        </div>
      </header>

      <section class="hud orbit">
        <header class="hud-h"><span>Next 30 days</span><b>${T.money(soon.reduce((a, r) => a + r.amount, 0))}</b></header>
        <div class="orbit-strip">
          ${Array.from({ length: 31 }, (_, i) => { const d = addDays(t, i), p = parseDay(d); return `<span class="ob-d ${p.getDate() === 1 ? 'm1' : ''} ${i === 0 ? 'now' : ''}" style="--x:${(i / 30 * 100).toFixed(2)}%">${i % 5 === 0 || p.getDate() === 1 ? `<small>${p.getDate() === 1 ? fmtMonth(monthKey(d), true).slice(0, 3) : p.getDate()}</small>` : ''}</span>`; }).join('')}
          ${soon.map((r, i) => { const c = T.cat(r.categoryId), n = dayDiff(t, r.next); return `<button type="button" class="ob-p ${n > 19 ? 'flip' : ''}" data-r="${r.id}" style="--x:${(n / 30 * 100).toFixed(2)}%;--c:${c?.color || 'var(--gold)'};--row:${i % 3}" title="${esc(r.name)} · ${fmtDay(r.next)} · ${T.money(r.amount)}"><i></i><span>${esc(r.name)}</span></button>`; }).join('')}
        </div>
      </section>

      ${list.length ? `<ul class="rlist">${list.map(r => {
        const c = T.cat(r.categoryId), n = r.next ? dayDiff(t, r.next) : null;
        const posted = st.expenses.filter(e => e.recurringId === r.id);
        return `<li class="hud rr ${r.active ? '' : 'off'}" data-r="${r.id}" style="--c:${c?.color || 'var(--text-3)'}">
          <span class="hex">${icon(c?.icon || 'repeat')}</span>
          <span class="rr-t"><b>${esc(r.name)}</b><small>${EVERY[r.every]} · ${esc(c?.name || 'No category')}${posted.length ? ` · ${plural(posted.length, 'payment')} logged` : ''}</small></span>
          <span class="rr-n">${r.active ? `<b>${fmtDay(r.next)}</b><small>${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}</small>` : '<b>Paused</b><small>nothing is logged</small>'}</span>
          <span class="rr-a"><b>${T.money(r.amount)}</b>${r.every !== 'month' ? `<small>${T.money(T.monthly(r))}/mo</small>` : ''}</span>
          <label class="switch" title="${r.active ? 'Pause' : 'Resume'}"><input type="checkbox" data-toggle ${r.active ? 'checked' : ''} aria-label="Active"><i></i></label>
        </li>`;
      }).join('')}</ul>` : `<div class="v-empty">${icon('repeat')}<p><b>No recurring payments.</b> Add rent, bills and subscriptions once; each one logs itself in the ledger on its day, and you see the year’s cost at a glance.</p></div>`}`;

    el.onclick = e => {
      const tg = e.target;
      if (tg.closest('[data-act="new"]')) return T.edit.rec();
      if (tg.closest('.switch')) return;
      const r = T.state.recurring.find(x => x.id === tg.closest('[data-r]')?.dataset.r);
      if (r) T.edit.rec(r);
    };
    el.onchange = e => {
      if (!e.target.matches('[data-toggle]')) return;
      const r = T.state.recurring.find(x => x.id === e.target.closest('[data-r]').dataset.r);
      r.active = e.target.checked;
      if (r.active && r.next < t) r.next = t;   // resuming doesn't back-fill what was skipped
      const posted = r.active ? T.postDue() : [];
      T.save('recurring');
      T.agent.on('say', { text: r.active ? `${r.name} resumed.${posted.length ? ` Logged today’s payment.` : ''}` : `${r.name} paused.`, act: 'write' });
    };
  }
  return { render };
})();
