/* =====================================================================
   AVALON RESEARCH — citation export
   Markdown reading list, APA 7 and MLA 9 reference lists. Titles that
   should be italic are wrapped in *asterisks* (Markdown).
   ===================================================================== */
'use strict';

R.cite = (() => {
  const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  const end = s => /[.?!]$/.test(s) ? s : `${s}.`;          // one full stop, never two
  const title = s => (s.title || s.url || 'Untitled').trim();
  const isWeb = s => !!s.url;

  function apaDate(d) {
    const p = parts(d);
    if (!p) return 'n.d.';
    return [p.y, p.m ? `${MONTHS[p.m - 1]}${p.d ? ` ${p.d}` : ''}` : ''].filter(Boolean).join(', ');
  }
  function mlaDate(d) {
    const p = parts(d);
    if (!p) return '';
    return [p.d || '', p.m ? MLA_MONTHS[p.m - 1] : '', p.y].filter(Boolean).join(' ');
  }

  /** APA 7: Author. (Date). *Title*. Site. URL */
  function apa(s) {
    const t = `*${title(s)}*`, date = `(${apaDate(s.publishedAt)}).`;
    const site = s.publisher && s.publisher !== s.author ? end(s.publisher) : '';
    const kind = s.fileId ? ' [Document]' : s.origin === 'text' ? ' [Unpublished text]' : '';
    const head = s.author ? `${end(s.author)} ${date} ${end(t + kind)}` : `${end(t + kind)} ${date}`;
    return [head, site, isWeb(s) ? s.url : ''].filter(Boolean).join(' ');
  }

  /** MLA 9: Author. "Title." *Site*, Date, url. Accessed Date. */
  function mla(s) {
    const t = `"${end(title(s))}"`;
    const container = [s.publisher ? `*${s.publisher}*` : '', mlaDate(s.publishedAt), isWeb(s) ? s.url.replace(/^https?:\/\//i, '') : ''].filter(Boolean).join(', ');
    const acc = isWeb(s) && s.accessedAt ? `Accessed ${mlaDate(s.accessedAt)}.` : '';
    return [s.author ? end(s.author) : '', t, container ? end(container) : '', acc].filter(Boolean).join(' ');
  }

  /** Markdown reading list, with each source's highlights quoted under it. */
  function md(s) {
    const link = isWeb(s) ? `[${title(s).replace(/[[\]]/g, '')}](${s.url})` : `**${title(s)}**`;
    const meta = [s.author, s.publisher, fmtDate(s.publishedAt), (R.SOURCE_TYPES[s.type] || R.SOURCE_TYPES.other).label,
      `reliability: ${R.RELIABILITY[s.reliability]}${s.reliability ? ` (${s.reliability}/5)` : ''}`,
      s.accessedAt ? `accessed ${fmtDate(s.accessedAt)}` : ''].filter(Boolean).join(' · ');
    const quotes = S.highlights.filter(h => h.sourceId === s.id)
      .map(h => `  > ${h.quote.replace(/\s*\n\s*/g, ' ')}${h.location ? ` (${h.location})` : ''}`);
    return [`- ${link} — ${meta}`, ...quotes].join('\n');
  }

  const sortKey = s => (s.author || title(s)).replace(/^[*"'“‘\s]+/, '').toLowerCase();
  function build(fmt, list) {
    const sorted = [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    if (fmt === 'md') {
      return `# Sources — ${S.inv.title}\n\n_${plural(list.length, 'source')}, exported ${fmtDate(today())} from Avalon Research._\n\n${sorted.map(md).join('\n')}\n`;
    }
    const f = fmt === 'apa' ? apa : mla;
    return `${fmt === 'apa' ? 'References' : 'Works Cited'}\n\n${sorted.map(f).join('\n\n')}\n`;
  }

  /* ---------- dialog ---------- */
  const dlg = $('#cite-dlg');
  let fmt = (R.ui.citeFmt) || 'md';
  function draw() {
    const list = $('#cite-filtered').checked ? R.visibleSources() : S.sources;
    $$('#cite-fmt button').forEach(b => b.classList.toggle('on', b.dataset.f === fmt));
    $('#cite-count').textContent = plural(list.length, 'source');
    $('#cite-out').value = list.length ? build(fmt, list) : 'No sources to export.';
  }
  function open() {
    if (!S.inv) return;
    fmt = R.ui.citeFmt || 'md';
    $('#cite-filtered').checked = false;
    draw();
    dlg.showModal();
  }
  $('#cite-fmt').addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    fmt = R.ui.citeFmt = b.dataset.f; R.saveUi(); draw();
  });
  $('#cite-filtered').addEventListener('change', draw);
  $('#cite-copy').addEventListener('click', async () => { if (await copyText($('#cite-out').value)) toast('Citations copied.'); });
  $('#cite-dl').addEventListener('click', () => {
    const ext = fmt === 'md' ? 'md' : 'txt';
    download(`${slug(S.inv.title)}-sources${fmt === 'md' ? '' : `-${fmt}`}.${ext}`, $('#cite-out').value, fmt === 'md' ? 'text/markdown' : 'text/plain');
  });

  return { open, apa, mla, md, build };
})();
