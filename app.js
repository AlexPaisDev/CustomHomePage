/* =====================================================================
   AVALON — home page logic
   Plain JS, no build step. State in localStorage (KEY); API responses
   are cached separately so the main save stays small.
   ===================================================================== */
'use strict';

const KEY = 'avalon_home_v1';
const LEGACY = ['system_hud_v2', 'system_hud_state_v1'];
const NEWS_CACHE = 'avalon_news_cache';
const GH_CACHE = 'avalon_gh_cache';

/* ---------------------------------------------------------------------
   UTILS
   --------------------------------------------------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = n => `<svg class="ic"><use href="#i-${n}"/></svg>`;
const firstLine = s => String(s || '').split('\n')[0].trim();
function ago(t) {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
const compact = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n);
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
/** Only http(s) links from third-party APIs become hrefs. */
const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? u : '#';
function readCache(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } }
function writeCache(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }

/* ---------------------------------------------------------------------
   DEFAULTS
   --------------------------------------------------------------------- */
const AV_BANG = { k: 'av', name: 'Avalon Search', url: 'results.html?q=%s' };
const DEFAULT_BANGS = [
  ['av', AV_BANG.name, AV_BANG.url],
  ['g', 'Google', 'https://www.google.com/search?q=%s'],
  ['d', 'DuckDuckGo', 'https://duckduckgo.com/?q=%s'],
  ['br', 'Brave Search', 'https://search.brave.com/search?q=%s'],
  ['bing', 'Bing', 'https://www.bing.com/search?q=%s'],
  ['yt', 'YouTube', 'https://www.youtube.com/results?search_query=%s'],
  ['gh', 'GitHub', 'https://github.com/search?q=%s&type=repositories'],
  ['ghc', 'GitHub code', 'https://github.com/search?q=%s&type=code'],
  ['r', 'Reddit', 'https://www.reddit.com/search/?q=%s'],
  ['w', 'Wikipedia', 'https://en.wikipedia.org/w/index.php?search=%s'],
  ['m', 'Maps', 'https://www.google.com/maps/search/%s'],
  ['i', 'Images', 'https://www.google.com/search?tbm=isch&q=%s'],
  ['t', 'Translate', 'https://translate.google.com/?sl=auto&tl=en&text=%s'],
  ['hn', 'Hacker News', 'https://hn.algolia.com/?q=%s'],
  ['mdn', 'MDN', 'https://developer.mozilla.org/en-US/search?q=%s'],
  ['npm', 'npm', 'https://www.npmjs.com/search?q=%s'],
  ['py', 'PyPI', 'https://pypi.org/search/?q=%s'],
  ['so', 'Stack Overflow', 'https://stackoverflow.com/search?q=%s'],
  ['dh', 'Docker Hub', 'https://hub.docker.com/search?q=%s'],
  ['aw', 'ArchWiki', 'https://wiki.archlinux.org/index.php?search=%s'],
  ['c', 'Claude', 'https://claude.ai/new?q=%s'],
  ['p', 'Perplexity', 'https://www.perplexity.ai/search?q=%s'],
  ['a', 'Amazon', 'https://www.amazon.com/s?k=%s'],
  ['mal', 'MyAnimeList', 'https://myanimelist.net/search/all?q=%s'],
].map(([k, name, url]) => ({ k, name, url }));

function defaults() {
  const L = (name, url) => ({ id: uid(), name, url });
  return {
    v: 2,
    name: '',
    settings: {
      engines: ['g'], history: true,
      multiMode: 'tabs',          // several engines → 'tabs' or 'avalon' (combined results page)
      searxUrl: '', wikiLang: 'en',
      idleStartup: true, idleAfter: 0,
      units: 'C', clock24: true,
      location: { name: 'Lisbon, Portugal', lat: 38.7223, lon: -9.1393 },
      focus: 25, short: 5, long: 15,
      newTab: false, sound: true, notify: false, effects: true,
      ghUser: '', ghToken: '',
      sources: { hn: true, show: true, devto: true, trending: true },
      interests: 'ai, llm, self-hosted, homelab, linux, docker, javascript, rust, security',
    },
    bangs: DEFAULT_BANGS.map(b => ({ ...b })),
    history: [],
    routine: [
      { id: uid(), text: 'Exercise' },
      { id: uid(), text: 'Read for 30 minutes' },
      { id: uid(), text: 'Plan tomorrow' },
    ],
    tasks: [],
    log: {},
    groups: [
      { id: uid(), name: 'Dev', links: [L('GitHub', 'https://github.com'), L('Claude', 'https://claude.ai'), L('ChatGPT', 'https://chatgpt.com')] },
      { id: uid(), name: 'Mail', links: [L('Gmail', 'https://mail.google.com'), L('Outlook', 'https://outlook.live.com/mail/'), L('Proton', 'https://mail.proton.me')] },
      { id: uid(), name: 'Media', links: [L('YouTube', 'https://youtube.com'), L('Crunchyroll', 'https://crunchyroll.com'), L('Steam', 'https://store.steampowered.com'), L('Discord', 'https://discord.com/app')] },
    ],
    memo: '',
    services: [],
    timer: { mode: 'focus', endAt: null, left: null },
    ui: { newsTab: '', ghTab: 'feed', collapsed: {} },
  };
}

/** Carry data over from the two earlier versions of this page. */
function migrate(old) {
  const s = defaults();
  if (old.username && old.username !== 'HUNTER') s.name = old.username;
  if (old.name && old.name !== 'Hunter') s.name = old.name;
  if (Array.isArray(old.groups)) s.groups = old.groups;
  else if (old.portals) {
    const names = { raids: 'Dev', vault: 'Media', guild: 'Social' };
    s.groups = Object.entries(old.portals).filter(([, l]) => Array.isArray(l))
      .map(([k, links]) => ({ id: uid(), name: names[k] || k, links: links.map(l => ({ id: l.id || uid(), name: l.name, url: l.url })) }));
  }
  if (old.memo) s.memo = old.memo;
  if (Array.isArray(old.daily)) s.routine = old.daily.map(d => ({ id: d.id, text: d.text }));
  if (Array.isArray(old.quests)) s.tasks = old.quests.map(q => ({ id: q.id || uid(), text: q.text, done: !!q.done, doneAt: q.doneAt }));
  if (old.log) for (const [k, L] of Object.entries(old.log)) s.log[k] = { done: L.daily || [], clear: !!L.clear, focus: L.focus || 0, sessions: L.raids || 0 };
  const o = old.settings || {};
  const loc = o.location || old.location;
  if (loc) s.settings.location = { name: loc.name || loc.label || `${loc.lat}, ${loc.lon}`, lat: +loc.lat, lon: +loc.lon };
  for (const k of ['units', 'clock24', 'focus', 'short', 'long', 'newTab', 'sound', 'notify', 'effects']) if (k in o) s.settings[k] = o[k];
  const eng = o.engine || old.searchEngine;
  const map = { google: 'g', ddg: 'd', duckduckgo: 'd', brave: 'br', bing: 'bing' };
  if (map[eng]) s.settings.engines = [map[eng]];
  const custom = (eng === 'custom' && o.customEngine) || (eng === 'searxng' && old.searxUrl && old.searxUrl + '%s');
  if (custom) { s.bangs.unshift({ k: 'sx', name: 'My search', url: custom.includes('%s') ? custom : custom + '%s' }); s.settings.engines = ['sx']; }
  return s;
}

/** Fill a saved object with any defaults added since it was written. */
function hydrate(p) {
  const d = defaults();
  const s = {
    ...d, ...p,
    settings: { ...d.settings, ...p.settings, sources: { ...d.settings.sources, ...p.settings?.sources } },
    timer: { ...d.timer, ...p.timer }, ui: { ...d.ui, ...p.ui, collapsed: { ...p.ui?.collapsed } },
  };
  if (p.settings?.engine && !p.settings.engines) s.settings.engines = [p.settings.engine];   // single → multi
  delete s.settings.engine;
  // v2 added the Avalon Search page: give existing saves its bang once
  if ((p.v || 1) < 2 && Array.isArray(s.bangs) && !s.bangs.some(b => b.k === 'av')) s.bangs = [{ ...AV_BANG }, ...s.bangs];
  s.v = 2;
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return hydrate(JSON.parse(raw));
    for (const k of LEGACY) {
      const old = localStorage.getItem(k);
      if (old) return migrate(JSON.parse(old));
    }
  } catch (e) { console.warn('Avalon: could not load saved data, starting fresh.', e); }
  return defaults();
}

let S = load();
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(flush, 150);
}
function flush() { clearTimeout(saveT); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.warn('Avalon: save failed', e); } }
window.addEventListener('beforeunload', () => { const m = document.getElementById('memo'); if (m) S.memo = m.value; flush(); });

function dayLog(k = dayKey()) {
  S.log[k] ||= { done: [], clear: false, focus: 0, sessions: 0 };
  return S.log[k];
}

/* ---------------------------------------------------------------------
   FEEDBACK
   --------------------------------------------------------------------- */
function toast(html) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = html;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, 2400);
}

let audioCtx;
function chime(notes = [784, 1175], gap = .08, vol = .06) {
  if (!S.settings.sound) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t0 + i * gap);
      g.gain.exponentialRampToValueAtTime(vol, t0 + i * gap + .015);
      g.gain.exponentialRampToValueAtTime(.0001, t0 + i * gap + .35);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + i * gap); o.stop(t0 + i * gap + .4);
    });
  } catch { }
}

/* ---------------------------------------------------------------------
   THE GUARDIAN — pixel sprite in the style of the Usage Buddy widget
   --------------------------------------------------------------------- */
const Guardian = (() => {
  const cv = $('#guardian'), c = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const BODY = [
    '.......LGGG.......',
    '.......GGGD.......',
    '...LG..GGGD..GD...',
    '..LGGGGGGGGGGGGD..',
    '..GVVVVVVVVVVVVD..',
    '..GVVVVVVVVVVVVD..',
    'LGGVVVVVVVVVVVVDGD',
    'LGGVVVVVVVVVVVVDGD',
    'LGGVVVVVVVVVVVVDGD',
    'LGDDDDDDDDDDDDDDGD',
  ];
  const SHIELD = [
    'YYYYYYY',
    'YNNNNNY',
    'YNNYNNY',
    'YNYCYNY',
    '.YYYYY.',
    '..YNY..',
    '...Y...',
  ];
  const C = {
    L: '#f7dc84', G: '#e6bd4e', D: '#b2892c', V: '#141230', Y: '#e6bd4e', N: '#1b1a45', C: '#62e6f0',
    legO: '#efcd68', legI: '#a47d29', cape: '#2c4196', capeD: '#22327a',
    blade: '#f2f8ff', edge: '#9fd3ff', grip: '#7a5520', eye: '#6fdca0', eyeHi: '#d8ffe9',
  };
  const EYE = { ok: '#6fdca0', warn: '#ffc857', hot: '#ff6b6b' };
  let f = 0, act = 'idle', t = 0, timer = null, sparks = [], mood = 'ok';
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

  function draw() {
    c.clearRect(0, 0, W, H);
    const bx = 11;
    let by = 11;
    let swordLift = 0;
    if (act === 'hop') by -= [0, 2, 3, 3, 2, 1, 0][Math.min(t, 6)];
    else if (act === 'cheer') swordLift = t < 3 ? t : t > 18 ? Math.max(0, 21 - t) : 3;
    else if (f % 40 >= 20) by += 1;   // slow idle bob

    // cape (behind everything)
    for (let r = 0; r < 13; r++) {
      const spread = Math.floor(r / 3), y = by + 4 + r;
      const flutter = act === 'idle' && r > 8 && (f + r) % 12 < 6 ? 1 : 0;
      px(bx + 1 - spread, y, 16 + spread * 2 + flutter, 1, C.cape);
      px(bx + 15 + spread + flutter, y, 2, 1, C.capeD);
    }
    // legs
    [[3, 4], [6, 7], [10, 11], [13, 14]].forEach(([a, b], i) => {
      const lift = act === 'hop' && t > 0 && t < 6 && i % 2 ? 1 : 0;
      px(bx + a, by + 10, 1, 3 - lift, C.legO);
      px(bx + b, by + 10, 1, 3 - lift, C.legI);
    });
    // body
    BODY.forEach((row, ry) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch !== '.') px(bx + i, by + ry, 1, 1, C[ch]);
      }
    });
    // eyes (blink every few seconds)
    const blink = f % 47 < 2;
    [[5, 6], [11, 12]].forEach(([a]) => {
      if (blink) { px(bx + a, by + 7, 2, 1, EYE[mood]); return; }
      px(bx + a, by + 5, 2, 3, EYE[mood]);
      px(bx + a, by + 5, 1, 1, mood === 'ok' ? C.eyeHi : '#fff4dc');
    });
    // shield
    SHIELD.forEach((row, ry) => {
      for (let i = 0; i < row.length; i++) if (row[i] !== '.') px(bx - 7 + i, by + 5 + ry, 1, 1, C[row[i]]);
    });
    // sword
    const sx = bx + 19, top = by - 8 - swordLift;
    px(sx, top + 1, 1, 13, C.blade);
    px(sx + 1, top + 1, 1, 13, C.edge);
    px(sx, top, 1, 1, C.blade);
    px(sx - 2, top + 14, 6, 1, C.G);
    px(sx, top + 15, 2, 3, C.grip);
    px(sx, top + 18, 2, 1, C.D);
    // glint travelling up the blade
    const g = f % 70;
    if (g < 12) { c.globalAlpha = .9; px(sx, top + 13 - g, 2, 1, '#ffffff'); c.globalAlpha = 1; }
    if (act === 'cheer' && t > 2 && t < 18) {
      c.globalAlpha = .5; px(sx - 1, top - 1, 4, 3, '#ffffff'); c.globalAlpha = 1;
    }
    // sparkles
    for (const s of sparks) {
      c.globalAlpha = Math.max(0, s.life / 14);
      px(s.x, s.y, 1, 1, s.col);
      if (s.life > 8) { px(s.x - 1, s.y, 1, 1, s.col); px(s.x + 1, s.y, 1, 1, s.col); px(s.x, s.y - 1, 1, 1, s.col); px(s.x, s.y + 1, 1, 1, s.col); }
    }
    c.globalAlpha = 1;
  }

  function step() {
    f++; t++;
    if (act !== 'idle' && t > (act === 'hop' ? 7 : 22)) { act = 'idle'; t = 0; }
    sparks.forEach(s => { s.y -= .25; s.life--; });
    sparks = sparks.filter(s => s.life > 0);
    draw();
  }

  function react(kind) {
    act = kind; t = 0;
    if (kind === 'cheer') for (let i = 0; i < 6; i++) sparks.push({ x: 4 + Math.random() * 32, y: 4 + Math.random() * 14, life: 10 + Math.random() * 8, col: i % 2 ? '#f7dc84' : '#62e6f0' });
    if (!timer) { for (let i = 0; i < 24; i++) setTimeout(step, i * 100); }
  }

  function setAnimated(on) {
    clearInterval(timer); timer = null;
    if (on && !matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => { if (!document.hidden) step(); }, 100);
    draw();
  }

  cv.addEventListener('click', () => { react(Math.random() < .5 ? 'hop' : 'cheer'); chime([988], 0, .03); });
  /** Eye colour follows the home network, like the Usage Buddy's follows usage. */
  function setMood(m) { if (EYE[m] && m !== mood) { mood = m; draw(); } }
  return { react, setAnimated, draw, setMood };
})();

