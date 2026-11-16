/* =====================================================================
   AVALON ACCOUNTANT — an iron soldier of Avalon who keeps the books
   Same family as the investigator (steel block helmet, dark visor,
   glowing eyes) but dressed for the counting house: a green eyeshade
   with a pencil behind it, rolled shirt sleeves with red garters, a
   blue waistcoat with a gold watch chain, a ledger and an abacus.

   AvalonAccountant.desk(el, opts) builds a sprite plus a status line:
     desk.do('count' | 'write' | 'found' | 'think' | 'wave' | 'idle', { hold })
     desk.say(text)      typed-out status line
     desk.set(text)      instant status line
     desk.mood('ok' | 'warn' | 'hot', ms?)
     desk.coins(0..4)    height of the coin stack at his feet (savings)
   One shared 10 fps ticker drives every sprite; it pauses when the tab is
   hidden or the sprite is off screen, and respects reduced motion.
   ===================================================================== */
(() => {
  'use strict';
  const W = 40, H = 28;
  const C = {
    L: '#e3e8f2', G: '#a9b2c6', D: '#69718a', V: '#141230',
    shade: 'rgba(84, 226, 150, .62)', shadeHi: '#9af5c4', strap: '#1f6b45',
    shirt: '#e9e6ff', shirtDk: '#bdb8e6', garter: '#d2424f',
    vest: '#2c4196', vestHi: '#4158c0', vestDk: '#1d2c6b', button: '#f7dc84', chain: '#e6bd4e', tie: '#8e3b46',
    legL: '#9aa2b8', legD: '#5f667e', boot: '#2a2433',
    cover: '#2f6b4a', coverDk: '#1f4a33', page: '#efe7d2', ink: '#8f8670', red: '#c4515b',
    quill: '#f4f1ff', quillDk: '#b9b3dc', nib: '#3a3040', pencil: '#f7dc84',
    frame: '#7a4c28', frameDk: '#56331a', rod: '#8d7e6c', bead: '#e6bd4e', bead2: '#62e6f0',
    coin: '#e6bd4e', coinHi: '#f7dc84', coinDk: '#b2892c',
  };
  const EYE = { ok: '#62e6f0', warn: '#ffc857', hot: '#ff6b6b' };
  const RUN = { found: 16, write: 20, wave: 14 };   // one-shot actions (ticks); others loop until replaced
  const SLOTS = 8, BEADS = 4;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const sprites = new Set();
  let timer = null;
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => { const s = e.target._acc; if (s) s.visible = e.isIntersecting; }))
    : null;
  function tick() {
    if (document.hidden) return;
    for (const s of sprites) {
      if (!s.cv.isConnected) { sprites.delete(s); io?.unobserve(s.cv); continue; }
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
    const s = { cv, visible: true, f: Math.floor(Math.random() * 40), t: 0, act: 'idle', hold: false, mood: 'ok', sparks: [], beads: [1, 3], rod: 0, stack: 0 };
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

    function abacus(x0, y0) {
      px(x0, y0, 10, 1, C.frame); px(x0, y0 + 6, 10, 1, C.frameDk);
      px(x0, y0, 1, 7, C.frame); px(x0 + 9, y0, 1, 7, C.frameDk);
      px(x0 + 1, y0 + 3, 8, 1, C.frameDk);                     // middle bar
      [y0 + 1, y0 + 4].forEach((ry, r) => {
        px(x0 + 1, ry + 1, SLOTS, 1, C.rod);
        const left = s.beads[r];
        for (let i = 0; i < BEADS; i++) {
          const bx = i < left ? x0 + 1 + i : x0 + 1 + SLOTS - (BEADS - i);
          px(bx, ry, 1, 2, r ? C.bead2 : C.bead);
        }
      });
    }

    function draw() {
      const { f, t, act } = s;
      c.clearRect(0, 0, W, H);
      const bx = 11;
      let by = 10;
      if (act === 'found') by -= [0, 2, 3, 3, 2, 1, 0][Math.min(t, 6)];
      else if (act === 'write') by += t % 8 < 4 ? 1 : 0;
      else if (f % 40 >= 20) by += 1;                        // slow idle bob

      // coin stack at his feet: what has been put aside
      for (let i = 0; i < s.stack; i++) {
        const cy = 25 - i * 2;
        px(4, cy, 5, 2, C.coin); px(4, cy, 5, 1, C.coinHi); px(8, cy, 1, 2, C.coinDk);
      }

      // trousers and boots
      const tuck = act === 'found' && t > 0 && t < 6 ? 1 : 0;
      px(bx + 4, by + 12, 1, 2 - tuck, C.legL); px(bx + 5, by + 12, 1, 2 - tuck, C.legD);
      px(bx + 12, by + 12, 1, 2 - tuck, C.legL); px(bx + 13, by + 12, 1, 2 - tuck, C.legD);
      px(bx + 3, by + 14 - tuck, 3, 1, C.boot); px(bx + 12, by + 14 - tuck, 3, 1, C.boot);

      // shirt, rows 7–11, with rolled sleeves and garters
      for (let r = 7; r <= 11; r++) {
        const x0 = r >= 10 ? bx + 2 : bx, x1 = r >= 10 ? bx + 15 : bx + 17;
        px(x0, by + r, x1 - x0 + 1, 1, C.shirt);
        px(x1, by + r, 1, 1, C.shirtDk);
      }
      px(bx, by + 8, 2, 1, C.garter); px(bx + 16, by + 8, 2, 1, C.garter);
      // waistcoat over it, open in a V at the collar
      for (let r = 7; r <= 11; r++) {
        const open = r === 7 ? 2 : r === 8 ? 1 : 0;
        px(bx + 3, by + r, 6 - open, 1, C.vest); px(bx + 9 + open, by + r, 6 - open, 1, C.vest);
        px(bx + 3, by + r, 1, 1, C.vestHi); px(bx + 14, by + r, 1, 1, C.vestDk);
      }
      px(bx + 3, by + 12, 2, 1, C.vestDk); px(bx + 13, by + 12, 2, 1, C.vestDk);   // waistcoat points
      px(bx + 8, by + 7, 2, 1, C.tie);                       // bow tie
      px(bx + 7, by + 7, 1, 1, C.tie); px(bx + 10, by + 7, 1, 1, C.tie);
      px(bx + 9, by + 9, 1, 1, C.button); px(bx + 9, by + 11, 1, 1, C.button);
      px(bx + 5, by + 10, 4, 1, C.chain); px(bx + 4, by + 10, 1, 1, C.coinHi);   // watch chain

      // helmet (steel) with visor, rows 0–6
      px(bx + 2, by, 14, 1, C.G); px(bx + 2, by, 2, 1, C.L); px(bx + 15, by, 1, 1, C.D);
      for (let r = 1; r <= 5; r++) { px(bx + 1, by + r, 1, 1, r < 3 ? C.L : C.G); px(bx + 2, by + r, 14, 1, C.V); px(bx + 16, by + r, 1, 1, C.D); }
      px(bx + 2, by + 6, 14, 1, C.D); px(bx + 2, by + 6, 1, 1, C.G);

      // eyes: look at the abacus while counting, down at the ledger while writing
      const eye = EYE[s.mood];
      const look = act === 'count' ? 1 : act === 'write' ? -1 : 0;
      const blink = act !== 'write' && f % 53 < 2;
      for (const ex of [bx + 5, bx + 11]) {
        if (act === 'wave' || (act === 'found' && t > 6)) { px(ex, by + 3, 2, 1, eye); px(ex - 1, by + 4, 1, 1, eye); px(ex + 2, by + 4, 1, 1, eye); continue; }
        if (blink) { px(ex + look, by + 4, 2, 1, eye); continue; }
        const top = act === 'write' ? by + 4 : by + 3;
        px(ex + look, top, 2, by + 5 - top, eye);
        px(ex + look, top, 1, 1, '#e6fdff');
      }

      // green eyeshade: strap round the helmet, translucent brim over the eyes, pencil behind it
      px(bx + 1, by - 1, 16, 1, C.strap);
      px(bx - 1, by + 1, 20, 1, C.shade); px(bx, by + 2, 18, 1, 'rgba(84, 226, 150, .22)');
      px(bx - 1, by + 1, 3, 1, C.shadeHi);
      px(bx + 16, by - 3, 1, 3, C.pencil); px(bx + 16, by - 4, 1, 1, C.nib);

      // ledger in the left hand
      const nx = bx - 8, ny = by + 7;
      px(nx, ny, 7, 4, C.page); px(nx + 3, ny, 1, 4, '#d8cdb2');
      px(nx, ny + 4, 7, 1, C.cover); px(nx - 1, ny, 1, 5, C.coverDk);
      px(nx + 1, ny, 1, 4, 'rgba(196, 81, 91, .55)');        // red margin rule
      const lines = act === 'write' ? Math.min(6, Math.floor(t / 3)) : 4;
      for (let i = 0; i < lines; i++) px(nx + (i % 2 ? 4 : 2), ny + Math.floor(i / 2) + 1, i % 2 ? 2 : 1, 1, C.ink);
      px(bx - 1, by + 8, 1, 2, C.shirt);                     // sleeve
      if (act === 'write') {                                 // quill scratching along the page
        const p = t % 6, x = nx + 1 + (p < 3 ? p : 5 - p);
        px(x + 2, ny - 4, 1, 3, C.quill); px(x + 3, ny - 5, 1, 3, C.quillDk); px(x + 1, ny - 1, 1, 1, C.nib);
      }

      // abacus in the right hand
      if (act !== 'write') {
        let ax = bx + 19, ay = by + 5;
        if (act === 'wave') ay -= [0, 2, 3, 2, 0, 2, 3, 2, 0][Math.min(8, t % 9)];
        else if (act === 'found') ay -= 2;
        else if (act === 'count') ay += f % 4 < 2 ? 0 : 1;
        px(bx + 17, by + 8, 1, 2, C.shirt);
        px(bx + 18, by + 9, 1, 1, C.G);                        // gauntlet
        abacus(Math.min(ax, W - 10), ay);
      }

      if (act === 'think') for (let i = 0; i < 3; i++) if (f % 18 >= i * 5) px(bx + 18 + i * 2, by - 3 - i * 2, 1 + (i > 1), 1 + (i > 1), C.coin);
      if (act === 'found' && t > 1) {                          // a gold coin pops up
        const cy = by - 6;
        px(bx + 7, cy, 4, 4, C.coin); px(bx + 7, cy, 4, 1, C.coinHi); px(bx + 10, cy, 1, 4, C.coinDk); px(bx + 8, cy + 1, 1, 2, C.coinHi);
      }

      for (const p of s.sparks) {
        c.globalAlpha = Math.max(0, p.life / 12);
        px(p.x, p.y, p.sz, p.sz, p.col);
      }
      c.globalAlpha = 1;
    }

    s.step = () => {
      s.f++; s.t++;
      if (!s.hold && RUN[s.act] && s.t > RUN[s.act]) { s.act = 'idle'; s.t = 0; }
      if (s.act === 'count' && s.f % 2 === 0) {                // flick one bead across, rod by rod
        const r = s.rod;
        s.beads[r] = (s.beads[r] + 1) % (BEADS + 1);
        if (s.beads[r] === 0 || Math.random() < .35) s.rod = 1 - r;
      }
      s.sparks.forEach(p => { p.y += p.vy; p.vy += .08; p.life--; });
      s.sparks = s.sparks.filter(p => p.life > 0);
      draw();
    };
    s.do = (act, { hold = false } = {}) => {
      s.act = act; s.t = 0; s.hold = hold;
      if (act === 'found') for (let i = 0; i < 7; i++) s.sparks.push({ x: 8 + Math.random() * 26, y: 4 + Math.random() * 8, vy: -.6 - Math.random() * .5, sz: i % 3 ? 1 : 2, life: 9 + Math.random() * 6, col: i % 2 ? '#f7dc84' : '#6fdca0' });
      if (reduced.matches) draw();
    };
    s.setMood = m => { if (EYE[m]) { s.mood = m; draw(); } };
    s.setStack = n => { s.stack = Math.max(0, Math.min(4, Math.round(n))); draw(); };
    cv._acc = s;
    io?.observe(cv);
    sprites.add(s);
    ensureTimer();
    draw();
    return s;
  }

  /* ---------- desk: sprite + name + typed status line ---------- */
  const QUIPS = ['Every cent accounted for.', 'The ledger balances.', 'Small leaks sink big ships.', 'Receipts, please.',
    'A wish is a budget line with patience.', 'Sleep on the big ones.', 'Counting twice, paying once.', 'Noted in ink.'];

  function desk(el, { name = 'Accountant', size = '', text = 'Ready.' } = {}) {
    if (!el) return null;
    el.classList.add('inv-desk', 'acc-desk');
    if (size) el.classList.add(`inv-${size}`);
    el.innerHTML = `
      <canvas class="inv-cv" width="${W}" height="${H}" role="img" aria-label="${name}, an Avalon iron soldier with an eyeshade, a ledger and an abacus"></canvas>
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
        i += Math.max(1, Math.round(txt.length / 40));
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
      s.do(['wave', 'found', 'count'][Math.floor(Math.random() * 3)]);
      if (s.act === 'count') setTimeout(() => s.act === 'count' && s.do('idle'), 1600);
      say(QUIPS[Math.floor(Math.random() * QUIPS.length)]);
    });
    set(text);
    return { do: s.do, say, set, mood, coins: s.setStack, sprite: s };
  }

  window.AvalonAccountant = { desk, sprite };
})();
