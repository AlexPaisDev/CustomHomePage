/* =====================================================================
   AVALON TREASURY — the forms: expense, wish, set aside / price,
   acquire, category, recurring payment, settings and data.
   Each opener fills its dialog and sets its submit handler afresh.
   ===================================================================== */
'use strict';

T.edit = (() => {
  const segVal = id => $(`#${id} .on`)?.dataset.k;
  const setSeg = (id, k) => $$(`#${id} [data-k]`).forEach(b => b.classList.toggle('on', b.dataset.k === k));
  function catOptions(sel, value, { none = false } = {}) {
    sel.innerHTML = (none ? '<option value="">No category</option>' : '') + T.state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    sel.value = value ?? (none ? '' : T.state.categories[0]?.id || '');
  }
  const bad = (input, on = true) => { input.classList.toggle('bad', on); if (on) input.focus(); return on; };
  const amountOf = (input, { zero = false } = {}) => {
    const c = T.toCents(input.value);
    if ((Number.isNaN(c) && (input.value.trim() || !zero)) || (!zero && !c)) { bad(input); return null; }
    bad(input, false);
    return Number.isNaN(c) ? 0 : c;
  };

  /* ---------- expense ---------- */
  function expense(e = null, preset = {}) {
    const dlg = $('#exp-dlg'), f = $('#exp-form'), x = e || { kind: 'expense', amount: 0, categoryId: '', note: '', date: today(), ...preset };
    $('#exp-title').textContent = e ? (x.kind === 'income' ? 'Edit income' : 'Edit expense') : 'New entry';
    setSeg('exp-kind', x.kind);
    f.amount.value = x.amount ? T.plainAmount(x.amount) : '';
    f.date.value = x.date;
    catOptions(f.categoryId, x.categoryId, { none: true });
    f.note.value = x.note || '';
    const toggle = () => { $('[data-for="expense"]', f).hidden = segVal('exp-kind') === 'income'; };
    toggle();
    $('#exp-kind').onseg = toggle;
    const rec = x.recurringId && T.state.recurring.find(r => r.id === x.recurringId), wish = x.wishId && T.state.wishes.find(w => w.id === x.wishId);
    $('#exp-meta').innerHTML = rec ? `${icon('repeat')} Posted by the recurring payment <b>${esc(rec.name)}</b>.` : wish ? `${icon('gift')} The wish <b>${esc(wish.name)}</b>, acquired.` : '';
    $('#exp-meta').hidden = !rec && !wish;
    const del = $('#exp-del');
    del.hidden = !e;
    del.onclick = async () => {
      if (!await ask({ title: 'Delete this entry?', text: `${T.money(x.amount)} · ${esc(x.note || T.catOf(x).name)} · ${fmtDay(x.date)}` })) return;
      T.remove('expenses', x.id); T.save('expenses'); dlg.close(); T.agent.on('deleted');
    };
    f.onsubmit = ev => {
      ev.preventDefault();
      const amount = amountOf(f.amount);
      if (amount == null) return;
      if (!f.date.value) return bad(f.date);
      const kind = segVal('exp-kind');
      const data = { kind, amount, date: f.date.value, categoryId: kind === 'income' ? '' : f.categoryId.value, note: f.note.value.trim() };
      let saved;
      if (e) { Object.assign(e, data); saved = e; } else saved = T.add('expenses', data);
      T.save('expenses');
      dlg.close();
      T.agent.on(kind, saved);
    };
    dlg.showModal();
    setTimeout(() => f.amount.focus(), 30);
  }

  /* ---------- wish ---------- */
  function wish(w = null, preset = {}) {
    const dlg = $('#wish-dlg'), f = $('#wish-form'), x = w || { name: '', url: '', image: '', price: 0, saved: 0, priority: 'want', target: '', note: '', ...preset };
    $('#wish-title').textContent = w ? 'Edit wish' : 'New wish';
    f.url.value = x.url || ''; f.name.value = x.name || ''; f.image.value = x.image || ''; f.note.value = x.note || '';
    f.price.value = x.price ? T.plainAmount(x.price) : ''; f.saved.value = x.saved ? T.plainAmount(x.saved) : '';
    f.target.value = x.target || '';
    setSeg('wish-prio', x.priority || 'want');
    let named = !!x.name;
    f.name.oninput = () => { named = !!f.name.value.trim(); };
    f.url.oninput = () => { if (!named) f.name.value = T.nameFromUrl(f.url.value.trim()); };
    const del = $('#wish-del');
    del.hidden = !w;
    del.onclick = async () => {
      if (!await ask({ title: `Delete “${esc(x.name)}”?`, text: x.saved ? `${T.money(x.saved)} is set aside for it; that stays yours, the wish just goes.` : '' })) return;
      T.remove('wishes', x.id); T.save('wishes'); dlg.close(); T.agent.on('deleted');
    };
    f.onsubmit = ev => {
      ev.preventDefault();
      const name = f.name.value.trim();
      if (!name) return bad(f.name);
      const price = amountOf(f.price);
      if (price == null) return;
      const saved = amountOf(f.saved, { zero: true });
      if (saved == null) return;
      const url = f.url.value.trim(), image = f.image.value.trim();
      if (url && !safeUrl(url)) return bad(f.url);
      if (image && !safeUrl(image)) return bad(f.image);
      const data = { name, price, saved, url, image, target: f.target.value, note: f.note.value.trim(), priority: segVal('wish-prio') || 'want' };
      if (w) {
        const last = (w.prices || []).at(-1);
        if (!last || last.price !== price) w.prices = [...(w.prices || []), { date: today(), price }];
        Object.assign(w, data);
        T.save('wishes');
        dlg.close();
        T.agent.on('say', { text: `${name}: updated.`, act: 'write' });
      } else {
        const nw = T.add('wishes', { ...data, status: 'active', prices: [{ date: today(), price }] });
        T.save('wishes');
        dlg.close();
        T.agent.on('wish', nw);
      }
    };
    dlg.showModal();
    setTimeout(() => (x.name ? f.price : f.url).focus(), 30);
  }

  /* ---------- set aside / take back / log a price ---------- */
  function fund(w, mode = 'add') {
    const dlg = $('#fund-dlg'), f = $('#fund-form');
    const price = mode === 'price';
    $('#fund-title').textContent = price ? `New price · ${w.name}` : w.name;
    $('#fund-mode').hidden = price;
    setSeg('fund-mode', price ? 'add' : mode);
    const rest = Math.max(0, w.price - (w.saved || 0));
    const paint = () => {
      const take = segVal('fund-mode') === 'take' && !price;
      $('#fund-label').textContent = price ? 'Price today' : take ? 'Take back' : 'Set aside';
      $('#fund-text').innerHTML = price
        ? `Last price ${T.money(w.prices?.at(-1)?.price ?? w.price)}. Logging prices over time shows you when it drops.`
        : `${T.money(w.saved || 0)} of ${T.money(w.price)} set aside${rest ? `, ${T.money(rest)} to go` : ' — fully funded'}.`;
      const q = price ? [] : take ? [w.saved || 0].filter(Boolean) : [1000, 2500, 5000, 10000].filter(v => v < rest).concat(rest ? [rest] : []);
      $('#fund-quick').innerHTML = q.map((v, i) => `<button type="button" class="btn btn-sm" data-v="${v}">${take ? 'All ' : i === q.length - 1 && v === rest ? 'The rest · ' : '+'}${T.money(v, { compact: v % 100 === 0 })}</button>`).join('');
    };
    paint();
    $('#fund-mode').onseg = paint;
    $('#fund-quick').onclick = e => { const b = e.target.closest('[data-v]'); if (b) { f.amount.value = T.plainAmount(+b.dataset.v); f.amount.focus(); } };
    f.amount.value = price ? T.plainAmount(w.prices?.at(-1)?.price ?? w.price) : '';
    f.onsubmit = ev => {
      ev.preventDefault();
      const v = amountOf(f.amount);
      if (v == null) return;
      if (price) {
        w.prices = [...(w.prices || []), { date: today(), price: v }];
        if (w.prices.length > 2 && w.prices.at(-2).date === today()) w.prices.splice(-2, 1);   // one price a day, but keep the first
        w.price = v;
        T.save('wishes'); dlg.close(); T.agent.on('price', w);
        return;
      }
      const take = segVal('fund-mode') === 'take';
      w.saved = Math.max(0, (w.saved || 0) + (take ? -v : v));
      T.save('wishes'); dlg.close();
      if (take) T.agent.on('say', { text: `${T.money(v)} taken back from ${w.name}.`, act: 'write' });
      else T.agent.on('fund', w);
    };
    dlg.showModal();
    setTimeout(() => { f.amount.focus(); f.amount.select(); }, 30);
  }

  /* ---------- acquire ---------- */
  function buy(w) {
    const dlg = $('#buy-dlg'), f = $('#buy-form');
    $('#buy-title').textContent = `Acquire · ${w.name}`;
    const cool = T.coolLeft(w);
    $('#buy-text').innerHTML = (cool ? `${icon('snow')} Still cooling off for ${plural(cool, 'day')}. Sure? ` : '')
      + (w.saved ? `${T.money(w.saved)} was set aside for it.` : 'Nothing was set aside for it.');
    f.amount.value = T.plainAmount(w.price);
    f.date.value = today();
    catOptions(f.categoryId, T.cat('shopping') ? 'shopping' : undefined, { none: true });
    f.log.checked = true;
    f.onsubmit = ev => {
      ev.preventDefault();
      const paid = amountOf(f.amount);
      if (paid == null) return;
      let ex = null;
      if (f.log.checked) ex = T.add('expenses', { kind: 'expense', amount: paid, categoryId: f.categoryId.value, note: w.name, date: f.date.value || today(), wishId: w.id });
      Object.assign(w, { status: 'bought', boughtAt: f.date.value || today(), paid, expenseId: ex?.id || null });
      T.save('wishes');
      dlg.close();
      T.agent.on('bought', w);
    };
    dlg.showModal();
  }

  /* ---------- category ---------- */
  function cat(c = null) {
    const dlg = $('#cat-dlg'), f = $('#cat-form');
    const x = c || { name: '', color: T.COLORS[T.state.categories.length % T.COLORS.length], icon: 'tag', budget: 0, keywords: [] };
    $('#cat-title').textContent = c ? `Edit ${c.name}` : 'New category';
    f.name.value = x.name; f.budget.value = x.budget ? T.plainAmount(x.budget) : ''; f.keywords.value = (x.keywords || []).join(' ');
    let color = x.color, ic = x.icon;
    const paint = () => {
      $('#cat-colors').innerHTML = T.COLORS.map(k => `<button type="button" class="sw ${k === color ? 'on' : ''}" style="--c:${k}" data-c="${k}" aria-label="Colour ${k}"></button>`).join('');
      $('#cat-icons').innerHTML = [...new Set([...T.ICONS, 'tag'])].map(k => `<button type="button" class="ip ${k === ic ? 'on' : ''}" style="--c:${color}" data-i="${k}" aria-label="${k}">${icon(k)}</button>`).join('');
    };
    paint();
    $('#cat-colors').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { color = b.dataset.c; paint(); } };
    $('#cat-icons').onclick = e => { const b = e.target.closest('[data-i]'); if (b) { ic = b.dataset.i; paint(); } };
    const del = $('#cat-del');
    del.hidden = !c;
    del.onclick = async () => {
      const n = T.state.expenses.filter(e => e.categoryId === c.id).length;
      if (!await ask({ title: `Delete ${esc(c.name)}?`, text: n ? `${plural(n, 'entry')} will become uncategorised. Nothing else is deleted.` : 'No entries use it.' })) return;
      T.state.expenses.forEach(e => { if (e.categoryId === c.id) e.categoryId = ''; });
      T.state.recurring.forEach(r => { if (r.categoryId === c.id) r.categoryId = ''; });
      T.remove('categories', c.id); T.save('categories'); dlg.close();
    };
    f.onsubmit = ev => {
      ev.preventDefault();
      const name = f.name.value.trim();
      if (!name) return bad(f.name);
      const budget = amountOf(f.budget, { zero: true });
      if (budget == null) return;
      const data = { name, color, icon: ic, budget, keywords: f.keywords.value.split(/[\s,]+/).map(s => s.trim().toLowerCase()).filter(Boolean) };
      if (c) Object.assign(c, data);
      else T.state.categories.push({ id: fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) + '-' + uid().slice(0, 4), ...data });
      T.save('categories');
      dlg.close();
      if (budget) T.agent.on('say', { text: `${name}: ${T.money(budget)} a month. I’ll warn you at 80%.`, act: 'write' });
    };
    dlg.showModal();
    setTimeout(() => f.name.focus(), 30);
  }

  /* ---------- recurring ---------- */
  function rec(r = null, preset = {}) {
    const dlg = $('#rec-dlg'), f = $('#rec-form');
    const x = r || { name: '', amount: 0, every: 'month', next: today(), categoryId: 'subs', active: true, ...preset };
    $('#rec-title').textContent = r ? `Edit ${r.name}` : 'New recurring payment';
    f.name.value = x.name; f.amount.value = x.amount ? T.plainAmount(x.amount) : ''; f.every.value = x.every; f.next.value = x.next || today(); f.active.checked = x.active !== false;
    catOptions(f.categoryId, T.cat(x.categoryId) ? x.categoryId : '', { none: true });
    const del = $('#rec-del');
    del.hidden = !r;
    del.onclick = async () => {
      if (!await ask({ title: `Delete ${esc(r.name)}?`, text: 'Payments it already logged stay in the ledger.' })) return;
      T.remove('recurring', r.id); T.save('recurring'); dlg.close();
    };
    f.onsubmit = ev => {
      ev.preventDefault();
      const name = f.name.value.trim();
      if (!name) return bad(f.name);
      const amount = amountOf(f.amount);
      if (amount == null) return;
      if (!f.next.value) return bad(f.next);
      const data = { name, amount, every: f.every.value, next: f.next.value, day: +f.next.value.slice(8, 10), categoryId: f.categoryId.value, active: f.active.checked };
      if (r) Object.assign(r, data); else T.add('recurring', data);
      const posted = T.postDue();
      T.save('recurring');
      dlg.close();
      T.agent.on('say', { text: posted.length ? `${name} is on the books, and ${plural(posted.length, 'payment')} already came due.` : `${name}: next one ${fmtDay(data.next).toLowerCase()}. I’ll log it when it comes.`, act: 'write' });
    };
    dlg.showModal();
    setTimeout(() => f.name.focus(), 30);
  }

  /* ---------- settings and data ---------- */
  function settings() {
    const dlg = $('#set-dlg'), f = $('#set-form'), s = T.state.settings;
    f.currency.innerHTML = [...new Set([s.currency, ...T.CURRENCIES])].map(c => {
      let name = c;
      try { name = `${c} · ${new Intl.DisplayNames(undefined, { type: 'currency' }).of(c)}`; } catch { }
      return `<option value="${c}">${esc(name)}</option>`;
    }).join('');
    f.currency.value = s.currency;
    f.coolOff.value = s.coolOff;
    f.budget.value = s.budget ? T.plainAmount(s.budget) : '';
    f.onsubmit = ev => {
      ev.preventDefault();
      const budget = amountOf(f.budget, { zero: true });
      if (budget == null) return;
      Object.assign(s, { currency: f.currency.value, coolOff: clamp(Math.round(+f.coolOff.value || 0), 0, 365), budget });
      T.replaceAll(T.state);   // clears the cached number formats, saves, redraws
      dlg.close();
      T.agent.brief();
    };
    $('.set-data', f).onclick = async e => {
      const b = e.target.closest('[data-data]');
      if (!b) return;
      const k = b.dataset.data;
      if (k === 'json') download(`avalon-treasury-${today()}.json`, JSON.stringify({ app: 'avalon-treasury', v: 1, exportedAt: new Date().toISOString(), data: T.state }, null, 2), 'application/json');
      if (k === 'csv') {
        const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const rows = [...T.state.expenses].sort((a, b) => a.date.localeCompare(b.date))
          .map(e => [e.date, e.kind, (e.kind === 'income' ? 1 : -1) * e.amount / 100, T.catOf(e).name, e.note].map(q).join(','));
        download(`avalon-treasury-${today()}.csv`, ['date,kind,amount,category,note', ...rows].join('\n'), 'text/csv');
      }
      if (k === 'import') $('#set-file').click();
      if (k === 'reset') {
        if (!await ask({ title: 'Erase everything?', text: 'Every expense, wish, budget and recurring payment in this browser is deleted. Make a backup first if you might want it back.', ok: 'Erase' })) return;
        T.replaceAll(null); dlg.close(); T.agent.brief();
      }
    };
    $('#set-file').onchange = async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const j = JSON.parse(await file.text()), data = j.data || j;
        if (!Array.isArray(data.expenses) || !Array.isArray(data.wishes)) throw new Error('shape');
        if (!await ask({ title: 'Replace the books with this backup?', text: `${plural(data.expenses.length, 'entry')} and ${plural(data.wishes.length, 'wish')}. What is here now is replaced.`, ok: 'Import', danger: false })) return;
        T.replaceAll(data); dlg.close(); toast('Backup imported.'); T.agent.brief();
      } catch { toast('That file is not a Treasury backup.', 'err'); }
    };
    dlg.showModal();
  }

  return { expense, wish, fund, buy, cat, rec, settings };
})();
