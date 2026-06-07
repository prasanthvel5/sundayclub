// Node.js script to extract complete player statistics from HAR file
const fs = require('fs');

// HAR files searched for ball-type-wise (per-format) statistics.
// The first HAR holding a given player's data wins.
const BALL_TYPE_HAR_FILES = ['cricheroes.com_fullstats.har', 'cricheroes.com.har'];

// Players excluded from the dashboard regardless of which roster they appear in.
// IDs (not names) so renames and casing tweaks can't silently re-enable them.
//   15459630 — Arun Manikandan
//   15702188 — Padhmanaban M
const BLOCKED_PLAYER_IDS = new Set([
    '15459630',
    '15702188'
]);

function isBlocked(playerId) {
    return BLOCKED_PLAYER_IDS.has(String(playerId));
}

// Map ball-type-wise totals row to our internal batting shape.
function mapBallTypeBatting(t) {
    return {
        runs: parseInt(t.Runs) || 0,
        innings: parseInt(t.Inns) || 0,
        average: parseFloat(t.Avg) || 0,
        strikeRate: parseFloat(t.SR) || 0,
        highestScore: String(t.HS || '0'),
        thirties: parseInt(t['30s']) || 0,
        fifties: parseInt(t['50s']) || 0,
        hundreds: parseInt(t['100s']) || 0,
        fours: parseInt(t['4s']) || 0,
        sixes: parseInt(t['6s']) || 0,
        notOuts: parseInt(t.NO) || 0,
        matches: parseInt(t.Mat) || 0
    };
}

function mapBallTypeBowling(t) {
    return {
        wickets: parseInt(t.Wkts) || 0,
        overs: parseFloat(t.Overs) || 0,
        economy: parseFloat(t.Eco) || 0,
        average: parseFloat(t.Avg) || 0,
        bestBowling: String(t.BB || '0/0'),
        maidens: parseInt(t.Maidens) || 0,
        runs: parseInt(t.Runs) || 0,
        dotBalls: parseInt(t.Dots) || 0,
        wides: parseInt(t.WD) || 0,
        noBalls: parseInt(t.NB) || 0,
        threeWickets: parseInt(t['3 Wkts']) || 0,
        fiveWickets: parseInt(t['5 Wkts']) || 0,
        matches: parseInt(t.Mat) || 0
    };
}

function mapBallTypeFielding(t) {
    return {
        catches: parseInt(t.Catches) || 0,
        stumpings: parseInt(t.St) || 0,
        runOuts: parseInt(t['R/O']) || 0,
        caughtBehind: parseInt(t['C.B']) || 0,
        matches: parseInt(t.Mat) || 0
    };
}

// Locate the first JSON-decodable response body that follows a URL match in raw HAR text.
function findResponseTextAfter(harData, urlIndex) {
    const searchEnd = Math.min(urlIndex + 80000, harData.length);
    const block = harData.substring(urlIndex, searchEnd);
    const m = block.match(/"text":\s*"((?:[^"\\]|\\.)*)"/);
    if (!m) return null;
    let jsonStr = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\\//g, '/').replace(/\\n/g, '\n').replace(/\\r/g, '');
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        return null;
    }
}

// Extract per-format (box, tennis) totals from ball-type-wise responses in the given HAR text.
// Returns a map: playerId -> { box: {batting,bowling,fielding}, tennis: {...} }
function extractFormatStatsFromHar(harData) {
    const formats = {};
    const urlRegex = /get-player-stat-ball-type-wise\/(\d+)\/(BATTING|BOWLING|FIELDING)/g;
    const seen = new Set();
    let m;
    while ((m = urlRegex.exec(harData)) !== null) {
        const playerId = m[1];
        const statType = m[2];
        const key = `${playerId}/${statType}`;
        if (seen.has(key)) continue;

        const apiResponse = findResponseTextAfter(harData, m.index);
        if (!apiResponse || !apiResponse.data) continue;
        seen.add(key);

        const d = apiResponse.data;
        const boxTotal = (d.box_stat || []).find(r => r && r.is_total === 1);
        const tennisTotal = (d.tennis_ball || []).find(r => r && r.is_total === 1);

        if (!formats[playerId]) formats[playerId] = { box: {}, tennis: {} };

        if (statType === 'BATTING') {
            if (boxTotal) formats[playerId].box.batting = mapBallTypeBatting(boxTotal);
            if (tennisTotal) formats[playerId].tennis.batting = mapBallTypeBatting(tennisTotal);
        } else if (statType === 'BOWLING') {
            if (boxTotal) formats[playerId].box.bowling = mapBallTypeBowling(boxTotal);
            if (tennisTotal) formats[playerId].tennis.bowling = mapBallTypeBowling(tennisTotal);
        } else if (statType === 'FIELDING') {
            if (boxTotal) formats[playerId].box.fielding = mapBallTypeFielding(boxTotal);
            if (tennisTotal) formats[playerId].tennis.fielding = mapBallTypeFielding(tennisTotal);
        }
    }
    return formats;
}

