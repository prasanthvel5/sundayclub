# Sunday Club — Cricket Statistics Dashboard

A mobile-responsive cricket statistics dashboard for the **Sunday Club** team. Pulls player statistics directly from CricHeroes' public API (no login, no HAR file required) and renders interactive leaderboards with computed performance ratings.

## What it does

- Fetches the team roster and per-player batting/bowling/fielding stats live from `api.cricheroes.in` — covering **all** team members, not just whoever you happened to click on.
- Computes performance ratings (0–1000 scale) for batting, bowling, and all-rounders using normalized team-relative metrics.
- Displays five tabs: **Batting**, **Bowling**, **Allrounders**, **Fielding**, **Highlights**.
- Tracks rank changes between syncs (▲/▼/NEW indicators) by comparing against the previously saved rankings.
- Supports re-syncing in-place via the dashboard sync button.

## Quick Start

### Prerequisites
- Node.js **v18+** (uses native `fetch`)

### Install and Run

```bash
npm install
node scrape.js            # fetches stats from CricHeroes' public API
npm start                 # serves http://localhost:3000
```

Open **http://localhost:3000/index.html**.

Windows users can double-click `start.bat` instead.

## Refreshing the data

Three ways, in order of convenience:

1. **Sync button** — click the ⟳ on the dashboard. The server calls `scrape.js` and the page reloads with fresh stats.
2. **Re-run the scraper** — `node scrape.js` then refresh the browser.
3. **Use a HAR file (legacy)** — drop a `cricheroes.com.har` in the project root and run `node extract-players.js`. The sync endpoint also supports this via `POST /sync?source=har`.

### How the API access works

The dashboard hits two CricHeroes endpoints:
- `GET /api/v1/team/get-team-players/{teamId}` — full team roster
- `GET /api/v1/player/get-player-statistic/{playerId}?pagesize=12` — per-player career stats

Both are publicly accessible. They're gated only by static `api-key`, `udid`, and `device-type` headers (no login, no session cookie). The first run generates a stable `udid` and saves it to `.scrape-udid` (gitignored).

To switch to a different team, pass the team ID as a CLI argument:

```bash
node scrape.js <teamId>
```

## Tabs

| Tab          | What it shows                                                            | Default sort       |
|--------------|--------------------------------------------------------------------------|--------------------|
| Batting      | Runs, Innings, Avg, SR, HS, 30s/50s, 4s/6s — with batting rating         | Batting Rating     |
| Bowling      | Wickets, Overs, Economy, Best, 3wkts, Dot Balls — with bowling rating    | Bowling Rating     |
| Allrounders  | Combined bat+bowl rating (filtered: ≥10 innings AND ≥20 overs)           | Allrounder Rating  |
| Fielding     | Catches, Stumpings, Run Outs                                             | Total Dismissals   |
| Highlights   | Top performer cards (Most Runs, Highest Score, Most Wickets, etc.)       | —                  |

## Rating Formulas

**Batting Rating** (0–1000) = `0.30·quality + 0.25·intent + 0.25·volume + 0.20·consistency`
- *quality*: Average normalized to team max
- *intent*: Strike Rate normalized to team max
- *volume*: Runs normalized to team max
- *consistency*: `30s + 2·50s` normalized to team max

**Bowling Rating** (0–1000) = `0.30·wicketTaking + 0.25·economy + 0.25·efficiency + 0.20·impact`
- *wicketTaking*: Wickets normalized to team max
- *economy*: Inverted normalization across team economy range (lower is better)
- *efficiency*: Inverted normalization across bowling-average range
- *impact*: 3-wicket hauls normalized to team max
- Returns 0 for players with 0 overs or 0 wickets.

**Allrounder Rating** = `(battingRating × bowlingRating) / 1000` — only for players with ≥10 batting innings and ≥20 overs bowled.

## File Structure

```
Dashboard/
├── index.html             # Dashboard markup with tab navigation
├── styles.css             # Mobile-first dark theme
├── app.js                 # Frontend: leaderboards, sorting, rank-change UI
├── data.js                # Auto-generated: window-scoped dashboardData
├── scrape.js              # Live scraper — calls CricHeroes' public API
├── extract-players.js     # Legacy HAR parser (still works) + shared rating logic
├── proxy-server.js        # Express server + POST /sync endpoint
├── cricheroes.com.har     # Optional source HAR — only used if you run extract-players.js
├── dashboard-data.json    # Generated statistics + previousRankings snapshot
├── data.js                # Generated mirror of dashboard-data.json (loaded by index.html)
├── .scrape-udid           # Generated stable device ID for the API (gitignored)
├── demo.html              # Standalone preview with hard-coded sample data
├── package.json           # Express + cors
├── start.bat              # Windows: install + extract + start
└── QUICKSTART.md          # Condensed setup guide
```

## Customization

**Team** — pass the team ID as a CLI arg to `scrape.js`, or change the `TEAM_ID` / `TEAM_NAME` defaults at the top of `scrape.js`.

**Theme** — CSS variables at the top of `styles.css`.

**Allrounder eligibility** — innings/overs thresholds in `extract-players.js` (line 102) and `app.js` (line 298). Keep both in sync.

**Port** — `PORT` constant in `proxy-server.js`.

**Concurrency** — `CONCURRENCY` constant in `scrape.js` controls how many player-stat requests run in parallel (default 4).

## Mobile Access (Same WiFi)

Run `ipconfig` (Windows) or `ifconfig` (Mac/Linux) to find your IPv4 address, then visit `http://<your-ip>:3000/index.html` from your phone.

## Troubleshooting

- **`scrape.js` fails with HTTP 4xx** — CricHeroes occasionally rotates the api-key. Capture a fresh HAR, copy the new `api-key` value from the request headers, and update the `API_KEY` constant in `scrape.js`.
- **`Device-type not found` API error** — the `device-type` header is missing or malformed. Check the constants at the top of `scrape.js`.
- **Empty leaderboards** — run `node scrape.js` and check that it reports `Total Players: N` with N > 0.
- **Sync button shows ✗** — server isn't running, or the API call failed. Check the server console for the actual error message.

## Privacy

The scraper hits CricHeroes' public API only — there is no auth token to leak. The legacy HAR file, if you have one, contains full HTTP traffic including any session cookies the browser had at capture time. **Do not commit or share HAR files publicly.** `*.har` is gitignored by default.

## License

MIT.