function renderSparkles() {
  const spots = [[6, 12, 18], [24, 7, 12], [47, 4, 10], [71, 22, 14], [91, 10, 22], [96, 46, 12], [3, 62, 12], [33, 88, 16],
    [62, 70, 10], [88, 82, 14], [52, 40, 8], [14, 36, 8]];
  const html = (scale = 1) => spots.map(([x, y, s], i) =>
    `<span class="spark" style="left:${x}%;top:${y}%;width:${s * scale}px;height:${s * scale}px;animation-delay:${-i * 1.3}s"><svg><use href="#i-sparkle"/></svg></span>`).join('');
  $('#sparkles').innerHTML = S.settings.effects ? html() : '';
  $('#idle-sparkles').innerHTML = html(1.3);   // the idle screen always sparkles
}

/* ---------------------------------------------------------------------
   CLOCK + WEATHER
   --------------------------------------------------------------------- */
function renderClock() {
  const now = new Date();
  let h = now.getHours(), ampm = '';
  if (!S.settings.clock24) { ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; }
  $('#clock').innerHTML = `${S.settings.clock24 ? pad(h) : h}:${pad(now.getMinutes())}${ampm ? `<span class="ampm">${ampm}</span>` : ''}`;
  const hi = now.getHours();
  const greet = S.name ? `${hi < 5 ? 'Late night' : hi < 12 ? 'Morning' : hi < 18 ? 'Afternoon' : 'Evening'}, ${S.name} · ` : '';
  $('#date').textContent = greet + now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const mid = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1) - now;
  $('#routine-reset').textContent = `Resets in ${Math.floor(mid / 3.6e6)}h ${pad(Math.floor(mid / 6e4) % 60)}m`;
}