// Aggregate format stats across every HAR file in BALL_TYPE_HAR_FILES (first match wins).
function loadAllFormatStats() {
    const merged = {};
    for (const file of BALL_TYPE_HAR_FILES) {
        if (!fs.existsSync(file)) continue;
        try {
            const harData = fs.readFileSync(file, 'utf8');
            const found = extractFormatStatsFromHar(harData);
            const ids = Object.keys(found);
            if (ids.length > 0) {
                console.log(`Found ball-type-wise stats for ${ids.length} players in ${file}`);
            }
            for (const id of ids) {
                if (!merged[id]) {
                    merged[id] = found[id];
                } else {
                    merged[id].box = { ...found[id].box, ...merged[id].box };
                    merged[id].tennis = { ...found[id].tennis, ...merged[id].tennis };
                }
            }
        } catch (e) {
            console.log(`  Could not process ${file}: ${e.message}`);
        }
    }
    return merged;
}

// Scan the raw HAR text for player_id/name pairs from roster API responses.
// CricHeroes embeds these in escaped form: \"player_id\":<id>,\"name\":\"<name>\"
// We also accept the unescaped form for HARs stored differently.
function buildHarNameMap(harData) {
    const names = {};
    const patterns = [
        /\\"player_id\\":(\d+),\\"name\\":\\"((?:[^"\\]|\\.)*?)\\"/g,
        /"player_id":(\d+),"name":"((?:[^"\\]|\\.)*?)"/g
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(harData)) !== null) {
            const id = m[1];
            const name = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
            if (name && !names[id]) names[id] = name;
        }
    }
    return names;
}

function resolvePlayerName(playerId, harNameMap) {
    return harNameMap[playerId] || `Player ${playerId}`;
}

// --- Rating calculation functions (mirrored from app.js) ---

function calculateTeamMaxes(players) {
    const maxes = {
        runs: 0, average: 0, strikeRate: 0, consistency: 0,
        wickets: 0, threeWickets: 0,
        economyMin: Infinity, economyMax: 0,
        bowlAvgMin: Infinity, bowlAvgMax: 0
    };

    players.forEach(p => {
        const bat = p.batting;
        const bowl = p.bowling;

        maxes.runs = Math.max(maxes.runs, bat.runs || 0);
        maxes.average = Math.max(maxes.average, bat.average || 0);
        maxes.strikeRate = Math.max(maxes.strikeRate, bat.strikeRate || 0);
        const cons = (bat.thirties || 0) + ((bat.fifties || 0) * 2);
        maxes.consistency = Math.max(maxes.consistency, cons);

        maxes.wickets = Math.max(maxes.wickets, bowl.wickets || 0);
        maxes.threeWickets = Math.max(maxes.threeWickets, bowl.threeWickets || 0);

        if (bowl.overs > 0) {
            maxes.economyMin = Math.min(maxes.economyMin, bowl.economy || Infinity);
            maxes.economyMax = Math.max(maxes.economyMax, bowl.economy || 0);
        }
        if (bowl.wickets > 0) {
            maxes.bowlAvgMin = Math.min(maxes.bowlAvgMin, bowl.average || Infinity);
            maxes.bowlAvgMax = Math.max(maxes.bowlAvgMax, bowl.average || 0);
        }
    });

    if (maxes.economyMin === Infinity) maxes.economyMin = 0;
    if (maxes.bowlAvgMin === Infinity) maxes.bowlAvgMin = 0;

    return maxes;
}

// Sample-size confidence multiplier mirrors app.js so persisted rankings line
// up with what the UI shows. See calculateBattingRating in app.js for context.
function calculateBattingRating(batting, maxes, opts) {
    const fullCreditInnings = (opts && opts.fullCreditInnings) || 10;
    const normalize = (val, max) => max > 0 ? (val / max) * 1000 : 0;

    const quality = normalize(batting.average || 0, maxes.average);
    const intent = normalize(batting.strikeRate || 0, maxes.strikeRate);
    const volume = normalize(batting.runs || 0, maxes.runs);
    const cons = (batting.thirties || 0) + ((batting.fifties || 0) * 2);
    const consistency = normalize(cons, maxes.consistency);

    // Average is only trustworthy when backed by volume: a 40 average off 40
    // runs is a not-out artifact, not batting quality. Scale the quality
    // (average) weight by how much volume backs it (0..1) and hand the freed
    // weight to volume, so low-volume batters are judged on actual runs rather
    // than a fragile average. sqrt softens the curve so mid-volume players
    // aren't over-penalized; weights still sum to 1.0 to keep the 0-1000 scale.
    const volumeCredibility = maxes.runs > 0 ? Math.min(1, Math.sqrt((batting.runs || 0) / maxes.runs)) : 0;
    const qualityWeight = 0.30 * volumeCredibility;
    const volumeWeight = 0.25 + 0.30 * (1 - volumeCredibility);

    const rawRating = quality * qualityWeight + intent * 0.25 + volume * volumeWeight + consistency * 0.20;
    const confidence = Math.min(1, (batting.innings || 0) / fullCreditInnings);
    return Math.round(rawRating * confidence);
}

