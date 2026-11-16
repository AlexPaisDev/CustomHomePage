/* =====================================================================
   AVALON TREASURY — small SVG charts, drawn as strings
   ring    the vault core: budget used, one arc per category
   burn    cumulative spend through the month against the budget pace
   spark   a price or spend trend
   bars    month-by-month columns (HTML, so the labels stay crisp)
   ===================================================================== */
'use strict';

T.charts = (() => {
  const f = n => Math.round(n * 10) / 10;

  /** segments: [{ value, color, label }] · total: the budget (0 = sum of the segments) */
  function ring(segments, total, { size = 260, stroke = 16, gap = 2.2 } = {}) {
    const r = (size - stroke) / 2 - 8, C = 2 * Math.PI * r, cx = size / 2;
    const sum = segments.reduce((a, s) => a + s.value, 0);
    const over = total > 0 && sum > total;
    const scale = Math.max(total || sum, sum) || 1;
    let at = 0;
    const arcs = segments.filter(s => s.value > 0).map((s, i) => {
      const len = Math.max(0, s.value / scale * C - gap);
      const el = `<circle class="rg-seg" cx="${cx}" cy="${cx}" r="${f(r)}" stroke="${s.color}" stroke-width="${stroke}"
        stroke-dasharray="${f(len)} ${f(C)}" stroke-dashoffset="${f(-at)}" style="--len:${f(len)};--d:${i * 70}ms"><title>${esc(s.label || '')}</title></circle>`;
      at += s.value / scale * C;
      return el;
    }).join('');
    const ticks = Array.from({ length: 60 }, (_, i) => {
      const a = i / 60 * Math.PI * 2 - Math.PI / 2, r1 = r + stroke / 2 + 5, r2 = r1 + (i % 5 ? 3 : 7);
      return `<line x1="${f(cx + Math.cos(a) * r1)}" y1="${f(cx + Math.sin(a) * r1)}" x2="${f(cx + Math.cos(a) * r2)}" y2="${f(cx + Math.sin(a) * r2)}" />`;
    }).join('');
    // where the budget would put you today, if it were spent evenly
    const p = T.pace();
    const paceA = p.days ? p.day / p.days * Math.PI * 2 - Math.PI / 2 : 0;
    const pr = r + stroke / 2 + 2;
    return `<svg class="rg ${over ? 'over' : ''}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <g class="rg-ticks">${ticks}</g>
      <circle class="rg-track" cx="${cx}" cy="${cx}" r="${f(r)}" stroke-width="${stroke}" />
      <g transform="rotate(-90 ${cx} ${cx})">${arcs}</g>
      <circle class="rg-inner" cx="${cx}" cy="${cx}" r="${f(r - stroke / 2 - 10)}" />
      ${total ? `<circle class="rg-pace" cx="${f(cx + Math.cos(paceA) * pr)}" cy="${f(cx + Math.sin(paceA) * pr)}" r="4" />` : ''}
    </svg>`;
  }

  /** daily: cents spent on each day of the month (index 0 = day 1).
      The SVG stretches to its box; the dot and day labels are HTML so they don't. */
  function burn(daily, { budget = 0, day = daily.length } = {}) {
    const n = daily.length, w = 1000, h = 200, padT = 8;
    const cum = []; daily.reduce((a, v, i) => (cum[i] = a + v), 0);
    const spent = day ? cum[day - 1] : 0;
    const projected = day ? spent / day * n : 0;
    const top = Math.max(budget, projected, cum[n - 1] || 0, 1) * 1.08;
    const X = i => (i / Math.max(1, n - 1)) * w;
    const Y = v => padT + (1 - v / top) * (h - padT);
    const upto = cum.slice(0, Math.max(day, 0));
    const line = upto.map((v, i) => `${i ? 'L' : 'M'}${f(X(i))} ${f(Y(v))}`).join(' ');
    const area = upto.length ? `${line} L${f(X(upto.length - 1))} ${h} L0 ${h} Z` : '';
    const grid = [.25, .5, .75, 1].map(q => `<line x1="0" x2="${w}" y1="${f(Y(top / 1.08 * q))}" y2="${f(Y(top / 1.08 * q))}" />`).join('');
    const hot = budget && projected > budget;
    const pct = (x, y) => `left:${f(x / w * 100)}%;top:${f(y / h * 100)}%`;
    return `<div class="burn ${hot ? 'hot' : ''}">
      <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="burn-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--burn)" stop-opacity=".35" /><stop offset="1" stop-color="var(--burn)" stop-opacity="0" /></linearGradient></defs>
        <g class="burn-grid">${grid}</g>
        ${budget ? `<line class="burn-pace" x1="0" y1="${h}" x2="${w}" y2="${f(Y(budget))}" /><line class="burn-cap" x1="0" x2="${w}" y1="${f(Y(budget))}" y2="${f(Y(budget))}" />` : ''}
        ${area ? `<path class="burn-area" d="${area}" />` : ''}
        ${line ? `<path class="burn-line" d="${line}" />` : ''}
        ${day && day < n ? `<line class="burn-proj" x1="${f(X(day - 1))}" y1="${f(Y(spent))}" x2="${w}" y2="${f(Y(projected))}" />` : ''}
      </svg>
      ${budget ? `<span class="burn-tag" style="${pct(w, Y(budget))}">${T.money(budget, { compact: true })}</span>` : ''}
      ${day ? `<span class="burn-now" style="${pct(X(day - 1), Y(spent))}" title="${T.money(spent)} so far"></span>` : ''}
      <div class="burn-days">${[1, 8, 15, 22, n].map(d => `<span style="left:${f(X(d - 1) / w * 100)}%">${d}</span>`).join('')}</div>
    </div>`;
  }

  function spark(values, { w = 120, h = 32, cls = '' } = {}) {
    if (values.length < 2) return '';
    const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
    const pts = values.map((v, i) => `${f(2 + i / (values.length - 1) * (w - 4))},${f(h - 3 - (v - lo) / span * (h - 6))}`);
    const last = pts[pts.length - 1].split(',');
    return `<svg class="tspark ${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${pts.join(' ')}" /><circle cx="${last[0]}" cy="${last[1]}" r="2.5" /></svg>`;
  }

  /** items: [{ label, value, hi?, title? }] */
  function bars(items, { cap = 0 } = {}) {
    const top = Math.max(cap, ...items.map(i => i.value), 1);
    return `<div class="bars">${items.map((it, i) => `
      <div class="bar ${it.hi ? 'hi' : ''} ${cap && it.value > cap ? 'over' : ''}" title="${esc(it.title || '')}">
        <span class="bar-v">${it.value ? T.money(it.value, { compact: true }) : ''}</span>
        <i style="--h:${f(it.value / top * 100)};--d:${i * 50}ms"></i>
        <span class="bar-l">${esc(it.label)}</span>
      </div>`).join('')}
      ${cap ? `<div class="bars-cap" style="--h:${f(cap / top * 100)}"><span>${T.money(cap, { compact: true })}</span></div>` : ''}
    </div>`;
  }

  /** Counts a number up when it first appears (data-count = cents). */
  function countUp(root) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    $$('[data-count]', root).forEach(el => {
      const to = +el.dataset.count, sign = el.dataset.sign === '1', t0 = performance.now(), dur = 700;
      const step = now => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = T.money(Math.round(to * e), { sign });
        if (k < 1 && el.isConnected) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  return { ring, burn, spark, bars, countUp };
})();
