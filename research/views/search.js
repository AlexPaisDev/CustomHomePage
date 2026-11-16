/* =====================================================================
   AVALON RESEARCH — search inside an investigation
   Built on the shared engine (search-core.js). Presets per investigation
   type pick a query template and a set of sources; structured sources
   (Wikidata, GLEIF, OpenAlex…) always get the plain subject, web sources
   get the expanded query. Every result can be saved as a Source in one
   click. Results are kept per investigation while the page is open.
   ===================================================================== */
'use strict';

R.views.search = (() => {
  const AS = window.AvalonSearch;
  const P = (k, label, tpl, src, extra = {}) => ({ k, label, tpl, src, ...extra });
  const WEB = ['searx', 'marginalia', 'ddg'];
  const NEWS = P('news', 'News', '{q}', ['searx', 'hn', 'lemmy'], { cat: 'news' });
  const SOCIAL = P('social', 'Social', '{q}', ['mastodon', 'bluesky', 'searx'], { searxTpl: '{q} (site:linkedin.com OR site:x.com OR site:instagram.com OR site:facebook.com)' });
  const ACADEMIC = P('academic', 'Academic', '{q}', ['openalex', 'crossref', 'searx'], { cat: 'science' });
  const DOMAINS = P('domains', 'Domains', '{q}', ['rdap', 'wayback'], { hint: 'Type a domain, like example.com' });
  const PRESETS = {
    company: [
      P('overview', 'Overview', '{q}', [...WEB, 'wikidata', 'wikipedia']),
      P('leaders', 'Leadership', '{q} CEO OR founder OR "board of directors"', ['searx', 'marginalia', 'wikidata']),
      P('money', 'Financials', '{q} annual report revenue results', ['searx', 'marginalia', 'ddg']),
      NEWS,
      P('registry', 'Registry & legal', '{q}', ['gleif', 'wikidata', 'searx'], { searxTpl: '{q} company registry OR lawsuit OR court' }),
      DOMAINS, SOCIAL,
      P('reviews', 'Reviews', '{q} reviews', ['searx', 'marginalia'], { searxTpl: '{q} reviews (site:trustpilot.com OR site:glassdoor.com OR site:reddit.com)' }),
    ],
    person: [
      P('overview', 'Overview', '{q}', [...WEB, 'wikidata', 'wikipedia']),
      P('profile', 'Profile', '{q} biography OR profile OR interview', ['searx', 'marginalia', 'wikidata', 'orcid']),
      P('career', 'Career', '{q} career OR appointed OR joined', ['searx', 'marginalia', 'ddg']),
      P('pubs', 'Publications', '{q}', ['openalex', 'crossref', 'orcid']),
      NEWS, SOCIAL,
    ],
    topic: [
      P('overview', 'Overview', '{q}', [...WEB, 'wikipedia', 'wikidata']),
      P('concepts', 'Key concepts', '{q} explained OR introduction OR glossary', ['searx', 'marginalia', 'wikipedia', 'ddg']),
      ACADEMIC, NEWS,
      P('opposing', 'Opposing views', '{q} criticism OR controversy OR debate', ['searx', 'marginalia', 'hn', 'lemmy']),
    ],
    custom: [P('overview', 'Web', '{q}', [...WEB, 'wikipedia', 'wikidata']), NEWS, ACADEMIC, SOCIAL, DOMAINS],
  };

  /** "Open in" links for places with no public API, per subject type. */
  function openIn(type, q) {
    const e = encodeURIComponent(q);
    const common = [['Google', `https://www.google.com/search?q=${e}`], ['Google News', `https://news.google.com/search?q=${e}`]];
    const by = {
      company: [['LinkedIn', `https://www.linkedin.com/search/results/companies/?keywords=${e}`], ['OpenCorporates', `https://opencorporates.com/companies?q=${e}`],
        ['Racius (PT)', `https://www.google.com/search?q=${e}+site%3Aracius.com`], ['eInforma (PT)', `https://www.google.com/search?q=${e}+site%3Aeinforma.pt`],
        ['Companies House (UK)', `https://find-and-update.company-information.service.gov.uk/search?q=${e}`], ['SEC EDGAR (US)', `https://www.sec.gov/cgi-bin/browse-edgar?company=${e}&action=getcompany`]],
      person: [['LinkedIn', `https://www.linkedin.com/search/results/people/?keywords=${e}`], ['Google Scholar', `https://scholar.google.com/scholar?q=${e}`],
        ['X', `https://x.com/search?q=${e}&f=user`]],
      topic: [['Google Scholar', `https://scholar.google.com/scholar?q=${e}`], ['Reddit', `https://www.reddit.com/search/?q=${e}`], ['arXiv', `https://arxiv.org/search/?query=${e}&searchtype=all`]],
      custom: [['Reddit', `https://www.reddit.com/search/?q=${e}`], ['Google Scholar', `https://scholar.google.com/scholar?q=${e}`]],
    };
    return [...common, ...(by[type] || by.custom)];
  }

  const KIND_LABEL = { all: 'All', multi: 'Multi-source', web: 'Web', wiki: 'Encyclopedic', academic: 'Academic', registry: 'Registries', archive: 'Archives', social: 'Social', people: 'People', talk: 'Discussions', qa: 'Q&A', code: 'Code' };
  const memo = new Map();              // investigation id → last search state
  let el = null, st = null;

  const presetsFor = inv => PRESETS[inv.type] || PRESETS.custom;
  const fill = (tpl, q) => tpl.replace(/\{q\}/g, q.includes(' ') && !/^".*"$/.test(q) ? `"${q}"` : q);
  function stateFor(inv) {
    if (!memo.has(inv.id)) memo.set(inv.id, { q: '', preset: presetsFor(inv)[0].k, outputs: {}, status: {}, merged: [], run: 0, sel: -1, kind: 'all', ran: '' });
    return memo.get(inv.id);
  }
  const onFile = url => S.sources.find(s => s.normUrl && s.normUrl === AS.normUrl(url));

  /* ---------- render ---------- */
  function render(root) {
    el = root;
    st = stateFor(S.inv);
    const inv = S.inv, presets = presetsFor(inv), recent = (inv.searches || []).slice(0, 6);
    el.innerHTML = `
      <header class="rx-head">
        <div><p class="rx-kicker">${icon('search')}Search</p><h1 class="rx-title">${esc(inv.title)}</h1></div>
        <div class="p-actions"><span class="p-meta" id="rs-cfg"></span></div>
      </header>
      <form class="cmd rx-sform" id="rx-sform" role="search" autocomplete="off">
        ${icon('search', 'ic cmd-ic')}
        <input id="rx-sq" type="text" data-filter spellcheck="false" value="${esc(st.q || inv.title)}" placeholder="What are you looking for?" aria-label="Search">
        <button class="cmd-engine rx-sgo" type="submit"><span>Search</span></button>
      </form>
      <div class="rx-presets" role="tablist" aria-label="Search presets">
        ${presets.map(p => `<button type="button" data-preset="${p.k}" class="${p.k === st.preset ? 'on' : ''}">${esc(p.label)}</button>`).join('')}
      </div>
      ${recent.length ? `<div class="rx-recent"><span>Recent</span>${recent.map(r => `<button type="button" data-recent="${esc(r.q)}" data-rp="${esc(r.preset)}">${esc(r.q)}<small>${esc((presets.find(p => p.k === r.preset) || {}).label || '')}</small></button>`).join('')}</div>` : ''}
      <div class="rx-snotice" id="rx-snotice" hidden></div>
      <div class="rx-schips" id="rx-schips"></div>
      <div class="rx-sgrid">
        <section>
          <div class="tabs" id="rx-skinds"></div>
          <ol class="rx-results" id="rx-results"></ol>
        </section>
        <aside class="rx-sside" id="rx-sside"></aside>
      </div>`;
    const cfgFrom = AS.config.from;
    $('#rs-cfg', el).textContent = AS.config.searx ? 'SearXNG connected' : cfgFrom === 'none' ? 'Settings not shared yet' : '';
    $('#rs-cfg', el).title = AS.config.searx ? AS.config.searx : 'Switch here from Home once so Research gets your search settings.';
    drawAll();

    $('#rx-sform', el).addEventListener('submit', e => { e.preventDefault(); search(); });
    el.addEventListener('click', onClick);
    if (!st.ran) setTimeout(() => $('#rx-sq', el)?.select(), 0);
  }

  function drawAll() { drawNotice(); drawChips(); drawList(); drawSide(); }

  function preset() { return presetsFor(S.inv).find(p => p.k === st.preset) || presetsFor(S.inv)[0]; }

  function drawNotice() {
    const box = $('#rx-snotice', el); if (!box) return;
    const p = preset(), parts = [];
    if (p.hint) parts.push(`${icon('alert')}${esc(p.hint)}.`);
    if (!AS.config.searx && p.src.includes('searx')) parts.push(`${icon('alert')}Google, Bing and news search need your SearXNG; until then this preset uses the open sources below${p.k === 'news' ? ' (HN and Lemmy)' : ''}. Use <b>Open in</b> for the big engines.`);
    const errs = Object.entries(st.status).filter(([, s]) => s.state === 'error');
    if (errs.length) parts.push(errs.map(([id, s]) => `<b>${esc(AS.SOURCES[id].label || AS.SOURCES[id].name)}</b>: ${esc(s.error)}`).join(' · '));
    box.innerHTML = parts.map(x => `<p>${x}</p>`).join('');
    box.hidden = !parts.length;
  }

  function drawChips() {
    const box = $('#rx-schips', el); if (!box) return;
    box.innerHTML = preset().src.map(id => {
      const s = AS.SOURCES[id], x = st.status[id], off = s.needs && !s.needs();
      const info = off ? 'not set up' : !x ? '' : x.state === 'loading' ? '…' : x.state === 'error' ? 'error' : `${x.count}`;
      return `<span class="rs-chip on ${x?.state || ''} ${off ? 'na' : ''}" title="${esc(off ? s.hint : x?.error || s.label || s.name)}" style="--c:${AS.COLORS[s.name] || 'var(--gold)'}"><span class="led"></span>${esc(s.label || s.name)}<small>${esc(info)}</small></span>`;
    }).join('');
  }

  function drawList() {
    const list = $('#rx-results', el); if (!list) return;
    const all = st.merged;
    const counts = { all: all.length, multi: all.filter(m => m.sources.size > 1).length };
    all.forEach(m => m.kinds.forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
    const kinds = Object.keys(KIND_LABEL).filter(k => k === 'all' || counts[k]);
    if (!kinds.includes(st.kind)) st.kind = 'all';
    $('#rx-skinds', el).innerHTML = all.length ? kinds.map(k => `<button data-kind="${k}" class="${k === st.kind ? 'on' : ''}">${KIND_LABEL[k]} <span class="n">${counts[k]}</span></button>`).join('') : '';
    const shown = visible();
    const loading = Object.values(st.status).some(s => s.state === 'loading');
    if (!st.ran) {
      list.innerHTML = `<li class="rx-sempty">${icon('search')}<p>Pick a preset and press <b>Search</b>. Results you save become sources of this investigation, with every engine that found them.</p></li>`;
      return;
    }
    if (!shown.length) { list.innerHTML = loading ? '<li class="skeleton"></li>'.repeat(5) : '<li class="state">Nothing found here. Try another preset or different words.</li>'; return; }
    list.innerHTML = shown.map((m, i) => {
      const h = host(m.url), saved = onFile(m.url);
      return `<li class="rx-res ${m.sources.size > 1 ? 'multi' : ''} ${i === st.sel ? 'sel' : ''}" data-i="${i}">
        <div class="rx-res-main">
          <div class="rs-url"><img src="https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(h)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'"><span>${esc(h)}</span></div>
          <a class="rs-title" href="${esc(safeUrl(m.url))}" target="_blank" rel="noopener noreferrer">${esc(m.title || h)}</a>
          ${m.snippet ? `<p class="rs-snip">${esc(m.snippet)}</p>` : ''}
          <div class="rs-meta">
            ${m.sources.size > 1 ? `<span class="rs-count">▲ ${m.sources.size} sources</span>` : ''}
            ${[...m.sources].map(n => `<span class="rs-src" style="--c:${AS.COLORS[n] || '#9a94c9'}">${esc(n)}</span>`).join('')}
            ${m.date ? `<span class="rs-extra">${esc(fmtDate(m.date))}</span>` : m.metas[0] ? `<span class="rs-extra">${m.metas[0]}</span>` : ''}
          </div>
        </div>
        ${saved ? `<button class="rx-save done" data-open="${saved.id}" title="Already a source: open it">${icon('check')}<span>On file</span></button>`
          : `<button class="rx-save" data-save="${i}" title="Save to this investigation (S)">${icon('plus')}<span>Save</span></button>`}
      </li>`;
    }).join('') + (loading ? '<li class="state">Still waiting on some sources…</li>' : '');
  }
  const visible = () => st.merged.filter(m => st.kind === 'all' || (st.kind === 'multi' ? m.sources.size > 1 : m.kinds.has(st.kind)));

  function drawSide() {
    const box = $('#rx-sside', el); if (!box) return;
    const ans = ['wikidata', 'searx', 'ddg', 'wikipedia'].map(id => st.outputs[id]?.answer).find(Boolean);
    const q = st.ran || $('#rx-sq', el)?.value || S.inv.title;
    let html = '';
    if (ans) {
      const saved = ans.url && onFile(ans.url);
      html += `<section class="panel rx-facts">
        <header class="p-head"><h2>${esc(ans.title || 'Answer')}</h2><span class="p-meta">${esc(ans.source || '')}</span></header>
        ${ans.img ? `<img class="rs-ans-img" src="${esc(safeUrl(ans.img))}" alt="">` : ''}
        ${ans.text ? `<p class="rs-ans">${esc(ans.text)}</p>` : ''}
        ${ans.facts?.length ? `<dl class="rx-factlist">${ans.facts.map(f => `<dt>${esc(f.label)}</dt><dd>${f.p === 'P856' ? `<a href="${esc(safeUrl(f.value.split(', ')[0]))}" target="_blank" rel="noopener">${esc(host(f.value.split(', ')[0]) || f.value)}</a>` : esc(f.date ? fmtDate(f.value) : f.value)}</dd>`).join('')}</dl>` : ''}
        <div class="rx-facts-foot">
          ${ans.url ? `<a class="link-btn" href="${esc(safeUrl(ans.url))}" target="_blank" rel="noopener">${esc(host(ans.url))} →</a>` : ''}
          ${ans.url ? (saved ? `<button class="btn btn-sm" data-open="${saved.id}">${icon('check')}On file</button>` : `<button class="btn btn-sm" data-save-answer>${icon('plus')}Save as source</button>`) : ''}
        </div>
      </section>`;
    }
    const rel = [...new Set([...(st.outputs.searx?.related || []), ...(st.outputs.ddg?.related || [])])].slice(0, 8);
    if (rel.length) html += `<section class="panel"><header class="p-head"><h2>Related</h2></header><div class="rs-rel">${rel.map(r => `<button type="button" data-q="${esc(r)}">${esc(r)}</button>`).join('')}</div></section>`;
    html += `<section class="panel"><header class="p-head"><h2>Open in</h2></header><div class="rs-else">${openIn(S.inv.type, q).map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)} ${icon('external')}</a>`).join('')}</div></section>`;
    box.innerHTML = html;
  }

  /* ---------- searching ---------- */
  async function search(q = $('#rx-sq', el)?.value.trim()) {
    if (!q) return $('#rx-sq', el)?.focus();
    const inv = S.inv, cur = st, p = preset(), id = ++cur.run;   // cur: this investigation's state, even if you switch away
    Object.assign(cur, { q, ran: q, outputs: {}, status: {}, merged: [], sel: -1, kind: 'all' });
    const active = p.src.filter(s => AS.SOURCES[s] && (!AS.SOURCES[s].needs || AS.SOURCES[s].needs()));
    active.forEach(s => { cur.status[s] = { state: 'loading' }; });
    drawAll();
    // remember the search on the investigation (newest first, no repeats)
    const searches = [{ q, preset: p.k, at: new Date().toISOString() }, ...(inv.searches || []).filter(x => !(x.q === q && x.preset === p.k))].slice(0, 12);
    R.store.updateInv(inv.id, { searches }, 'search');
    R.agent.desk?.do('search', { hold: true });
    R.agent.desk?.say(`Searching ${active.length} sources: ${p.label.toLowerCase()} on “${q}”…`);
    const ctx = { searxCategories: p.cat || '' };
    const showing = () => st === cur && el && document.body.contains(el);
    await Promise.all(active.map(async s => {
      const src = AS.SOURCES[s], t0 = performance.now();
      const query = src.research || s === 'wikipedia' || s === 'ddg' ? q : s === 'searx' && p.searxTpl ? fill(p.searxTpl, q) : fill(p.tpl, q);
      try {
        const out = await src.run(query, ctx);
        if (id !== cur.run) return;
        cur.outputs[s] = out;
        cur.status[s] = { state: 'ok', count: out.results.length, ms: Math.round(performance.now() - t0) };
      } catch (e) {
        if (id !== cur.run) return;
        cur.status[s] = { state: 'error', error: e.message || String(e) };
      }
      cur.merged = AS.merge(cur.outputs);
      if (showing()) drawAll();
      report(cur, id);
    }));
  }
  function report(cur, id) {
    if (id !== cur.run) return;
    const all = Object.values(cur.status), done = all.filter(s => s.state !== 'loading').length, failed = all.filter(s => s.state === 'error').length;
    if (done < all.length) return R.agent.desk?.set(`Checking sources… ${done} of ${all.length} answered.`);
    const multi = cur.merged.filter(m => m.sources.size > 1).length;
    const miss = failed ? ` ${failed} source${failed > 1 ? 's' : ''} didn't answer.` : '';
    if (!cur.merged.length) { R.agent.desk?.do('think'); R.agent.desk?.mood('warn', 5000); return R.agent.desk?.say(`Nothing turned up.${miss}`); }
    R.agent.desk?.do('found');
    R.agent.desk?.say(`${cur.merged.length} leads${multi ? `, ${multi} backed by more than one source` : ''}.${miss} Press S to save the selected one.`);
  }

  /* ---------- saving ---------- */
  const toPartial = d => { const m = String(d || '').match(/^\d{4}(-\d{2}(-\d{2})?)?/); return m && PARTIAL_DATE.test(m[0]) ? m[0] : ''; };
  async function saveMatch(m) {
    const existing = onFile(m.url);
    if (existing) { R.views.sources.select(existing.id); R.agent.event('dup', existing); return; }
    const src = await R.store.addSource({
      url: m.url, title: (m.title || host(m.url)).slice(0, 300), author: m.author || '', publisher: m.publisher || host(m.url),
      publishedAt: toPartial(m.date), type: m.type || guessType(m), origin: 'search', foundBy: [...m.sources], snippet: (m.snippet || '').slice(0, 600),
      searchQuery: st.ran,
    });
    toast(`Saved <b>${esc(src.title)}</b>.`);
    R.agent.event('filed', src);
    drawList(); drawSide();
  }
  function guessType(m) {
    const h = host(m.url);
    if (/youtube\.com|youtu\.be|vimeo\.com/.test(h)) return 'video';
    if (/linkedin\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|reddit\.com|news\.ycombinator\.com|bsky\.app|mastodon/.test(h)) return 'social';
    if (/\.gov(\.[a-z]{2})?$|\.gov\b|europa\.eu$|justica\.gov\.pt/.test(h)) return 'official';
    if (/\.pdf($|\?)/i.test(m.url)) return 'document';
    if (m.kinds.has('talk')) return 'social';
    return m.date ? 'article' : 'website';
  }

  function onClick(e) {
    const t = e.target;
    const pb = t.closest('[data-preset]');
    if (pb) { st.preset = pb.dataset.preset; $$('[data-preset]', el).forEach(b => b.classList.toggle('on', b === pb)); drawNotice(); drawChips(); if (st.ran) search(); else drawSide(); return; }
    const rb = t.closest('[data-recent]');
    if (rb) { if (rb.dataset.rp && presetsFor(S.inv).some(p => p.k === rb.dataset.rp)) st.preset = rb.dataset.rp; $('#rx-sq', el).value = rb.dataset.recent; R.renderMain(); search(rb.dataset.recent); return; }
    const kb = t.closest('[data-kind]');
    if (kb) { st.kind = kb.dataset.kind; st.sel = -1; drawList(); return; }
    const qb = t.closest('[data-q]');
    if (qb) { $('#rx-sq', el).value = qb.dataset.q; search(qb.dataset.q); return; }
    const sv = t.closest('[data-save]');
    if (sv) { sv.disabled = true; saveMatch(visible()[+sv.dataset.save]); return; }
    if (t.closest('[data-save-answer]')) {
      const ans = ['wikidata', 'searx', 'ddg', 'wikipedia'].map(id => st.outputs[id]?.answer).find(Boolean);
      if (ans?.url) saveMatch({ url: ans.url, title: ans.title, snippet: ans.text, sources: new Set([ans.source || 'Wikidata']), kinds: new Set(['wiki']), metas: [], type: 'website', publisher: ans.source });
      return;
    }
    const op = t.closest('[data-open]');
    if (op) { R.views.sources.select(op.dataset.open); return; }
    const li = t.closest('.rx-res');
    if (li && !t.closest('a')) { st.sel = +li.dataset.i; mark(); }
  }
  function mark() {
    $$('.rx-res', el).forEach(li => li.classList.toggle('sel', +li.dataset.i === st.sel));
    $(`.rx-res[data-i="${st.sel}"]`, el)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function step(d) {
    const n = visible().length;
    if (!n) return;
    st.sel = Math.max(0, Math.min(n - 1, st.sel + d));
    mark();
  }
  function save() {
    const m = visible()[st.sel];
    if (m) saveMatch(m);
  }
  function open() {
    const m = visible()[st.sel];
    if (m) window.open(safeUrl(m.url), '_blank', 'noopener');
  }

  // sources saved or removed elsewhere change the Save / On file buttons
  function update(kind, id, from) {
    if (!el || !document.body.contains(el)) return false;
    if (['sources', 'external'].includes(kind)) { drawList(); drawSide(); return true; }
    if (kind === 'selection' || kind === 'highlights' || kind === 'inv' || from === 'search') return true;
    return false;
  }

  return { render, update, step, save, open, search, PRESETS };
})();
