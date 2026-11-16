/* =====================================================================
   AVALON RESEARCH — shared helpers
   Plain classic scripts (no modules: they are unreliable on file:// in
   Zen/Firefox). Every Research file hangs its parts off window.R.
   ===================================================================== */
'use strict';

const R = window.R = { views: {} };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? u : '#';
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}" /></svg>`;
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Same URL identity rule as Avalon Search, so "the same page" means the same thing in both. */
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

/** Drops tracking parameters (utm_*, fbclid…) so saved links and citations stay clean. */
function cleanUrl(u) {
  try {
    const x = new URL(u);
    [...x.searchParams.keys()].forEach(k => { if (/^(utm_|fbclid$|gclid$|mc_eid$|mc_cid$|igshid$|si$)/i.test(k)) x.searchParams.delete(k); });
    return x.toString();
  } catch { return u; }
}

/* ---------- dates ----------
   Publish dates are often partial, so they are stored as "YYYY", "YYYY-MM" or
   "YYYY-MM-DD". Everything else uses ISO timestamps. */
const PARTIAL_DATE = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function parts(d) {
  const m = String(d || '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  return m ? { y: +m[1], m: m[2] ? +m[2] : 0, d: m[3] ? +m[3] : 0 } : null;
}
function fmtDate(d) {
  const p = parts(d);
  if (!p) return '';
  if (!p.m) return String(p.y);
  if (!p.d) return `${MONTHS[p.m - 1].slice(0, 3)} ${p.y}`;
  return `${MONTHS[p.m - 1].slice(0, 3)} ${p.d}, ${p.y}`;
}
function ago(t) {
  const s = Math.max(0, (Date.now() - new Date(t).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(new Date(t).toISOString().slice(0, 10));
}
function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}

function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

/* ---------- feedback ---------- */
function toast(html, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = html;
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 220); }, kind === 'err' ? 4200 : 2600);
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
  // resolved from the clicks themselves; the dialog's close event is only a fallback (Esc)
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
  const blob = data instanceof Blob ? data : new Blob([data], { type: `${type};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30e3);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    return ok;
  }
}

/** Filename-safe slug. */
const slug = s => String(s || 'investigation').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'investigation';

/* ---------- per-browser UI preferences (layout sizes, filters, formats) ---------- */
R.ui = (() => { try { return JSON.parse(localStorage.getItem('avalon_research_ui')) || {}; } catch { return {}; } })();
R.saveUi = debounce(() => { try { localStorage.setItem('avalon_research_ui', JSON.stringify(R.ui)); } catch { } }, 300);

/* ---------- shared vocabularies ---------- */
R.TYPES = {
  company: { label: 'Company', icon: 'building' },
  person: { label: 'Person', icon: 'user' },
  topic: { label: 'Topic', icon: 'book' },
  custom: { label: 'Custom', icon: 'shapes' },
};
R.STATUS = {
  active: { label: 'Active', cls: 'ok' },
  paused: { label: 'Paused', cls: 'warn' },
  closed: { label: 'Closed', cls: 'off' },
};
R.SOURCE_TYPES = {
  article: { label: 'Article', icon: 'newspaper' },
  website: { label: 'Website', icon: 'globe' },
  document: { label: 'Document', icon: 'file' },
  social: { label: 'Social post', icon: 'message' },
  official: { label: 'Official record', icon: 'landmark' },
  video: { label: 'Video', icon: 'video' },
  other: { label: 'Other', icon: 'shapes' },
};
/** Kinds of entity (people, organisations…) and their colour on the board. */
R.ENTITY_KINDS = {
  person: { label: 'Person', icon: 'user', color: '#62e6f0' },
  organisation: { label: 'Organisation', icon: 'building', color: '#e6bd4e' },
  place: { label: 'Place', icon: 'pin', color: '#6fdca0' },
  event: { label: 'Event', icon: 'calendar', color: '#ffc857' },
  document: { label: 'Document', icon: 'file', color: '#b27bff' },
  other: { label: 'Other', icon: 'shapes', color: '#9a94c9' },
};
/** 0 = not assessed yet; 1–5 from unreliable to authoritative. */
R.RELIABILITY = ['Unverified', 'Unreliable', 'Questionable', 'Mixed', 'Reliable', 'Authoritative'];
R.relBar = n => `<span class="rel rel-${n}" title="${R.RELIABILITY[n]}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
