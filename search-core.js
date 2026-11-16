/* =====================================================================
   AVALON SEARCH CORE — shared by Avalon Search (results.js) and Research
   window.AvalonSearch: the source registry, fetching, URL identity and
   result merging (reciprocal-rank fusion).

   Each source's run(q, ctx) returns
     { results: [{ url, title, snippet, meta?, date?, sources? }], answer?, related? }
   `kind` drives filter tabs. `research: true` sources are only offered in
   Research. `date` is "YYYY", "YYYY-MM" or "YYYY-MM-DD" when known.

   Settings: on http(s) every Avalon page shares the home page's storage.
   On file:// (Zen, Firefox 92+) every file is its own origin, so the OS
   layer carries the non-secret settings over when you switch apps and
   each app keeps a copy under "avalon_shared_cfg" (see os/os.js).
   ===================================================================== */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? u : '#';
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
  /** Strip tags and decode entities from API snippets. */
  function plain(html) {
    const d = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html');
    return (d.body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  const isoDate = d => { const x = new Date(d); return isNaN(x) ? '' : x.toISOString().slice(0, 10); };

  /* ---------- settings ---------- */
  const FALLBACK_BANGS = [
    { k: 'g', name: 'Google', url: 'https://www.google.com/search?q=%s' },
    { k: 'd', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
    { k: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  ];
  function readConfig() {
    let home = null, shared = null;
    try { home = JSON.parse(localStorage.getItem('avalon_home_v1')); } catch { }
    try { shared = JSON.parse(localStorage.getItem('avalon_shared_cfg'))?.cfg; } catch { }
    const s = home?.settings || shared || {};
    const bangs = Array.isArray(home?.bangs) ? home.bangs : Array.isArray(shared?.bangs) ? shared.bangs : [];
    return {
      searx: String(s.searxUrl || '').trim().replace(/\/+$/, ''),
      wikiLang: String(s.wikiLang || 'en').toLowerCase(),
      ghToken: home?.settings?.ghToken || '',            // never copied between apps
      newTab: !!s.newTab,
      bangs: bangs.length ? bangs : FALLBACK_BANGS,
      from: home ? 'home' : shared ? 'shared' : 'none',
    };
  }
  const config = readConfig();

  /* ---------- names and colours ---------- */
  const COLORS = {
    Google: '#4f8cff', Bing: '#2dd4bf', DuckDuckGo: '#ff8a3d', Brave: '#fb6b3b', Startpage: '#6c8cff', Qwant: '#ff5a7a',
    Mojeek: '#7ee0c3', Marginalia: '#b27bff', Wikipedia: '#e9e6ff', 'Stack Overflow': '#f4a14a', 'Hacker News': '#ff7a1a',
    GitHub: '#9a94c9', Lemmy: '#6fdca0', npm: '#ff6b6b', Reddit: '#ff5a36', YouTube: '#ff4d4d',
    Wikidata: '#7fb2ff', OpenAlex: '#f7dc84', Crossref: '#ffb86b', ORCID: '#a6ce39', GLEIF: '#62e6f0', RDAP: '#c3cad8',
    'Wayback Machine': '#e0c38c', Mastodon: '#8c8dff', Bluesky: '#3d9bff',
  };
  const ENGINE_NAMES = {
    google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', brave: 'Brave', startpage: 'Startpage', qwant: 'Qwant',
    mojeek: 'Mojeek', wikipedia: 'Wikipedia', stackoverflow: 'Stack Overflow', github: 'GitHub', reddit: 'Reddit',
    youtube: 'YouTube', yahoo: 'Yahoo', presearch: 'Presearch', wikidata: 'Wikidata', npm: 'npm', pypi: 'PyPI',
  };
  const engineName = e => ENGINE_NAMES[e] || String(e).replace(/(^|\s)\w/g, c => c.toUpperCase());
  // home-page bang key → SearXNG engine name
  const BANG_TO_SEARX = { g: 'google', d: 'duckduckgo', bing: 'bing', br: 'brave', sp: 'startpage', w: 'wikipedia', gh: 'github',
    so: 'stackoverflow', r: 'reddit', yt: 'youtube', py: 'pypi', npm: 'npm', aw: 'arch linux wiki', mdn: 'mdn' };
  // home-page bang key → source that can be queried directly
  const BANG_TO_SOURCE = { w: 'wikipedia', gh: 'github', ghc: 'github', so: 'stackoverflow', hn: 'hn', npm: 'npm', d: 'ddg' };
  const WEB_BANGS = ['g', 'd', 'bing', 'br', 'sp'];
  const KIND_TABS = [['all', 'All'], ['multi', 'Multi-source'], ['web', 'Web'], ['wiki', 'Wiki'], ['qa', 'Q&A'], ['code', 'Code'], ['talk', 'Discussions']];
  const DEFAULT_ON = ['searx', 'marginalia', 'ddg', 'wikipedia', 'stackoverflow', 'hn', 'github'];

  /* ---------- fetching ---------- */
  async function getJSON(url, opts = {}, timeout = 9000) {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal, credentials: 'omit' });
      if (res.status === 403 && config.searx && url.startsWith(config.searx)) throw new Error('JSON output is disabled (403) — add json to search.formats');
      if (res.status === 429 || res.status === 503) throw new Error('rate limited, try again shortly');
      if (res.status === 404) throw new Error('nothing found (404)');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try { return await res.json(); } catch { throw new Error('did not return JSON'); }
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('timed out');
      if (e instanceof TypeError) throw new Error('unreachable from the browser (offline, wrong URL or no CORS header)');
      throw e;
    } finally { clearTimeout(t); }
  }

  /** A bare domain in the query ("galp.com", "https://www.galp.com/pt"), for domain-only sources. */
  function domainOf(q) {
    const m = String(q).toLowerCase().match(/(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})(?:[/:?#]|\s|$)/);
    return m ? m[1] : '';
  }
  const needDomain = q => { const d = domainOf(q); if (!d) throw new Error('needs a domain, like example.com'); return d; };

  /* ---------- Wikidata facts for the answer card ---------- */
  const FACT_PROPS = [
    ['P31', 'Instance of'], ['P571', 'Founded'], ['P112', 'Founded by'], ['P169', 'CEO'], ['P488', 'Chair'], ['P159', 'Headquarters'],
    ['P17', 'Country'], ['P452', 'Industry'], ['P1128', 'Employees'], ['P2139', 'Revenue'], ['P1278', 'LEI'], ['P414', 'Stock exchange'],
    ['P749', 'Parent'], ['P355', 'Subsidiaries'], ['P569', 'Born'], ['P570', 'Died'], ['P19', 'Birthplace'], ['P27', 'Citizenship'],
    ['P106', 'Occupation'], ['P108', 'Employer'], ['P69', 'Educated at'], ['P39', 'Position'], ['P856', 'Website'],
  ];
  function wdValue(snak) {
    const v = snak?.datavalue?.value;
    if (v == null) return null;
    if (typeof v === 'string') return { text: v };
    if (v.id) return { id: v.id };
    if (v.time) {
      const m = v.time.match(/^\+?(-?\d+)-(\d\d)-(\d\d)/);
      if (!m) return null;
      const prec = v.precision;                     // 9 = year, 10 = month, 11 = day
      return { text: prec >= 11 ? `${m[1]}-${m[2]}-${m[3]}` : prec === 10 ? `${m[1]}-${m[2]}` : m[1], date: true };
    }
    if (v.amount) return { text: Number(v.amount).toLocaleString('en') };
    return null;
  }
  async function wikidataFacts(id, lang) {
    const d = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${id}&props=labels|descriptions|claims|sitelinks&languages=${lang}|en&format=json&origin=*`);
    const e = d.entities?.[id];
    if (!e) return null;
    const facts = [], ids = new Set();
    for (const [p, label] of FACT_PROPS) {
      const vals = (e.claims?.[p] || []).filter(c => c.rank !== 'deprecated').slice(0, 3).map(c => wdValue(c.mainsnak)).filter(Boolean);
      if (!vals.length) continue;
      vals.forEach(v => v.id && ids.add(v.id));
      facts.push({ p, label, vals });
    }
    if (ids.size) {
      const l = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${[...ids].slice(0, 50).join('|')}&props=labels&languages=${lang}|en&format=json&origin=*`).catch(() => ({}));
      for (const f of facts) for (const v of f.vals) if (v.id) v.text = l.entities?.[v.id]?.labels?.[lang]?.value || l.entities?.[v.id]?.labels?.en?.value || v.id;
    }
    const name = e.labels?.[lang]?.value || e.labels?.en?.value || id;
    const wiki = e.sitelinks?.[`${lang}wiki`]?.title || e.sitelinks?.enwiki?.title;
    return {
      title: name, text: e.descriptions?.[lang]?.value || e.descriptions?.en?.value || '',
      url: `https://www.wikidata.org/wiki/${id}`, source: 'Wikidata', id,
      wiki: wiki ? `https://${e.sitelinks?.[`${lang}wiki`] ? lang : 'en'}.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, '_'))}` : '',
      facts: facts.map(f => ({ p: f.p, label: f.label, value: f.vals.map(v => v.text).filter(Boolean).join(', '), date: f.vals[0].date || false })),
    };
  }

  /* ---------- sources ---------- */
  const SOURCES = {
    searx: {
      name: 'SearXNG', kind: 'web', needs: () => !!config.searx, hint: 'Set your SearXNG URL in Settings → Search for Google, Bing, Brave…',
      async run(q, ctx = {}) {
        const eng = ctx.searxEngines?.length ? `&engines=${encodeURIComponent(ctx.searxEngines.join(','))}` : '';
        const cat = ctx.searxCategories ? `&categories=${encodeURIComponent(ctx.searxCategories)}` : '';
        const d = await getJSON(`${config.searx}/search?q=${encodeURIComponent(q)}&format=json&safesearch=0&language=auto${eng}${cat}`);
        const results = (d.results || []).map(r => ({
          url: r.url, title: r.title, snippet: r.content, meta: r.publishedDate ? new Date(r.publishedDate).toLocaleDateString() : '',
          date: r.publishedDate ? isoDate(r.publishedDate) : '',
          sources: (r.engines && r.engines.length ? r.engines : [r.engine]).filter(Boolean).map(engineName),
        }));
        const ib = (d.infoboxes || [])[0];
        const ans = (d.answers || [])[0];
        return {
          results,
          answer: ib ? { title: ib.infobox, text: plain(ib.content), url: ib.urls?.[0]?.url || ib.id, img: ib.img_src, source: 'SearXNG' }
            : ans ? { title: 'Answer', text: typeof ans === 'string' ? ans : ans.answer, url: ans.url, source: 'SearXNG' } : null,
          related: d.suggestions || [],
        };
      },
    },
    marginalia: {
      name: 'Marginalia', kind: 'web',
      async run(q) {
        // shared public API key: can be slow at busy times, so it gets a longer timeout
        const d = await getJSON(`https://api.marginalia.nu/public/search/${encodeURIComponent(q)}?count=20`, {}, 16000);
        return { results: (d.results || []).map(r => ({ url: r.url, title: r.title, snippet: r.description })) };
      },
    },
    ddg: {
      name: 'DuckDuckGo', kind: 'web', label: 'DuckDuckGo answers',
      async run(q) {
        const d = await getJSON(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1&t=avalon`);
        const results = [];
        if (d.AbstractURL) results.push({ url: d.AbstractURL, title: d.Heading || q, snippet: d.AbstractText });
        (d.Results || []).forEach(r => r.FirstURL && results.push({ url: r.FirstURL, title: `${host(r.FirstURL)} — ${plain(r.Text) || 'Official site'}`, snippet: '' }));
        const related = [];
        const walk = list => (list || []).forEach(t => t.Topics ? walk(t.Topics) : t.Text && related.push(t.Text.split(' - ')[0]));
        walk(d.RelatedTopics);
        const img = d.Image ? (d.Image.startsWith('http') ? d.Image : `https://duckduckgo.com${d.Image}`) : '';
        return {
          results,
          answer: d.Answer ? { title: 'Answer', text: plain(d.Answer), source: 'DuckDuckGo' }
            : d.AbstractText ? { title: d.Heading, text: d.AbstractText, url: d.AbstractURL, img, source: d.AbstractSource || 'DuckDuckGo' }
            : d.Definition ? { title: 'Definition', text: d.Definition, url: d.DefinitionURL, source: d.DefinitionSource } : null,
          related: related.slice(0, 8),
        };
      },
    },
    wikipedia: {
      name: 'Wikipedia', kind: 'wiki',
      async run(q) {
        const W = config.wikiLang;
        const d = await getJSON(`https://${W}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=8&srprop=snippet|timestamp`);
        const hits = d.query?.search || [];
        let answer = null;
        if (hits[0]) {
          try {
            const s = await getJSON(`https://${W}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hits[0].title.replace(/ /g, '_'))}`);
            if (s.extract && s.type !== 'disambiguation') answer = { title: s.title, text: s.extract, url: s.content_urls?.desktop?.page, img: s.thumbnail?.source, source: 'Wikipedia' };
          } catch { }
        }
        return {
          results: hits.map(h => ({ url: `https://${W}.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`, title: h.title, snippet: plain(h.snippet) })),
          answer,
        };
      },
    },
    stackoverflow: {
      name: 'Stack Overflow', kind: 'qa',
      async run(q) {
        const d = await getJSON(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=8&filter=withbody`);
        return {
          results: (d.items || []).map(i => ({
            url: i.link, title: plain(i.title), snippet: plain(i.body).slice(0, 240), date: isoDate(i.creation_date * 1000),
            meta: `${i.score} votes · ${i.answer_count} answers${i.is_answered ? ' · answered' : ''}`,
          })),
        };
      },
    },
    hn: {
      name: 'Hacker News', kind: 'talk',
      async run(q) {
        const d = await getJSON(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=8`);
        return {
          results: (d.hits || []).map(h => ({
            url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, title: h.title, snippet: '', date: isoDate(h.created_at),
            meta: `${h.points} points · <a href="https://news.ycombinator.com/item?id=${esc(h.objectID)}">${h.num_comments} comments</a>`,
          })),
        };
      },
    },
    lemmy: {
      name: 'Lemmy', kind: 'talk',
      async run(q) {
        const d = await getJSON(`https://lemmy.world/api/v3/search?q=${encodeURIComponent(q)}&type_=Posts&sort=TopAll&limit=8`);
        return {
          results: (d.posts || []).map(p => ({
            url: p.post.url || p.post.ap_id, title: p.post.name, snippet: plain(p.post.body).slice(0, 200), date: isoDate(p.post.published),
            meta: `${p.counts?.score ?? 0} points · <a href="${esc(safeUrl(p.post.ap_id))}">${p.counts?.comments ?? 0} comments</a> · ${esc(p.community?.name || '')}`,
          })),
        };
      },
    },
    github: {
      name: 'GitHub', kind: 'code',
      async run(q) {
        const headers = config.ghToken ? { Authorization: `Bearer ${config.ghToken}` } : {};
        const d = await getJSON(`https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=8`, { headers });
        return {
          results: (d.items || []).map(r => ({
            url: r.html_url, title: r.full_name, snippet: r.description,
            meta: `★ ${r.stargazers_count.toLocaleString()}${r.language ? ' · ' + esc(r.language) : ''} · updated ${new Date(r.pushed_at).toLocaleDateString()}`,
          })),
        };
      },
    },
    npm: {
      name: 'npm', kind: 'code',
      async run(q) {
        const d = await getJSON(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=8`);
        return {
          results: (d.objects || []).map(o => ({
            url: o.package.links?.npm || `https://www.npmjs.com/package/${o.package.name}`, title: o.package.name, snippet: o.package.description,
            meta: `v${esc(o.package.version)}${o.downloads?.weekly ? ` · ${o.downloads.weekly.toLocaleString()}/week` : ''}`,
          })),
        };
      },
    },

    /* ----- Research sources (structured, public, readable from a page) ----- */
    wikidata: {
      name: 'Wikidata', kind: 'wiki', research: true, type: 'website',
      async run(q) {
        const L = config.wikiLang;
        const d = await getJSON(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=${L}&uselang=${L}&limit=8&format=json&origin=*`);
        const hits = d.search || [];
        let answer = null;
        if (hits[0]) answer = await wikidataFacts(hits[0].id, L).catch(() => null);
        return {
          results: hits.map(h => ({ url: `https://www.wikidata.org/wiki/${h.id}`, title: `${h.label || h.id}`, snippet: h.description || '', meta: h.id })),
          answer,
        };
      },
    },
    openalex: {
      name: 'OpenAlex', kind: 'academic', research: true, type: 'document',
      async run(q) {
        const d = await getJSON(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=10`);
        return {
          results: (d.results || []).map(w => {
            const authors = (w.authorships || []).slice(0, 3).map(a => a.author?.display_name).filter(Boolean);
            return {
              url: w.doi || w.primary_location?.landing_page_url || w.id, title: w.display_name || w.title,
              snippet: [authors.join(', ') + ((w.authorships || []).length > 3 ? ' et al.' : ''), w.primary_location?.source?.display_name].filter(Boolean).join(' · '),
              meta: `${w.publication_year || ''}${w.cited_by_count ? ` · cited ${w.cited_by_count.toLocaleString()}×` : ''}`,
              date: w.publication_date || (w.publication_year ? String(w.publication_year) : ''),
              author: authors.join('; '), publisher: w.primary_location?.source?.display_name || '',
            };
          }),
        };
      },
    },
    crossref: {
      name: 'Crossref', kind: 'academic', research: true, type: 'document',
      async run(q) {
        const d = await getJSON(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=8&select=DOI,title,author,issued,container-title,publisher,URL,type`);
        return {
          results: (d.message?.items || []).map(w => {
            const authors = (w.author || []).slice(0, 3).map(a => [a.family, a.given?.[0] ? `${a.given[0]}.` : ''].filter(Boolean).join(', '));
            const dp = w.issued?.['date-parts']?.[0] || [];
            return {
              url: w.URL || `https://doi.org/${w.DOI}`, title: (w.title || [])[0] || w.DOI,
              snippet: [authors.join('; '), (w['container-title'] || [])[0]].filter(Boolean).join(' · '),
              meta: `${dp[0] || ''}${w.type ? ` · ${esc(w.type.replace(/-/g, ' '))}` : ''}`,
              date: dp[0] ? [dp[0], dp[1] && String(dp[1]).padStart(2, '0'), dp[2] && String(dp[2]).padStart(2, '0')].filter(Boolean).join('-') : '',
              author: authors.join('; '), publisher: (w['container-title'] || [])[0] || w.publisher || '',
            };
          }),
        };
      },
    },
    orcid: {
      name: 'ORCID', kind: 'people', research: true, type: 'website',
      async run(q) {
        const d = await getJSON(`https://pub.orcid.org/v3.0/expanded-search/?q=${encodeURIComponent(q)}&rows=8`, { headers: { Accept: 'application/json' } });
        return {
          results: (d['expanded-result'] || []).map(p => ({
            url: `https://orcid.org/${p['orcid-id']}`, title: [p['given-names'], p['family-names']].filter(Boolean).join(' ') || p['orcid-id'],
            snippet: (p['institution-name'] || []).slice(0, 3).join(' · '), meta: p['orcid-id'],
          })),
        };
      },
    },
    gleif: {
      name: 'GLEIF', label: 'GLEIF registry', kind: 'registry', research: true, type: 'official',
      async run(q) {
        const d = await getJSON(`https://api.gleif.org/api/v1/lei-records?filter[fulltext]=${encodeURIComponent(q)}&page[size]=8`);
        return {
          results: (d.data || []).map(r => {
            const e = r.attributes?.entity || {}, a = e.headquartersAddress || e.legalAddress || {};
            return {
              url: `https://search.gleif.org/#/record/${r.id}`, title: e.legalName?.name || r.id,
              snippet: [`LEI ${r.id}`, e.jurisdiction, e.status && e.status.toLowerCase(), [a.city, a.country].filter(Boolean).join(', ')].filter(Boolean).join(' · '),
              meta: r.attributes?.registration?.status ? `registration ${esc(r.attributes.registration.status.toLowerCase())}` : '',
              date: (r.attributes?.registration?.initialRegistrationDate || '').slice(0, 10),
              publisher: 'GLEIF',
            };
          }),
        };
      },
    },
    rdap: {
      name: 'RDAP', label: 'Domain records', kind: 'registry', research: true, type: 'official',
      async run(q) {
        const dom = needDomain(q);
        const d = await getJSON(`https://rdap.org/domain/${encodeURIComponent(dom)}`, {}, 12000);
        const ev = a => (d.events || []).find(e => e.eventAction === a)?.eventDate;
        const registrar = (d.entities || []).find(e => (e.roles || []).includes('registrar'));
        const regName = registrar?.vcardArray?.[1]?.find(v => v[0] === 'fn')?.[3] || '';
        return {
          results: [{
            url: `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(dom)}`, title: `${dom} — domain registration`,
            snippet: [regName && `Registrar: ${regName}`, ev('registration') && `registered ${isoDate(ev('registration'))}`,
              ev('expiration') && `expires ${isoDate(ev('expiration'))}`, (d.nameservers || []).length && `NS: ${(d.nameservers || []).map(n => n.ldhName?.toLowerCase()).slice(0, 3).join(', ')}`,
              (d.status || []).length && `status: ${d.status.slice(0, 3).join(', ')}`].filter(Boolean).join(' · '),
            date: ev('registration') ? isoDate(ev('registration')) : '', publisher: regName || 'RDAP',
          }],
        };
      },
    },
    wayback: {
      name: 'Wayback Machine', label: 'Wayback Machine', kind: 'archive', research: true, type: 'website',
      async run(q) {
        const dom = needDomain(q);
        const [first, last] = await Promise.all([
          getJSON(`https://archive.org/wayback/available?url=${encodeURIComponent(dom)}&timestamp=19960101`, {}, 12000).catch(() => ({})),
          getJSON(`https://archive.org/wayback/available?url=${encodeURIComponent(dom)}`, {}, 12000),
        ]);
        const fmt = ts => ts ? `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}` : '';
        const out = [];
        const f = first.archived_snapshots?.closest, l = last.archived_snapshots?.closest;
        if (l) out.push({ url: l.url.replace(/^http:/, 'https:'), title: `${dom} — latest archived copy`, snippet: `Captured ${fmt(l.timestamp)}`, date: fmt(l.timestamp), publisher: 'Internet Archive' });
        if (f && f.timestamp !== l?.timestamp) out.push({ url: f.url.replace(/^http:/, 'https:'), title: `${dom} — earliest archived copy`, snippet: `Captured ${fmt(f.timestamp)}`, date: fmt(f.timestamp), publisher: 'Internet Archive' });
        out.push({ url: `https://web.archive.org/web/*/${dom}`, title: `${dom} — every archived capture`, snippet: 'Calendar of all snapshots in the Wayback Machine', publisher: 'Internet Archive' });
        return { results: out };
      },
    },
    mastodon: {
      name: 'Mastodon', kind: 'social', research: true, type: 'social',
      async run(q) {
        const d = await getJSON(`https://mastodon.social/api/v2/search?q=${encodeURIComponent(q)}&type=accounts&limit=8&resolve=false`);
        return {
          results: (d.accounts || []).map(a => ({
            url: a.url, title: `${a.display_name || a.username} (@${a.acct})`, snippet: plain(a.note).slice(0, 220),
            meta: `${(a.followers_count || 0).toLocaleString()} followers`, date: (a.created_at || '').slice(0, 10),
          })),
        };
      },
    },
    bluesky: {
      name: 'Bluesky', kind: 'social', research: true, type: 'social',
      async run(q) {
        const d = await getJSON(`https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${encodeURIComponent(q)}&limit=8`);
        return {
          results: (d.actors || []).map(a => ({
            url: `https://bsky.app/profile/${a.handle}`, title: `${a.displayName || a.handle} (@${a.handle})`, snippet: (a.description || '').slice(0, 220),
            date: (a.createdAt || '').slice(0, 10),
          })),
        };
      },
    },
  };

  /* ---------- URL identity + merging ---------- */
  function normUrl(u) {
    try {
      const x = new URL(u);
      const h = x.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '').replace(/\.m\.wikipedia\.org$/, '.wikipedia.org');
      [...x.searchParams.keys()].forEach(k => { if (/^(utm_|ref$|ref_|fbclid|gclid|si$)/i.test(k)) x.searchParams.delete(k); });
      const qs = x.searchParams.toString();
      let p = decodeURIComponent(x.pathname).replace(/\/+$/, '').toLowerCase();
      if (h.endsWith('wikipedia.org')) p = p.replace(/_/g, ' ');
      return `${h}${p}${qs ? '?' + qs : ''}`;
    } catch { return String(u || '').trim().toLowerCase(); }
  }

  /**
   * Reciprocal-rank fusion. Every (source, rank) sighting adds 1/(K + rank),
   * so pages found by several sources, or high up in any of them, rise.
   */
  function merge(outputs) {
    const K = 20, map = new Map();
    for (const [id, out] of Object.entries(outputs)) {
      if (!out?.results) continue;
      const src = SOURCES[id];
      out.results.forEach((r, rank) => {
        if (!r.url || !/^https?:/i.test(r.url)) return;
        const key = normUrl(r.url);
        const names = r.sources?.length ? r.sources : [src.name];
        let m = map.get(key);
        if (!m) { m = { url: r.url, title: r.title, snippet: r.snippet || '', metas: [], sources: new Set(), kinds: new Set(), ids: new Set(), score: 0, date: '', author: '', publisher: '', type: '' }; map.set(key, m); }
        for (const n of names) { if (!m.sources.has(n)) { m.sources.add(n); m.score += 1 / (K + rank); } }
        m.kinds.add(src.kind); m.ids.add(id);
        if ((r.snippet || '').length > m.snippet.length) m.snippet = r.snippet;
        if (!m.title && r.title) m.title = r.title;
        if (r.meta) m.metas.push(r.meta);
        if (!m.date && r.date) m.date = r.date;
        if (!m.author && r.author) m.author = r.author;
        if (!m.publisher && r.publisher) m.publisher = r.publisher;
        if (!m.type && src.type) m.type = src.type;
      });
    }
    return [...map.values()].sort((a, b) => b.score - a.score);
  }

  /** Run several sources in parallel; onUpdate(outputs, status) fires as each one answers. */
  function runAll(q, ids, ctx, onUpdate) {
    const outputs = {}, status = {};
    const active = ids.filter(id => SOURCES[id] && (!SOURCES[id].needs || SOURCES[id].needs()));
    active.forEach(id => { status[id] = { state: 'loading' }; });
    onUpdate?.(outputs, status, false);
    const all = active.map(async id => {
      const t0 = performance.now();
      try {
        outputs[id] = await SOURCES[id].run(q, ctx);
        status[id] = { state: 'ok', count: outputs[id].results.length, ms: Math.round(performance.now() - t0) };
      } catch (e) { status[id] = { state: 'error', error: e.message || String(e) }; }
      onUpdate?.(outputs, status, Object.values(status).every(s => s.state !== 'loading'));
    });
    return Promise.all(all).then(() => ({ outputs, status }));
  }

  window.AvalonSearch = {
    config, readConfig, SOURCES, COLORS, ENGINE_NAMES, engineName, BANG_TO_SEARX, BANG_TO_SOURCE, WEB_BANGS, KIND_TABS, DEFAULT_ON,
    getJSON, normUrl, merge, runAll, domainOf, plain, wikidataFacts,
  };
})();
