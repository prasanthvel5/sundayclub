# Project Context — Sunday Club Cricket Dashboard

A working reference for anyone (human or AI) picking up this codebase. Captures architecture, data flow, conventions, and the non-obvious bits that aren't visible from the file tree.

## TL;DR

This is a **vanilla JS + Node/Express** dashboard that fetches per-player cricket statistics from CricHeroes' public API, computes performance ratings, and renders interactive leaderboards. Frontend is fully static (just `index.html`, `styles.css`, `app.js`, `data.js`). The backend is a thin Express layer whose only real job is to expose `POST /sync` so the UI can re-trigger a scrape without a manual `node` invocation.

Two ingestion paths exist:
1. **`scrape.js`** (preferred) — calls `api.cricheroes.in` directly. No login, no HAR, no manual clicking. Public API gated only by static `api-key` + `udid` + `device-type` headers.
2. **`extract-players.js`** (legacy) — parses a captured `.har` file. Kept for offline/historical use; both paths produce identical `dashboard-data.json` shape.

There is **no build step**, no framework, no bundler, no database. State lives in two artifacts: `dashboard-data.json` (canonical) and `data.js` (the same JSON wrapped as a global so the HTML works without `fetch`).

## Architecture

```
                                  ┌──────────────────────────┐
                                  │  api.cricheroes.in       │
                                  │  - get-team-players/{id} │
                                  │  - get-player-statistic/ │
                                  │    {id}?pagesize=12      │
                                  └────────────┬─────────────┘
                                               │  (api-key + udid +
                                               │   device-type headers)
                                               ▼
┌──────────────────────────┐         ┌──────────────────────────┐
│  scrape.js               │ ──────▶ │  dashboard-data.json     │
│  - Roster fetch          │         │  + data.js (mirror)      │
│  - Per-player stats      │         └────────────┬─────────────┘
│    (concurrency=4)       │                      │  <script src="data.js">
│  - Compute ratings       │                      ▼
│  - Diff vs previous run  │         ┌──────────────────────────┐
└──────────────────────────┘         │  index.html + app.js     │
                                     │  - Tabs / leaderboards   │
┌──────────────────────────┐         │  - Sort controls         │
│  extract-players.js      │ ──────▶ │  - Rank-change badges    │
│  (LEGACY: HAR parser)    │         └──────────────────────────┘
└──────────────────────────┘                      ▲
                                                  │  Click sync (⟳)
                                                  │  fetch('/sync')
                                                  │
                                     ┌──────────────────────────┐
                                     │  proxy-server.js         │
                                     │  - express.static(.)     │
                                     │  - POST /sync (default:  │
                                     │    scrape; ?source=har)  │
                                     └──────────────────────────┘
```

## Data flow on a sync

1. User clicks ⟳ → `app.js:handleSync()` → `fetch('/sync', { method: 'POST' })`.
2. `proxy-server.js` calls `scrape()` from `scrape.js` (default) — or `extractPlayerStats()` if `?source=har`.
3. `scrape()`:
   - Loads the existing `dashboard-data.json` and computes its rankings → `previousRankings`.
   - Calls `GET /api/v1/team/get-team-players/{teamId}` to fetch the full roster (player ID + display name).
   - Calls `GET /api/v1/player/get-player-statistic/{id}?pagesize=12` for each player, with up to `CONCURRENCY=4` requests in flight.
   - Shapes each response into the canonical `{batting, bowling, fielding}` record.
   - Hands the player map to `finalizeData()` (imported from `extract-players.js`) which computes ratings, writes `dashboard-data.json` + `data.js`, and prints the ranking diff.
4. Server returns `{ success: true, source, totalPlayers, lastSync }`.
5. Frontend reloads `data.js` indirectly via `loadDashboardData()` and re-renders. **Note:** because `data.js` is loaded via a `<script>` tag at page load, the in-memory `dashboardData` is **not** automatically refreshed by clicking sync — see "Known quirks" below.

## Key files