const WMO = {
  0: ['Clear', 'sun'], 1: ['Mostly clear', 'sun'], 2: ['Partly cloudy', 'cloud'], 3: ['Overcast', 'cloud'],
  45: ['Fog', 'fog'], 48: ['Fog', 'fog'], 51: ['Drizzle', 'rain'], 53: ['Drizzle', 'rain'], 55: ['Drizzle', 'rain'],
  56: ['Freezing drizzle', 'rain'], 57: ['Freezing drizzle', 'rain'], 61: ['Light rain', 'rain'], 63: ['Rain', 'rain'],
  65: ['Heavy rain', 'rain'], 66: ['Freezing rain', 'rain'], 67: ['Freezing rain', 'rain'], 71: ['Light snow', 'snow'],
  73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'], 80: ['Showers', 'rain'],
  81: ['Showers', 'rain'], 82: ['Violent showers', 'rain'], 85: ['Snow showers', 'snow'], 86: ['Snow showers', 'snow'],
  95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm', 'storm'], 99: ['Thunderstorm', 'storm'],
};
let weather = readCache('avalon_weather');
function renderWeather() {
  const el = $('#weather'), w = weather;
  if (!w?.data?.current) { el.innerHTML = `${icon('offline')}<span>—</span>`; return; }
  const c = w.data.current, d = w.data.daily;
  let [label, ic] = WMO[c.weather_code] || ['—', 'cloud'];
  if (ic === 'sun' && !c.is_day) ic = 'moon';
  el.innerHTML = `${icon(ic)}<b>${Math.round(c.temperature_2m)}°</b><small>${label} · ${Math.round(d.temperature_2m_max[0])}°/${Math.round(d.temperature_2m_min[0])}°</small>`;
  el.title = `${S.settings.location.name} — click to refresh`;
}
async function fetchWeather(force = false) {
  const { lat, lon } = S.settings.location, units = S.settings.units;
  const fresh = weather?.at && weather.lat === lat && weather.lon === lon && weather.units === units && Date.now() - weather.at < 20 * 60e3;
  if (fresh && !force) return renderWeather();
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1` +
      (units === 'F' ? '&temperature_unit=fahrenheit' : ''));
    if (!res.ok) throw new Error(res.status);
    weather = { at: Date.now(), lat, lon, units, data: await res.json() };
    writeCache('avalon_weather', weather);
  } catch (e) { console.warn('Avalon: weather unavailable', e); }
  renderWeather();
}
$('#weather').addEventListener('click', () => fetchWeather(true));

/* ---------------------------------------------------------------------
   TODAY: routine (resets daily) + tasks
   --------------------------------------------------------------------- */
function segbar(el, total, filled, n = total) {
  n = Math.max(1, Math.min(24, n));
  const frac = total ? filled / total : 0;
  el.innerHTML = Array.from({ length: n }, (_, i) => {
    const lo = i / n, hi = (i + 1) / n;
    return `<i class="${frac >= hi - 1e-9 ? 'on' : frac > lo ? 'part' : ''}"></i>`;
  }).join('');
}

function streak() {
  let n = 0, d = new Date();
  if (!S.log[dayKey(d)]?.clear) d = addDays(d, -1);
  while (S.log[dayKey(d)]?.clear) { n++; d = addDays(d, -1); }
  return n;
}

function tRow(item, kind, done) {
  return `<li class="t ${done ? 'done' : ''}" data-id="${item.id}" data-kind="${kind}">
    <button class="box" role="checkbox" aria-checked="${done}" aria-label="Done"></button>
    <span class="txt" title="Double-click to rename">${esc(item.text)}</span>
    <button class="icon-btn sm del" title="Delete">${icon('trash')}</button>
  </li>`;
}

function renderToday() {
  const L = S.log[dayKey()];
  const done = L?.done || [];
  const n = S.routine.filter(r => done.includes(r.id)).length;
  $('#routine-list').innerHTML = S.routine.length
    ? S.routine.map(r => tRow(r, 'routine', done.includes(r.id))).join('')
    : '<li class="empty">Nothing in your routine yet.</li>';
  $('#routine-count').textContent = `${n}/${S.routine.length}`;
  segbar($('#routine-bar'), S.routine.length, n, S.routine.length <= 16 ? S.routine.length : 16);

  const open = S.tasks.filter(t => !t.done), closed = S.tasks.filter(t => t.done);
  $('#task-list').innerHTML = open.length ? open.map(t => tRow(t, 'task', false)).join('') : '<li class="empty">All clear.</li>';
  $('#done-list').innerHTML = closed.map(t => tRow(t, 'task', true)).join('');
  $('#done-box').hidden = !closed.length;
  $('#done-count').textContent = `Done (${closed.length})`;
  $('#task-count').textContent = `${open.length} open`;

  const st = streak();
  $('#streak b').textContent = st;
  $('#streak').classList.toggle('lit', st > 0);
}

function syncClear() {
  const L = dayLog();
  L.done = L.done.filter(id => S.routine.some(r => r.id === id));
  const was = L.clear;
  L.clear = S.routine.length > 0 && S.routine.every(r => L.done.includes(r.id));
  if (L.clear && !was) { toast('Routine complete. Streak extended.'); Guardian.react('cheer'); chime([659, 784, 1047], .09); }
}

function toggle(kind, id) {
  if (kind === 'routine') {
    const L = dayLog(), i = L.done.indexOf(id);
    if (i === -1) { L.done.push(id); Guardian.react('hop'); chime(); } else L.done.splice(i, 1);
    syncClear();
  } else {
    const t = S.tasks.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done; t.doneAt = t.done ? Date.now() : undefined;
    if (t.done) { Guardian.react('hop'); chime(); }
  }
  save(); renderToday();
}

function rename(li) {
  const { id, kind } = li.dataset;
  const item = (kind === 'routine' ? S.routine : S.tasks).find(x => x.id === id);
  const span = $('.txt', li);
  if (!item || !span) return;
  const inp = document.createElement('input');
  inp.className = 'txt-edit'; inp.value = item.text;
  span.replaceWith(inp); inp.focus(); inp.select();
  let fin = false;
  const finish = ok => { if (fin) return; fin = true; const v = inp.value.trim(); if (ok && v) { item.text = v; save(); } renderToday(); };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
  inp.addEventListener('blur', () => finish(true));
}

['#routine-list', '#task-list', '#done-list'].forEach(sel => {
  $(sel).addEventListener('click', e => {
    const li = e.target.closest('.t');
    if (!li || $('.txt-edit', li)) return;
    const { id, kind } = li.dataset;
    if (e.target.closest('.del')) {
      if (kind === 'routine') { S.routine = S.routine.filter(x => x.id !== id); syncClear(); }
      else S.tasks = S.tasks.filter(x => x.id !== id);
      save(); renderToday(); return;
    }
    if (e.target.closest('.box')) toggle(kind, id);
  });
  $(sel).addEventListener('dblclick', e => { if (e.target.closest('.txt')) rename(e.target.closest('.t')); });
});
$('#routine-form').addEventListener('submit', e => {
  e.preventDefault();
  const inp = $('input', e.target), text = inp.value.trim();
  if (!text) return;
  S.routine.push({ id: uid(), text }); inp.value = '';
  syncClear(); save(); renderToday();
});
$('#task-form').addEventListener('submit', e => {
  e.preventDefault();
  const inp = $('input', e.target), text = inp.value.trim();
  if (!text) return;
  S.tasks.push({ id: uid(), text, done: false }); inp.value = '';
  save(); renderToday();
});
$('#clear-done').addEventListener('click', e => { e.preventDefault(); S.tasks = S.tasks.filter(t => !t.done); save(); renderToday(); });

/* ---------------------------------------------------------------------
   FOCUS TIMER (survives reloads via endAt)
   --------------------------------------------------------------------- */
const MODE_NAME = { focus: 'Focus', short: 'Break', long: 'Long break' };
const modeSecs = m => (S.settings[m] || 25) * 60;
function timeLeft() {
  const T = S.timer;
  return T.endAt ? Math.max(0, Math.round((T.endAt - Date.now()) / 1000)) : (T.left ?? modeSecs(T.mode));
}
function setMode(m) { S.timer = { mode: m, endAt: null, left: null }; save(); renderFocus(); }
function toggleFocus() {
  const T = S.timer;
  if (T.endAt) { T.left = timeLeft(); T.endAt = null; }
  else {
    T.endAt = Date.now() + timeLeft() * 1000; T.left = null;
    if (S.settings.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }
  save(); renderFocus();
}
function finishFocus(skipped = false) {
  // Another open Avalon tab may already have finished this same session.
  if (!skipped) {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY));
      if (stored?.timer && stored.timer.endAt !== S.timer.endAt) { S = hydrate(stored); renderAll(); return; }
    } catch { }
  }
  const T = S.timer, L = dayLog();
  let next = 'focus';
  if (T.mode === 'focus') {
    if (!skipped) {
      L.sessions++; L.focus += S.settings.focus;
      toast(`Focus session done — ${S.settings.focus} min logged.`);
      notify('Focus session complete', 'Take a break.');
      Guardian.react('cheer'); chime([523, 659, 784, 1047], .1, .07);
    }
    next = L.sessions > 0 && L.sessions % 4 === 0 ? 'long' : 'short';
  } else if (!skipped) { notify('Break over', 'Back to it.'); chime([784, 659], .12); }
  S.timer = { mode: next, endAt: null, left: null };
  flush(); renderFocus();
}
function notify(title, body) {
  if (S.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, silent: true }); } catch { }
  }
}
function renderFocus() {
  const T = S.timer, left = timeLeft(), total = modeSecs(T.mode), running = !!T.endAt;
  const txt = `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
  $('#focus-time').textContent = txt;
  const bar = $('#focus-bar');
  segbar(bar, total, total - left, 24);
  bar.classList.toggle('gold', T.mode === 'focus');
  $$('#focus .seg-tabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === T.mode));
  $('#focus-toggle').innerHTML = running ? `${icon('pause')}<span>Pause</span>` : `${icon('play')}<span>${left < total ? 'Resume' : 'Start'}</span>`;
  $('#focus').classList.toggle('running', running);
  const L = S.log[dayKey()];
  $('#focus-count').textContent = `${L?.sessions || 0} today · ${L?.focus || 0}m`;
  document.title = running ? `${txt} · ${MODE_NAME[T.mode]}` : 'Avalon';
}
$$('#focus .seg-tabs button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
$('#focus-toggle').addEventListener('click', toggleFocus);
$('#focus-reset').addEventListener('click', () => setMode(S.timer.mode));
$('#focus-skip').addEventListener('click', () => finishFocus(true));

/* ---------------------------------------------------------------------
   MEMO
   --------------------------------------------------------------------- */
const memo = $('#memo');
let memoT;
memo.addEventListener('input', () => {
  $('#memo-status').textContent = 'editing…';
  clearTimeout(memoT);
  memoT = setTimeout(() => { S.memo = memo.value; save(); $('#memo-status').textContent = 'saved'; }, 400);
});

/* ---------------------------------------------------------------------
   LAUNCHPAD (links)
   --------------------------------------------------------------------- */
let editing = false;
function normUrl(u) {
  u = u.trim();
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u) || /^[\w.-]+:\d+/.test(u)) {
    // LAN hosts (localhost, IPs, *.local/.lan/.home, bare names like "nas:5000") usually speak plain http
    const lan = /^(localhost|\d+\.\d+\.\d+\.\d+|[\w-]+\.(local|lan|home|internal)|[\w-]+)(:\d+)?(\/|$)/i.test(u);
    u = (lan ? 'http://' : 'https://') + u;
  }
  return u;
}
function favicon(u) {
  const h = host(u);
  if (!h || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(h) || h.endsWith('.local') || h.endsWith('.lan')) return '';
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(h)}`;
}
const allLinks = () => S.groups.flatMap(g => g.links);

function renderLinks() {
  let n = 0;
  const wrap = $('#groups');
  $('#launchpad').classList.toggle('editing', editing);
  wrap.innerHTML = S.groups.map(g => `
    <div class="group" data-gid="${g.id}">
      <div class="group-head">
        <span class="gname" ${editing ? 'contenteditable="true" spellcheck="false"' : ''}>${esc(g.name)}</span>
        <button class="icon-btn" data-act="del-group" title="Delete group">${icon('trash')}</button>
      </div>
      <div class="tiles" data-gid="${g.id}">
        ${g.links.map(l => {
          n++;
          const fav = favicon(l.url), letter = esc((l.name[0] || '?').toUpperCase());
          return `<a class="tile" href="${esc(l.url)}" data-id="${l.id}" ${editing ? 'draggable="true"' : ''} title="${esc(host(l.url) || l.url)}">
            ${fav ? `<img src="${fav}" alt="" loading="lazy" data-letter="${letter}">` : `<span class="fav">${letter}</span>`}
            <span class="name">${esc(l.name)}</span>
            ${n <= 9 ? `<span class="num">${n}</span>` : ''}
            <span class="tools">
              <button class="icon-btn sm" data-act="edit" title="Edit">${icon('pencil')}</button>
              <button class="icon-btn sm" data-act="del" title="Remove">${icon('x')}</button>
            </span>
          </a>`;
        }).join('')}
        <button class="tile-add" data-act="add">${icon('plus')}Add</button>
      </div>
    </div>`).join('') || '<p class="muted">No links yet — press Edit.</p>';
  $$('img[data-letter]', wrap).forEach(img => img.addEventListener('error', () => {
    const s = document.createElement('span'); s.className = 'fav'; s.textContent = img.dataset.letter; img.replaceWith(s);
  }, { once: true }));
  $('#toggle-edit').classList.toggle('on', editing);
  $('#toggle-edit span').textContent = editing ? 'Done' : 'Edit';
  $('#add-group').hidden = !editing;
}
function findLink(id) {
  for (const g of S.groups) { const i = g.links.findIndex(l => l.id === id); if (i > -1) return { g, i, l: g.links[i] }; }
  return null;
}
function openUrl(url, newTab = S.settings.newTab) {
  if (newTab) window.open(url, '_blank', 'noopener'); else location.href = url;
}

$('#groups').addEventListener('click', e => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  const tile = e.target.closest('.tile');
  const gid = e.target.closest('[data-gid]')?.dataset.gid;
  if (editing && tile && !act) { e.preventDefault(); return; }
  if (!act) {
    if (tile && S.settings.newTab && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); openUrl(tile.href, true); }
    return;
  }
  e.preventDefault(); e.stopPropagation();
  if (act === 'edit') linkDialog(tile.dataset.id);
  if (act === 'del') { const f = findLink(tile.dataset.id); f.g.links.splice(f.i, 1); save(); renderLinks(); }
  if (act === 'add') linkDialog(null, gid);
  if (act === 'del-group') {
    const g = S.groups.find(x => x.id === gid);
    if (g.links.length && !confirm(`Delete "${g.name}" and its ${g.links.length} link(s)?`)) return;
    S.groups = S.groups.filter(x => x.id !== gid); save(); renderLinks();
  }
});
$('#groups').addEventListener('focusout', e => {
  const el = e.target.closest('.gname');
  if (!el) return;
  const g = S.groups.find(x => x.id === el.closest('.group').dataset.gid);
  const v = el.textContent.trim();
  if (g && v) { g.name = v; save(); } else if (g) el.textContent = g.name;
});
$('#groups').addEventListener('keydown', e => { if (e.target.closest('.gname') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });

let dragId = null;
$('#groups').addEventListener('dragstart', e => {
  const t = e.target.closest('.tile');
  if (!editing || !t) return;
  dragId = t.dataset.id; t.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
});
$('#groups').addEventListener('dragend', () => { dragId = null; $$('.dragging, .drop-target').forEach(x => x.classList.remove('dragging', 'drop-target')); });
$('#groups').addEventListener('dragover', e => {
  const tiles = e.target.closest('.tiles');
  if (!dragId || !tiles) return;
  e.preventDefault();
  $$('.drop-target').forEach(x => x !== tiles && x.classList.remove('drop-target'));
  tiles.classList.add('drop-target');
});
$('#groups').addEventListener('drop', e => {
  const tiles = e.target.closest('.tiles');
  if (!dragId || !tiles) return;
  e.preventDefault();
  const src = findLink(dragId), dest = S.groups.find(g => g.id === tiles.dataset.gid);
  if (!src || !dest) return;
  const [item] = src.g.links.splice(src.i, 1);
  const over = e.target.closest('.tile');
  let idx = dest.links.length;
  if (over && over.dataset.id !== dragId) {
    idx = dest.links.findIndex(l => l.id === over.dataset.id);
    const r = over.getBoundingClientRect();
    if (e.clientX > r.left + r.width / 2) idx++;
  }
  dest.links.splice(idx, 0, item);
  save(); renderLinks();
});
$('#toggle-edit').addEventListener('click', () => { editing = !editing; renderLinks(); });
$('#add-group').addEventListener('click', () => {
  S.groups.push({ id: uid(), name: 'New group', links: [] });
  save(); renderLinks();
  const names = $$('.gname'), last = names[names.length - 1];
  last?.focus(); document.getSelection().selectAllChildren(last);
});

let editingLinkId = null;
function linkDialog(linkId, groupId) {
  const f = $('#link-form'), found = linkId ? findLink(linkId) : null;
  if (!S.groups.length) S.groups.push({ id: uid(), name: 'Links', links: [] });
  editingLinkId = found ? linkId : null;
  f.group.innerHTML = S.groups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
  f.name.value = found?.l.name || ''; f.url.value = found?.l.url || '';
  f.group.value = found?.g.id || groupId || S.groups[0].id;
  $('#link-dlg-title').textContent = found ? 'Edit link' : 'New link';
  $('#link-dlg').showModal();
}
$('#link-form').addEventListener('submit', e => {
  const f = e.target, name = f.name.value.trim(), url = normUrl(f.url.value);
  if (!name || !url) return;
  const dest = S.groups.find(g => g.id === f.group.value) || S.groups[0];
  const found = editingLinkId ? findLink(editingLinkId) : null;
  if (found) {
    Object.assign(found.l, { name, url });
    if (dest !== found.g) { found.g.links.splice(found.i, 1); dest.links.push(found.l); }
  } else dest.links.push({ id: uid(), name, url });
  save(); renderLinks();
});

/* ---------------------------------------------------------------------
   SEARCH — bangs, links, URLs, calculator, history
   --------------------------------------------------------------------- */
const cmdInput = $('#cmd-input'), cmdList = $('#cmd-list');
let sugg = [], sel = 0;

const bang = k => S.bangs.find(b => b.k === String(k).toLowerCase());
/** The engines picked in the search-bar badge (one or more). */
function engines() {
  const list = (S.settings.engines || []).map(bang).filter(Boolean);
  return list.length ? list : [S.bangs[0] || DEFAULT_BANGS[0]];
}
const engineNames = list => list.length === 1 ? list[0].name : list.length === 2 ? `${list[0].name} + ${list[1].name}` : `${list[0].name} +${list.length - 1}`;
const fill = (tpl, q) => tpl.includes('%s') ? tpl.replace(/%s/g, encodeURIComponent(q)) : tpl + encodeURIComponent(q);
const homeOf = tpl => { const bare = tpl.replace(/%s/g, ''); try { return new URL(bare).origin; } catch { return bare; } };   // relative (results.html) stays as is
const isUrl = q => !/\s/.test(q) && (/^[a-z][a-z0-9+.-]*:\/\//i.test(q) || /^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(q) ||
  /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(q) || /^[\w-]+:\d{2,5}(\/.*)?$/.test(q));

function calc(q) {
  let expr = q.replace(/^=\s*/, '');
  if (!/^[\d\s.,+\-*/()%^]+$/.test(expr) || !/\d/.test(expr)) return null;
  if (!q.startsWith('=') && !/\d\s*[+\-*/%^]\s*[\d(]/.test(expr)) return null;
  expr = expr.replace(/,/g, '.').replace(/\^/g, '**');
  try {
    const v = Function(`"use strict";return (${expr})`)();
    if (typeof v !== 'number' || !isFinite(v)) return null;
    return +v.toPrecision(12);
  } catch { return null; }
}

/** Bangs at the start and/or end of a query: "!g !d rust", "rust !yt", "!gh". */
function parseBangs(q) {
  const words = q.trim().split(/\s+/).filter(Boolean);
  const isB = w => /^!\S+$/.test(w) && bang(w.slice(1));
  const list = [];
  while (words.length && isB(words[0])) list.push(bang(words.shift().slice(1)));
  while (words.length && isB(words[words.length - 1])) list.unshift(bang(words.pop().slice(1)));
  if (!list.length) return null;
  return { list: list.filter((b, i) => list.indexOf(b) === i), q: words.join(' ') };
}

function buildSugg(raw) {
  const q = raw.trim(), out = [];
  if (q.startsWith('>')) {
    const cmds = commandSugg(q.slice(1));
    return cmds.length ? [{ label: 'Commands' }, ...cmds] : [{ label: 'No matching command' }];
  }
  if (!q) {
    if (S.settings.history && S.history.length) {
      out.push({ label: 'Recent' });
      S.history.slice(0, 6).forEach(h => out.push({ ic: 'clock', main: esc(h), tag: '', run: nt => go(h, nt) }));
    }
    return out;
  }
  const c = calc(q);
  const calcItem = c === null ? null : { ic: 'calc', main: `= <em>${c.toLocaleString(undefined, { maximumFractionDigits: 10 })}</em>`, tag: 'copy', run: () => { navigator.clipboard?.writeText(String(c)); toast(`Copied ${c}`); } };
  // "=…" or real operators win Enter; dash-only strings (phone numbers, dates) keep search first
  const calcFirst = calcItem && (q.startsWith('=') || /[*/^+(]/.test(q));
  if (calcFirst) out.push(calcItem);

  const pb = parseBangs(q);
  if (pb) {
    const names = pb.list.map(b => esc(b.name)).join(', '), tag = pb.list.map(b => '!' + b.k).join(' ');
    out.push(pb.q
      ? { ic: 'search', main: useAvalonPage(pb.list) ? `<em>Avalon results</em> from ${names} for “${esc(pb.q)}”` : `Search <em>${names}</em> for “${esc(pb.q)}”`, tag, run: nt => go(q, nt) }
      : { ic: 'globe', main: `Open <em>${names}</em>`, tag, run: nt => go(q, nt) });
    return out;
  }
  const partial = q.match(/^!(\S*)$/);
  if (partial) {
    S.bangs.filter(b => b.k.startsWith(partial[1].toLowerCase()) || b.name.toLowerCase().startsWith(partial[1].toLowerCase()))
      .slice(0, 7).forEach(b => out.push({ ic: 'bolt', main: `<em>!${esc(b.k)}</em> ${esc(b.name)}`, tag: 'tab', complete: `!${b.k} ` }));
    if (out.length) return out;
  }
  const lq = q.toLowerCase();
  const links = allLinks().map(l => {
    const n = l.name.toLowerCase();
    return { l, s: n.startsWith(lq) ? 3 : n.includes(lq) ? 2 : host(l.url).includes(lq) ? 1 : 0 };
  }).filter(x => x.s).sort((a, b) => b.s - a.s).slice(0, 4);
  const linkItems = links.map(({ l }) => ({ img: favicon(l.url), ic: 'globe', main: esc(l.name), tag: host(l.url) || 'link', run: nt => openUrl(l.url, nt) }));
  const eng = engines();
  const searchItem = useAvalonPage(eng)
    ? { ic: 'search', main: `<em>Avalon results</em> from ${eng.map(b => esc(b.name)).join(', ')} for “${esc(q)}”`, tag: 'combined', run: nt => go(q, nt) }
    : { ic: 'search', main: `Search ${eng.map(b => esc(b.name)).join(', ')} for “${esc(q)}”`, tag: eng.length > 1 ? `${eng.length} tabs` : 'enter', run: nt => go(q, nt) };
  // "node.js", "main.py": looks like a domain but is almost always a search
  const fileish = /^[^/:]+\.(js|ts|jsx|tsx|py|rs|go|md|json|txt|sh|exe|cpp|cs|css|html|yml|yaml|toml|lock)$/i.test(q);
  const urlItem = isUrl(q) && { ic: 'globe', main: `Go to <em>${esc(q)}</em>`, tag: 'url', run: nt => openUrl(normUrl(q), nt) };
  if (urlItem && !fileish) out.push(urlItem);
  if (links[0]?.s === 3 && !urlItem && c === null) out.push(...linkItems, searchItem);
  else out.push(searchItem, ...linkItems);
  if (urlItem && fileish) out.push(urlItem);
  if (calcItem && !calcFirst) out.push(calcItem);
  if (S.settings.history) S.history.filter(h => h.toLowerCase().startsWith(lq) && h.toLowerCase() !== lq).slice(0, 3)
    .forEach(h => out.push({ ic: 'clock', main: esc(h), tag: 'recent', run: nt => go(h, nt) }));
  return out.slice(0, 9);
}

/** Run a search string with its bangs, or with the engines picked in the badge. Records history. */
function go(q, newTab) {
  q = q.trim();
  if (!q) return;
  if (S.settings.history) { S.history = [q, ...S.history.filter(h => h !== q)].slice(0, 30); save(); flush(); }
  const pb = parseBangs(q);
  const list = pb ? pb.list : engines(), query = pb ? pb.q : q;
  if (query && useAvalonPage(list)) return openUrl(avalonUrl(query, list), newTab);
  openMany(list.map(b => ({ name: b.name, url: query ? fill(b.url, query) : homeOf(b.url) })), newTab);
}
/** Several engines + "Avalon page" mode → one combined results page instead of tabs. */
const useAvalonPage = list => list.length > 1 && S.settings.multiMode === 'avalon';
const avalonUrl = (q, list) => `results.html?q=${encodeURIComponent(q)}&e=${list.map(b => encodeURIComponent(b.k)).join(',')}`;

/**
 * One target → normal navigation. Several targets:
 *
 * Firefox/Zen (135+) give a page ONE new tab per click or key press: the first
 * window.open() uses up the user activation and the rest return null. Loading a
 * page in the *current* tab needs no activation, so the first engine goes here
 * and the others go to new tabs. Two engines always fit in one press. With more,
 * the home page stays and each further Enter (a fresh activation) opens the next
 * engine; the leftovers are also shown as plain links, which are never blocked.
 */
let pendingTabs = null;   // { query, list: [{ name, url }] } waiting for "Enter again"

function openMany(targets, newTab) {
  if (targets.length === 1) return openUrl(targets[0].url, newTab);
  const keepHome = newTab ?? S.settings.newTab;
  const here = keepHome ? null : targets[0];
  const blocked = [];
  for (const t of keepHome ? targets : targets.slice(1)) {
    if (blocked.length) { blocked.push(t); continue; }   // activation is gone; don't spam the blocker
    const w = window.open(t.url, '_blank');               // no "noopener": it would make open() return null even on success
    if (w) { try { w.opener = null; } catch { } } else blocked.push(t);
  }
  if (!blocked.length) {
    pendingTabs = null; $('#multi-bar').hidden = true;
    if (here) location.href = here.url; else toast(`Opened ${targets.length} searches.`);
    return;
  }
  // Not everything fitted in this key press: stay on the home page and queue the rest.
  pendingTabs = { query: cmdInput.value, list: here ? [here, ...blocked] : blocked };
  renderPending(targets.length);
}

function renderPending(total) {
  const bar = $('#multi-bar'), p = pendingTabs;
  if (!p || !p.list.length) { bar.hidden = true; pendingTabs = null; return; }
  if (total) p.total = total;
  bar.innerHTML = `<span>Opened ${p.total - p.list.length} of ${p.total}. <b>Press Enter again</b> for ${esc(p.list[0].name)}, or click:</span>` +
    p.list.map((t, i) => `<a href="${esc(t.url)}" target="_blank" rel="noopener" data-i="${i}">${esc(t.name)} ↗</a>`).join('') +
    `<button class="icon-btn sm" title="Dismiss">${icon('x')}</button>
     <span class="muted" style="flex-basis:100%;margin:0">Zen opens one new tab per key press or click. If it shows a “pop-ups blocked” bar
       at the top, choose <b>Allow pop-ups</b> for this page and every engine opens at once.</span>`;
  bar.hidden = false;
  bar.onclick = e => {
    if (e.target.closest('button')) { pendingTabs = null; bar.hidden = true; return; }
    const a = e.target.closest('a[data-i]');
    if (a) { p.list.splice(+a.dataset.i, 1); setTimeout(() => renderPending(), 0); }
  };
}

/** Called on Enter while a multi-search is still queued. Each press is a new activation. */
function openNextPending() {
  const p = pendingTabs, t = p.list[0];
  const w = window.open(t.url, '_blank');
  if (!w) { toast(`The browser blocked ${esc(t.name)} — click its button instead.`); return; }
  try { w.opener = null; } catch { }
  p.list.shift();
  renderPending();
}

const selectable = () => sugg.map((s, i) => s.label ? -1 : i).filter(i => i >= 0);
function renderSugg() {
  if (!sugg.length) { cmdList.hidden = true; return; }
  cmdList.hidden = false;
  cmdList.innerHTML = sugg.map((s, i) => s.label
    ? `<li class="group-label">${s.label}</li>`
    : `<li role="option" class="${i === sel ? 'sel' : ''}" data-i="${i}" aria-selected="${i === sel}">
        ${s.img ? `<img src="${s.img}" alt="" onerror="this.style.visibility='hidden'">` : icon(s.ic)}
        <span class="main">${s.main}</span><span class="tag">${esc(s.tag)}</span></li>`).join('');
}
function updateCmd() {
  sugg = buildSugg(cmdInput.value);
  sel = selectable()[0] ?? -1;
  renderSugg();
  renderEngineBadge();
}
function renderEngineBadge() {
  const pb = parseBangs(cmdInput.value.trim()), list = pb ? pb.list : engines();
  $('#engine-label').textContent = engineNames(list);
  const btn = $('#engine-btn');
  btn.classList.toggle('bang', !!pb);
  btn.classList.toggle('multi', !pb && list.length > 1);
  btn.title = pb ? `Bang in your query: ${list.map(b => b.name).join(', ')}` : `Searching with ${list.map(b => b.name).join(', ')} — click to change`;
}

/* ---- engine picker (the badge in the search bar) ---- */
const enginePop = $('#engine-pop'), engineBtn = $('#engine-btn'), engineFilter = $('#engine-filter');
function renderEngineRows() {
  const f = engineFilter.value.trim().toLowerCase().replace(/^!/, ''), on = S.settings.engines;
  const rows = S.bangs.filter(b => !f || b.k.startsWith(f) || b.name.toLowerCase().includes(f));
  // The whole row toggles the engine in/out of the set; "only" picks it alone.
  $('#engine-rows').innerHTML = rows.map(b => `<li class="eng ${on.includes(b.k) ? 'on' : ''}" data-k="${esc(b.k)}">
      <button type="button" class="eng-toggle" role="menuitemcheckbox" aria-checked="${on.includes(b.k)}">
        <span class="cb" aria-hidden="true"></span>${esc(b.name)}<code>!${esc(b.k)}</code>
      </button>
      <button type="button" class="eng-only" title="Search with ${esc(b.name)} only">only</button>
    </li>`).join('') || '<li class="muted" style="padding:8px">No engine matches. Add one in Settings → Search.</li>';
  const list = engines(), avalon = S.settings.multiMode === 'avalon';
  $('#engine-sel').textContent = list.length < 2 ? `Searching with ${list[0].name}`
    : avalon ? `${list.length} selected · one combined page` : `${list.length} selected · Enter opens ${list.length} tabs`;
  $$('#engine-mode button').forEach(b => b.classList.toggle('on', b.dataset.mm === (avalon ? 'avalon' : 'tabs')));
}
$('#engine-mode').addEventListener('click', e => {
  const b = e.target.closest('button[data-mm]');
  if (!b) return;
  S.settings.multiMode = b.dataset.mm; save();
  renderEngineRows(); renderEngineBadge();
});
function openEnginePop() {
  engineFilter.value = '';
  renderEngineRows();
  enginePop.hidden = false; cmdList.hidden = true;
  engineBtn.setAttribute('aria-expanded', 'true');
  engineFilter.focus();
}
function closeEnginePop(refocus = true) {
  if (enginePop.hidden) return;
  enginePop.hidden = true;
  engineBtn.setAttribute('aria-expanded', 'false');
  if (refocus) cmdInput.focus();
}
function setEngines(keys) {
  S.settings.engines = keys.length ? keys : [S.bangs[0]?.k || 'g'];
  save(); renderEngineBadge();
}
engineBtn.addEventListener('click', () => enginePop.hidden ? openEnginePop() : closeEnginePop());
engineFilter.addEventListener('input', renderEngineRows);
engineFilter.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); const first = $('#engine-rows .eng'); if (first) { setEngines([first.dataset.k]); closeEnginePop(); } }
  if (e.key === 'Escape') { e.stopPropagation(); closeEnginePop(); }
});
enginePop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closeEnginePop(); } });
$('#engine-rows').addEventListener('click', e => {
  const row = e.target.closest('.eng');
  if (!row) return;
  const k = row.dataset.k;
  if (e.target.closest('.eng-only')) { setEngines([k]); closeEnginePop(); return; }
  if (e.target.closest('.eng-toggle')) {
    const cur = S.settings.engines.filter(x => bang(x));
    if (cur.includes(k)) {
      if (cur.length === 1) { toast('Keep at least one engine selected.'); return; }
      setEngines(cur.filter(x => x !== k));
    } else setEngines([...cur, k]);
    renderEngineRows();
    $(`#engine-rows .eng[data-k="${CSS.escape(k)}"] .eng-toggle`)?.focus();
  }
});
$('#engine-done').addEventListener('click', () => closeEnginePop());
document.addEventListener('mousedown', e => {
  if (!enginePop.hidden && !enginePop.contains(e.target) && !engineBtn.contains(e.target)) closeEnginePop(false);
});
function runSel(newTab) {
  const s = sugg[sel];
  if (!s) { if (cmdInput.value.trim()) go(cmdInput.value, newTab); return; }
  if (s.complete) { cmdInput.value = s.complete; updateCmd(); cmdInput.focus(); return; }
  s.run(newTab);
}
cmdInput.addEventListener('input', () => {
  // typing a different query drops the queued tabs from the previous multi-search
  if (pendingTabs && cmdInput.value !== pendingTabs.query) { pendingTabs = null; $('#multi-bar').hidden = true; }
  updateCmd();
});
cmdInput.addEventListener('focus', updateCmd);
cmdInput.addEventListener('blur', () => setTimeout(() => { cmdList.hidden = true; }, 150));
cmdInput.addEventListener('keydown', e => {
  const idx = selectable();
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!idx.length) return;
    e.preventDefault();
    const p = idx.indexOf(sel);
    sel = idx[(p + (e.key === 'ArrowDown' ? 1 : -1) + idx.length) % idx.length];
    renderSugg();
  } else if (e.key === 'Tab' && sugg[sel]?.complete) {
    e.preventDefault(); runSel();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (pendingTabs?.list.length && cmdInput.value === pendingTabs.query) { openNextPending(); return; }
    runSel(e.ctrlKey || e.metaKey || e.shiftKey ? true : undefined);
  } else if (e.key === 'Escape') {
    if (cmdInput.value) { e.stopPropagation(); cmdInput.value = ''; updateCmd(); } else cmdInput.blur();
  }
});
$('#cmd').addEventListener('submit', e => e.preventDefault());
cmdList.addEventListener('mousedown', e => {
  const li = e.target.closest('li[data-i]');
  if (!li) return;
  e.preventDefault();
  sel = +li.dataset.i;
  runSel(e.button === 1 || e.ctrlKey || e.metaKey ? true : undefined);
});