function calculateBowlingRating(bowling, maxes, opts) {
    if (!bowling.overs || bowling.overs === 0) return 0;
    if (!bowling.wickets || bowling.wickets === 0) return 0;

    const fullCreditOvers = (opts && opts.fullCreditOvers) || 20;
    const normalize = (val, max) => max > 0 ? (val / max) * 1000 : 0;

    const invertedNormalize = (val, min, max) => {
        if (max === min) return 500;
        const raw = (1 - (val - min) / (max - min)) * 1000;
        return Math.max(0, Math.min(1000, raw));
    };

    const wicketTaking = normalize(bowling.wickets, maxes.wickets);
    const economy = invertedNormalize(bowling.economy, maxes.economyMin, maxes.economyMax);
    const efficiency = invertedNormalize(bowling.average, maxes.bowlAvgMin, maxes.bowlAvgMax);
    const impact = normalize(bowling.threeWickets || 0, maxes.threeWickets);

    const rawRating = wicketTaking * 0.30 + economy * 0.25 + efficiency * 0.25 + impact * 0.20;
    const confidence = Math.min(1, (bowling.overs || 0) / fullCreditOvers);
    return Math.round(rawRating * confidence);
}

// Pull the right batting/bowling/fielding block for a given format.
// Mirrors getPlayerStatsForFormat() in app.js so persisted rankings line up
// with what the UI shows for that tab.
function getStatsForFormat(player, format) {
    if (format === 'overall') {
        return { batting: player.batting, bowling: player.bowling, fielding: player.fielding };
    }
    const fmt = player.formats && player.formats[format];
    if (!fmt) return null;
    return { batting: fmt.batting || null, bowling: fmt.bowling || null, fielding: fmt.fielding || null };
}

// Compute the four leaderboards for a given (already filtered) set of
// {player, stats} pairs. Returns ordered arrays of player IDs.
function computeRankingsForFormat(playersWithStats, minInnings, minOvers) {
    const normalizedPlayers = playersWithStats.map(({ stats }) => ({
        batting: stats.batting || {},
        bowling: stats.bowling || {}
    }));
    const teamMaxes = calculateTeamMaxes(normalizedPlayers);
    const ratingOpts = { fullCreditInnings: minInnings, fullCreditOvers: minOvers };

    const battingRanking = playersWithStats
        .filter(({ stats }) => stats.batting)
        .map(({ player, stats }) => ({ id: player.id, rating: calculateBattingRating(stats.batting, teamMaxes, ratingOpts) }))
        .sort((a, b) => b.rating - a.rating)
        .map(p => p.id);

    const bowlingRanking = playersWithStats
        .filter(({ stats }) => stats.bowling)
        .map(({ player, stats }) => ({ id: player.id, rating: calculateBowlingRating(stats.bowling, teamMaxes, ratingOpts) }))
        .sort((a, b) => b.rating - a.rating)
        .map(p => p.id);

    const fieldingRanking = playersWithStats
        .filter(({ stats }) => stats.fielding)
        .map(({ player, stats }) => ({
            id: player.id,
            totalDismissals: (stats.fielding.catches || 0) + (stats.fielding.stumpings || 0) + (stats.fielding.runOuts || 0)
        }))
        .sort((a, b) => b.totalDismissals - a.totalDismissals)
        .map(p => p.id);

    const allrounderRanking = playersWithStats
        .filter(({ stats }) => stats.batting && stats.bowling)
        .filter(({ stats }) => (stats.batting.innings || 0) >= minInnings && (stats.bowling.overs || 0) >= minOvers)
        .map(({ player, stats }) => {
            const batRating = calculateBattingRating(stats.batting, teamMaxes, ratingOpts);
            const bowlRating = calculateBowlingRating(stats.bowling, teamMaxes, ratingOpts);
            return { id: player.id, rating: Math.round((batRating * bowlRating) / 1000) };
        })
        .sort((a, b) => b.rating - a.rating)
        .map(p => p.id);

    return { batting: battingRanking, bowling: bowlingRanking, fielding: fieldingRanking, allrounder: allrounderRanking };
}

// Compute per-format ranking maps so the UI can show rank-change deltas on
// every format tab, not just Overall. Format keys mirror app.js: 'overall',
// 'box' (Turf), 'tennis' (Ground). Allrounder thresholds shrink for non-Overall
// formats since sample sizes are smaller — same as app.js processPlayerData().
function computeRankings(players) {
    const formats = ['overall', 'box', 'tennis'];
    const result = {};
    for (const fmt of formats) {
        const playersWithStats = players
            .map(p => ({ player: p, stats: getStatsForFormat(p, fmt) }))
            .filter(item => item.stats)
            // Mirror app.js processPlayerData: drop players who didn't bat or
            // bowl in this format so previousRankings stays in sync with what
            // the UI shows.
            .filter(({ stats }) => ((stats.batting && stats.batting.runs) || 0) > 0 || ((stats.bowling && stats.bowling.overs) || 0) > 0);
        const minInnings = fmt === 'overall' ? 10 : 5;
        const minOvers = fmt === 'overall' ? 20 : 5;
        result[fmt] = computeRankingsForFormat(playersWithStats, minInnings, minOvers);
    }
    return result;
}

// Load previous rankings from existing dashboard-data.json
function loadPreviousRankings() {
    try {
        const existingData = JSON.parse(fs.readFileSync('dashboard-data.json', 'utf8'));
        if (existingData && existingData.players && existingData.players.length > 0) {
            console.log(`Loaded existing data with ${existingData.players.length} players for ranking comparison`);
            return computeRankings(existingData.players);
        }
    } catch (e) {
        console.log('No existing dashboard-data.json found, skipping ranking comparison');
    }
    return null;
}

