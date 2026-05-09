// Scrape player statistics directly from CricHeroes' public API.
// Replaces the manual HAR-capture workflow. No login required — the stats
// endpoints are gated only by static api-key + udid + device-type headers.
//
// Pulls rosters from multiple teams (Crazy Boyz + Thunder Boyz) and
// de-duplicates by player_id. Players that appear in both teams are
// fetched only once.
//
// Usage:
//   node scrape.js                            # default teams (TEAMS below)
//   node scrape.js <teamId>[,<teamId>,...]    # comma-separated team IDs
//
// Writes dashboard-data.json and data.js, identical in shape to what
// extract-players.js produces from a HAR.

const fs = require('fs');
const {
    finalizeData,
    loadPreviousRankings,
    mapBallTypeBatting,
    mapBallTypeBowling,
    mapBallTypeFielding
} = require('./extract-players');

// Defaults — can be overridden via CLI args.
// Sunday Club consists of two CricHeroes teams (Crazy Boyz + Thunder Boyz)
// with significant roster overlap. Both rosters are pulled and de-duplicated
// by player_id so each player's stats are fetched exactly once.
const TEAMS = [
    { id: '10442708', slug: 'crazy-boyz' },
    { id: '10442742', slug: 'thunder-boyz' }
];
const TEAM_NAME = 'Sunday Club';
// Used as the canonical teamId in dashboard-data.json (the first team in TEAMS).
const PRIMARY_TEAM_ID = TEAMS[0].id;

// Headers required by CricHeroes' public API. The api-key is shipped in their
// own frontend bundle, so it's not a secret. The udid is any stable random
// value — we generate one on first run and persist it to .scrape-udid.
const API_KEY = 'cr!CkH3r0s';
const DEVICE_TYPE = 'Chrome: 147.0.0.0';
const UDID_FILE = '.scrape-udid';

// How many player-stat requests to fire in parallel. CricHeroes hasn't shown
// any rate-limiting at small numbers, but stay polite.
const CONCURRENCY = 4;

function getUdid() {
    try {
        const existing = fs.readFileSync(UDID_FILE, 'utf8').trim();
        if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
    } catch {}
    const fresh = require('crypto').randomBytes(16).toString('hex');
    fs.writeFileSync(UDID_FILE, fresh);
    return fresh;
}

const UDID = getUdid();

const baseHeaders = {
    'api-key': API_KEY,
    'udid': UDID,
    'device-type': DEVICE_TYPE,
    'origin': 'https://cricheroes.com',
    'referer': 'https://cricheroes.com/',
    'user-agent': 'Mozilla/5.0 (compatible; SundayClubDashboard/1.0)',
    'accept': 'application/json, text/plain, */*'
};

async function apiGet(url) {
    const res = await fetch(url, { headers: baseHeaders });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    const json = await res.json();
    if (json.status === false) {
        const msg = json.error?.message || 'unknown';
        throw new Error(`API error on ${url}: ${msg}`);
    }
    return json;
}

async function fetchTeamRoster(teamId) {
    const url = `https://api.cricheroes.in/api/v1/team/get-team-players/${teamId}`;
    const json = await apiGet(url);
    const players = (json.data || []).map(p => ({
        id: String(p.player_id),
        name: p.name
    }));
    return players;
}

async function fetchPlayerStatistics(playerId) {
    const url = `https://api.cricheroes.in/api/v1/player/get-player-statistic/${playerId}?pagesize=12`;
    const json = await apiGet(url);
    return json.data?.statistics || null;
}

// Fetch the ball-type-wise breakdown for one stat category (BATTING/BOWLING/FIELDING).
async function fetchBallTypeStat(playerId, statType) {
    const url = `https://api.cricheroes.in/api/v1/player/get-player-stat-ball-type-wise/${playerId}/${statType}?pagesize=12`;
    const json = await apiGet(url);
    return json.data || null;
}

