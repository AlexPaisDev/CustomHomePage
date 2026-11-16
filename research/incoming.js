/* =====================================================================
   AVALON RESEARCH — results handed over from Avalon Search
   Search and Research have separate storage on file://, so "+ Research"
   on a search result opens Research with the result in the link
   (AvalonOS.arrival.extra.save). This asks which investigation to file
   it in, saves it, and offers the way back to the results.
   ===================================================================== */
'use strict';

R.incoming = (() => {
  const dlg = $('#save-dlg'), form = $('#save-form');
  let item = null;

  function preview(p) {
    const h = host(p.url);
    $('#save-preview').innerHTML = `
      <div class="rs-url"><img src="https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(h)}" alt="" onerror="this.style.visibility='hidden'"><span>${esc(h)}</span></div>
      <b>${esc(p.title || h)}</b>
      ${p.snippet ? `<p>${esc(p.snippet)}</p>` : ''}
      ${p.sources?.length ? `<div class="rs-meta">${p.sources.map(n => `<span class="rs-src" style="--c:${(window.AvalonSearch?.COLORS || {})[n] || '#9a94c9'}">${esc(n)}</span>`).join('')}</div>` : ''}`;
  }

  function open(p) {
    if (!p?.url || !/^https?:\/\//i.test(p.url)) return;
    item = p;
    preview(p);
    const invs = [...S.invs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    form.inv.innerHTML = invs.map(i => `<option value="${i.id}">${esc(i.title)}</option>`).join('') + '<option value="__new">＋ New investigation…</option>';
    form.inv.value = invs.some(i => i.id === R.ui.last) ? R.ui.last : invs[0]?.id || '__new';
    form.newTitle.value = p.q || '';
    form.title.value = p.title || '';
    toggleNew();
    $('#save-done').hidden = true; form.hidden = false;
    dlg.showModal();
    R.agent.desk?.do('wave');
    R.agent.desk?.say('A lead from Search. Which case does it belong to?');
  }
  const toggleNew = () => { $('#save-new-wrap').hidden = form.inv.value !== '__new'; };
  form.inv.addEventListener('change', toggleNew);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    let invId = form.inv.value;
    if (invId === '__new') {
      const title = form.newTitle.value.trim();
      if (!title) return form.newTitle.focus();
      invId = (await R.store.createInv({ title, type: 'topic' })).id;
    }
    await R.goAndWait(R.invHash(invId, 'sources'), { replace: true });
    const { here } = await R.store.findUrl(item.url);
    let src = here, already = !!here;
    if (!src) {
      const date = String(item.date || '').match(/^\d{4}(-\d{2}(-\d{2})?)?/)?.[0] || '';
      src = await R.store.addSource({
        url: item.url, title: (form.title.value.trim() || item.title || host(item.url)).slice(0, 300),
        author: item.author || '', publisher: item.publisher || host(item.url), publishedAt: PARTIAL_DATE.test(date) ? date : '',
        type: item.type || 'website', origin: 'search', foundBy: item.sources || [], snippet: item.snippet || '', searchQuery: item.q || '',
      });
    }
    R.views.sources.select(src.id);
    R.agent.event(already ? 'dup' : 'filed', src);
    form.hidden = true;
    $('#save-done-text').innerHTML = already
      ? `That link is already a source in <b>${esc(S.inv.title)}</b>, so it was opened instead.`
      : `Saved to <b>${esc(S.inv.title)}</b>.`;
    $('#save-done').hidden = false;
    $('#save-back').focus();
  });
  $('#save-back').addEventListener('click', () => { dlg.close(); history.back(); });
  $('#save-stay').addEventListener('click', () => dlg.close());

  /** Called once at boot with whatever the link carried. */
  function check() {
    const raw = window.AvalonOS?.arrival?.extra?.save;
    if (raw) open(AvalonOS.unpack(raw));
  }
  return { open, check };
})();
