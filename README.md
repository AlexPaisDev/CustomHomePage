# Avalon OS — home page

> アヴァロン · *The isle beyond the mist*

A small "operating system" that lives in your browser's home page (built for Zen Browser).
It uses the Avalon brand: night-indigo, gold triangles, chrome lettering, and the pixel guardian
from the Claude Usage Buddy widget.

Plain HTML, CSS and JavaScript. No build step, no framework, and no accounts: open `index.html` and it runs.

## What's in it

| | |
|---|---|
| **Lock / startup screen** | Animated Avalon logo with clock, weather and network status. It appears when the browser starts, on `#idle`, from the moon button or `I`, or after a period of inactivity (optional). Any key or click enters, and a typed letter goes straight into search. |
| **System bar** | Home-network status, GitHub unread count, a running focus timer, weather, lock, shortcuts, settings. |
| **Search** | Pick one engine or several at once from the badge in the search bar (several open one tab each). Bangs at the start or end: `!yt lofi`, `lofi !yt`, `!g !d rust`. Bangs are editable in Settings. Also `= 2^10/4` for maths, `host:port` to open a LAN address, link names, and recent searches. |
| **Avalon Search** | A combined results page (`results.html`). It queries several sources at once, merges results that point at the same page, ranks pages found by more sources higher, and labels each result with every source that found it. Open it with `!av query`, or set *several engines open as → Avalon page* in the engine picker. |
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
   The `#idle` makes every browser start open on the animated lock screen. Leave it off to go
   straight to the dashboard; the lock screen will still appear when no Avalon tab has been open
   for 3+ minutes (switch that off in Settings → General).
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
| `?` | All shortcuts |

## Data

Everything is kept in `localStorage` (key `avalon_home_v1`, plus small caches for the feed,
GitHub, weather and Sentinel). Data from the earlier "Hunter Interface" versions is migrated
automatically. Use **Settings → Data** to export or import a JSON backup.

External services used, all keyless: Open-Meteo (weather and city search), the Hacker News Algolia
API, the dev.to API, the GitHub REST/GraphQL API, Google's favicon service, and Google Fonts.

## Files

- `index.html`: markup, icon sprite, dialogs, lock screen
- `style.css`: Avalon theme, layout, animations
- `app.js`: all behaviour, in commented sections (state, guardian, search, feed, GitHub, Sentinel, lock screen…)
- `results.html` + `results.js`: Avalon Search, the combined results page (sources, merging, ranking)