// Pull box + tennis-ball totals for a player by hitting all three category endpoints.
// Returns { box: {batting,bowling,fielding}, tennis: {...} } with whichever blocks the API provided.
async function fetchPlayerFormatStats(playerId) {
    const [batting, bowling, fielding] = await Promise.all([
        fetchBallTypeStat(playerId, 'BATTING').catch(() => null),
        fetchBallTypeStat(playerId, 'BOWLING').catch(() => null),
        fetchBallTypeStat(playerId, 'FIELDING').catch(() => null)
    ]);

    const formats = { box: {}, tennis: {} };
    const totalRow = (arr) => Array.isArray(arr) ? arr.find(r => r && r.is_total === 1) : null;

    if (batting) {
        const box = totalRow(batting.box_stat);
        const tennis = totalRow(batting.tennis_ball);
        if (box) formats.box.batting = mapBallTypeBatting(box);
        if (tennis) formats.tennis.batting = mapBallTypeBatting(tennis);
    }
    if (bowling) {
        const box = totalRow(bowling.box_stat);
        const tennis = totalRow(bowling.tennis_ball);
        if (box) formats.box.bowling = mapBallTypeBowling(box);
        if (tennis) formats.tennis.bowling = mapBallTypeBowling(tennis);
    }
    if (fielding) {
        const box = totalRow(fielding.box_stat);
        const tennis = totalRow(fielding.tennis_ball);
        if (box) formats.box.fielding = mapBallTypeFielding(box);
        if (tennis) formats.tennis.fielding = mapBallTypeFielding(tennis);
    }

    const hasAny = Object.keys(formats.box).length > 0 || Object.keys(formats.tennis).length > 0;
    return hasAny ? formats : null;
}

// Run an async fn over an array with a concurrency cap.
async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (true) {
            const i = cursor++;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
}

const valueOf = (arr, title) => {
    if (!Array.isArray(arr)) return 0;
    const item = arr.find(i => i.title === title);
    return item ? item.value : 0;
};

function shapeStats(stats) {
    const batting = stats.batting || [];
    const bowling = stats.bowling || [];
    const fielding = stats.fielding || [];

    return {
        batting: {
            runs: parseInt(valueOf(batting, 'Runs')) || 0,
            innings: parseInt(valueOf(batting, 'Innings')) || 0,
            average: parseFloat(valueOf(batting, 'Avg')) || 0,
            strikeRate: parseFloat(valueOf(batting, 'SR')) || 0,
            highestScore: String(valueOf(batting, 'Highest Runs') || '0'),
            thirties: parseInt(valueOf(batting, '30s')) || 0,
            fifties: parseInt(valueOf(batting, '50s')) || 0,
            hundreds: parseInt(valueOf(batting, '100s')) || 0,
            fours: parseInt(valueOf(batting, '4s')) || 0,
            sixes: parseInt(valueOf(batting, '6s')) || 0,
            notOuts: parseInt(valueOf(batting, 'Not out')) || 0,
            matches: parseInt(valueOf(batting, 'Matches')) || 0
        },
        bowling: {
            wickets: parseInt(valueOf(bowling, 'Wickets')) || 0,
            overs: parseFloat(valueOf(bowling, 'Overs')) || 0,
            economy: parseFloat(valueOf(bowling, 'Economy')) || 0,
            average: parseFloat(valueOf(bowling, 'Avg')) || 0,
            bestBowling: String(valueOf(bowling, 'Best Bowling') || '0/0'),
            maidens: parseInt(valueOf(bowling, 'Maidens')) || 0,
            runs: parseInt(valueOf(bowling, 'Runs')) || 0,
            dotBalls: parseInt(valueOf(bowling, 'Dot Balls')) || 0,
            wides: parseInt(valueOf(bowling, 'Wides')) || 0,
            noBalls: parseInt(valueOf(bowling, 'NoBalls')) || 0,
            threeWickets: parseInt(valueOf(bowling, '3 Wickets')) || 0,
            fiveWickets: parseInt(valueOf(bowling, '5 Wickets')) || 0,
            matches: parseInt(valueOf(bowling, 'Matches')) || 0
        },
        fielding: {
            catches: parseInt(valueOf(fielding, 'Catches')) || 0,
            stumpings: parseInt(valueOf(fielding, 'Stumpings')) || 0,
            runOuts: parseInt(valueOf(fielding, 'Run outs')) || 0,
            caughtBehind: parseInt(valueOf(fielding, 'Caught behind')) || 0,
            matches: parseInt(valueOf(fielding, 'Matches')) || 0
        }
    };
}