// Print ranking changes to console for every format (overall/box/tennis).
// Accepts both the new per-format shape and the legacy flat shape (treated as
// overall) so older dashboard-data.json files don't crash the extractor.
function printRankingChanges(previousRankings, newRankings, playersMap) {
    if (!previousRankings) {
        console.log('\nNo previous rankings to compare (first run)');
        return;
    }

    const categories = ['batting', 'bowling', 'fielding', 'allrounder'];
    const categoryLabels = { batting: 'Batting', bowling: 'Bowling', fielding: 'Fielding', allrounder: 'All-rounder' };
    const formatLabels = { overall: 'Overall', box: 'Turf', tennis: 'Ground' };

    const getPlayerName = (id) => {
        const p = playersMap.get(id);
        return p ? p.name : `Player ${id}`;
    };

    const isFlatShape = (obj) => obj && (obj.batting || obj.bowling || obj.fielding || obj.allrounder) && !obj.overall && !obj.box && !obj.tennis;
    const prevByFormat = isFlatShape(previousRankings) ? { overall: previousRankings } : previousRankings;
    const newByFormat = isFlatShape(newRankings) ? { overall: newRankings } : newRankings;

    for (const fmt of ['overall', 'box', 'tennis']) {
        const prevForFmt = prevByFormat[fmt];
        const newForFmt = newByFormat[fmt];
        if (!prevForFmt || !newForFmt) continue;

        console.log(`\n--- ${formatLabels[fmt]} format ---`);

        for (const cat of categories) {
            const prevOrder = prevForFmt[cat] || [];
            const newOrder = newForFmt[cat] || [];
            const prevRankMap = {};
            prevOrder.forEach((id, idx) => { prevRankMap[id] = idx + 1; });

            const changes = [];
            newOrder.forEach((id, idx) => {
                const newRank = idx + 1;
                const prevRank = prevRankMap[id];
                if (prevRank === undefined) {
                    changes.push({ name: getPlayerName(id), change: 'NEW', newRank });
                } else if (prevRank !== newRank) {
                    const diff = prevRank - newRank;
                    changes.push({ name: getPlayerName(id), change: diff, newRank, prevRank });
                }
            });

            if (changes.length > 0) {
                console.log(`\n${categoryLabels[cat]} Ranking Changes:`);
                changes.forEach(c => {
                    if (c.change === 'NEW') {
                        console.log(`  NEW  #${c.newRank} ${c.name}`);
                    } else if (c.change > 0) {
                        console.log(`  ▲ ${c.change}  #${c.prevRank} → #${c.newRank} ${c.name}`);
                    } else {
                        console.log(`  ▼ ${Math.abs(c.change)}  #${c.prevRank} → #${c.newRank} ${c.name}`);
                    }
                });
            } else {
                console.log(`\n${categoryLabels[cat]} Rankings: No changes`);
            }
        }
    }
}