/* ---------------------------------------------------------------------
   TECH FEED
   --------------------------------------------------------------------- */
const SOURCES = {
  hn: {
    name: 'Hacker News',
    url: () => 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30',
    map: d => d.hits.map(h => ({
      id: 'hn' + h.objectID, title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discuss: `https://news.ycombinator.com/item?id=${h.objectID}`, score: h.points, comments: h.num_comments,
      by: h.author, time: h.created_at_i * 1000, text: h.title,
    })),
  },
  show: {
    name: 'Show HN',
    url: () => `https://hn.algolia.com/api/v1/search?tags=show_hn&numericFilters=created_at_i>${Math.floor(Date.now() / 1000) - 3 * 86400},points>5&hitsPerPage=30`,
    map: d => d.hits.map(h => ({
      id: 'sh' + h.objectID, title: h.title.replace(/^Show HN:\s*/i, ''), url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discuss: `https://news.ycombinator.com/item?id=${h.objectID}`, score: h.points, comments: h.num_comments,
      by: h.author, time: h.created_at_i * 1000, text: h.title,
    })),
  },
  devto: {
    name: 'dev.to',
    url: () => 'https://dev.to/api/articles?top=3&per_page=30',
    map: d => d.map(a => ({
      id: 'dv' + a.id, title: a.title, url: a.url, discuss: a.url + '#comments', score: a.positive_reactions_count,
      comments: a.comments_count, by: a.user?.name, time: a.published_at, tags: a.tag_list,
      text: `${a.title} ${(a.tag_list || []).join(' ')} ${a.description || ''}`,
    })),
  },
  trending: {
    name: 'Rising repos',
    url: () => `https://api.github.com/search/repositories?q=created:>${dayKey(addDays(new Date(), -7))}&sort=stars&order=desc&per_page=25`,
    auth: true,
    map: d => d.items.map(r => ({
      id: 'gr' + r.id, title: r.full_name, desc: r.description, url: r.html_url, discuss: null,
      score: r.stargazers_count, scoreIcon: 'star', lang: r.language, time: r.created_at,
      text: `${r.full_name} ${r.description || ''} ${(r.topics || []).join(' ')} ${r.language || ''}`,
    })),
  },
};
let news = readCache(NEWS_CACHE);   // { [src]: { at, items, err } }
const NEWS_TTL = 15 * 60e3;

