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
/* ---------- the shared engine (search-core.js) ---------- */
const { SOURCES: ALL_SOURCES, COLORS, engineName, BANG_TO_SEARX, BANG_TO_SOURCE, WEB_BANGS, KIND_TABS, DEFAULT_ON, merge, config: cfg } = AvalonSearch;
// Research-only sources (registries, papers, social profiles) stay out of the general results page
const SOURCES = Object.fromEntries(Object.entries(ALL_SOURCES).filter(([, s]) => !s.research));
const SEARX = cfg.searx;
const BANGS = cfg.bangs;

/* ---------- page state ---------- */
const params = new URLSearchParams(location.search);
let query = (params.get('q') || '').trim();
const bangKeys = (params.get('e') || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
let enabled = initialSources();
let outputs = {}, status = {}, runId = 0, tab = 'all', sel = -1, merged = [], shown = [];

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
  const list = shown = merged.filter(m => tab === 'all' || (tab === 'multi' ? m.sources.size > 1 : m.kinds.has(tab)));
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
          <button type="button" class="rs-save" data-save="${i}" title="Save to a Research investigation">+ Research</button>
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

/* ---------- the investigator (os/investigator.js) reports on each search ---------- */
const agent = window.AvalonInvestigator ? AvalonInvestigator.desk($('#rs-agent'), { text: 'What should I look into?' }) : null;
const goHome = () => (window.AvalonOS ? AvalonOS.go('index.html') : (location.href = 'index.html'));
function agentReport() {
  if (!agent) return;
  const st = Object.values(status);
  const done = st.filter(x => x.state !== 'loading').length, failed = st.filter(x => x.state === 'error').length;
  if (done < st.length) return agent.set(`Checking sources… ${done} of ${st.length} answered.`);
  const multi = merged.filter(m => m.sources.size > 1).length;
  const miss = failed ? ` ${failed} source${failed > 1 ? 's' : ''} didn't answer.` : '';
  if (!merged.length) { agent.do('think'); agent.mood('warn', 6000); return agent.say(`Nothing turned up. Try other words or more sources.${miss}`); }
  agent.do('found');
  if (failed) agent.mood('warn', 6000);
  agent.say(`${merged.length} results${multi ? `, ${multi} confirmed by more than one source` : ''}.${miss}`);
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
  if (!query) { agent?.do('idle'); agent?.set('What should I look into?'); return; }
  agent?.do('search', { hold: true });
  agent?.say(`Searching ${active.length} sources for “${query}”…`);
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
    if (id === runId) agentReport();
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
  if (s.needs && !s.needs()) { goHome(); return; }
  enabled.has(id) ? enabled.delete(id) : enabled.add(id);
  updateUrl(); search();
});
$('#rs-tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (b) { tab = b.dataset.tab; sel = -1; renderList(); }
});
// "+ Research": hand the result to the Research app (its own storage on file://), which asks where to file it
$('#rs-list').addEventListener('click', e => {
  const b = e.target.closest('[data-save]');
  if (!b) return;
  const m = shown[+b.dataset.save];
  if (!m) return;
  const save = { url: m.url, title: m.title, snippet: (m.snippet || '').slice(0, 600), sources: [...m.sources], date: m.date || '', author: m.author || '', publisher: m.publisher || '', type: m.type || '', q: query };
  if (window.AvalonOS) AvalonOS.go('research.html', { save }); else location.href = 'research.html';
});
$('#rs-related').addEventListener('click', e => {
  const b = e.target.closest('button[data-q]');
  if (b) { query = b.dataset.q; updateUrl(); search(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
});
document.addEventListener('keydown', e => {
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (e.key === 'Escape') { if (typing) document.activeElement.blur(); else goHome(); return; }
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