function extractPlayerStats() {
    try {
        // Load previous rankings before processing new data
        const previousRankings = loadPreviousRankings();

        console.log('Reading HAR file...');
        let harData = fs.readFileSync('cricheroes.com.har', 'utf8');

        // Try to fix truncated HAR file by completing the JSON structure
        let har;
        try {
            har = JSON.parse(harData);
        } catch (parseError) {
            console.log('HAR file appears truncated, attempting to fix...');
            // Try to find the last complete entry and close the JSON properly
            const lastCompleteEntry = harData.lastIndexOf('}],"cookies":[]');
            if (lastCompleteEntry > 0) {
                harData = harData.substring(0, lastCompleteEntry + 15) + '}]}]}';
                har = JSON.parse(harData);
                console.log('Successfully fixed truncated HAR file');
            } else {
                // Alternative: extract data using regex patterns
                console.log('Using regex extraction for player statistics...');
                return extractWithRegex(harData, previousRankings);
            }
        }

        const playersMap = new Map();
        const harNameMap = buildHarNameMap(harData);
        console.log(`Built HAR roster lookup: ${Object.keys(harNameMap).length} player names found`);

        console.log('Processing HAR entries...');

        // Process all entries to find player statistics
        har.log.entries.forEach((entry, index) => {
            const url = entry.request.url;

            // Extract player statistics from API responses
            if (url.includes('get-player-statistic') && entry.response.content.text) {
                try {
                    const responseText = entry.response.content.text;
                    const apiResponse = JSON.parse(responseText);

                    if (apiResponse && apiResponse.data && apiResponse.data.statistics) {
                        const stats = apiResponse.data.statistics;

                        // Extract player ID from URL
                        const playerIdMatch = url.match(/get-player-statistic\/(\d+)/);
                        if (!playerIdMatch) return;

                        const playerId = playerIdMatch[1];

                        // Helper function to get value from statistics array
                        const getValue = (arr, title) => {
                            const item = arr.find(i => i.title === title);
                            return item ? item.value : 0;
                        };

                        const playerName = resolvePlayerName(playerId, harNameMap);

                        // Extract batting statistics
                        const batting = stats.batting || [];
                        const battingStats = {
                            runs: parseInt(getValue(batting, 'Runs')) || 0,
                            innings: parseInt(getValue(batting, 'Innings')) || 0,
                            average: parseFloat(getValue(batting, 'Avg')) || 0,
                            strikeRate: parseFloat(getValue(batting, 'SR')) || 0,
                            highestScore: String(getValue(batting, 'Highest Runs') || '0'),
                            thirties: parseInt(getValue(batting, '30s')) || 0,
                            fifties: parseInt(getValue(batting, '50s')) || 0,
                            hundreds: parseInt(getValue(batting, '100s')) || 0,
                            fours: parseInt(getValue(batting, '4s')) || 0,
                            sixes: parseInt(getValue(batting, '6s')) || 0,
                            notOuts: parseInt(getValue(batting, 'Not out')) || 0,
                            matches: parseInt(getValue(batting, 'Matches')) || 0
                        };

                        // Extract bowling statistics
                        const bowling = stats.bowling || [];
                        const bowlingStats = {
                            wickets: parseInt(getValue(bowling, 'Wickets')) || 0,
                            overs: parseFloat(getValue(bowling, 'Overs')) || 0,
                            economy: parseFloat(getValue(bowling, 'Economy')) || 0,
                            average: parseFloat(getValue(bowling, 'Avg')) || 0,
                            bestBowling: String(getValue(bowling, 'Best Bowling') || '0/0'),
                            maidens: parseInt(getValue(bowling, 'Maidens')) || 0,
                            runs: parseInt(getValue(bowling, 'Runs')) || 0,
                            dotBalls: parseInt(getValue(bowling, 'Dot Balls')) || 0,
                            wides: parseInt(getValue(bowling, 'Wides')) || 0,
                            noBalls: parseInt(getValue(bowling, 'NoBalls')) || 0,
                            threeWickets: parseInt(getValue(bowling, '3 Wickets')) || 0,
                            fiveWickets: parseInt(getValue(bowling, '5 Wickets')) || 0,
                            matches: parseInt(getValue(bowling, 'Matches')) || 0
                        };

                        // Extract fielding statistics
                        const fielding = stats.fielding || [];
                        const fieldingStats = {
                            catches: parseInt(getValue(fielding, 'Catches')) || 0,
                            stumpings: parseInt(getValue(fielding, 'Stumpings')) || 0,
                            runOuts: parseInt(getValue(fielding, 'Run outs')) || 0,
                            caughtBehind: parseInt(getValue(fielding, 'Caught behind')) || 0,
                            matches: parseInt(getValue(fielding, 'Matches')) || 0
                        };

                        // Store or update player data
                        playersMap.set(playerId, {
                            id: playerId,
                            name: playerName,
                            batting: battingStats,
                            bowling: bowlingStats,
                            fielding: fieldingStats,
                            lastUpdated: new Date().toISOString()
                        });

                        console.log(`✓ Extracted stats for: ${playerName} (ID: ${playerId})`);
                    }
                } catch (e) {
                    // Skip invalid JSON or malformed responses
                }
            }
        });

        // Convert to array
        const playersList = Array.from(playersMap.values());

        // Sort by name
        playersList.sort((a, b) => a.name.localeCompare(b.name));

        // Attach per-format (box / tennis) stats where available.
        const formatStats = loadAllFormatStats();
        let playersWithFormats = 0;
        for (const player of playersList) {
            const fs2 = formatStats[player.id];
            if (fs2 && (Object.keys(fs2.box).length > 0 || Object.keys(fs2.tennis).length > 0)) {
                player.formats = fs2;
                playersWithFormats++;
            }
        }
        if (playersWithFormats > 0) {
            console.log(`Attached format-wise stats for ${playersWithFormats} player(s)`);
        }

        // Compute new rankings and compare with previous
        const newRankings = computeRankings(playersList);

        // Create the data structure with previous rankings embedded
        const dashboardData = {
            teamName: 'Sunday Club',
            teamId: '10442708',
            lastSync: new Date().toISOString(),
            totalPlayers: playersList.length,
            players: playersList,
            previousRankings: previousRankings || null
        };

        // Save to JSON file
        fs.writeFileSync('dashboard-data.json', JSON.stringify(dashboardData, null, 2));

        // Update data.js for embedded dashboard data
        const dataJsContent = `// Dashboard data embedded for static deployment
const dashboardData = ${JSON.stringify(dashboardData, null, 2)};
`;
        fs.writeFileSync('data.js', dataJsContent);

        console.log('\n' + '='.repeat(60));
        console.log('✓ Extraction Complete!');
        console.log('='.repeat(60));
        console.log(`Total Players: ${playersList.length}`);
        console.log(`Output Files:`);
        console.log(`  - dashboard-data.json`);
        console.log(`  - data.js (embedded)`);
        console.log('='.repeat(60));

        // Print summary statistics
        const totalRuns = playersList.reduce((sum, p) => sum + p.batting.runs, 0);
        const totalWickets = playersList.reduce((sum, p) => sum + p.bowling.wickets, 0);
        const totalCatches = playersList.reduce((sum, p) => sum + p.fielding.catches, 0);

        console.log('\nTeam Summary:');
        console.log(`  Total Runs: ${totalRuns}`);
        console.log(`  Total Wickets: ${totalWickets}`);
        console.log(`  Total Catches: ${totalCatches}`);

        // Print ranking changes
        printRankingChanges(previousRankings, newRankings, playersMap);
        console.log('\n');

        return dashboardData;

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    }
}