function interests() {
  return S.settings.interests.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
function matchInterest(item, terms) {
  const hay = ` ${String(item.text || item.title).toLowerCase()} `;
  return terms.find(t => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(hay));
}

async function fetchSource(key, force) {
  const src = SOURCES[key], c = news[key];
  if (!force && c?.items && Date.now() - c.at < NEWS_TTL) return;
  try {
    const headers = src.auth && S.settings.ghToken ? { Authorization: `Bearer ${S.settings.ghToken}` } : {};
    const res = await fetch(src.url(), { headers });
    if (!res.ok) throw new Error(res.status === 403 ? 'rate limited, try later' : `HTTP ${res.status}`);
    news[key] = { at: Date.now(), items: src.map(await res.json()) };
  } catch (e) {
    news[key] = { ...(c || {}), at: c?.at || 0, err: e.message || 'offline' };
  }
}
async function loadNews(force = false) {
  const keys = Object.keys(SOURCES).filter(k => S.settings.sources[k]);
  if (!keys.some(k => news[k]?.items)) renderNews(true);
  await Promise.all(keys.map(k => fetchSource(k, force)));
  writeCache(NEWS_CACHE, news);
  renderNews();
}

function renderNews(loading = false) {
  const keys = Object.keys(SOURCES).filter(k => S.settings.sources[k]);
  const terms = interests();
  const forYou = [];
  const seen = new Set();
  keys.forEach(k => (news[k]?.items || []).forEach((it, i, arr) => {
    const m = matchInterest(it, terms);
    if (m && !seen.has(it.url)) { seen.add(it.url); forYou.push({ ...it, src: k, match: m, heat: i / arr.length }); }
  }));
  forYou.sort((a, b) => a.heat - b.heat);

  let tab = S.ui.newsTab;
  const tabs = [...(terms.length ? ['foryou'] : []), ...keys];
  if (!tabs.includes(tab)) tab = terms.length && forYou.length ? 'foryou' : keys[0];
  $('#news-tabs').innerHTML = tabs.map(k => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}" role="tab">
      ${k === 'foryou' ? `${icon('sparkle')}For you <span class="n">${forYou.length}</span>` : esc(SOURCES[k].name)}</button>`).join('');

  const list = $('#news-list');
  if (!keys.length) { list.innerHTML = '<li class="state">All sources are off. Turn some on in Settings → Feed.</li>'; return; }
  if (loading) { list.innerHTML = '<li class="skeleton"></li>'.repeat(8); return; }
  const items = tab === 'foryou' ? forYou : (news[tab]?.items || []).map(it => ({ ...it, src: tab, match: matchInterest(it, terms) }));
  const err = tab !== 'foryou' && news[tab]?.err;
  if (!items.length) {
    list.innerHTML = `<li class="state ${err ? 'err' : ''}">${err ? `Couldn't load ${esc(SOURCES[tab].name)}: ${esc(err)}.` :
      tab === 'foryou' ? 'Nothing matches your interests right now. Edit them in Settings → Feed.' : 'Nothing here yet.'}</li>`;
  } else {
    list.innerHTML = (err ? `<li class="state err">Showing cached stories — ${esc(err)}.</li>` : '') + items.map((it, i) => `
      <li class="story ${it.match ? 'hot' : ''}">
        <span class="rank">${i + 1}</span>
        <div>
          <a class="title" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title)}</a>${it.url && !it.desc ? `<span class="dom">${esc(host(it.url))}</span>` : ''}
          ${it.desc ? `<div class="meta" style="margin-top:3px">${esc(it.desc)}</div>` : ''}
          <div class="meta">
            <span class="src ${it.src}">${esc(SOURCES[it.src].name)}</span>
            ${it.score != null ? `<span>${icon(it.scoreIcon || 'bolt')}${compact(it.score)}</span>` : ''}
            ${it.discuss ? `<a href="${esc(safeUrl(it.discuss))}" target="_blank" rel="noopener">${icon('msg')}${it.comments ?? 0}</a>` : ''}
            ${it.lang ? `<span>${esc(it.lang)}</span>` : ''}
            ${it.time ? `<span>${ago(it.time)}</span>` : ''}
            ${it.match ? `<span class="chip">${esc(it.match)}</span>` : ''}
          </div>
        </div>
      </li>`).join('');
  }
  const ats = keys.map(k => news[k]?.at || 0).filter(Boolean);
  $('#news-updated').textContent = ats.length ? `updated ${ago(Math.min(...ats))}` : '';
}
$('#news-tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  S.ui.newsTab = b.dataset.tab; save(); renderNews();
  $('#news-list').scrollTop = 0;
});
$('#news-refresh').addEventListener('click', () => loadNews(true));

/* ---------------------------------------------------------------------
   GITHUB
   --------------------------------------------------------------------- */
let gh = readCache(GH_CACHE);   // { user, at, profile, received, mine, repos, notifs, contrib, err }
const GH_TTL = 10 * 60e3;

async function ghFetch(path, opts = {}) {
  const headers = { Accept: 'application/vnd.github+json', ...(opts.headers || {}) };
  if (S.settings.ghToken) headers.Authorization = `Bearer ${S.settings.ghToken}`;
  const res = await fetch(path.startsWith('http') ? path : `https://api.github.com${path}`, { ...opts, headers });
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) {
      const reset = res.headers.get('x-ratelimit-reset');
      throw new Error(`rate limit reached${reset ? `, resets at ${new Date(reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`);
    }
    if (res.status === 401) throw new Error('token rejected (401) — check it in Settings → GitHub');
    if (res.status === 404) throw new Error('not found');
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function loadGitHub(force = false) {
  const user = S.settings.ghUser.trim();
  if (!user) { gh = {}; renderGitHub(); return; }
  const fresh = gh.user === user && gh.tokenSet === !!S.settings.ghToken && Date.now() - gh.at < GH_TTL;
  if (fresh && !force) { renderGitHub(); return; }
  if (gh.user !== user) { gh = { user, loading: true }; renderGitHub(); }
  const token = !!S.settings.ghToken;
  const u = encodeURIComponent(user);
  const jobs = {
    profile: ghFetch(`/users/${u}`),
    received: ghFetch(`/users/${u}/received_events?per_page=50`),
    mine: ghFetch(`/users/${u}/events?per_page=50`),
    repos: ghFetch(token ? `/user/repos?sort=pushed&per_page=10&affiliation=owner,collaborator` : `/users/${u}/repos?sort=pushed&per_page=10`),
  };
  if (token) {
    jobs.notifs = ghFetch('/notifications?per_page=40&all=false');
    jobs.contrib = ghFetch('/graphql', {
      method: 'POST',
      body: JSON.stringify({
        query: 'query($l:String!){user(login:$l){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{contributionCount date contributionLevel}}}}}}',
        variables: { l: user },
      }),
    });
  }
  const keys = Object.keys(jobs);
  const results = await Promise.allSettled(Object.values(jobs));
  const next = { user, tokenSet: token, at: Date.now() };
  results.forEach((r, i) => {
    const k = keys[i];
    if (r.status === 'fulfilled') next[k] = r.value;
    else { next[k] = gh.user === user ? gh[k] : undefined; next.err ||= r.reason.message; if (k === 'profile' && r.reason.message === 'not found') next.err = `user "${user}" not found`; }
  });
  if (!results.some(r => r.status === 'fulfilled')) next.at = gh.at || 0;
  gh = next;
  writeCache(GH_CACHE, gh);
  renderGitHub();
}

function evHtml(e) {
  const repo = e.repo?.name || '', p = e.payload || {};
  const rl = `<a href="https://github.com/${esc(repo)}" target="_blank" rel="noopener">${esc(repo)}</a>`;
  const link = (url, text) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(text)}</a>`;
  let verb = '', rest = rl, detail = '';
  switch (e.type) {
    case 'PushEvent': {
      const n = p.size ?? p.distinct_size ?? p.commits?.length;
      const br = String(p.ref || '').replace('refs/heads/', '');
      verb = 'pushed'; rest = `${n ? `${n} commit${n > 1 ? 's' : ''} ` : ''}to <b>${esc(br)}</b> in ${rl}`;
      detail = firstLine(p.commits?.[p.commits.length - 1]?.message);
      if (e._merged > 1) detail = `${e._merged} pushes` + (detail ? ` · latest: ${detail}` : '');
      break;
    }
    case 'CreateEvent': verb = 'created'; rest = p.ref_type === 'repository' ? `repository ${rl}` : `${p.ref_type} <b>${esc(p.ref)}</b> in ${rl}`; break;
    case 'DeleteEvent': verb = 'deleted'; rest = `${p.ref_type} <b>${esc(p.ref)}</b> in ${rl}`; break;
    case 'WatchEvent': verb = 'starred'; break;
    case 'ForkEvent': verb = 'forked'; rest = `${rl}${p.forkee ? ` → ${link(p.forkee.html_url, p.forkee.full_name)}` : ''}`; break;
    case 'PublicEvent': verb = 'open-sourced'; break;
    case 'ReleaseEvent': verb = 'released'; rest = `${p.release ? link(p.release.html_url, p.release.tag_name) : ''} in ${rl}`; detail = p.release?.name; break;
    case 'PullRequestEvent': {
      const pr = p.pull_request || {};
      verb = p.action === 'closed' && pr.merged ? 'merged' : p.action;
      rest = `PR ${link(pr.html_url || `https://github.com/${repo}/pull/${p.number}`, '#' + (pr.number || p.number))} in ${rl}`; detail = pr.title; break;
    }
    case 'PullRequestReviewEvent': verb = 'reviewed'; rest = `PR ${link(p.pull_request?.html_url, '#' + p.pull_request?.number)} in ${rl}`; detail = p.pull_request?.title; break;
    case 'PullRequestReviewCommentEvent': verb = 'commented on'; rest = `PR ${link(p.comment?.html_url, '#' + p.pull_request?.number)} in ${rl}`; detail = firstLine(p.comment?.body); break;
    case 'IssuesEvent': verb = p.action; rest = `issue ${link(p.issue?.html_url, '#' + p.issue?.number)} in ${rl}`; detail = p.issue?.title; break;
    case 'IssueCommentEvent': verb = 'commented on'; rest = `${p.issue?.pull_request ? 'PR' : 'issue'} ${link(p.comment?.html_url || p.issue?.html_url, '#' + p.issue?.number)} in ${rl}`; detail = firstLine(p.comment?.body); break;
    case 'CommitCommentEvent': verb = 'commented on a commit in'; break;
    case 'MemberEvent': verb = 'added'; rest = `<b>${esc(p.member?.login)}</b> to ${rl}`; break;
    case 'GollumEvent': verb = 'updated the wiki of'; break;
    default: verb = e.type.replace(/Event$/, '').toLowerCase();
  }
  const actor = e.actor?.display_login || e.actor?.login || '';
  return `<li class="ev">
    <img src="${esc(e.actor?.avatar_url)}&s=48" alt="" loading="lazy">
    <div>
      <div class="line"><a href="https://github.com/${esc(actor)}" target="_blank" rel="noopener"><b>${esc(actor)}</b></a> <span class="verb">${esc(verb)}</span> ${rest}<span class="when">${ago(e.created_at)}</span></div>
      ${detail ? `<div class="detail" title="${esc(detail)}">${esc(detail)}</div>` : ''}
    </div>
  </li>`;
}

/** Fold runs of pushes by the same person to the same repo into one line. */
function foldEvents(list = []) {
  const out = [];
  for (const e of list) {
    const prev = out[out.length - 1];
    if (prev && e.type === 'PushEvent' && prev.type === 'PushEvent' && prev.actor?.id === e.actor?.id && prev.repo?.id === e.repo?.id) {
      prev._merged = (prev._merged || 1) + 1;
      continue;
    }
    out.push({ ...e });
  }
  return out;
}

function notifUrl(n) {
  const api = n.subject?.url;
  if (!api) return n.repository?.html_url || 'https://github.com/notifications';
  return api.replace('api.github.com/repos', 'github.com').replace('/pulls/', '/pull/').replace(/\/commits\//, '/commit/');
}

function renderGitHub() {
  renderTray();   // unread count lives in the tray too
  const body = $('#gh-body');
  const user = S.settings.ghUser.trim();
  if (!user) {
    $('#gh-updated').textContent = '';
    body.innerHTML = `<div class="connect">
      <p>Connect your GitHub to see activity from people and repos you follow, your own pushes, rising repos and your repositories.</p>
      <form id="gh-connect"><input name="u" placeholder="GitHub username" spellcheck="false" autocomplete="off"><button class="btn btn-gold">Connect</button></form>
      <p class="muted" style="margin-top:12px">Add a token in Settings → GitHub for notifications and the contribution graph.</p>
    </div>`;
    $('#gh-connect').addEventListener('submit', e => {
      e.preventDefault();
      const v = e.target.u.value.trim().replace(/^@/, '');
      if (!v) return;
      S.settings.ghUser = v; save(); loadGitHub(true);
    });
    return;
  }
  if (gh.loading && !gh.profile) { body.innerHTML = '<ul style="padding:0;margin:0">' + '<li class="skeleton"></li>'.repeat(6) + '</ul>'; return; }

  const P = gh.profile;
  const token = !!S.settings.ghToken;
  const unread = (gh.notifs || []).filter(n => n.unread).length;
  const tabs = [['feed', 'Feed'], ['mine', 'You'], ...(token ? [['inbox', 'Inbox']] : []), ['repos', 'Repos']];
  let tab = S.ui.ghTab;
  if (!tabs.some(([k]) => k === tab)) tab = 'feed';

  let contrib = '';
  const cal = gh.contrib?.data?.user?.contributionsCollection?.contributionCalendar;
  if (cal) {
    const weeks = cal.weeks.slice(-22);
    const lvl = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
    contrib = `<div class="contrib"><div class="contrib-grid">${weeks.map(w =>
      Array.from({ length: 7 }, (_, d) => { const day = w.contributionDays.find(x => new Date(x.date + 'T12:00').getDay() === d);
        return day ? `<i data-l="${lvl[day.contributionLevel] ?? 0}" title="${day.contributionCount} on ${day.date}"></i>` : '<i style="visibility:hidden"></i>'; }).join('')).join('')}</div>
      <div class="contrib-cap"><span>Last ${weeks.length} weeks</span><span>${cal.totalContributions.toLocaleString()} this year</span></div></div>`;
  }

  let list = '';
  if (tab === 'feed' || tab === 'mine') {
    const evs = foldEvents(tab === 'feed' ? gh.received : gh.mine).slice(0, 30);
    list = evs.length ? evs.map(evHtml).join('') : `<li class="state">${tab === 'feed'
      ? 'Nothing yet. Follow people or star repos on GitHub and their activity shows up here.' : 'No recent public activity.'}</li>`;
  } else if (tab === 'inbox') {
    const ns = gh.notifs || [];
    list = ns.length ? ns.map(n => `<li class="ev">
        <img src="${esc(n.repository?.owner?.avatar_url)}&s=48" alt="" loading="lazy">
        <div><div class="line">${n.unread ? '<span class="unread"></span>' : ''}<a href="${esc(safeUrl(notifUrl(n)))}" target="_blank" rel="noopener"><b>${esc(n.subject?.title)}</b></a><span class="when">${ago(n.updated_at)}</span></div>
        <div class="detail">${esc(n.repository?.full_name)} · ${esc((n.subject?.type || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())} · ${esc(n.reason.replace(/_/g, ' '))}</div></div>
      </li>`).join('') + `<li class="state"><a href="https://github.com/notifications" target="_blank" rel="noopener">Open inbox on GitHub →</a></li>`
      : `<li class="state">Inbox zero. ${gh.err && !gh.notifs ? esc(gh.err) : ''}</li>`;
  } else {
    const rs = gh.repos || [];
    list = rs.length ? rs.map(r => `<a class="repo" href="${esc(safeUrl(r.html_url))}" target="_blank" rel="noopener">
        <b>${esc(r.full_name)}</b>${r.private ? ' <span class="chip">private</span>' : ''}
        ${r.description ? `<p>${esc(r.description)}</p>` : ''}
        <div class="meta">${r.language ? `<span>${esc(r.language)}</span>` : ''}<span>${icon('star')} ${compact(r.stargazers_count)}</span><span>${r.open_issues_count} open</span><span>pushed ${ago(r.pushed_at)}</span></div>
      </a>`).join('') : '<li class="state">No repositories.</li>';
  }

  body.innerHTML = `
    ${P ? `<div class="gh-profile">
      <img src="${esc(P.avatar_url)}&s=96" alt="">
      <div class="who"><a href="${esc(safeUrl(P.html_url))}" target="_blank" rel="noopener">${esc(P.name || P.login)}</a><p>@${esc(P.login)}${P.bio ? ' · ' + esc(P.bio) : ''}</p></div>
    </div>
    <div class="gh-stats">
      <div><b>${compact(P.public_repos + (P.total_private_repos || 0))}</b><span>repos</span></div>
      <div><b>${compact(P.followers)}</b><span>followers</span></div>
      <div><b>${token ? unread : compact(P.following)}</b><span>${token ? 'unread' : 'following'}</span></div>
    </div>` : ''}
    ${contrib}
    ${gh.err ? `<p class="state err" style="padding:4px 2px 10px">GitHub: ${esc(gh.err)}</p>` : ''}
    <div class="tabs" id="gh-tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}${k === 'inbox' && unread ? ` <span class="n">${unread}</span>` : ''}</button>`).join('')}</div>
    <ul class="scroll" style="list-style:none;margin:0;padding:0">${list}</ul>
    ${!token ? '<p class="hint">Add a token in Settings → GitHub for your inbox &amp; contribution graph.</p>' : ''}`;
  $('#gh-updated').textContent = gh.at ? `updated ${ago(gh.at)}` : '';
  $('#gh-tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (b) { S.ui.ghTab = b.dataset.tab; save(); renderGitHub(); }
  });
}
$('#gh-refresh').addEventListener('click', () => loadGitHub(true));

/* ---------------------------------------------------------------------
   SETTINGS
   --------------------------------------------------------------------- */
let pendingLoc = null;
const sf = $('#settings-form');

function bangRow(b = { k: '', name: '', url: '' }) {
  return `<div class="bang-row">
    <input class="bk" value="${esc(b.k)}" placeholder="key" aria-label="Bang key" maxlength="12">
    <input class="bn" value="${esc(b.name)}" placeholder="Name" aria-label="Name" maxlength="30">
    <input class="bu" value="${esc(b.url)}" placeholder="https://site/search?q=%s" aria-label="URL">
    <button type="button" class="icon-btn sm" data-del title="Remove">${icon('x')}</button>
  </div>`;
}
function readBangRows() {
  return $$('#bang-table .bang-row').map(r => ({
    k: $('.bk', r).value.trim().toLowerCase().replace(/^!/, '').replace(/\s+/g, ''),
    name: $('.bn', r).value.trim(),
    url: $('.bu', r).value.trim(),
  })).filter(b => b.k && (/^https?:\/\//i.test(b.url) || /^results\.html\?/i.test(b.url))).map(b => ({ ...b, name: b.name || b.k }));
}

function openSettings(tab = 'general') {
  const s = S.settings;
  sf.name.value = S.name;
  sf.clock24.value = s.clock24 ? '1' : '0';
  sf.units.value = s.units;
  sf.focus.value = s.focus; sf.short.value = s.short; sf.long.value = s.long;
  sf.newTab.checked = s.newTab; sf.sound.checked = s.sound; sf.effects.checked = s.effects; sf.notify.checked = s.notify;
  sf.idleStartup.checked = s.idleStartup; sf.idleAfter.value = s.idleAfter;
  sf.history.checked = s.history;
  sf.multiMode.value = s.multiMode; sf.wikiLang.value = s.wikiLang; sf.searxUrl.value = s.searxUrl;
  $('#searx-result').textContent = '';
  sf.ghUser.value = s.ghUser; sf.ghToken.value = s.ghToken;
  for (const k of Object.keys(SOURCES)) sf['src_' + k].checked = !!s.sources[k];
  sf.interests.value = s.interests;
  $('#bang-table').innerHTML = S.bangs.map(bangRow).join('');
  pendingLoc = null;
  $('#city-results').innerHTML = ''; $('#city-input').value = '';
  $('#loc-current').textContent = `Current: ${s.location.name}`;
  showSetTab(tab);
  $('#settings-dlg').showModal();
}
function showSetTab(t) {
  $$('#set-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $$('.set-page').forEach(p => { p.hidden = p.dataset.page !== t; });
}
$('#set-tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) showSetTab(b.dataset.tab); });
$('#bang-add').addEventListener('click', () => {
  $('#bang-table').insertAdjacentHTML('beforeend', bangRow());
  const rows = $$('#bang-table .bang-row'); $('.bk', rows[rows.length - 1]).focus();
});
$('#bang-table').addEventListener('click', e => { if (e.target.closest('[data-del]')) e.target.closest('.bang-row').remove(); });

/** Check that the SearXNG instance answers JSON to this page (format enabled + CORS header). */
$('#searx-test').addEventListener('click', async () => {
  const out = $('#searx-result'), raw = sf.searxUrl.value.trim();
  if (!raw) { out.textContent = 'Enter your SearXNG address first.'; return; }
  const base = normUrl(raw).replace(/\/+$/, '');
  out.textContent = 'Testing…';
  try {
    const res = await fetch(`${base}/search?q=avalon&format=json`, { credentials: 'omit' });
    if (res.status === 403) { out.textContent = '✗ Reached it, but JSON is disabled: add "json" under search.formats in settings.yml.'; return; }
    if (!res.ok) { out.textContent = `✗ It answered HTTP ${res.status}.`; return; }
    const d = await res.json().catch(() => null);
    if (!d || !Array.isArray(d.results)) { out.textContent = '✗ It answered, but not with SearXNG JSON. Check the URL.'; return; }
    const engs = [...new Set(d.results.flatMap(r => r.engines || [r.engine]))].slice(0, 6).join(', ');
    out.textContent = `✓ Connected — ${d.results.length} results${engs ? ` from ${engs}` : ''}. Press Save.`;
  } catch {
    out.textContent = '✗ The browser could not read it: wrong address, server down, or no Access-Control-Allow-Origin header (see README).';
  }
});

sf.addEventListener('submit', () => {
  const s = S.settings;
  const clamp = (v, lo, hi, d) => { v = parseInt(v, 10); return isNaN(v) ? d : Math.min(hi, Math.max(lo, v)); };
  const ghBefore = `${s.ghUser}|${s.ghToken}`;
  const srcBefore = JSON.stringify(s.sources);
  S.name = sf.name.value.trim();
  const bangs = readBangRows();
  if (bangs.length) S.bangs = bangs.filter((b, i) => bangs.findIndex(x => x.k === b.k) === i);
  Object.assign(s, {
    clock24: sf.clock24.value === '1', units: sf.units.value,
    focus: clamp(sf.focus.value, 1, 180, 25), short: clamp(sf.short.value, 1, 60, 5), long: clamp(sf.long.value, 1, 90, 15),
    newTab: sf.newTab.checked, sound: sf.sound.checked, effects: sf.effects.checked, notify: sf.notify.checked,
    history: sf.history.checked,
    // keep picked engines that still exist after bang edits
    engines: s.engines.filter(k => S.bangs.some(b => b.k === k)),
    idleStartup: sf.idleStartup.checked, idleAfter: clamp(sf.idleAfter.value, 0, 240, 0),
    multiMode: sf.multiMode.value,
    wikiLang: (sf.wikiLang.value.trim().toLowerCase().match(/^[a-z-]{2,10}$/) || ['en'])[0],
    searxUrl: sf.searxUrl.value.trim() ? normUrl(sf.searxUrl.value).replace(/\/+$/, '') : '',
    ghUser: sf.ghUser.value.trim().replace(/^@/, ''), ghToken: sf.ghToken.value.trim(),
    sources: Object.fromEntries(Object.keys(SOURCES).map(k => [k, sf['src_' + k].checked])),
    interests: sf.interests.value,
  });
  if (!s.history) S.history = [];
  if (pendingLoc) s.location = pendingLoc;
  if (s.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  save(); flush();
  applyEffects(); renderAll(); fetchWeather();
  if (ghBefore !== `${s.ghUser}|${s.ghToken}`) loadGitHub(true);
  if (srcBefore !== JSON.stringify(s.sources)) loadNews(); else renderNews();
});

async function searchCity() {
  const q = $('#city-input').value.trim(), out = $('#city-results');
  if (!q) return;
  out.innerHTML = '<li class="muted">Searching…</li>';
  try {
    const data = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en`)).json();
    if (!data.results?.length) { out.innerHTML = '<li class="muted">No matches.</li>'; return; }
    out.innerHTML = data.results.map((r, i) => `<li><button type="button" data-i="${i}">${esc([r.name, r.admin1, r.country].filter(Boolean).join(', '))}</button></li>`).join('');
    out.onclick = e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const r = data.results[+b.dataset.i];
      pendingLoc = { name: [r.name, r.country].filter(Boolean).join(', '), lat: r.latitude, lon: r.longitude };
      out.innerHTML = '';
      $('#loc-current').textContent = `Selected: ${pendingLoc.name} (save to apply)`;
    };
  } catch { out.innerHTML = '<li class="muted">Lookup failed — offline?</li>'; }
}
$('#city-search').addEventListener('click', searchCity);
$('#city-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); searchCity(); } });
$('#geo-btn').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  $('#loc-current').textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(p => {
    pendingLoc = { name: `${p.coords.latitude.toFixed(2)}, ${p.coords.longitude.toFixed(2)}`, lat: +p.coords.latitude.toFixed(4), lon: +p.coords.longitude.toFixed(4) };
    $('#loc-current').textContent = `Selected: ${pendingLoc.name} (save to apply)`;
  }, () => { $('#loc-current').textContent = 'Location denied — search a city instead.'; });
});

