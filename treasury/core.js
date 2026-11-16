/* =====================================================================
   AVALON TREASURY — helpers, money, dates and the store
   Plain classic scripts (no modules: unreliable on file:// in Zen).
   Everything hangs off window.T.

   Data lives in one localStorage document (avalon_treasury_v1). Amounts
   are whole cents, dates are local "YYYY-MM-DD" strings.
     settings    { currency, coolOff (days), budget (cents, 0 = sum of categories) }
     categories  { id, name, color, icon, budget, keywords[] }
     expenses    { id, kind: 'expense'|'income', amount, categoryId, note, date, recurringId?, wishId?, createdAt }
     recurring   { id, name, amount, categoryId, every: 'week'|'month'|'year', start, next, active }
     wishes      { id, name, url, image, price, priority: 'need'|'want'|'dream', saved, target, status:
                   'active'|'bought'|'dropped', note, prices: [{ date, price }], createdAt, boughtAt, expenseId }
   ===================================================================== */
'use strict';

const T = window.T = { views: {} };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}" /></svg>`;
const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? u : '';
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const pad = n => String(n).padStart(2, '0');
const plural = (n, w) => `${n} ${n === 1 ? w : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : /(sh|ch|s|x)$/.test(w) ? w + 'es' : w + 's'}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------- dates ---------- */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const parseDay = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return iso(d); };
const dayDiff = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);   // b − a in days
const monthKey = s => String(s).slice(0, 7);
const thisMonth = () => monthKey(today());
function shiftMonth(key, n) {
  let [y, m] = key.split('-').map(Number);
  m += n;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${pad(m)}`;
}
const daysIn = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const fmtMonth = (key, short = false) => { const [y, m] = key.split('-').map(Number); return `${short ? MONTHS[m - 1].slice(0, 3) : MONTHS[m - 1]} ${y}`; };
function fmtDay(s, { year = false } = {}) {
  const d = parseDay(s), t = today();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  if (s === addDays(t, 1)) return 'Tomorrow';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(year || d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}
/** Same day next week / month / year; month ends clamp (Jan 31 → Feb 28). */
function nextDate(s, every, anchorDay) {
  const d = parseDay(s);
  if (every === 'week') { d.setDate(d.getDate() + 7); return iso(d); }
  const want = anchorDay || d.getDate();
  const y = d.getFullYear() + (every === 'year' ? 1 : 0), m = d.getMonth() + (every === 'month' ? 1 : 0);
  const last = new Date(y, m + 1, 0).getDate();
  return iso(new Date(y, m, Math.min(want, last)));
}

function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

/* ---------- money ---------- */
const fmts = new Map();
function nf(compact) {
  const cur = T.state?.settings.currency || 'EUR', k = cur + compact;
  if (!fmts.has(k)) {
    try { fmts.set(k, new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, ...(compact ? { maximumFractionDigits: 0 } : {}) })); }
    catch { fmts.set(k, new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' })); }
  }
  return fmts.get(k);
}
/** 1250 → "€12.50"; sign adds "+" to positive values; compact drops the cents. */
T.money = (cents, { sign = false, compact = false } = {}) => {
  const v = Math.round(cents || 0);
  const s = nf(compact || Math.abs(v) >= 1e6).format(Math.abs(v) / 100);
  return (v < 0 ? '−' : sign && v > 0 ? '+' : '') + s;
};
T.symbol = () => nf(true).formatToParts(0).find(p => p.type === 'currency')?.value || '€';
/** "12,50" "1.234,56" "1,234.56" "€ 12" → cents, or NaN. */
T.toCents = v => {
  let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s || !/\d/.test(s)) return NaN;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = /,\d{1,2}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(Math.abs(n) * 100) : NaN;
};
T.plainAmount = c => (Math.round(c || 0) / 100).toFixed(2).replace(/\.00$/, '');
T.CURRENCIES = ['EUR', 'USD', 'GBP', 'BRL', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'INR', 'CNY', 'MXN'];

