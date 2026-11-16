/* =====================================================================
   AVALON RESEARCH — a small, safe Markdown renderer for notes
   Everything is escaped first; only these come back as markup:
   # headings, **bold**, *italic*, `code`, ``` blocks, - / 1. lists,
   - [ ] checkboxes, > quotes, --- rules, [links](https://…), bare URLs,
   [[Entity name]] → entity chip, @[Source title] → source chip.
   Unknown [[names]] render as dashed chips you can click to create.
   ===================================================================== */
'use strict';

R.md = (() => {
  const norm = s => String(s || '').trim().toLowerCase();
  function entityByName(name) {
    const n = norm(name);
    return S.entities.find(e => norm(e.name) === n || (e.aliases || []).some(a => norm(a) === n));
  }
  function sourceByTitle(title) {
    const t = norm(title);
    return S.sources.find(s => norm(s.title) === t) || S.sources.find(s => norm(s.title).startsWith(t) && t.length > 6);
  }

  function inline(text) {
    let s = esc(text);
    const keep = [];
    const stash = html => `\u0000${keep.push(html) - 1}\u0000`;
    s = s.replace(/`([^`]+)`/g, (_, c) => stash(`<code>${c}</code>`));
    s = s.replace(/\[\[([^\]\n]{1,120})\]\]/g, (_, name) => {
      const raw = name.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const e = entityByName(raw);
      if (!e) return stash(`<button type="button" class="md-ent missing" data-new-entity="${name}" title="Not an entity yet: click to create it">${name}</button>`);
      const k = R.ENTITY_KINDS[e.kind] || R.ENTITY_KINDS.other;
      return stash(`<button type="button" class="md-ent" data-entity="${e.id}" style="--c:${k.color}">${icon(k.icon)}${esc(e.name)}</button>`);
    });
    s = s.replace(/@\[([^\]\n]{1,200})\]/g, (_, title) => {
      const raw = title.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
      const src = sourceByTitle(raw);
      if (!src) return stash(`<span class="md-src missing" title="No source with this title">@${title}</span>`);
      return stash(`<button type="button" class="md-src" data-source="${src.id}" title="${esc(src.publisher || host(src.url))}">${R.relBar(src.reliability)}${esc(src.title)}</button>`);
    });
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => stash(`<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`));
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (_, pre, u) => `${pre}${stash(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`)}`);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
  }

  function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) {
        const buf = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
        continue;
      }
      const h = l.match(/^(#{1,4})\s+(.*)$/);
      if (h) { out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); i++; continue; }
      if (/^\s*(---|\*\*\*)\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
      if (/^>\s?/.test(l)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
        const ordered = /^\s*\d+[.)]/.test(l), items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          const t = lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
          const box = t.match(/^\[( |x|X)\]\s+(.*)$/);
          items.push(box ? `<li class="md-task"><span class="md-box ${box[1] !== ' ' ? 'on' : ''}"></span>${inline(box[2])}</li>` : `<li>${inline(t)}</li>`);
        }
        out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
        continue;
      }
      if (!l.trim()) { i++; continue; }
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*([-*+]|\d+[.)])\s+|\s*(---|\*\*\*)\s*$)/.test(lines[i])) buf.push(lines[i++]);
      out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
    }
    return out.join('\n');
  }

  /** Plain text for previews and exports ([[x]] → x, @[t] → t, markup removed). */
  function plainText(src) {
    return String(src || '').replace(/\[\[([^\]]+)\]\]/g, '$1').replace(/@\[([^\]]+)\]/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`#>~]/g, '').replace(/\n{2,}/g, '\n').trim();
  }
  /** Names referenced with [[…]] in a text. */
  const mentions = src => [...String(src || '').matchAll(/\[\[([^\]\n]{1,120})\]\]/g)].map(m => m[1].trim());

  return { render, inline, plainText, mentions, entityByName, sourceByTitle };
})();