| File                  | Role                                                                                              |
|-----------------------|---------------------------------------------------------------------------------------------------|
| `index.html`          | Markup. Tab navigation, leaderboard containers, sort `<select>` controls, sync button.            |
| `app.js`              | All frontend behavior. Loads `dashboardData`, computes ratings, renders cards, handles sorting.   |
| `styles.css`          | Mobile-first dark theme with gold/silver/bronze rank highlights and rating bars.                  |
| `data.js`             | **Generated.** A single `const dashboardData = {...}` mirror of `dashboard-data.json`.            |
| `dashboard-data.json` | **Generated.** Canonical scraped data including `previousRankings` snapshot.                      |
| `scrape.js`           | Live API scraper. Hits `team/get-team-players` + `player/get-player-statistic` directly.          |
| `extract-players.js`  | Legacy HAR parser. Also exports the rating/ranking helpers used by `scrape.js`.                   |
| `proxy-server.js`     | Express server, static file middleware, `POST /sync` endpoint (api default, `?source=har` opt-in).|
| `.scrape-udid`        | **Generated, gitignored.** Random 32-hex device ID; persisted so the same value is reused.        |
| `cricheroes.com.har`  | Source data. ~22 MB. **Sensitive** (contains auth headers).                                       |
| `demo.html`           | Standalone HTML preview with inline mock data — useful for UI iteration without a real HAR.       |
| `start.bat`           | Windows convenience: `npm install` + extract + `npm start`.                                       |
| `temp-data.txt`       | Scratch text snippet of one player's API response. Not used at runtime.                           |
| `cricheroes.com_old.har` | Previous HAR snapshot kept around for comparison/debugging. Not loaded by the app.             |

## Rating system (the math)

Computed identically in both `extract-players.js` (for ranking diff) and `app.js` (for display). **They must stay in sync** — this is the most fragile invariant in the codebase.

### Team-relative normalization

`calculateTeamMaxes(players)` walks all players to find:
- `runs`, `average`, `strikeRate`, `consistency` maxes (consistency = `30s + 2·50s`)
- `wickets`, `threeWickets` maxes
- `economyMin`/`economyMax`, `bowlAvgMin`/`bowlAvgMax` (only over players with overs > 0 / wickets > 0)

`normalize(val, max) = (val / max) * 1000` — straight ratio.
`invertedNormalize(val, min, max) = (1 - (val - min) / (max - min)) * 1000` — for "lower is better" stats (economy, bowling avg).

### Batting rating
```
quality      = normalize(average,  teamMaxes.average)
intent       = normalize(strikeRate, teamMaxes.strikeRate)
volume       = normalize(runs, teamMaxes.runs)
consistency  = normalize(30s + 2·50s, teamMaxes.consistency)

rating = round(0.30·quality + 0.25·intent + 0.25·volume + 0.20·consistency)
```

### Bowling rating
```
if (overs == 0 || wickets == 0) → 0   // hard short-circuit

wicketTaking = normalize(wickets, teamMaxes.wickets)
economy      = invertedNormalize(economy, ecoMin, ecoMax)
efficiency   = invertedNormalize(bowlingAvg, avgMin, avgMax)
impact       = normalize(threeWickets, teamMaxes.threeWickets)

rating = round(0.30·wicketTaking + 0.25·economy + 0.25·efficiency + 0.20·impact)
```

### Allrounder rating
```
eligibility: batting.innings >= 10 AND bowling.overs >= 20
rating = round((battingRating · bowlingRating) / 1000)
```

The multiplicative form means a weak rating in either discipline crushes the all-rounder score — that's intentional (rewards genuine balance, not specialists).

## Rank-change tracking

Two-layer system, with the persisted layer taking precedence:

1. **Persisted (preferred):** `extract-players.js` snapshots the previous run's rankings before re-extracting and embeds them in `dashboard-data.json` as `previousRankings: { batting: [ids], bowling: [ids], fielding: [ids], allrounder: [ids] }`. `app.js:calculateRankChanges()` reads this directly.
2. **Fallback:** if `previousRankings` is missing, `app.js` falls back to `localStorage.previousRankings` written by `saveCurrentRankings()`.

`getRankChangeHTML(change)` renders one of:
- `NEW` — player wasn't in previous ranking
- `–` — same rank
- `▲ N` — moved up N positions
- `▼ N` — moved down N positions

## Conventions / non-obvious bits