/* ---------- feedback ---------- */
function toast(html, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, kind === 'err' ? 4200 : 2800);
  return el;
}
/** Promise-based confirm, styled like the rest of Avalon. */
function ask({ title, text = '', ok = 'Delete', danger = true }) {
  const dlg = $('#ask-dlg');
  $('#ask-title').textContent = title;
  $('#ask-text').innerHTML = text;
  const okBtn = $('#ask-ok');
  okBtn.textContent = ok;
  okBtn.classList.toggle('btn-danger', danger);
  okBtn.classList.toggle('btn-gold', !danger);
  return new Promise(res => {
    let settled = false;
    const done = v => {
      if (settled) return;
      settled = true;
      dlg.removeEventListener('click', onClick); dlg.removeEventListener('close', onClose);
      if (dlg.open) dlg.close();
      res(v);
    };
    const onClick = e => { const b = e.target.closest('button[value]'); if (b) { e.preventDefault(); done(b.value === 'ok'); } };
    const onClose = () => done(false);
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('close', onClose);
    dlg.showModal();
    okBtn.focus();
  });
}
function download(name, data, type = 'text/plain') {
  const blob = new Blob([data], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- categories ---------- */
T.ICONS = ['cart', 'cup', 'car', 'home', 'bolt', 'repeat', 'bag', 'heart', 'ticket', 'plane', 'gift', 'book', 'paw', 'dots', 'coins'];
T.COLORS = ['#6fdca0', '#ffb86b', '#62e6f0', '#9d8cff', '#ffc857', '#ff7eb6', '#e6bd4e', '#ff6b6b', '#7aa7ff', '#5fd4c0', '#c792ea', '#9a94c9'];
const DEFAULT_CATS = [
  ['groceries', 'Groceries', '#6fdca0', 'cart', 'groceries grocery supermarket market continente pingo lidl aldi mercadona auchan intermarche minipreco bakery padaria'],
  ['dining', 'Eating out', '#ffb86b', 'cup', 'coffee cafe lunch dinner breakfast restaurant pizza burger sushi bar beer drinks takeaway ubereats glovo bolt-food snack'],
  ['transport', 'Transport', '#62e6f0', 'car', 'uber bolt taxi metro bus train cp fuel gas gasoline diesel petrol parking toll via-verde scooter'],
  ['home', 'Home & rent', '#9d8cff', 'home', 'rent mortgage furniture ikea cleaning repair hardware'],
  ['bills', 'Bills', '#ffc857', 'bolt', 'electricity water internet phone mobile insurance tax edp meo nos vodafone'],
  ['subs', 'Subscriptions', '#ff7eb6', 'repeat', 'netflix spotify disney hbo max prime youtube icloud dropbox github chatgpt claude adobe xbox playstation patreon'],
  ['shopping', 'Shopping', '#e6bd4e', 'bag', 'clothes shoes amazon zara fnac worten aliexpress electronics gift'],
  ['health', 'Health', '#ff6b6b', 'heart', 'pharmacy farmacia doctor dentist gym medicine hospital clinic'],
  ['leisure', 'Leisure', '#7aa7ff', 'ticket', 'cinema movie concert game games steam book books museum hobby'],
  ['travel', 'Travel', '#5fd4c0', 'plane', 'hotel flight airbnb booking trip holiday vacation'],
  ['other', 'Other', '#9a94c9', 'dots', ''],
];
T.cat = id => T.state.categories.find(c => c.id === id) || null;
T.catOf = e => e.kind === 'income' ? { id: '', name: 'Income', color: '#6fdca0', icon: 'trend-up' } : (T.cat(e.categoryId) || { id: '', name: 'Uncategorised', color: '#5d5887', icon: 'dots' });

/* ---------- the store ---------- */
const KEY = 'avalon_treasury_v1';
function blank() {
  return {
    v: 1,
    settings: { currency: 'EUR', coolOff: 14, budget: 0 },
    categories: DEFAULT_CATS.map(([id, name, color, ic, kw]) => ({ id, name, color, icon: ic, budget: 0, keywords: kw.split(' ').filter(Boolean) })),
    expenses: [], recurring: [], wishes: [],
  };
}
function normalise(d) {
  const b = blank();
  if (!d || typeof d !== 'object') return b;
  return {
    v: 1,
    settings: { ...b.settings, ...(d.settings || {}) },
    categories: Array.isArray(d.categories) ? d.categories : b.categories,
    expenses: Array.isArray(d.expenses) ? d.expenses : [],
    recurring: Array.isArray(d.recurring) ? d.recurring : [],
    wishes: Array.isArray(d.wishes) ? d.wishes : [],
  };
}
T.storage = 'ok';
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return normalise(raw ? JSON.parse(raw) : null);
  } catch { T.storage = 'off'; return blank(); }
}
T.state = load();
T.isNew = (() => { try { return !localStorage.getItem(KEY); } catch { return true; } })();