async function scrape(teams = TEAMS) {
    const start = Date.now();
    const teamList = Array.isArray(teams) ? teams : [teams];
    console.log(`\nScraping ${teamList.length} team(s): ${teamList.map(t => t.slug || t.id).join(', ')}\n`);

    const previousRankings = loadPreviousRankings();

    // Fetch every team's roster, then de-duplicate by player_id. The first
    // team to mention a player wins for the display name.
    const rosterById = new Map();
    let totalRosterRows = 0;
    let duplicateRows = 0;
    for (const team of teamList) {
        console.log(`Fetching roster for ${team.slug || team.id}...`);
        const roster = await fetchTeamRoster(team.id);
        console.log(`  ${roster.length} players`);
        totalRosterRows += roster.length;
        for (const p of roster) {
            if (rosterById.has(p.id)) {
                duplicateRows++;
                continue;
            }
            rosterById.set(p.id, p);
        }
    }
    const roster = [...rosterById.values()];
    console.log(`\nUnique players: ${roster.length} (skipped ${duplicateRows} duplicate roster row(s) across ${totalRosterRows} total)\n`);

    console.log(`Fetching per-player statistics (concurrency=${CONCURRENCY})...`);
    const playersMap = new Map();
    let success = 0, failed = 0;

    let formatHits = 0;

    await mapWithConcurrency(roster, CONCURRENCY, async (p) => {
        try {
            // Overall stats and ball-type-wise breakdown can be fetched in parallel.
            const [stats, formats] = await Promise.all([
                fetchPlayerStatistics(p.id),
                fetchPlayerFormatStats(p.id).catch(() => null)
            ]);

            if (!stats) {
                console.log(`  ✗ ${p.name} (${p.id}) — no statistics in response`);
                failed++;
                return;
            }
            const shaped = shapeStats(stats);
            const player = {
                id: p.id,
                name: p.name,
                ...shaped,
                lastUpdated: new Date().toISOString()
            };
            if (formats) {
                player.formats = formats;
                formatHits++;
            }
            playersMap.set(p.id, player);
            console.log(`  ✓ ${p.name} (${p.id})${formats ? ' [+formats]' : ''}`);
            success++;
        } catch (err) {
            console.log(`  ✗ ${p.name} (${p.id}) — ${err.message}`);
            failed++;
        }
    });

    console.log(`\nFetched ${success} / ${roster.length} player stats (${failed} failed)`);
    console.log(`  Ball-type-wise (Box/Tennis) breakdown attached for ${formatHits} player(s)`);

    if (success === 0) {
        throw new Error('No player statistics retrieved — aborting before overwriting dashboard-data.json');
    }

    finalizeData(playersMap, previousRankings, { teamName: TEAM_NAME, teamId: PRIMARY_TEAM_ID });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s.`);
}

if (require.main === module) {
    // Optional CLI override: `node scrape.js 10442708,10442742`
    let teams = TEAMS;
    if (process.argv[2]) {
        teams = process.argv[2].split(',').map(id => ({ id: id.trim(), slug: id.trim() }));
    }
    scrape(teams).catch(err => {
        console.error('\n❌ Scrape failed:', err.message);
        process.exit(1);
    });
}

module.exports = { scrape };
