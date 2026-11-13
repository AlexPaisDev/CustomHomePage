/* =====================================================================
   AVALON SEARCH — combined results page
   results.html?q=<query>[&e=<bang keys>][&s=<source ids>]

   Queries several sources in parallel, merges results that point at the
   same page, and ranks them with reciprocal-rank fusion: a link found by
   several sources (or several engines inside SearXNG) rises to the top
   and shows every source that found it.

   Google/Bing/Brave… can't be read from a web page (no CORS), so those
   come through the user's own SearXNG instance when one is configured.
   ===================================================================== */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? u : '#';
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
/** Strip tags and decode entities from API snippets (Wikipedia, Stack Exchange). */
function plain(html) {
  const d = new DOMParser().parseFromString(`<body>${String(html || '')}</body>`, 'text/html');
  return (d.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/* ---------- settings shared with the home page ---------- */
let saved = {};
try { saved = JSON.parse(localStorage.getItem('avalon_home_v1')) || {}; } catch { }
const cfg = saved.settings || {};
const SEARX = String(cfg.searxUrl || '').trim().replace(/\/+$/, '');
const WIKI = (cfg.wikiLang || 'en').toLowerCase();
const GH_TOKEN = cfg.ghToken || '';
const BANGS = Array.isArray(saved.bangs) ? saved.bangs : [];

/* ---------- source registry ---------- */
const COLORS = {
  Google: '#4f8cff', Bing: '#2dd4bf', DuckDuckGo: '#ff8a3d', Brave: '#fb6b3b', Startpage: '#6c8cff', Qwant: '#ff5a7a',
  Mojeek: '#7ee0c3', Marginalia: '#b27bff', Wikipedia: '#e9e6ff', 'Stack Overflow': '#f4a14a', 'Hacker News': '#ff7a1a',
  GitHub: '#9a94c9', Lemmy: '#6fdca0', npm: '#ff6b6b', Reddit: '#ff5a36', YouTube: '#ff4d4d',
};
const ENGINE_NAMES = {
  google: 'Google', bing: 'Bing', duckduckgo: 'DuckDuckGo', brave: 'Brave', startpage: 'Startpage', qwant: 'Qwant',
  mojeek: 'Mojeek', wikipedia: 'Wikipedia', stackoverflow: 'Stack Overflow', github: 'GitHub', reddit: 'Reddit',
  youtube: 'YouTube', 'yahoo': 'Yahoo', 'presearch': 'Presearch', 'wikidata': 'Wikidata', 'npm': 'npm', 'pypi': 'PyPI',
};
const engineName = e => ENGINE_NAMES[e] || e.replace(/(^|\s)\w/g, c => c.toUpperCase());
// home-page bang key → SearXNG engine name
const BANG_TO_SEARX = { g: 'google', d: 'duckduckgo', bing: 'bing', br: 'brave', sp: 'startpage', w: 'wikipedia', gh: 'github',
  so: 'stackoverflow', r: 'reddit', yt: 'youtube', py: 'pypi', npm: 'npm', aw: 'arch linux wiki', mdn: 'mdn' };
// home-page bang key → source that can be queried directly
const BANG_TO_SOURCE = { w: 'wikipedia', gh: 'github', ghc: 'github', so: 'stackoverflow', hn: 'hn', npm: 'npm', d: 'ddg' };
const WEB_BANGS = ['g', 'd', 'bing', 'br', 'sp'];

/**
 * Each source returns { results: [{ url, title, snippet, meta? }], answer?, related? }.
 * `kind` drives the filter tabs. `sources` on a result may list several engines (SearXNG).
 */
const SOURCES = {
  searx: {
    name: 'SearXNG', kind: 'web', needs: () => !!SEARX, hint: 'Set your SearXNG URL in Settings → Search for Google, Bing, Brave…',
    async run(q, ctx) {
      const eng = ctx.searxEngines.length ? `&engines=${encodeURIComponent(ctx.searxEngines.join(','))}` : '';
      const d = await getJSON(`${SEARX}/search?q=${encodeURIComponent(q)}&format=json&safesearch=0&language=auto${eng}`);
      const results = (d.results || []).map(r => ({
        url: r.url, title: r.title, snippet: r.content, meta: r.publishedDate ? new Date(r.publishedDate).toLocaleDateString() : '',
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
      const d = await getJSON(`https://${WIKI}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=8&srprop=snippet|timestamp`);
      const hits = d.query?.search || [];
      let answer = null;
      if (hits[0]) {
        try {
          const s = await getJSON(`https://${WIKI}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hits[0].title.replace(/ /g, '_'))}`);
          if (s.extract && s.type !== 'disambiguation') answer = { title: s.title, text: s.extract, url: s.content_urls?.desktop?.page, img: s.thumbnail?.source, source: 'Wikipedia' };
        } catch { }
      }
      return {
        results: hits.map(h => ({ url: `https://${WIKI}.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`, title: h.title, snippet: plain(h.snippet) })),
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
          url: i.link, title: plain(i.title), snippet: plain(i.body).slice(0, 240),
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
          url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, title: h.title,
          snippet: '', meta: `${h.points} points · <a href="https://news.ycombinator.com/item?id=${esc(h.objectID)}">${h.num_comments} comments</a>`,
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
          url: p.post.url || p.post.ap_id, title: p.post.name, snippet: plain(p.post.body).slice(0, 200),
          meta: `${p.counts?.score ?? 0} points · <a href="${esc(safeUrl(p.post.ap_id))}">${p.counts?.comments ?? 0} comments</a> · ${esc(p.community?.name || '')}`,
        })),
      };
    },
  },
  github: {
    name: 'GitHub', kind: 'code',
    async run(q) {
      const headers = GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {};
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
};
const KIND_TABS = [['all', 'All'], ['multi', 'Multi-source'], ['web', 'Web'], ['wiki', 'Wiki'], ['qa', 'Q&A'], ['code', 'Code'], ['talk', 'Discussions']];
const DEFAULT_ON = ['searx', 'marginalia', 'ddg', 'wikipedia', 'stackoverflow', 'hn', 'github'];

async function getJSON(url, opts = {}, timeout = 9000) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, credentials: 'omit' });
    if (res.status === 403 && url.startsWith(SEARX || '\0')) throw new Error('JSON output is disabled (403) — add json to search.formats');
    if (res.status === 429 || res.status === 503) throw new Error('rate limited, try again shortly');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    try { return await res.json(); } catch { throw new Error('did not return JSON'); }
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('timed out');
    if (e instanceof TypeError) throw new Error('unreachable from the browser (offline, wrong URL or no CORS header)');
    throw e;
  } finally { clearTimeout(t); }
}