const chan = 'BroadcastChannel' in window ? new BroadcastChannel('avalon_treasury') : null;
const tabId = uid();
T.save = what => {
  try { localStorage.setItem(KEY, JSON.stringify(T.state)); T.storage = 'ok'; }
  catch (e) { T.storage = e?.name === 'QuotaExceededError' ? 'full' : 'off'; toast('Could not save in this browser.', 'err'); }
  chan?.postMessage({ from: tabId, what });
  T.changed?.(what, true);
};
// another tab changed the books: reload and redraw
const reload = what => { T.state = load(); fmts.clear(); T.changed?.(what || 'external', false); };
chan?.addEventListener('message', e => { if (e.data?.from !== tabId) reload(e.data?.what); });
window.addEventListener('storage', e => { if (e.key === KEY && !chan) reload('external'); });

T.add = (list, obj) => { const x = { id: uid(), createdAt: new Date().toISOString(), ...obj }; T.state[list].push(x); return x; };
T.remove = (list, id) => { T.state[list] = T.state[list].filter(x => x.id !== id); };
T.replaceAll = data => { T.state = normalise(data); fmts.clear(); T.save('all'); };

/* ---------- numbers the views share ---------- */
T.inMonth = (key, kind = 'expense') => T.state.expenses.filter(e => e.kind === kind && monthKey(e.date) === key);
T.sum = list => list.reduce((a, e) => a + (e.amount || 0), 0);
T.budget = () => T.state.settings.budget || T.state.categories.reduce((a, c) => a + (c.budget || 0), 0);
T.byCat = list => {
  const m = new Map();
  for (const e of list) m.set(e.categoryId || '', (m.get(e.categoryId || '') || 0) + e.amount);
  return m;
};
/** Spend so far this month and where the month is heading at this pace. */
T.pace = (key = thisMonth()) => {
  const spent = T.sum(T.inMonth(key)), n = daysIn(key);
  const isNow = key === thisMonth(), past = key < thisMonth();
  const day = isNow ? new Date().getDate() : past ? n : 0;
  const projected = day ? Math.round(spent / day * n) : 0;
  return { spent, day, days: n, left: n - day, projected: isNow ? projected : spent, budget: T.budget() };
};
/** Monthly cost of a recurring item. */
T.monthly = r => r.every === 'week' ? Math.round(r.amount * 52 / 12) : r.every === 'year' ? Math.round(r.amount / 12) : r.amount;

/* ---------- wishes ---------- */
T.PRIORITY = { need: { label: 'Need', rank: 0 }, want: { label: 'Want', rank: 1 }, dream: { label: 'Dream', rank: 2 } };
T.coolLeft = w => Math.max(0, (T.state.settings.coolOff || 0) - dayDiff(String(w.createdAt).slice(0, 10), today()));
T.progress = w => w.price ? clamp((w.saved || 0) / w.price, 0, 1) : 0;
/** How much a month to have it by the target date. */
T.perMonth = w => {
  if (!w.target || !w.price) return 0;
  const months = Math.max(1, (parseDay(w.target) - new Date()) / (864e5 * 30.44));
  return Math.max(0, Math.ceil((w.price - (w.saved || 0)) / months));
};
T.priceChange = w => {
  const p = w.prices || [];
  if (p.length < 2) return 0;
  return (p[p.length - 1].price - p[0].price) / p[0].price;
};
/** "amazon.es/Apple-AirPods-Pro-2/dp/…" → "Apple AirPods Pro 2". */
T.nameFromUrl = u => {
  try {
    const parts = new URL(u).pathname.split('/').filter(Boolean)
      .map(p => decodeURIComponent(p).replace(/\.(html?|php|aspx?)$/i, ''))
      .filter(p => /[a-z]{3}/i.test(p) && /[-_ ]/.test(p) && !/^(dp|p|product|products|item|itm|gp)$/i.test(p));
    const best = parts.sort((a, b) => b.length - a.length)[0];
    if (!best) return '';
    return best.replace(/[-_+]+/g, ' ').replace(/\b[a-z0-9]{10,}\b/gi, '').replace(/\s+/g, ' ').trim().replace(/^./, c => c.toUpperCase()).slice(0, 80);
  } catch { return ''; }
};