// Fallback regex extraction for truncated HAR files
function extractWithRegex(harData, previousRankings) {
    const playersMap = new Map();
    const harNameMap = buildHarNameMap(harData);
    console.log(`Built HAR roster lookup: ${Object.keys(harNameMap).length} player names found`);

    console.log('Searching for player statistics in HAR data...');

    // Find all player statistic URLs and extract their associated response data
    const playerIdRegex = /get-player-statistic\/(\d+)\?pagesize=12/g;
    const playerIds = new Set();
    let match;
    while ((match = playerIdRegex.exec(harData)) !== null) {
        playerIds.add(match[1]);
    }

    console.log(`Found ${playerIds.size} unique player IDs`);

    // Find all "text" entries containing statistics
    // The HAR format stores JSON response as: "text": "{\"status\":true,...}"
    const textPattern = /"text":\s*"\{[^"]*\\"status\\":true[^"]*\\"statistics\\"[^"]*\}"/g;
    const textMatches = harData.match(textPattern) || [];

    // Also look for unescaped JSON (when HAR stores it differently)
    const unescapedPattern = /"text":\s*"\{[^\n]*"status":true[^\n]*"statistics"[^\n]*\}"/g;

    // Process each player ID by finding their stats in the HAR
    for (const playerId of playerIds) {
        // Find URL position
        const urlPattern = `get-player-statistic/${playerId}?pagesize=12`;
        let searchIdx = 0;
        let foundStats = false;

        while (!foundStats) {
            const urlIndex = harData.indexOf(urlPattern, searchIdx);
            if (urlIndex === -1) break;

            // Search forward for the response content (within ~5000 chars typically)
            const searchEnd = Math.min(urlIndex + 10000, harData.length);
            const searchBlock = harData.substring(urlIndex, searchEnd);

            // Look for "text": followed by escaped JSON string (matches content until unescaped closing quote)
            // The pattern handles escaped quotes \" inside the string
            const textMatch = searchBlock.match(/"text":\s*"((?:[^"\\]|\\.)*)"/);

            if (textMatch) {
                try {
                    // The content is JSON-escaped, unescape it
                    let jsonStr = textMatch[1];
                    // Unescape the JSON string
                    jsonStr = jsonStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

                    const data = JSON.parse(jsonStr);

                    if (data.status && data.data && data.data.statistics) {
                        const stats = data.data.statistics;
                        const batting = stats.batting || [];
                        const bowling = stats.bowling || [];
                        const fielding = stats.fielding || [];

                        const getValue = (arr, title) => {
                            const item = arr.find(i => i.title === title);
                            return item ? item.value : 0;
                        };

                        const playerName = resolvePlayerName(playerId, harNameMap);

                        const battingStats = {
                            runs: parseInt(getValue(batting, 'Runs')) || 0,
                            innings: parseInt(getValue(batting, 'Innings')) || 0,
                            average: parseFloat(getValue(batting, 'Avg')) || 0,
                            strikeRate: parseFloat(getValue(batting, 'SR')) || 0,
                            highestScore: String(getValue(batting, 'Highest Runs') || '0'),
                            thirties: parseInt(getValue(batting, '30s')) || 0,
                            fifties: parseInt(getValue(batting, '50s')) || 0,
                            hundreds: parseInt(getValue(batting, '100s')) || 0,
                            fours: parseInt(getValue(batting, '4s')) || 0,
                            sixes: parseInt(getValue(batting, '6s')) || 0,
                            notOuts: parseInt(getValue(batting, 'Not out')) || 0,
                            matches: parseInt(getValue(batting, 'Matches')) || 0
                        };

                        const bowlingStats = {
                            wickets: parseInt(getValue(bowling, 'Wickets')) || 0,
                            overs: parseFloat(getValue(bowling, 'Overs')) || 0,
                            economy: parseFloat(getValue(bowling, 'Economy')) || 0,
                            average: parseFloat(getValue(bowling, 'Avg')) || 0,
                            bestBowling: String(getValue(bowling, 'Best Bowling') || '0/0'),
                            maidens: parseInt(getValue(bowling, 'Maidens')) || 0,
                            runs: parseInt(getValue(bowling, 'Runs')) || 0,
                            dotBalls: parseInt(getValue(bowling, 'Dot Balls')) || 0,
                            wides: parseInt(getValue(bowling, 'Wides')) || 0,
                            noBalls: parseInt(getValue(bowling, 'NoBalls')) || 0,
                            threeWickets: parseInt(getValue(bowling, '3 Wickets')) || 0,
                            fiveWickets: parseInt(getValue(bowling, '5 Wickets')) || 0,
                            matches: parseInt(getValue(bowling, 'Matches')) || 0
                        };

                        const fieldingStats = {
                            catches: parseInt(getValue(fielding, 'Catches')) || 0,
                            stumpings: parseInt(getValue(fielding, 'Stumpings')) || 0,
                            runOuts: parseInt(getValue(fielding, 'Run outs')) || 0,
                            caughtBehind: parseInt(getValue(fielding, 'Caught behind')) || 0,
                            matches: parseInt(getValue(fielding, 'Matches')) || 0
                        };

                        playersMap.set(playerId, {
                            id: playerId,
                            name: playerName,
                            batting: battingStats,
                            bowling: bowlingStats,
                            fielding: fieldingStats,
                            lastUpdated: new Date().toISOString()
                        });

                        console.log(`✓ Extracted stats for: ${playerName} (ID: ${playerId})`);
                        foundStats = true;
                    }
                } catch (e) {
                    // Try next occurrence
                }
            }
            searchIdx = urlIndex + 1;
        }

        if (!foundStats) {
            console.log(`  Could not find stats for player ID: ${playerId}`);
        }
    }

    return finalizeData(playersMap, previousRankings);
}