/* ---------- URL normalisation + merging ---------- */
function normUrl(u) {
  try {
    const x = new URL(u);
    let h = x.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '').replace(/\.m\.wikipedia\.org$/, '.wikipedia.org');
    [...x.searchParams.keys()].forEach(k => { if (/^(utm_|ref$|ref_|fbclid|gclid|si$)/i.test(k)) x.searchParams.delete(k); });
    const qs = x.searchParams.toString();
    let p = decodeURIComponent(x.pathname).replace(/\/+$/, '').toLowerCase();
    if (h.endsWith('wikipedia.org')) p = p.replace(/_/g, ' ');
    return `${h}${p}${qs ? '?' + qs : ''}`;
  } catch { return String(u).toLowerCase(); }
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
      if (!m) { m = { url: r.url, title: r.title, snippet: r.snippet || '', metas: [], sources: new Set(), kinds: new Set(), score: 0 }; map.set(key, m); }
      for (const n of names) { if (!m.sources.has(n)) { m.sources.add(n); m.score += 1 / (K + rank); } }
      m.kinds.add(src.kind);
      if ((r.snippet || '').length > m.snippet.length) m.snippet = r.snippet;
      if (!m.title && r.title) m.title = r.title;
      if (r.meta) m.metas.push(r.meta);
    });
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