/* ---------- recurring: post what has come due ---------- */
T.postDue = () => {
  const t = today(), posted = [];
  for (const r of T.state.recurring) {
    if (!r.active || !r.next) continue;
    let guard = 0;
    while (r.next <= t && guard++ < 60) {
      posted.push(T.add('expenses', { kind: 'expense', amount: r.amount, categoryId: r.categoryId, note: r.name, date: r.next, recurringId: r.id }));
      r.next = nextDate(r.next, r.every, r.day);
    }
  }
  if (posted.length) T.save('expenses');
  return posted;
};

/* ---------- quick entry: "12.50 coffee #dining yesterday" ---------- */
const AMOUNT = /^([+-]?)(?:[€$£¥]|r\$|chf)?\s?(\d[\d.,]*)(?:\s?(?:€|eur|usd|\$|£|gbp|¥))?$/i;
function lastWeekday(name) {
  const want = DAYS.findIndex(d => d.startsWith(name));
  const d = new Date();
  for (let i = 0; i < 7; i++) { if (d.getDay() === want) return iso(d); d.setDate(d.getDate() - 1); }
  return today();
}
function guessCat(words) {
  const ws = words.map(fold);
  // what you filed the same note under before wins over the built-in keywords
  const first = ws.join(' ');
  if (first) {
    const past = [...T.state.expenses].reverse().find(e => e.kind === 'expense' && e.categoryId && fold(e.note) === first)
      || [...T.state.expenses].reverse().find(e => e.kind === 'expense' && e.categoryId && fold(e.note).split(' ')[0] === ws[0]);
    if (past && T.cat(past.categoryId)) return { id: past.categoryId, how: 'history' };
  }
  for (const c of T.state.categories) {
    if ((c.keywords || []).some(k => ws.includes(fold(k)))) return { id: c.id, how: 'keyword' };
    if (ws.includes(fold(c.name))) return { id: c.id, how: 'name' };
  }
  return null;
}
T.parse = text => {
  const out = { kind: 'expense', amount: NaN, categoryId: '', note: '', date: today(), wish: false, url: '', how: '' };
  let s = String(text || '').trim();
  if (!s) return out;
  if (/^(wish|want|\*)\s*/i.test(s)) { out.wish = true; s = s.replace(/^(wish|want|\*)\s*:?\s*/i, ''); }
  const words = [];
  for (const tok of s.split(/\s+/)) {
    const lo = fold(tok);
    let m;
    if (/^https?:\/\//i.test(tok)) { out.url = tok; continue; }
    if (Number.isNaN(out.amount) && (m = tok.match(AMOUNT))) {
      out.amount = T.toCents(m[2]);
      if (m[1] === '+') out.kind = 'income';
      continue;
    }
    if (tok.startsWith('#') && tok.length > 1) {
      const q = fold(tok.slice(1));
      const c = T.state.categories.find(c => fold(c.name).replace(/\s|&/g, '').startsWith(q) || c.id.startsWith(q));
      if (c) { out.categoryId = c.id; out.how = 'tag'; continue; }
      if (/^(income|salary|in)$/.test(q)) { out.kind = 'income'; continue; }
    }
    if (lo === 'today') { out.date = today(); continue; }
    if (lo === 'yesterday' || lo === 'ontem') { out.date = addDays(today(), -1); continue; }
    if (lo.length >= 3 && DAYS.some(d => d.startsWith(lo))) { out.date = lastWeekday(lo); continue; }
    if ((m = tok.match(/^(\d{4})-(\d{2})-(\d{2})$/))) { out.date = tok; continue; }
    if ((m = tok.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/))) {
      const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
      const d = new Date(y, +m[2] - 1, +m[1]);
      if (!Number.isNaN(d.getTime())) { out.date = iso(d); continue; }
    }
    words.push(tok);
  }
  out.note = words.join(' ');
  if (!out.wish && out.kind === 'expense' && !out.categoryId) {
    const g = guessCat(words);
    if (g) { out.categoryId = g.id; out.how = g.how; }
  }
  if (out.wish && !out.note && out.url) out.note = T.nameFromUrl(out.url) || host(out.url);
  return out;
};