- **`data.js` is generated.** Don't edit it by hand — `extract-players.js` overwrites it on every run. If you need to mutate dashboard data manually, edit `dashboard-data.json` and regenerate, or change `extract-players.js`.
- **No fetch on page load.** The dashboard works opening `index.html` from `file://`. The `<script src="data.js">` tag is what makes that possible.
- **The team is "Sunday Club".** Older docs reference "Crazy Boyz" — that's stale. Source of truth: `dashboard-data.json:teamName` and the `<title>` in `index.html`.
- **Player names come straight from CricHeroes.** `scrape.js` reads names from the team-roster API response directly. `extract-players.js` (HAR path) does the same via `buildHarNameMap()`. There is no hardcoded override map — names always reflect what CricHeroes shows. If a display name needs cleanup (e.g. all-caps), fix it on the CricHeroes profile, not in code.
- **API auth is via a hardcoded api-key in `scrape.js`.** The value (`cr!CkH3r0s`) is the same one CricHeroes' own frontend ships, so it's not a secret — but they could rotate it any time. If the scraper starts failing with 401/403, capture a fresh HAR and copy the new `api-key` header value.
- **Best Bowling sort treats wickets as the primary key**, runs conceded as tiebreaker (lower is better). See `app.js:displayHighlights()`.
- **HAR repair logic** in `extract-players.js` looks for the substring `}],"cookies":[]` to find the last complete entry before truncation. This is brittle — if CricHeroes changes their response shape it'll fall through to the regex extractor.
- **Highlights tab uses sample-of-one logic** — `[...leaderboard].sort()[0]`. If two players tie, the first one in the sorted list wins arbitrarily.

## Known quirks / footguns

- **Sync doesn't fully refresh `dashboardData` in-memory.** `app.js:loadDashboardData()` reads the global `dashboardData` (set by `data.js` at page load). Re-running extraction overwrites `data.js` on disk, but the in-memory variable in the running tab still references the old object until the page reloads. The sync handler doesn't force `location.reload()` — the rank-change UI works because `previousRankings` was already embedded server-side, but stat values won't update without a manual refresh. **If you change the sync flow, decide explicitly whether to reload.**
- **Fielding totals don't filter by activity.** A player with 0 catches/0 stumpings/0 runouts still appears in the fielding leaderboard at the bottom.
- **Rating formulas are duplicated across `extract-players.js` and `app.js`.** Any change to weights or normalization must be made in both files. There is no shared module.
- **`hundreds` and `fiveWickets` fields are extracted but unused** in any leaderboard or highlight. Wired up in the JSON but not displayed.
- **HAR file size (~22 MB) is checked into the repo.** Watch the `.gitignore` if you intend to publish — see "Privacy" below.

## Privacy

The HAR file contains full HTTP traffic from the user's CricHeroes session including:
- `Authorization` headers / session cookies
- The user's CricHeroes account ID and any team membership tokens

**Do not push the HAR file to a public repo.** Confirm `.gitignore` covers `*.har` before any publish/share. The dashboard's extracted output (`dashboard-data.json`, `data.js`) is fine to share — it only contains aggregate per-player stats.

## Tech stack

- **Runtime:** Node.js v14+ (CommonJS modules)
- **Server:** Express 4 + cors
- **Frontend:** Vanilla JS (ES6+), no framework, no bundler
- **Styling:** Hand-written CSS with custom properties; no preprocessor
- **Data:** Static JSON, no DB, no cache layer

## Running locally

```bash
npm install
node extract-players.js   # required at least once before first run
npm start                 # http://localhost:3000/index.html
```

The server logs a banner on startup and prints sync activity. `extract-players.js` prints per-player extraction lines, a team summary, and ranking diffs.

## When extending this project

- **Adding a new stat to display:** extract it in `extract-players.js`, add it to the rendered template in the appropriate `display*Leaderboard()` in `app.js`, optionally add a sort option in `index.html`.
- **Adding a new tab:** add the button + content section in `index.html`, add a leaderboard array + sort fn + display fn in `app.js`, wire it in `displayDashboard()` and `processPlayerData()`.
- **Changing rating weights:** edit BOTH `extract-players.js` AND `app.js`. Add a comment if you do — the duplication is the trap.
- **Supporting multiple teams:** today the team name and player-ID map are hard-coded. A real multi-team version would need to drive `playerNames` from the HAR's roster API response and key everything by `teamId`.