/* ---------- page state ---------- */
const params = new URLSearchParams(location.search);
let query = (params.get('q') || '').trim();
const bangKeys = (params.get('e') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
let enabled = initialSources();
let outputs = {}, status = {}, runId = 0, tab = 'all', sel = -1, merged = [];

/** Which sources start switched on: from ?s=, else from the home page's selected engines, else defaults. */
function initialSources() {
  const s = (params.get('s') || '').split(',').filter(id => SOURCES[id]);
  if (s.length) return new Set(s);
  // the default set, plus anything the home page's chosen engines map to (e.g. !npm → npm)
  const on = new Set(DEFAULT_ON);
  bangKeys.forEach(k => { if (BANG_TO_SOURCE[k]) on.add(BANG_TO_SOURCE[k]); });
  return on;
}
const searxEngines = () => [...new Set(bangKeys.map(k => BANG_TO_SEARX[k]).filter(Boolean))];

/* ---------- rendering ---------- */
function badge(name) {
  return `<span class="rs-src" style="--c:${COLORS[name] || '#9a94c9'}">${esc(name)}</span>`;
}

function renderSources() {
  $('#rs-sources').innerHTML = Object.entries(SOURCES).map(([id, s]) => {
    const st = status[id], on = enabled.has(id), off = s.needs && !s.needs();
    const info = off ? 'not set up' : !on ? 'off' : !st ? '' : st.state === 'loading' ? '…' : st.state === 'error' ? 'error' : `${st.count} · ${st.ms}ms`;
    return `<button type="button" class="rs-chip ${on && !off ? 'on' : ''} ${st?.state || ''} ${off ? 'na' : ''}" data-id="${id}"
      title="${esc(off ? s.hint : st?.error ? `${s.name}: ${st.error}` : `Toggle ${s.label || s.name}`)}" style="--c:${COLORS[s.name] || 'var(--gold)'}">
      <span class="led"></span>${esc(s.label || s.name)}<small>${esc(info)}</small></button>`;
  }).join('');
  const done = Object.values(status).filter(s => s.state !== 'loading').length, total = Object.keys(status).length;
  $('#rs-stat').textContent = total ? `${merged.length} results · ${done}/${total} sources` : '';
}

function renderNotice() {
  const n = $('#rs-notice'), wantsWeb = bangKeys.some(k => WEB_BANGS.includes(k) && k !== 'd');
  const errs = Object.entries(status).filter(([, s]) => s.state === 'error');
  let html = '';
  if (!SEARX && wantsWeb) {
    const names = bangKeys.filter(k => WEB_BANGS.includes(k) && k !== 'd').map(k => engineName(BANG_TO_SEARX[k])).join(' and ');
    html += `<p><b>${esc(names)}</b> results need your own SearXNG — big engines don't let web pages read their results.
      Add its URL in <a href="index.html">Settings → Search</a>, or use the <b>Open in</b> links. These results come from the sources below.</p>`;
  }
  if (errs.length) html += `<p>${errs.map(([id, s]) => `<b>${esc(SOURCES[id].name)}</b>: ${esc(s.error)}`).join(' · ')}</p>`;
  n.innerHTML = html; n.hidden = !html;
}

function renderList() {
  merged = merge(outputs);
  const counts = Object.fromEntries(KIND_TABS.map(([k]) => [k, 0]));
  merged.forEach(m => { counts.all++; if (m.sources.size > 1) counts.multi++; m.kinds.forEach(k => counts[k]++); });
  $('#rs-tabs').innerHTML = KIND_TABS.filter(([k]) => k === 'all' || counts[k]).map(([k, n]) =>
    `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n} <span class="n">${counts[k]}</span></button>`).join('');
  const list = merged.filter(m => tab === 'all' || (tab === 'multi' ? m.sources.size > 1 : m.kinds.has(tab)));
  const loading = Object.values(status).some(s => s.state === 'loading');
  const target = cfg.newTab ? ' target="_blank" rel="noopener"' : '';
  if (!query) {
    $('#rs-list').innerHTML = '<li class="state">Type something to search across your sources.</li>';
  } else if (!list.length) {
    $('#rs-list').innerHTML = loading ? '<li class="skeleton"></li>'.repeat(6) : `<li class="state">No results${tab !== 'all' ? ' in this tab' : ''}.</li>`;
  } else {
    $('#rs-list').innerHTML = list.map((m, i) => {
      const h = host(m.url), path = (() => { try { const u = new URL(m.url); return decodeURIComponent(u.pathname).replace(/\/$/, '').split('/').filter(Boolean).slice(0, 3).join(' › '); } catch { return ''; } })();
      return `<li class="rs-item ${m.sources.size > 1 ? 'multi' : ''} ${i === sel ? 'sel' : ''}" data-i="${i}">
        <div class="rs-url"><img src="https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(h)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <span>${esc(h)}${path ? ` <i>› ${esc(path)}</i>` : ''}</span></div>
        <a class="rs-title" href="${esc(safeUrl(m.url))}"${target}>${esc(m.title || h)}</a>
        ${m.snippet ? `<p class="rs-snip">${esc(m.snippet)}</p>` : ''}
        <div class="rs-meta">
          ${m.sources.size > 1 ? `<span class="rs-count" title="Found by ${m.sources.size} sources">${'▲'} ${m.sources.size} sources</span>` : ''}
          ${[...m.sources].map(badge).join('')}
          ${m.metas[0] ? `<span class="rs-extra">${m.metas[0]}</span>` : ''}
        </div>
      </li>`;
    }).join('') + (loading ? '<li class="state">Still waiting on some sources…</li>' : '');
  }
  renderSources();
}

function renderSide() {
  // answer: SearXNG infobox > DuckDuckGo > Wikipedia summary
  const ans = ['searx', 'ddg', 'wikipedia'].map(id => outputs[id]?.answer).find(Boolean);
  const box = $('#rs-answer');
  box.hidden = !ans;
  if (ans) box.innerHTML = `<header class="p-head"><h2>${esc(ans.title || 'Answer')}</h2></header>
    ${ans.img ? `<img class="rs-ans-img" src="${esc(safeUrl(ans.img))}" alt="">` : ''}
    <p class="rs-ans">${esc(ans.text)}</p>
    ${ans.url ? `<a class="rs-ans-src" href="${esc(safeUrl(ans.url))}">${esc(ans.source || host(ans.url))} →</a>` : `<span class="rs-ans-src">${esc(ans.source || '')}</span>`}`;

  const rel = [...new Set([...(outputs.searx?.related || []), ...(outputs.ddg?.related || [])])].filter(r => r.toLowerCase() !== query.toLowerCase()).slice(0, 10);
  const rb = $('#rs-related');
  rb.hidden = !rel.length;
  if (rel.length) rb.innerHTML = `<header class="p-head"><h2>Related</h2></header><div class="rs-rel">${rel.map(r => `<button type="button" data-q="${esc(r)}">${esc(r)}</button>`).join('')}</div>`;

  // straight links to the real engines (always work, even without SearXNG)
  const keys = bangKeys.length ? bangKeys : ['g', 'd', 'bing'];
  const bangs = keys.map(k => BANGS.find(b => b.k === k)).filter(b => b && /^https?:/i.test(b.url));
  $('#rs-else').innerHTML = query && bangs.length
    ? bangs.map(b => `<a href="${esc(b.url.replace(/%s/g, encodeURIComponent(query)))}" target="_blank" rel="noopener">${esc(b.name)} <svg class="ic"><use href="#i-external"/></svg></a>`).join('')
    : '<span class="muted">Search something first.</span>';
}

/* ---------- running a search ---------- */
async function search() {
  const id = ++runId;
  outputs = {}; status = {}; sel = -1; tab = 'all';
  document.title = query ? `${query} — Avalon Search` : 'Avalon Search';
  $('#rs-q').value = query;
  const active = [...enabled].filter(s => SOURCES[s] && (!SOURCES[s].needs || SOURCES[s].needs()));
  active.forEach(s => { status[s] = { state: 'loading' }; });
  renderNotice(); renderList(); renderSide();
  if (!query) return;
  const ctx = { searxEngines: searxEngines() };
  await Promise.all(active.map(async s => {
    const t0 = performance.now();
    try {
      const out = await SOURCES[s].run(query, ctx);
      if (id !== runId) return;
      outputs[s] = out;
      status[s] = { state: 'ok', count: out.results.length, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      if (id !== runId) return;
      status[s] = { state: 'error', error: e.message || String(e) };
    }
    renderList(); renderSide(); renderNotice();   // progressive: show what we have so far
  }));
}

function updateUrl() {
  const p = new URLSearchParams();
  if (query) p.set('q', query);
  if (bangKeys.length) p.set('e', bangKeys.join(','));
  p.set('s', [...enabled].join(','));
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

/* ---------- events ---------- */
$('#rs-form').addEventListener('submit', e => {
  e.preventDefault();
  query = $('#rs-q').value.trim();
  updateUrl(); search();
  $('#rs-q').blur();
});
$('#rs-sources').addEventListener('click', e => {
  const b = e.target.closest('.rs-chip');
  if (!b) return;
  const id = b.dataset.id, s = SOURCES[id];
  if (s.needs && !s.needs()) { location.href = 'index.html'; return; }
  enabled.has(id) ? enabled.delete(id) : enabled.add(id);
  updateUrl(); search();
});
$('#rs-tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (b) { tab = b.dataset.tab; sel = -1; renderList(); }
});
$('#rs-related').addEventListener('click', e => {
  const b = e.target.closest('button[data-q]');
  if (b) { query = b.dataset.q; updateUrl(); search(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
document.addEventListener('keydown', e => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (e.key === 'Escape') { if (typing) document.activeElement.blur(); else location.href = 'index.html'; return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const items = $$('.rs-item');
  if (e.key === '/') { e.preventDefault(); $('#rs-q').focus(); $('#rs-q').select(); }
  else if ((e.key === 'j' || e.key === 'ArrowDown') && items.length) { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); mark(items); }
  else if ((e.key === 'k' || e.key === 'ArrowUp') && items.length) { e.preventDefault(); sel = Math.max(0, sel - 1); mark(items); }
  else if (e.key === 'Enter' && items[sel]) { $('.rs-title', items[sel]).click(); }
});
function mark(items) {
  items.forEach((el, i) => el.classList.toggle('sel', i === sel));
  items[sel]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

search();
if (!query) $('#rs-q').focus();
