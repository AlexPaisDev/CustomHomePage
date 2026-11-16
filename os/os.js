/* =====================================================================
   AVALON OS LAYER — shared by every Avalon page
   - App switcher (Home · Search · Research) with a sliding indicator
   - Animated hand-over between apps: links to another app and
     AvalonOS.go(url) play the exit, the next page plays the arrival
   - "G then H / S / R" jumps between apps from the keyboard
   The arrival is detected before first paint by the small inline script
   in each page's <head>: the link carries "#~os:<from>" (removed again
   at once), with a localStorage note as a second channel. The hash is
   what makes it work on file://, where Zen keeps storage per file.
   ===================================================================== */
(() => {
  'use strict';
  const APPS = [
    { k: 'home', file: 'index.html', label: 'Home', key: 'h' },
    { k: 'search', file: 'results.html', label: 'Search', key: 's' },
    { k: 'research', file: 'research.html', label: 'Research', key: 'r' },
  ];
  const NAV_KEY = 'avalon_os_nav';
  const root = document.documentElement;
  const here = root.dataset.app || '';
  const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dirOf = p => p.slice(0, p.lastIndexOf('/') + 1);

  /** Which Avalon app a URL opens (only pages next to this one count). */
  function appOf(url) {
    try {
      const u = new URL(url, location.href);
      if (u.protocol !== location.protocol || u.host !== location.host || dirOf(u.pathname) !== dirOf(location.pathname)) return null;
      const file = u.pathname.slice(u.pathname.lastIndexOf('/') + 1) || 'index.html';
      return APPS.find(a => a.file === file) || null;
    } catch { return null; }
  }

  /* ---------- switcher indicator ---------- */
  const nav = document.querySelector('.os-apps');
  const idx = k => Math.max(0, APPS.findIndex(a => a.k === k));
  function point(k, instant = false) {
    if (!nav) return;
    if (instant) {
      nav.style.setProperty('--i', idx(k));
      nav.classList.add('os-still');
      void nav.offsetWidth;
      nav.classList.remove('os-still');
    } else nav.style.setProperty('--i', idx(k));
  }

  /* ---------- leaving ---------- */
  const LEAVE_MS = 950;                 // matches the curtain choreography in os.css
  const MARK = `<svg viewBox="0 0 250 108" aria-hidden="true">
      <defs><linearGradient id="os-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7dc84" /><stop offset=".55" stop-color="#e6bd4e" /><stop offset="1" stop-color="#b2892c" /></linearGradient></defs>
      <g fill="url(#os-g)"><path class="t1" d="M0 108 58 0l58 108z" /><path class="t2" d="M66 0h118l-59 108z" /><path class="t3" d="M134 108 192 0l58 108z" /></g>
      <g fill="#62e6f0"><circle class="d1" cx="58" cy="72" r="7" /><circle class="d2" cx="125" cy="36" r="7" /><circle class="d3" cx="192" cy="72" r="7" /></g>
    </svg>`;
  let leaving = false, curtain = null;

  /** base64url of UTF-8 JSON, for passing data along in the link */
  const pack = v => btoa(unescape(encodeURIComponent(JSON.stringify(v)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  /** Settings to hand over: live on the home page, otherwise the copy this app was given. Never secrets. */
  function sharedConfig() {
    try { return api.config ? api.config() : JSON.parse(localStorage.getItem('avalon_shared_cfg'))?.cfg || null; } catch { return null; }
  }
  /** Link to another app, carrying where we came from, the shared settings and any extra payload. */
  function linkTo(url, extra = {}) {
    const target = new URL(url, location.href);
    if (target.hash) return target.href;
    const cfg = sharedConfig();
    let h = `~os:${here}`;
    if (cfg) h += `~cfg:${pack(cfg)}`;
    for (const [k, v] of Object.entries(extra)) h += `~${k}:${pack(v)}`;
    target.hash = h;
    return target.href;
  }

  function go(url, extra = {}) {
    const app = appOf(url);
    if (!app || app.k === here) { location.href = url; return; }
    const href = linkTo(url, extra);
    if (calm()) { location.href = href; return; }
    if (leaving) return;
    leaving = true;
    try { localStorage.setItem(NAV_KEY, JSON.stringify({ to: app.k, from: here, at: Date.now() })); } catch { }
    curtain = document.createElement('div');
    curtain.className = 'os-curtain';
    curtain.setAttribute('aria-hidden', 'true');
    curtain.innerHTML = `${MARK}<div class="os-curtain-label">${app.label}</div><div class="os-curtain-line"></div>`;
    document.body.appendChild(curtain);
    root.classList.remove('os-arrive', 'os-arrived');
    root.classList.add('os-leave');
    point(app.k);
    setTimeout(() => { location.href = href; }, LEAVE_MS);
  }

  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const app = appOf(a.href);
    if (!app || app.k === here) return;
    e.preventDefault();
    go(a.href);
  });

  // back/forward cache: a page restored after we left it must not keep the exit state
  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    leaving = false;
    curtain?.remove(); curtain = null;
    root.classList.remove('os-leave', 'os-arrive', 'os-arrived');
    point(here, true);
  });

  /* ---------- arriving ---------- */
  if (root.classList.contains('os-arrive')) {
    point(root.dataset.osFrom || here, true);
    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      root.classList.add('os-arrived');
      document.body.classList.add('os-enter');
      document.dispatchEvent(new CustomEvent('avalon:arrive'));
      point(here);
      setTimeout(() => {
        root.classList.remove('os-arrive', 'os-arrived');
        document.body.classList.remove('os-enter');
      }, 1100);
    };
    // hold the finished frame a beat once the page has drawn, then dissolve;
    // the timeout covers hidden or throttled tabs
    const t = setTimeout(reveal, 260);
    requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); setTimeout(reveal, 120); }));
  } else point(here, true);

  /* ---------- keyboard: G then H / S / R ---------- */
  let gAt = 0;
  window.addEventListener('keydown', e => {
    const a = document.activeElement;
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(a?.tagName) || a?.isContentEditable;
    if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    const k = e.key.toLowerCase();
    if (k === 'g' && !e.repeat) { gAt = Date.now(); return; }
    if (Date.now() - gAt > 900) return;
    const app = APPS.find(x => x.key === k);
    if (!app) return;
    gAt = 0;
    e.preventDefault(); e.stopImmediatePropagation();
    if (app.k !== here) go(app.file);
  }, true);

  /** Decode a payload the head script found in the link (e.g. arrival.extra.save). */
  const unpack = s => { try { return JSON.parse(decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; } };
  const arrival = window.AvalonArrival || { from: null, extra: {} };
  const api = window.AvalonOS = { go, appOf, here, linkTo, unpack, arrival, config: null, apps: APPS.map(a => ({ ...a })) };
})();