$('#export-btn').addEventListener('click', () => {
  const data = { ...S, settings: { ...S.settings, ghToken: '' } };   // never export the token
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = `avalon-home-${dayKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#import-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object' || !Array.isArray(data.groups)) throw new Error('not an Avalon backup');
    if (!confirm('Replace your current data with this backup?')) return;
    const token = S.settings.ghToken;
    S = data.v >= 1 && data.bangs ? hydrate({ ...data, settings: { ...data.settings, ghToken: token } }) : migrate(data);
    flush(); $('#settings-dlg').close(); boot(); toast('Backup restored.');
  } catch (err) { alert('Import failed: ' + err.message); }
  e.target.value = '';
});
$('#clear-history').addEventListener('click', () => { S.history = []; save(); toast('Search history cleared.'); });
$('#reset-btn').addEventListener('click', () => {
  if (!confirm('Erase all links, tasks, notes, bangs and settings (including your GitHub token)?')) return;
  [KEY, ...LEGACY, NEWS_CACHE, GH_CACHE, SENT_CACHE, 'avalon_weather'].forEach(k => localStorage.removeItem(k));
  S = defaults(); news = {}; gh = {}; weather = null; sentinel = {}; flush();
  $('#settings-dlg').close(); boot();
});

$('#btn-settings').addEventListener('click', () => openSettings());
$('#btn-help').addEventListener('click', () => {
  $('#bang-list').innerHTML = S.bangs.map(b => `<span><b>!${esc(b.k)}</b>${esc(b.name)}</span>`).join('');
  $('#help-dlg').showModal();
});
$$('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

/* ---------------------------------------------------------------------
   SENTINEL — watches home-network services
   A no-cors fetch resolves for any HTTP answer and rejects when the host
   can't be reached, so it works for LAN services without CORS headers.
   --------------------------------------------------------------------- */
const SENT_CACHE = 'avalon_sentinel';
let sentinel = readCache(SENT_CACHE);   // { [serviceId]: { hist: [{ t, up, ms }] } }
let probing = false;

async function probe(url) {
  const ctrl = new AbortController(), to = setTimeout(() => ctrl.abort(), 6000), t0 = performance.now();
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', credentials: 'omit', signal: ctrl.signal });
    return { up: true, ms: Math.round(performance.now() - t0) };
  } catch { return { up: false, ms: null }; }
  finally { clearTimeout(to); }
}
const lastProbe = s => sentinel[s.id]?.hist?.at(-1);
function netSummary() {
  const total = S.services.length;
  const known = S.services.filter(lastProbe);
  const up = known.filter(s => lastProbe(s).up).length;
  const down = known.length - up;
  const mood = !total || !known.length ? 'idle' : down === 0 ? 'ok' : up === 0 ? 'hot' : 'warn';
  return { total, up, down, mood };
}
async function runSentinel(force = false) {
  if (!S.services.length) { renderSentinel(); return; }
  if (probing || (!force && document.hidden)) return;
  probing = true; $('#sentinel').classList.add('checking');
  const list = S.services.slice();
  const res = await Promise.all(list.map(s => probe(s.url)));
  list.forEach((s, i) => {
    const h = (sentinel[s.id] ||= { hist: [] }), prev = h.hist.at(-1);
    h.hist.push({ t: Date.now(), ...res[i] });
    h.hist = h.hist.slice(-40);
    if (prev && prev.up && !res[i].up) { toast(`<b>${esc(s.name)}</b> is unreachable.`); notify(`${s.name} is down`, s.url); }
    if (prev && !prev.up && res[i].up) toast(`<b>${esc(s.name)}</b> is back online.`);
  });
  for (const id of Object.keys(sentinel)) if (!S.services.some(s => s.id === id)) delete sentinel[id];
  writeCache(SENT_CACHE, sentinel);
  probing = false; $('#sentinel').classList.remove('checking');
  renderSentinel();
}
function renderSentinel() {
  const list = $('#svc-list');
  if (!S.services.length) {
    list.innerHTML = `<li class="svc-empty">Add the services on your home network — router, NAS, Jellyfin, Pi-hole, Home Assistant…
      Avalon checks them every minute, and the guardian's eyes turn <b>amber</b> when something stops answering.</li>`;
  } else {
    list.innerHTML = S.services.map(s => {
      const h = sentinel[s.id]?.hist || [], last = h.at(-1);
      const state = !last ? 'unknown' : last.up ? 'up' : 'down';
      const bars = Array.from({ length: 20 }, (_, i) => { const p = h[h.length - 20 + i]; return `<i class="${p ? (p.up ? 'up' : 'down') : ''}"></i>`; }).join('');
      const upPct = h.length ? Math.round(h.filter(x => x.up).length / h.length * 100) : null;
      let where = s.url; try { where = new URL(s.url).host; } catch { }
      return `<li class="svc ${state}" data-id="${s.id}">
        <span class="led ${state === 'up' ? 'ok' : state === 'down' ? 'hot' : 'idle'}"></span>
        <div class="who"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a><small>${esc(where)}</small></div>
        <span class="hist" title="${upPct == null ? 'No checks yet' : `${upPct}% reachable over the last ${h.length} checks`}">${bars}</span>
        <span class="ms">${!last ? '…' : last.up ? `${last.ms}ms` : 'down'}</span>
        <button class="icon-btn sm del" title="Stop watching">${icon('x')}</button>
      </li>`;
    }).join('');
  }
  const n = netSummary();
  $('#sent-sum').textContent = n.total ? `${n.up}/${n.total} online` : '';
  Guardian.setMood(n.mood === 'idle' ? 'ok' : n.mood);
  renderTray();
}
$('#svc-form').addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, name = f.name.value.trim(), url = normUrl(f.url.value);
  if (!name || !url) return;
  const svc = { id: uid(), name, url };
  S.services.push(svc); save();
  f.reset(); f.name.focus();
  renderSentinel();
  probe(url).then(r => { sentinel[svc.id] = { hist: [{ t: Date.now(), ...r }] }; writeCache(SENT_CACHE, sentinel); renderSentinel(); });
});
$('#svc-list').addEventListener('click', e => {
  const li = e.target.closest('.svc');
  if (li && e.target.closest('.del')) {
    S.services = S.services.filter(s => s.id !== li.dataset.id);
    delete sentinel[li.dataset.id]; writeCache(SENT_CACHE, sentinel);
    save(); renderSentinel();
  }
});
$('#sent-refresh').addEventListener('click', () => runSentinel(true));