function finalizeData(playersMap, previousRankings, opts = {}) {
    // Drop blocklisted players before any downstream processing or output.
    const dropped = [];
    for (const id of [...playersMap.keys()]) {
        if (isBlocked(id)) {
            dropped.push(`${playersMap.get(id).name || '?'} (${id})`);
            playersMap.delete(id);
        }
    }
    if (dropped.length > 0) {
        console.log(`Filtered ${dropped.length} blocklisted player(s): ${dropped.join(', ')}`);
    }

    const playersList = Array.from(playersMap.values());
    playersList.sort((a, b) => a.name.localeCompare(b.name));

    // Attach per-format (box / tennis) stats from HAR files for any player that
    // doesn't already have them (e.g. set by the live API scraper).
    const formatStats = loadAllFormatStats();
    let playersWithFormats = playersList.filter(p => p.formats).length;
    let attachedFromHar = 0;
    for (const player of playersList) {
        if (player.formats) continue;
        const fs2 = formatStats[player.id];
        if (fs2 && (Object.keys(fs2.box).length > 0 || Object.keys(fs2.tennis).length > 0)) {
            player.formats = fs2;
            attachedFromHar++;
            playersWithFormats++;
        }
    }
    if (attachedFromHar > 0) {
        console.log(`Attached format-wise stats from HAR for ${attachedFromHar} player(s)`);
    }
    if (playersWithFormats > 0) {
        console.log(`Total players with format-wise stats: ${playersWithFormats}`);
    }

    // Compute new rankings and compare with previous
    const newRankings = computeRankings(playersList);

    const dashboardData = {
        teamName: opts.teamName || 'Sunday Club',
        teamId: opts.teamId || '10442708',
        lastSync: new Date().toISOString(),
        totalPlayers: playersList.length,
        players: playersList,
        previousRankings: previousRankings || null
    };

    fs.writeFileSync('dashboard-data.json', JSON.stringify(dashboardData, null, 2));

    const dataJsContent = `// Dashboard data embedded for static deployment
const dashboardData = ${JSON.stringify(dashboardData, null, 2)};
`;
    fs.writeFileSync('data.js', dataJsContent);

    console.log('\n' + '='.repeat(60));
    console.log('✓ Extraction Complete!');
    console.log('='.repeat(60));
    console.log(`Total Players: ${playersList.length}`);
    console.log(`Output Files:`);
    console.log(`  - dashboard-data.json`);
    console.log(`  - data.js (embedded)`);
    console.log('='.repeat(60));

    const totalRuns = playersList.reduce((sum, p) => sum + p.batting.runs, 0);
    const totalWickets = playersList.reduce((sum, p) => sum + p.bowling.wickets, 0);
    const totalCatches = playersList.reduce((sum, p) => sum + p.fielding.catches, 0);

    console.log('\nTeam Summary:');
    console.log(`  Total Runs: ${totalRuns}`);
    console.log(`  Total Wickets: ${totalWickets}`);
    console.log(`  Total Catches: ${totalCatches}`);

    // Print ranking changes
    printRankingChanges(previousRankings, newRankings, playersMap);
    console.log('\n');

    return dashboardData;
}

