/* =====================================================================
   AVALON RESEARCH — all investigations
   Cards with search, type / status / tag filters and sorting. Filter
   choices are remembered per browser (R.ui.home).
   ===================================================================== */
'use strict';

R.views.home = (() => {
  const SORTS = { updated: 'Last updated', created: 'Created', name: 'Name' };
  const f = () => (R.ui.home ||= { q: '', type: '', status: '', tag: '', sort: 'updated' });
  let counts = {};

  async function loadCounts() {
    const c = {};
    await Promise.all(S.invs.map(async i => {
      const [src, hl] = await Promise.all([R.db.count('sources', 'investigationId', i.id), R.db.count('highlights', 'investigationId', i.id)]);
      c[i.id] = { src, hl };
    }));
    counts = c;
  }

  function filtered() {
    const o = f(), q = o.q.trim().toLowerCase();
    const list = S.invs.filter(i =>
      (!o.type || i.type === o.type) && (!o.status || i.status === o.status) && (!o.tag || i.tags.includes(o.tag)) &&
      (!q || [i.title, i.description, ...i.tags].join(' ').toLowerCase().includes(q)));
    const by = {
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      created: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    }[o.sort] || (() => 0);
    return list.sort(by);
  }

  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;

  function card(i) {
    const st = R.STATUS[i.status] || R.STATUS.active, t = R.TYPES[i.type] || R.TYPES.custom, c = counts[i.id] || { src: 0, hl: 0 };
    return `
      <a class="rx-card" href="${R.invHash(i.id)}">
        <span class="rx-card-top"><span class="rx-card-type">${icon(t.icon)}${t.label}</span><i class="st ${st.cls}">${st.label}</i></span>
        <span class="rx-card-title">${esc(i.title)}</span>
        ${i.description ? `<span class="rx-card-desc">${esc(i.description)}</span>` : ''}
        ${i.tags.length ? `<span class="rx-tags">${i.tags.map(x => `<span class="rx-tag">${esc(x)}</span>`).join('')}</span>` : ''}
        <span class="rx-card-foot">
          <span>${icon('link')}${plural(c.src, 'source')}</span>
          ${c.hl ? `<span>${icon('quote')}${plural(c.hl, 'highlight')}</span>` : ''}
          <span class="rx-card-when" title="Created ${esc(new Date(i.createdAt).toLocaleString())}">updated ${ago(i.updatedAt)}</span>
        </span>
      </a>`;
  }

  function drawList(el) {
    const list = filtered();
    $('#rx-home-n', el).textContent = list.length === S.invs.length ? plural(list.length, 'investigation') : `${list.length} of ${S.invs.length}`;
    $('#rx-cards', el).innerHTML = list.map(card).join('') ||
      `<p class="rx-none">No investigation matches these filters. <button class="link-btn" data-act="reset">Clear filters</button></p>`;
  }

  async function render(el) {
    await loadCounts();
    if (!S.invs.length) {
      el.innerHTML = `
        <div class="rx-welcome">
          <div class="rx-welcome-agent"></div>
          <h1>Research</h1>
          <p>A workspace for digging into a company, a person or a topic, and keeping what you find: sources, highlights,
          and soon a board, entities, findings and a timeline.</p>
          <button class="btn btn-gold" data-act="new">${icon('plus')}Start an investigation</button>
          <p class="muted">Everything stays in this browser. Nothing is sent anywhere unless you search.</p>
        </div>`;
      $('[data-act="new"]', el).addEventListener('click', () => R.editInv());
      const big = window.AvalonInvestigator?.desk($('.rx-welcome-agent', el), { size: 'lg', text: 'Ready for the first case.' });
      big?.do('wave');
      return;
    }
    const o = f(), tags = R.allTags();
    if (o.tag && !tags.includes(o.tag)) o.tag = '';
    el.innerHTML = `
      <header class="rx-head">
        <div><p class="rx-kicker">${icon('research')}Avalon Research</p><h1 class="rx-title">Investigations</h1></div>
        <div class="p-actions"><span class="p-meta" id="rx-home-n"></span><button class="btn btn-gold" data-act="new">${icon('plus')}New</button></div>
      </header>
      <div class="rx-toolbar">
        <label class="rx-search">${icon('search')}<input type="search" data-filter name="q" value="${esc(o.q)}" placeholder="Search titles, descriptions and tags" aria-label="Search investigations"></label>
        <select name="type" aria-label="Type">${opt('', 'All types', o.type)}${Object.entries(R.TYPES).map(([k, t]) => opt(k, t.label, o.type)).join('')}</select>
        <select name="status" aria-label="Status">${opt('', 'Any status', o.status)}${Object.entries(R.STATUS).map(([k, t]) => opt(k, t.label, o.status)).join('')}</select>
        ${tags.length ? `<select name="tag" aria-label="Tag">${opt('', 'All tags', o.tag)}${tags.map(t => opt(t, `#${t}`, o.tag)).join('')}</select>` : ''}
        <select name="sort" aria-label="Sort">${Object.entries(SORTS).map(([k, l]) => opt(k, `Sort: ${l}`, o.sort)).join('')}</select>
      </div>
      <div class="rx-cards" id="rx-cards"></div>`;
    drawList(el);
    $('.rx-toolbar', el).addEventListener('input', e => {
      if (!e.target.name) return;
      f()[e.target.name] = e.target.value; R.saveUi(); drawList(el);
    });
    el.addEventListener('click', onClick);
  }
  function onClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'new') R.editInv();
    if (act === 'reset') { Object.assign(f(), { q: '', type: '', status: '', tag: '' }); R.saveUi(); R.renderMain(); }
  }

  return { render };
})();