/* ---------------------------------------------------------------------
   SYSTEM TRAY
   --------------------------------------------------------------------- */
function renderTray() {
  const n = netSummary(), online = navigator.onLine;
  const led = $('#tray-net .led');
  led.className = 'led ' + (!online ? 'hot' : n.mood);
  $('#tray-net-txt').textContent = !online ? 'Offline' : n.total ? `${n.up}/${n.total}` : 'Home';
  $('#tray-net').title = !online ? 'This device is offline' : n.total ? `Home network: ${n.up} of ${n.total} services reachable` : 'Home network — add services in Sentinel';
  const unread = S.settings.ghToken ? (gh.notifs || []).filter(x => x.unread).length : 0;
  $('#tray-gh').hidden = !unread;
  $('#tray-gh-n').textContent = unread;
  const running = !!S.timer.endAt;
  $('#tray-focus').hidden = !running;
  if (running) { const l = timeLeft(); $('#tray-focus-t').textContent = `${pad(Math.floor(l / 60))}:${pad(l % 60)}`; }
  const dot = $('#foot-dot');
  dot.className = 'dot ' + (!online ? 'hot' : n.mood === 'warn' || n.mood === 'hot' ? n.mood : '');
  $('#foot-txt').textContent = !online ? 'Avalon OS · offline' : n.down ? `Avalon OS · ${n.down} service${n.down > 1 ? 's' : ''} down` : 'Avalon OS · all systems nominal';
}
function reveal(panelId) {
  const p = $('#' + panelId);
  if (S.ui.collapsed?.[panelId]) togglePanel(p);
  p.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
$('#tray-net').addEventListener('click', () => { reveal('sentinel'); if (!S.services.length) setTimeout(() => $('#svc-form [name=name]').focus({ preventScroll: true }), 300); else runSentinel(true); });
$('#tray-gh').addEventListener('click', () => { S.ui.ghTab = 'inbox'; save(); renderGitHub(); reveal('gh'); });
$('#tray-focus').addEventListener('click', toggleFocus);
window.addEventListener('online', () => { renderTray(); loadNews(); loadGitHub(); fetchWeather(); });
window.addEventListener('offline', renderTray);

/* ---------------------------------------------------------------------
   CALENDAR (click the clock) — marks routine-complete and focus days
   --------------------------------------------------------------------- */
const Cal = (() => {
  const pop = $('#cal-pop'), btn = $('#timebox');
  let view = new Date();
  function render() {
    const y = view.getFullYear(), m = view.getMonth();
    const first = new Date(y, m, 1), startDow = (first.getDay() + 6) % 7;   // weeks start on Monday
    const start = addDays(first, -startDow), today = dayKey();
    const dows = Array.from({ length: 7 }, (_, i) => addDays(new Date(2024, 0, 1), i).toLocaleDateString(undefined, { weekday: 'narrow' }));
    let clear = 0, sessions = 0, cells = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i), k = dayKey(d), L = S.log[k], inMonth = d.getMonth() === m;
      if (inMonth && L?.clear) clear++;
      if (inMonth) sessions += L?.sessions || 0;
      const cls = ['d', inMonth ? '' : 'out', k === today ? 'today' : '', L?.clear ? 'clear' : '', L?.sessions ? 'focus' : ''].join(' ');
      cells += `<span class="${cls}" title="${d.toDateString()}${L?.clear ? ' · routine done' : ''}${L?.sessions ? ` · ${L.sessions} focus (${L.focus}m)` : ''}">${d.getDate()}</span>`;
    }
    pop.innerHTML = `
      <div class="cal-head">
        <button class="icon-btn sm cal-prev" title="Previous month">${icon('chevron')}</button>
        <b>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
        <button class="icon-btn sm cal-next" title="Next month">${icon('chevron')}</button>
      </div>
      <div class="cal-grid">${dows.map(d => `<span class="dow">${d}</span>`).join('')}${cells}</div>
      <div class="cal-foot"><span><i></i>${clear} routine day${clear === 1 ? '' : 's'}</span><span><i class="f"></i>${sessions} focus session${sessions === 1 ? '' : 's'}</span></div>`;
  }
  function open() { view = new Date(); render(); pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
  function close() { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  function toggle() { pop.hidden ? open() : close(); }
  btn.addEventListener('click', toggle);
  pop.addEventListener('click', e => {
    if (e.target.closest('.cal-prev')) { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); }
    if (e.target.closest('.cal-next')) { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); }
  });
  document.addEventListener('mousedown', e => { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) close(); });
  return { toggle, close };
})();

