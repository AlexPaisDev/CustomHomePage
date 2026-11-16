/* =====================================================================
   AVALON RESEARCH — tasks: open questions, leads and to-dos
   Each has a status (Open / Doing / Done / Dropped) and can be linked to
   the entities and sources it concerns.
   ===================================================================== */
'use strict';

R.TASK_KINDS = { question: { label: 'Question', icon: 'help' }, lead: { label: 'Lead', icon: 'search' }, todo: { label: 'To-do', icon: 'list' } };
R.TASK_STATUS = { open: 'Open', doing: 'Doing', done: 'Done', dropped: 'Dropped' };

R.views.tasks = (() => {
  let el = null;
  const f = () => (R.ui.tasks ||= { kind: '', showDone: false });

  function render(root) {
    el = root;
    const o = f();
    const list = S.tasks.filter(t => !o.kind || t.kind === o.kind);
    const groups = [['doing', 'In progress'], ['open', 'Open'], ['closed', 'Done and dropped']];
    const pick = g => list.filter(t => g === 'closed' ? ['done', 'dropped'].includes(t.status) : t.status === g)
      .sort((a, b) => g === 'closed' ? (b.doneAt || b.updatedAt).localeCompare(a.doneAt || a.updatedAt) : a.createdAt.localeCompare(b.createdAt));
    el.innerHTML = `
      <header class="rx-head">
        <div><p class="rx-kicker">${icon('list')}Tasks</p><h1 class="rx-title">${esc(S.inv.title)}</h1></div>
        <div class="p-actions"><span class="p-meta">${S.tasks.filter(t => !['done', 'dropped'].includes(t.status)).length} open</span></div>
      </header>
      <form class="tk-new" id="tk-new" autocomplete="off">
        <select name="kind" aria-label="Kind">${Object.entries(R.TASK_KINDS).map(([k, x]) => `<option value="${k}">${x.label}</option>`).join('')}</select>
        <input name="text" data-filter placeholder="An open question, a lead to follow, something to do…" required maxlength="400" aria-label="Task">
        <button class="btn btn-gold">${icon('plus')}Add</button>
      </form>
      <div class="rx-toolbar">
        <div class="fd-filters">
          <button type="button" data-kind="" class="${!o.kind ? 'on' : ''}">All <span>${S.tasks.length}</span></button>
          ${Object.entries(R.TASK_KINDS).map(([k, x]) => `<button type="button" data-kind="${k}" class="${o.kind === k ? 'on' : ''}">${x.label}s <span>${S.tasks.filter(t => t.kind === k).length}</span></button>`).join('')}
        </div>
      </div>
      ${S.tasks.length ? groups.map(([g, label]) => {
        const items = pick(g);
        if (!items.length && g !== 'open') return '';
        if (g === 'closed') return `<details class="tk-group" ${o.showDone ? 'open' : ''}><summary>${label} <span>${items.length}</span></summary><ul class="tk-list">${items.map(row).join('')}</ul></details>`;
        return `<section class="tk-group"><h2>${label} <span>${items.length}</span></h2><ul class="tk-list">${items.map(row).join('') || '<li class="empty">Nothing open. Add a question or a lead above.</li>'}</ul></section>`;
      }).join('') : `<div class="rx-empty-big">${icon('list')}<p><b>No tasks yet.</b> Keep the open questions and leads of this case here, linked to the people and sources they're about.</p></div>`}`;
    $('#tk-new', el).addEventListener('submit', add);
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    el.addEventListener('input', onInput);
    $('details.tk-group', el)?.addEventListener('toggle', e => { f().showDone = e.target.open; R.saveUi(); });
  }

  function row(t) {
    const k = R.TASK_KINDS[t.kind] || R.TASK_KINDS.todo, closed = ['done', 'dropped'].includes(t.status);
    const ents = (t.entityIds || []).map(id => S.entities.find(e => e.id === id)).filter(Boolean);
    const srcs = (t.sourceIds || []).map(id => S.sources.find(s => s.id === id)).filter(Boolean);
    const freeE = S.entities.filter(e => !(t.entityIds || []).includes(e.id)), freeS = S.sources.filter(s => !(t.sourceIds || []).includes(s.id));
    return `<li class="tk tk-${t.status}" data-tk="${t.id}">
      <button class="tk-box ${t.status === 'done' ? 'on' : ''}" data-done title="${t.status === 'done' ? 'Reopen' : 'Mark done'}" aria-label="Done">${t.status === 'done' ? icon('check') : ''}</button>
      <div class="tk-main">
        <div class="tk-line">
          <span class="tk-kind">${icon(k.icon)}${k.label}</span>
          <input class="tk-text" value="${esc(t.text)}" aria-label="Task" ${closed ? '' : ''}>
          <select class="tk-status" data-status aria-label="Status">${Object.entries(R.TASK_STATUS).map(([s, l]) => `<option value="${s}" ${s === t.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <button class="icon-btn sm" data-del title="Delete">${icon('trash')}</button>
        </div>
        <div class="fd-row">
          ${ents.map(e => `<span class="fd-chip ent" style="--c:${(R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other).color}"><button type="button" data-open-ent="${e.id}">${esc(e.name)}</button><button type="button" class="x" data-unlink="ent:${e.id}" aria-label="Remove">×</button></span>`).join('')}
          ${srcs.map(s => `<span class="fd-chip">${R.relBar(s.reliability)}<button type="button" data-open-src="${s.id}">${esc((s.title || s.url || '').slice(0, 44))}</button><button type="button" class="x" data-unlink="src:${s.id}" aria-label="Remove">×</button></span>`).join('')}
          ${freeE.length ? `<select data-link="ent" aria-label="Link an entity"><option value="">+ entity</option>${freeE.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select>` : ''}
          ${freeS.length ? `<select data-link="src" aria-label="Link a source"><option value="">+ source</option>${freeS.map(s => `<option value="${s.id}">${esc((s.title || s.url || '').slice(0, 60))}</option>`).join('')}</select>` : ''}
        </div>
      </div>
    </li>`;
  }

  const byEl = t => S.tasks.find(x => x.id === t.closest('[data-tk]')?.dataset.tk);
  async function setStatus(t, status) {
    t.status = status;
    t.doneAt = status === 'done' ? new Date().toISOString() : null;
    await R.store.save('tasks', t, 'tasks');
    if (status === 'done') { R.agent.desk?.do('found'); R.agent.desk?.say(`Closed: “${t.text.slice(0, 50)}”.`); }
    R.renderMain();
  }
  async function add(e) {
    e.preventDefault();
    const fm = e.target, text = fm.text.value.trim();
    if (!text) return;
    await R.store.create('tasks', { text, kind: fm.kind.value, status: 'open', entityIds: [], sourceIds: [], doneAt: null }, 'tasks');
    const kind = fm.kind.value;
    R.renderMain();
    const n = $('#tk-new', $('#rx-main'));
    if (n) { n.kind.value = kind; n.text.focus(); }
  }
  async function onClick(e) {
    const t = e.target;
    const k = t.closest('[data-kind]');
    if (k) { f().kind = k.dataset.kind; R.saveUi(); return R.renderMain(); }
    const x = byEl(t);
    if (!x) return;
    if (t.closest('[data-done]')) return setStatus(x, x.status === 'done' ? 'open' : 'done');
    if (t.closest('[data-del]')) { await R.store.removeAll({ tasks: [x.id] }, 'tasks'); return R.renderMain(); }
    const un = t.closest('[data-unlink]');
    if (un) { const [kind, id] = un.dataset.unlink.split(':'), key = kind === 'ent' ? 'entityIds' : 'sourceIds'; x[key] = (x[key] || []).filter(i => i !== id); await R.store.save('tasks', x, 'tasks'); return R.renderMain(); }
    const oe = t.closest('[data-open-ent]'); if (oe) return R.openEntity(oe.dataset.openEnt);
    const os = t.closest('[data-open-src]'); if (os) return R.views.sources.openPanel(os.dataset.openSrc);
  }
  async function onChange(e) {
    const x = byEl(e.target);
    if (!x) return;
    if (e.target.matches('[data-status]')) return setStatus(x, e.target.value);
    const link = e.target.dataset.link;
    if (link && e.target.value) {
      const key = link === 'ent' ? 'entityIds' : 'sourceIds';
      x[key] = [...new Set([...(x[key] || []), e.target.value])];
      await R.store.save('tasks', x, 'tasks');
      R.renderMain();
    }
  }
  const saveText = debounce(async (x, v) => { x.text = v; await R.store.save('tasks', x, 'tasks'); }, 450);
  function onInput(e) { const x = byEl(e.target); if (x && e.target.matches('.tk-text') && e.target.value.trim()) saveText(x, e.target.value.trim()); }

  function update(kind, id, from) {
    if (!el || !document.body.contains(el)) return false;
    if (from === 'tasks') return true;
    if (['tasks', 'entities', 'sources', 'external'].includes(kind)) { if (!el.contains(document.activeElement) || document.activeElement === document.body) R.renderMain(); return true; }
    return ['selection', 'inv', 'highlights', 'entityFields', 'nodes', 'edges', 'notes', 'findings'].includes(kind);
  }
  return { render, update };
})();