// Extract from additional HAR file and append to existing data
function appendFromHarFile(harFileName) {
    try {
        console.log(`\nReading additional HAR file: ${harFileName}...`);

        // Load previous rankings before processing
        const previousRankings = loadPreviousRankings();

        // Load existing data
        let existingData = { players: [] };
        try {
            existingData = JSON.parse(fs.readFileSync('dashboard-data.json', 'utf8'));
            console.log(`Loaded existing data with ${existingData.players.length} players`);
        } catch (e) {
            console.log('No existing data found, starting fresh');
        }

        // Create map from existing players
        const playersMap = new Map();
        existingData.players.forEach(p => playersMap.set(p.id, p));

        // Read new HAR file
        const harData = fs.readFileSync(harFileName, 'utf8');
        const harNameMap = buildHarNameMap(harData);
        console.log(`Built HAR roster lookup: ${Object.keys(harNameMap).length} player names found`);

        // Find player IDs in new HAR
        const playerIdRegex = /get-player-statistic\/(\d+)\?pagesize=12/g;
        const newPlayerIds = new Set();
        let match;
        while ((match = playerIdRegex.exec(harData)) !== null) {
            newPlayerIds.add(match[1]);
        }

        console.log(`Found ${newPlayerIds.size} player IDs in new HAR file`);

        let newPlayersAdded = 0;
        let playersUpdated = 0;

        // Process each player ID
        for (const playerId of newPlayerIds) {
            const urlPattern = `get-player-statistic/${playerId}?pagesize=12`;
            let searchIdx = 0;
            let foundStats = false;

            while (!foundStats) {
                const urlIndex = harData.indexOf(urlPattern, searchIdx);
                if (urlIndex === -1) break;

                const searchEnd = Math.min(urlIndex + 10000, harData.length);
                const searchBlock = harData.substring(urlIndex, searchEnd);

                const textMatch = searchBlock.match(/"text":\s*"((?:[^"\\]|\\.)*)"/);

                if (textMatch) {
                    try {
                        let jsonStr = textMatch[1];
                        jsonStr = jsonStr.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

                        const data = JSON.parse(jsonStr);

                        if (data.status && data.data && data.data.statistics) {
                            const stats = data.data.statistics;
                            const batting = stats.batting || [];
                            const bowling = stats.bowling || [];
                            const fielding = stats.fielding || [];

                            const getValue = (arr, title) => {
                                const item = arr.find(i => i.title === title);
                                return item ? item.value : 0;
                            };

                            const playerName = resolvePlayerName(playerId, harNameMap);

                            const battingStats = {
                                runs: parseInt(getValue(batting, 'Runs')) || 0,
                                innings: parseInt(getValue(batting, 'Innings')) || 0,
                                average: parseFloat(getValue(batting, 'Avg')) || 0,
                                strikeRate: parseFloat(getValue(batting, 'SR')) || 0,
                                highestScore: String(getValue(batting, 'Highest Runs') || '0'),
                                thirties: parseInt(getValue(batting, '30s')) || 0,
                                fifties: parseInt(getValue(batting, '50s')) || 0,
                                hundreds: parseInt(getValue(batting, '100s')) || 0,
                                fours: parseInt(getValue(batting, '4s')) || 0,
                                sixes: parseInt(getValue(batting, '6s')) || 0,
                                notOuts: parseInt(getValue(batting, 'Not out')) || 0,
                                matches: parseInt(getValue(batting, 'Matches')) || 0
                            };

                            const bowlingStats = {
                                wickets: parseInt(getValue(bowling, 'Wickets')) || 0,
                                overs: parseFloat(getValue(bowling, 'Overs')) || 0,
                                economy: parseFloat(getValue(bowling, 'Economy')) || 0,
                                average: parseFloat(getValue(bowling, 'Avg')) || 0,
                                bestBowling: String(getValue(bowling, 'Best Bowling') || '0/0'),
                                maidens: parseInt(getValue(bowling, 'Maidens')) || 0,
                                runs: parseInt(getValue(bowling, 'Runs')) || 0,
                                dotBalls: parseInt(getValue(bowling, 'Dot Balls')) || 0,
                                wides: parseInt(getValue(bowling, 'Wides')) || 0,
                                noBalls: parseInt(getValue(bowling, 'NoBalls')) || 0,
                                threeWickets: parseInt(getValue(bowling, '3 Wickets')) || 0,
                                fiveWickets: parseInt(getValue(bowling, '5 Wickets')) || 0,
                                matches: parseInt(getValue(bowling, 'Matches')) || 0
                            };

                            const fieldingStats = {
                                catches: parseInt(getValue(fielding, 'Catches')) || 0,
                                stumpings: parseInt(getValue(fielding, 'Stumpings')) || 0,
                                runOuts: parseInt(getValue(fielding, 'Run outs')) || 0,
                                caughtBehind: parseInt(getValue(fielding, 'Caught behind')) || 0,
                                matches: parseInt(getValue(fielding, 'Matches')) || 0
                            };

                            const isNew = !playersMap.has(playerId);
                            playersMap.set(playerId, {
                                id: playerId,
                                name: playerName,
                                batting: battingStats,
                                bowling: bowlingStats,
                                fielding: fieldingStats,
                                lastUpdated: new Date().toISOString()
                            });

                            if (isNew) {
                                console.log(`✓ Added NEW player: ${playerName} (ID: ${playerId})`);
                                newPlayersAdded++;
                            } else {
                                console.log(`✓ Updated existing: ${playerName} (ID: ${playerId})`);
                                playersUpdated++;
                            }
                            foundStats = true;
                        }
                    } catch (e) {
                        // Try next occurrence
                    }
                }
                searchIdx = urlIndex + 1;
            }
        }

        // Save updated data
        const result = finalizeData(playersMap, previousRankings);

        console.log(`\nSummary:`);
        console.log(`  New players added: ${newPlayersAdded}`);
        console.log(`  Existing players updated: ${playersUpdated}`);

        return result;

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length > 0 && args[0] === '--append') {
        const harFile = args[1] || 'cricheroes_new.com.har';
        appendFromHarFile(harFile);
    } else {
        extractPlayerStats();
    }
}

module.exports = {
    extractPlayerStats,
    appendFromHarFile,
    finalizeData,
    loadPreviousRankings,
    computeRankings,
    calculateTeamMaxes,
    calculateBattingRating,
    calculateBowlingRating,
    mapBallTypeBatting,
    mapBallTypeBowling,
    mapBallTypeFielding,
    isBlocked,
    BLOCKED_PLAYER_IDS
};