/* ---------------------------------------------------------------------
   COMMAND PALETTE — type ">" in the search bar
   --------------------------------------------------------------------- */
function commands() {
  const s = S.settings;
  return [
    ['Start or pause focus', 'F', toggleFocus],
    ['Start a break', '', () => { setMode('short'); toggleFocus(); }],
    ['Lock screen', 'I', () => Idle.show()],
    ['Add a task', 'T', () => { reveal('today'); $('#task-form input').focus({ preventScroll: true }); }],
    ['Add a routine item', 'N', () => { reveal('today'); $('#routine-form input').focus({ preventScroll: true }); }],
    ['Add a link', '', () => linkDialog(null)],
    ['Edit links', 'E', () => { editing = !editing; renderLinks(); }],
    ['Watch a home service', '', () => { reveal('sentinel'); $('#svc-form [name=name]').focus({ preventScroll: true }); }],
    ['Check home services now', '', () => runSentinel(true)],
    ['Refresh feed and GitHub', 'R', () => { loadNews(true); loadGitHub(true); }],
    ['GitHub inbox', '', () => { S.ui.ghTab = 'inbox'; renderGitHub(); reveal('gh'); }],
    ['Calendar', 'C', () => Cal.toggle()],
    ['Write in memo', 'M', () => { reveal('memo-panel'); memo.focus({ preventScroll: true }); }],
    ['Choose search engines', '', () => openEnginePop()],
    ['Open Avalon Search', '', () => openUrl('results.html')],
    [`Several engines open as ${s.multiMode === 'avalon' ? 'tabs' : 'one Avalon page'}`, '', () => {
      s.multiMode = s.multiMode === 'avalon' ? 'tabs' : 'avalon'; save(); renderEngineBadge();
      toast(`Several engines now open as ${s.multiMode === 'avalon' ? 'one Avalon results page' : 'separate tabs'}.`);
    }],
    ['Settings', '', () => openSettings()],
    ['Settings: search & bangs', '', () => openSettings('search')],
    ['Settings: GitHub', '', () => openSettings('github')],
    ['Settings: tech feed', '', () => openSettings('news')],
    ['Settings: backup & data', '', () => openSettings('data')],
    [`Turn sounds ${s.sound ? 'off' : 'on'}`, '', () => { s.sound = !s.sound; save(); toast(`Sounds ${s.sound ? 'on' : 'off'}.`); }],
    [`Turn animations ${s.effects ? 'off' : 'on'}`, '', () => { s.effects = !s.effects; save(); applyEffects(); }],
    [`Open links in ${s.newTab ? 'this tab' : 'new tabs'}`, '', () => { s.newTab = !s.newTab; save(); toast(`Links open in ${s.newTab ? 'new tabs' : 'this tab'}.`); }],
    ['Collapse all panels', '', () => $$('.grid .panel').forEach(p => !p.classList.contains('collapsed') && togglePanel(p))],
    ['Expand all panels', '', () => $$('.grid .panel').forEach(p => p.classList.contains('collapsed') && togglePanel(p))],
    ['Export backup', '', () => $('#export-btn').click()],
    ['Keyboard shortcuts', '?', () => $('#btn-help').click()],
  ].map(([name, key, run]) => ({ name, key, run }));
}
function commandSugg(q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return commands().filter(c => words.every(w => c.name.toLowerCase().includes(w))).slice(0, 9).map(c => ({
    ic: 'bolt', main: esc(c.name), tag: c.key,
    run: () => { cmdInput.value = ''; updateCmd(); cmdInput.blur(); cmdList.hidden = true; c.run(); },
  }));
}

/* ---------------------------------------------------------------------
   COLLAPSIBLE PANELS
   --------------------------------------------------------------------- */
function togglePanel(p) {
  S.ui.collapsed ||= {};
  const c = !p.classList.contains('collapsed');
  p.classList.toggle('collapsed', c);
  S.ui.collapsed[p.id] = c;
  $('.p-head h2', p).setAttribute('aria-expanded', String(!c));
  save();
}
$$('.grid .panel').forEach(p => {
  const h = $('.p-head h2', p);
  h.insertAdjacentHTML('beforeend', `<svg class="ic fold"><use href="#i-chevron"/></svg>`);
  h.tabIndex = 0; h.setAttribute('role', 'button'); h.title = 'Collapse / expand';
  h.addEventListener('click', () => togglePanel(p));
  h.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(p); } });
});
function applyCollapsed() {
  $$('.grid .panel').forEach(p => {
    const c = !!S.ui.collapsed?.[p.id];
    p.classList.toggle('collapsed', c);
    $('.p-head h2', p).setAttribute('aria-expanded', String(!c));
  });
}

/* ---------------------------------------------------------------------
   IDLE / STARTUP SCREEN
   Shown: from the moon button or "I"; on #idle in the URL; when the page
   opens and no Avalon tab has been alive for 3+ min (≈ browser start);
   after N idle minutes if enabled. Any key, click or scroll dismisses it.
   --------------------------------------------------------------------- */
const ALIVE = 'avalon_alive';
const Idle = (() => {
  const el = $('#idle');
  let on = false, lastActive = Date.now();

  function renderInfo() {
    if (!on) return;
    const now = new Date();
    let h = now.getHours(), ampm = '';
    if (!S.settings.clock24) { ampm = h >= 12 ? ' PM' : ' AM'; h = h % 12 || 12; }
    $('#idle-clock').textContent = `${S.settings.clock24 ? pad(h) : h}:${pad(now.getMinutes())}${ampm}`;
    const parts = [now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })];
    const c = weather?.data?.current;
    if (c) parts.push(`${Math.round(c.temperature_2m)}° ${(WMO[c.weather_code] || ['—'])[0]}`);
    if (S.timer.endAt) { const l = timeLeft(); parts.push(`<b>${MODE_NAME[S.timer.mode]} ${pad(Math.floor(l / 60))}:${pad(l % 60)}</b>`); }
    const n = netSummary();
    if (n.total) parts.push(n.down ? `<b>${n.down} service${n.down > 1 ? 's' : ''} down</b>` : `network ${n.up}/${n.total} online`);
    $('#idle-sub').innerHTML = parts.join(' · ');
  }
  function show() {
    if (on) return;
    on = true;
    closeEnginePop(false); Cal.close(); cmdList.hidden = true;
    document.body.classList.add('idling');
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    el.hidden = false;
    el.classList.remove('leaving', 'play');
    void el.offsetWidth;            // restart the intro animation
    el.classList.add('play');
    renderInfo();
  }
  function hide(typed) {
    if (!on) return;
    on = false; lastActive = Date.now();
    document.body.classList.remove('idling');
    el.classList.add('leaving');
    setTimeout(() => { if (!on) { el.hidden = true; el.classList.remove('leaving', 'play'); } }, 450);
    if (location.hash === '#idle') history.replaceState(null, '', location.pathname + location.search);
    cmdInput.focus({ preventScroll: true });
    if (typed) { cmdInput.value = typed; updateCmd(); }
  }

  // Capture phase so nothing underneath reacts to the dismissing key/click.
  window.addEventListener('keydown', e => {
    if (!on) { lastActive = Date.now(); return; }
    if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    // a printable key goes straight into the search bar
    hide(e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey ? e.key : '');
  }, true);
  el.addEventListener('pointerdown', e => { e.preventDefault(); hide(); });
  el.addEventListener('wheel', () => hide(), { passive: true });
  ['pointermove', 'pointerdown', 'wheel', 'scroll'].forEach(t => window.addEventListener(t, () => { if (!on) lastActive = Date.now(); }, { passive: true }));

  function check() {
    const mins = S.settings.idleAfter;
    if (on || !mins || document.hidden || document.querySelector('dialog[open]')) return;
    if (Date.now() - lastActive > mins * 60e3) show();
  }

  return { show, hide, renderInfo, check, get on() { return on; } };
})();
$('#btn-idle').addEventListener('click', () => Idle.show());

/* ---------------------------------------------------------------------
   KEYBOARD
   --------------------------------------------------------------------- */
document.addEventListener('keydown', e => {
  const a = document.activeElement;
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(a?.tagName) || a?.isContentEditable;
  if (document.querySelector('dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmdInput.focus(); cmdInput.select(); return; }
  if (e.key === 'Escape' && typing) { a.blur(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const act = {
    '/': () => cmdInput.focus(),
    '?': () => $('#btn-help').click(),
    t: () => $('#task-form input').focus(),
    n: () => $('#routine-form input').focus(),
    f: toggleFocus,
    m: () => memo.focus(),
    r: () => { loadNews(true); loadGitHub(true); },
    e: () => { editing = !editing; renderLinks(); },
    i: () => Idle.show(),
    c: () => Cal.toggle(),
    '>': () => { cmdInput.focus(); cmdInput.value = '>'; updateCmd(); },
  }[k];
  if (act) { e.preventDefault(); act(); return; }
  if (/^[1-9]$/.test(k)) { const l = allLinks()[+k - 1]; if (l) openUrl(l.url); }
});

/* ---------------------------------------------------------------------
   BOOT
   --------------------------------------------------------------------- */
function applyEffects() { renderSparkles(); Guardian.setAnimated(S.settings.effects); }
function renderAll() {
  renderClock(); renderToday(); renderFocus(); renderLinks(); renderWeather(); renderNews(); renderGitHub();
  memo.value = S.memo || '';
  renderEngineBadge();
}

let lastDay = dayKey();
function tick() {
  renderClock();
  if (S.timer.endAt) { if (Date.now() >= S.timer.endAt) finishFocus(); else renderFocus(); }
  if (dayKey() !== lastDay) { lastDay = dayKey(); renderToday(); }
  Idle.renderInfo();
  renderTray();
}

function boot() {
  applyEffects();
  applyCollapsed();
  renderAll();
  fetchWeather();
  loadNews();
  loadGitHub();
  runSentinel();
}

// keep several open tabs of this page in sync
window.addEventListener('storage', e => {
  if (e.key !== KEY || !e.newValue) return;
  try { S = hydrate(JSON.parse(e.newValue)); applyCollapsed(); renderAll(); renderSentinel(); } catch { }
});
// refresh feeds when coming back to the tab after a while
document.addEventListener('visibilitychange', () => { if (!document.hidden) { loadNews(); loadGitHub(); fetchWeather(); runSentinel(); } });
setInterval(() => runSentinel(), 60e3);

// "Is another Avalon tab alive?" heartbeat — a gap of 3+ minutes means the browser was just started.
let prevAlive = 0;
try { prevAlive = +localStorage.getItem(ALIVE) || 0; } catch { }
const beat = () => { try { localStorage.setItem(ALIVE, String(Date.now())); } catch { } };
beat();
setInterval(beat, 20e3);
window.addEventListener('pagehide', beat);

boot();
flush();
setInterval(tick, 1000);
setInterval(() => Idle.check(), 15e3);
if (location.hash === '#idle' || (S.settings.idleStartup && Date.now() - prevAlive > 3 * 60e3)) Idle.show();
else if (!location.hash) setTimeout(() => cmdInput.focus({ preventScroll: true }), 50);
