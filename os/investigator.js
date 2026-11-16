/* =====================================================================
   AVALON INVESTIGATOR — an iron soldier of Avalon in a detective's coat
   Same family as the golden guardian on the home page (block helmet,
   dark visor, glowing eyes) but in steel, with a felt hat, a trench coat,
   a notebook and a brass magnifying glass.

   AvalonInvestigator.desk(el, opts) builds a sprite plus a status line:
     desk.do('search' | 'write' | 'found' | 'think' | 'wave' | 'idle', { hold })
     desk.say(text)      typed-out status line
     desk.set(text)      instant status line (for fast-changing progress)
     desk.mood('ok' | 'warn' | 'hot')
   One shared 10 fps ticker drives every sprite; it pauses when the tab is
   hidden or the sprite is off screen, and respects reduced motion.
   ===================================================================== */
(() => {
  'use strict';
  const W = 40, H = 28;
  const C = {
    L: '#e3e8f2', G: '#a9b2c6', D: '#69718a', V: '#141230',
    hat: '#4a3b30', hatHi: '#62503f', hatDk: '#352a22', band: '#1c1626',
    coat: '#b48a55', coatHi: '#caa06a', coatDk: '#8a6a40', shirt: '#e9e6ff', tie: '#8e3b46', belt: '#3d2c1f', buckle: '#e6bd4e',
    legL: '#c3cad8', legD: '#7b8399', boot: '#2a2433',
    cover: '#7a2f3a', page: '#efe7d2', ink: '#8f8670', pencil: '#f7dc84', lead: '#3a3040',
    ring: '#e6bd4e', ringDk: '#b2892c', handle: '#5b3d24', glass: 'rgba(98, 230, 240, .28)',
  };
  const EYE = { ok: '#62e6f0', warn: '#ffc857', hot: '#ff6b6b' };
  const LENS_RING = [[-1, -2], [0, -2], [1, -2], [-2, -1], [2, -1], [-2, 0], [2, 0], [-2, 1], [2, 1], [-1, 2], [0, 2], [1, 2]];
  const RUN = { found: 16, write: 20, wave: 14 };   // one-shot actions (ticks); others loop until replaced

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sprites = new Set();
  let timer = null;
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => { const s = e.target._inv; if (s) s.visible = e.isIntersecting; }))
    : null;
  function tick() {
    if (document.hidden) return;
    for (const s of sprites) {
      if (!s.cv.isConnected) { sprites.delete(s); io?.unobserve(s.cv); continue; }   // its page section was redrawn
      if (s.visible) s.step();
    }
    if (!sprites.size) { clearInterval(timer); timer = null; }
  }
  function ensureTimer() {
    if (reduced.matches) { clearInterval(timer); timer = null; return; }
    if (!timer && sprites.size) timer = setInterval(tick, 100);
  }
  reduced.addEventListener?.('change', ensureTimer);

  function sprite(cv) {
    const c = cv.getContext('2d');
    const s = { cv, visible: true, f: Math.floor(Math.random() * 40), t: 0, act: 'idle', hold: false, mood: 'ok', sparks: [] };
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

    function draw() {
      const { f, t, act } = s;
      c.clearRect(0, 0, W, H);
      const bx = 11;
      let by = 10;
      if (act === 'found') by -= [0, 2, 3, 3, 2, 1, 0][Math.min(t, 6)];
      else if (act === 'write') by += t % 8 < 4 ? 1 : 0;
      else if (f % 40 >= 20) by += 1;                        // slow idle bob

      // legs and boots
      const tuck = act === 'found' && t > 0 && t < 6 ? 1 : 0;
      px(bx + 4, by + 12, 1, 2 - tuck, C.legL); px(bx + 5, by + 12, 1, 2 - tuck, C.legD);
      px(bx + 12, by + 12, 1, 2 - tuck, C.legL); px(bx + 13, by + 12, 1, 2 - tuck, C.legD);
      px(bx + 3, by + 14 - tuck, 3, 1, C.boot); px(bx + 12, by + 14 - tuck, 3, 1, C.boot);

      // trench coat, rows 7–11, with the collar turned up against the helmet
      for (let r = 7; r <= 11; r++) {
        const x0 = r >= 10 ? bx + 1 : bx, x1 = r >= 10 ? bx + 16 : bx + 17;
        px(x0, by + r, x1 - x0 + 1, 1, C.coat);
        px(x0, by + r, 1, 1, C.coatHi);
        px(x1, by + r, 1, 1, C.coatDk);
      }
      px(bx, by + 5, 1, 2, C.coatHi); px(bx + 17, by + 5, 1, 2, C.coatDk);   // popped collar
      px(bx + 1, by + 6, 1, 1, C.coat); px(bx + 16, by + 6, 1, 1, C.coat);
      px(bx + 8, by + 7, 2, 1, C.shirt);                     // collar opening
      px(bx + 7, by + 7, 1, 2, C.coatDk); px(bx + 10, by + 7, 1, 2, C.coatDk);   // lapels
      px(bx + 8, by + 8, 2, 1, C.tie);
      px(bx, by + 9, 18, 1, C.belt); px(bx + 8, by + 9, 2, 1, C.buckle);
      px(bx + 9, by + 10, 1, 2, C.coatDk);                    // coat split

      // helmet (steel) with visor, rows 0–6
      px(bx + 2, by, 14, 1, C.G); px(bx + 2, by, 2, 1, C.L); px(bx + 15, by, 1, 1, C.D);
      for (let r = 1; r <= 5; r++) { px(bx + 1, by + r, 1, 1, r < 3 ? C.L : C.G); px(bx + 2, by + r, 14, 1, C.V); px(bx + 16, by + r, 1, 1, C.D); }
      px(bx + 2, by + 6, 14, 1, C.D); px(bx + 2, by + 6, 1, 1, C.G);
      px(bx + 3, by + 1, 3, 1, '#262356');                   // visor sheen

      // eyes: blink, look at the lens while searching, down at the notebook while writing, smile when waving
      const eye = EYE[s.mood];
      const look = act === 'search' ? 1 : act === 'write' ? -1 : 0;
      const blink = act !== 'write' && f % 53 < 2;
      for (const ex of [bx + 5, bx + 11]) {
        if (act === 'wave' || (act === 'found' && t > 6)) { px(ex, by + 2, 2, 1, eye); px(ex - 1, by + 3, 1, 1, eye); px(ex + 2, by + 3, 1, 1, eye); continue; }
        if (blink) { px(ex + look, by + 4, 2, 1, eye); continue; }
        const top = act === 'write' ? by + 3 : by + 2;
        px(ex + look, top, 2, by + 5 - top, eye);
        px(ex + look, top, 1, 1, '#e6fdff');
      }

      // felt fedora: pinched crown, dark band, wide brim
      px(bx + 5, by - 5, 8, 1, C.hat); px(bx + 8, by - 5, 2, 1, C.hatDk);
      px(bx + 4, by - 4, 10, 1, C.hat); px(bx + 4, by - 4, 1, 1, C.hatHi); px(bx + 8, by - 4, 2, 1, C.hatDk);
      px(bx + 4, by - 3, 10, 1, C.hat); px(bx + 4, by - 3, 1, 1, C.hatHi);
      px(bx + 4, by - 2, 10, 1, C.band); px(bx + 11, by - 2, 1, 1, C.buckle);
      px(bx, by - 1, 18, 1, C.hat); px(bx, by - 1, 3, 1, C.hatHi); px(bx + 15, by - 1, 3, 1, C.hatDk);

      // notebook in the left hand
      const nx = bx - 7, ny = by + 7;
      px(nx, ny, 6, 4, C.page); px(nx + 3, ny, 1, 4, '#d8cdb2');
      px(nx, ny + 4, 6, 1, C.cover);
      const lines = act === 'write' ? Math.min(6, Math.floor(t / 3)) : 3;
      for (let i = 0; i < lines; i++) px(nx + 1 + (i % 2) * 3, ny + 1 + Math.floor(i / 2), 2, 1, C.ink);
      px(bx - 1, by + 8, 1, 2, C.coat);                      // sleeve
      if (act === 'write') {
        const p = t % 6, x = nx + 1 + (p < 3 ? p : 5 - p);
        px(x + 1, ny - 3, 1, 2, C.pencil); px(x, ny - 1, 1, 1, C.lead);
      }

      // magnifying glass in the right hand
      if (act !== 'write') {
        let cx = bx + 21, cy = by + 5;
        if (act === 'search') { cx += [0, 1, 2, 2, 1, 0, -1, -1][f % 8]; cy += [0, -1, -1, 0, 1, 1, 0, -1][f % 8] - 1; }
        else if (act === 'wave') cy -= [0, 2, 3, 2, 0, 2, 3, 2, 0][Math.min(8, t % 9)];
        else if (act === 'found') { cx -= 1; cy -= 3; }
        px(bx + 17, by + 8, 1, 2, C.coat);                     // sleeve
        px(bx + 18, by + 9, 1, 1, C.G);                        // gauntlet
        // handle from the hand to the lens
        const hx0 = bx + 18, hy0 = by + 8, hx1 = cx - 1, hy1 = cy + 3, n = Math.max(Math.abs(hx1 - hx0), Math.abs(hy1 - hy0), 1);
        for (let i = 0; i <= n; i++) px(hx0 + (hx1 - hx0) * i / n, hy0 + (hy1 - hy0) * i / n, 1, 1, C.handle);
        px(cx - 1, cy - 1, 3, 3, C.glass);
        if (act === 'search' && f % 4 < 2) px(cx, cy, 1, 1, EYE.ok);   // something caught in the lens
        LENS_RING.forEach(([dx, dy], i) => px(cx + dx, cy + dy, 1, 1, i > 8 ? C.ringDk : C.ring));
        if (act === 'search' || f % 60 < 6) px(cx - 1, cy - 1, 1, 1, '#ffffff');
      }

      // thinking dots / found mark
      if (act === 'think') for (let i = 0; i < 3; i++) if (f % 18 >= i * 5) px(bx + 18 + i * 2, by - 3 - i * 2, 1 + (i > 1), 1 + (i > 1), C.ring);
      if (act === 'found' && t > 1) { px(bx + 20, by - 7, 2, 4, C.ring); px(bx + 20, by - 2, 2, 1, C.ring); }

      for (const p of s.sparks) {
        c.globalAlpha = Math.max(0, p.life / 12);
        px(p.x, p.y, 1, 1, p.col);
        if (p.life > 7) { px(p.x - 1, p.y, 1, 1, p.col); px(p.x + 1, p.y, 1, 1, p.col); px(p.x, p.y - 1, 1, 1, p.col); px(p.x, p.y + 1, 1, 1, p.col); }
      }
      c.globalAlpha = 1;
    }

    s.step = () => {
      s.f++; s.t++;
      if (!s.hold && RUN[s.act] && s.t > RUN[s.act]) { s.act = 'idle'; s.t = 0; }
      s.sparks.forEach(p => { p.y -= .3; p.life--; });
      s.sparks = s.sparks.filter(p => p.life > 0);
      draw();
    };
    s.do = (act, { hold = false } = {}) => {
      s.act = act; s.t = 0; s.hold = hold;
      if (act === 'found') for (let i = 0; i < 6; i++) s.sparks.push({ x: 6 + Math.random() * 30, y: 2 + Math.random() * 12, life: 9 + Math.random() * 6, col: i % 2 ? '#f7dc84' : '#62e6f0' });
      if (reduced.matches) draw();
    };
    s.setMood = m => { if (EYE[m]) { s.mood = m; draw(); } };
    cv._inv = s;
    io?.observe(cv);
    sprites.add(s);
    ensureTimer();
    draw();
    return s;
  }

  /* ---------- desk: sprite + name + typed status line ---------- */
  const QUIPS = ['On the case.', 'Every claim needs a source.', 'Follow the paper trail.', 'Two sources beat one.',
    'Dates first, then motives.', 'Noted. Carry on.', 'Check the primary source.', 'Nothing escapes the lens.'];

  function desk(el, { name = 'Investigator', size = '', text = 'Ready.' } = {}) {
    if (!el) return null;
    el.classList.add('inv-desk');
    if (size) el.classList.add(`inv-${size}`);
    el.innerHTML = `
      <canvas class="inv-cv" width="${W}" height="${H}" role="img" aria-label="${name}, an Avalon iron soldier in a detective's coat"></canvas>
      <div class="inv-txt"><b class="inv-name">${name}</b><span class="inv-say" aria-live="polite"></span></div>`;
    const s = sprite(el.querySelector('canvas'));
    const line = el.querySelector('.inv-say');
    let typing = null, moodT = null;

    function set(txt) { clearInterval(typing); typing = null; line.textContent = txt; line.classList.remove('typing'); }
    function say(txt) {
      if (reduced.matches || !txt) return set(txt);
      clearInterval(typing);
      let i = 0;
      line.textContent = '';
      line.classList.add('typing');
      typing = setInterval(() => {
        i += Math.max(1, Math.round(txt.length / 40));       // long lines type faster
        line.textContent = txt.slice(0, i);
        if (i >= txt.length) { clearInterval(typing); typing = null; line.classList.remove('typing'); }
      }, 22);
    }
    function mood(m, ms = 0) {
      clearTimeout(moodT);
      s.setMood(m);
      if (ms) moodT = setTimeout(() => s.setMood('ok'), ms);
    }
    el.querySelector('canvas').addEventListener('click', () => {
      s.do(Math.random() < .5 ? 'wave' : 'found');
      say(QUIPS[Math.floor(Math.random() * QUIPS.length)]);
    });
    set(text);
    return { do: s.do, say, set, mood, sprite: s };
  }

  window.AvalonInvestigator = { desk, sprite };
})();
