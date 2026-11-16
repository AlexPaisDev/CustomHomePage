# Avalon OS — home page

> アヴァロン · *The isle beyond the mist*

A small "operating system" that lives in your browser's home page (built for Zen Browser).
It uses the Avalon brand: night-indigo, gold triangles, chrome lettering, and the pixel guardian
from the Claude Usage Buddy widget.

Plain HTML, CSS and JavaScript. No build step, no framework, and no accounts: open `index.html` and it runs.

## What's in it

| | |
|---|---|
| **Intro and lock screen** | Every time the page opens (Home button, new tab) the Avalon logo animates in and dissolves into the dashboard. When the browser starts, on `#idle`, from the moon button or `I`, or after a period of inactivity (optional), the full lock screen shows instead, with clock, weather and network status. Any key or click skips or enters, and a typed letter goes straight into search. Choose the behaviour in Settings → General. |
| **One OS, three apps** | Home, Search and Research share a switcher in the middle of the system bar. Moving between them plays an Avalon transition instead of a hard page load: the page sinks back, the gold mark assembles like the lock-screen intro, and the next app opens on that same frame and dissolves into view (about 1.7 s in all). `G` then `H`, `S` or `R` jumps between apps from the keyboard. |
| **The investigator** | An iron soldier of Avalon in a detective's coat, hat, notebook and magnifying glass. He lives in Research's sidebar and on the Search page and reacts to what you do: searching while sources load, writing when you file a source or a quote, a "!" when he spots a duplicate, and a short report when a search finishes. Click him for a line. |
| **System bar** | Home-network status, GitHub unread count, a running focus timer, weather, lock, shortcuts, settings. |
| **Search** | Pick one engine or several at once from the badge in the search bar (several open one tab each). Bangs at the start or end: `!yt lofi`, `lofi !yt`, `!g !d rust`. Bangs are editable in Settings. Also `= 2^10/4` for maths, `host:port` to open a LAN address, link names, and recent searches. |
| **Avalon Search** | A combined results page (`results.html`). It queries several sources at once, merges results that point at the same page, ranks pages found by more sources higher, and labels each result with every source that found it. Open it with `!av query`, or set *several engines open as → Avalon page* in the engine picker. |
| **Research** | A workspace for investigating a company, a person or a topic over time (`research.html`, or Research in the app switcher). Each investigation keeps its sources (links, uploaded PDFs and images, pasted text), a reliability rating and notes per source, saved highlights, and citation export in Markdown, APA 7 or MLA 9. Its **Search** section uses presets per subject (a company's leadership, financials, registry filings, domains, social profiles, reviews; a person's profile and publications; a topic's key concepts, academic papers and opposing views) over the Avalon Search sources plus Wikidata, OpenAlex, Crossref, ORCID, GLEIF, domain records (RDAP), the Wayback Machine, Mastodon and Bluesky, and saves any result as a source in one click. `+ Research` on an Avalon Search result files it into an investigation. The **Board** is an infinite corkboard: entities (people, organisations, places, events, documents), sticky notes, pinned sources, images and group frames, joined by labelled connections ("CEO of", "owns", "contradicts"…), with drag, resize, colours, multi-select, undo/redo and PNG export. Clicking an entity opens everything known about it: facts that cite their sources (or are filled from Wikidata), connections, sources, notes and the other investigations it appears in. Search, a board, entities, findings, a timeline and tasks are being added in stages. |
| **Command palette** | Type `>` in the search bar: lock, start focus, add task, open settings, toggle sounds, and more. |
| **Launchpad** | Grouped links with favicons. Press `E` to edit or drag-reorder, and `1`–`9` to open one. |
| **Sentinel** | Watches your home services (router, NAS, Jellyfin…) every minute, with latency and uptime history. The guardian's eyes turn amber or red when something stops answering. |
| **Tech feed** | Hacker News, Show HN, dev.to and fast-rising GitHub repos. Stories matching your interests are marked in gold and collected under **For you**. |
| **GitHub** | Profile, feed from people and repos you follow, your own activity, repos. With a token: inbox and a contribution graph. |
| **Today** | A daily routine that resets at midnight (with a streak) and a task list. |
| **Focus** | Pomodoro timer that survives reloads, with desktop notifications. |
| **Calendar** | Click the clock: shows the month, with routine-complete and focus days marked. |
| **Memo** | Autosaving scratchpad. |

## Setup

1. Clone the repo somewhere permanent.
2. In Zen: **Settings → Home → Homepage and new windows → Custom URL**:
   ```text
   file:///D:/path/to/CustomHomePage/index.html#idle
   ```
   The `#idle` makes every open show the full lock screen. Without it, each open plays the short
   logo intro and the lock screen appears only when no Avalon tab has been open for 3+ minutes.
   Both are set in **Settings → General → When the page opens**.
3. Open **Settings** (sliders icon, top right) to set your name, weather city, search engines,
   GitHub username/token and feed interests.

### GitHub token (optional)

Without a token you get public activity (GitHub allows 60 requests/hour, so results are cached
for 10 minutes). For the inbox and contribution graph, create a **classic** token with the
`notifications` and `read:user` scopes. It is stored only in this browser's local storage, sent only
to `api.github.com`, and never included in exports.

### Multi-engine search and pop-ups

Zen/Firefox (135+) let a page open only **one new tab per click or key press**; the old
`dom.block_multiple_popups` pref no longer exists. Avalon works around it:

- **2 engines:** the first loads in the current tab and the second opens in a new tab, all from one Enter.
- **3+ engines:** one opens per Enter. Keep pressing Enter (the query stays in the bar) or click the
  buttons under the search bar.
- If Zen shows its "pop-ups blocked" bar and offers **Allow pop-ups** for the page, allowing it lets
  every engine open at once.

### Avalon Search and SearXNG

Out of the box, the results page reads sources that allow web pages to query them: **Marginalia**
(an independent web index), **DuckDuckGo** instant answers, **Wikipedia**, **Stack Overflow**,
**Hacker News**, **Lemmy**, **GitHub** and **npm**. Toggle them with the chips at the top of the page.

Google, Bing, Brave and the other big engines don't let web pages read their results. To add them,
point Avalon at your own [SearXNG](https://docs.searxng.org/) (for example on the home server) in
**Settings → Search**, then press **Test**. SearXNG queries those engines for you and reports which
engines found each result, so a link found by Google *and* Bing shows both. The engines you pick in
the search bar are passed to SearXNG, so it queries only those.

SearXNG needs two changes for this to work:

1. Enable JSON output in `settings.yml`:
   ```yaml
   search:
     formats:
       - html
       - json
   ```
2. Let the browser read the response by adding a CORS header in your reverse proxy, for example:
   ```text
   # Caddy
   searx.lan {
     header Access-Control-Allow-Origin "*"
     reverse_proxy searxng:8080
   }
   ```
   ```nginx
   # nginx (inside the SearXNG location block)
   add_header Access-Control-Allow-Origin "*" always;
   ```

### Opening the pages from disk (file://)

Since Firefox 92, every local file is its own origin, so Home, Search and Research each have their own
storage. Avalon carries the search settings (SearXNG address, Wikipedia language, bangs; never the
GitHub token) along when you switch apps with the switcher, so open Search or Research from Home once
after changing them. Serving the folder over http (for example from the home server) removes this
limit: all apps then share one storage.

## Shortcuts

| Key | Action |
|---|---|
| `/` or `Ctrl K` | Focus search |
| `>` | Command palette |
| `↑` `↓` `Tab` `Enter` | Pick / complete a suggestion · `Ctrl Enter` opens in a new tab |
| `1`–`9` | Open link by number |
| `T` / `N` | Add a task / routine item |
| `F` | Start or pause focus |
| `C` | Calendar |
| `M` | Memo |
| `R` | Refresh feed and GitHub |
| `E` | Edit links |
| `I` | Lock screen |
| `G` then `H` / `S` / `R` | Switch to Home, Search or Research (works on every Avalon page) |
| `?` | All shortcuts |

## Data

Everything is kept in `localStorage` (key `avalon_home_v1`, plus small caches for the feed,
GitHub, weather and Sentinel). Data from the earlier "Hunter Interface" versions is migrated
automatically. Use **Settings → Data** to export or import a JSON backup.

Research keeps its investigations in the browser's IndexedDB (database `avalon_research`), which can hold
uploaded files. If the browser blocks IndexedDB for the page, Research falls back to `localStorage`
without uploads, and says so at the bottom of its sidebar. Its links always use `#/…` rather than `?…`,
because Firefox can give a `file://` page with a query string its own separate storage.

External services used, all keyless: Open-Meteo (weather and city search), the Hacker News Algolia
API, the dev.to API, the GitHub REST/GraphQL API, Google's favicon service, and Google Fonts.

## Files

- `index.html`: markup, icon sprite, dialogs, lock screen
- `style.css`: Avalon theme, layout, animations
- `app.js`: all behaviour, in commented sections (state, guardian, search, feed, GitHub, Sentinel, lock screen…)
- `search-core.js`: the search engine shared by Avalon Search and Research (sources, fetching, merging, ranking)
- `results.html` + `results.js`: Avalon Search, the combined results page
- `os/`: the layer every page shares
  - `os.js` + `os.css`: app switcher, transitions between apps, dialog motion
  - `investigator.js`: the investigator sprite and his status line
- `research.html` + `research.css` + `research/`: the Research workspace
  - `util.js` helpers · `db.js` IndexedDB storage · `store.js` data model · `app.js` layout, routes, shortcuts
  - `views/` one file per section (home, overview, search, sources, board) · `entity-panel.js` entity details · `cite.js` citation export · `incoming.js` results handed over from Avalon Search
