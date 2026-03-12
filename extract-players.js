// Node.js script to extract complete player statistics from HAR file
const fs = require('fs');

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

function calculateBattingRating(batting, maxes) {
    const normalize = (val, max) => max > 0 ? (val / max) * 1000 : 0;

    const quality = normalize(batting.average || 0, maxes.average);
    const intent = normalize(batting.strikeRate || 0, maxes.strikeRate);
    const volume = normalize(batting.runs || 0, maxes.runs);
    const cons = (batting.thirties || 0) + ((batting.fifties || 0) * 2);
    const consistency = normalize(cons, maxes.consistency);

    return Math.round(quality * 0.30 + intent * 0.25 + volume * 0.25 + consistency * 0.20);
}

function calculateBowlingRating(bowling, maxes) {
    if (!bowling.overs || bowling.overs === 0) return 0;
    if (!bowling.wickets || bowling.wickets === 0) return 0;

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

    return Math.round(wicketTaking * 0.30 + economy * 0.25 + efficiency * 0.25 + impact * 0.20);
}

// Compute sorted ranking order (returns array of player IDs) for all categories
function computeRankings(players) {
    const teamMaxes = calculateTeamMaxes(players);

    // Batting: sorted by battingRating descending
    const battingRanking = players
        .map(p => ({ id: p.id, rating: calculateBattingRating(p.batting, teamMaxes) }))
        .sort((a, b) => b.rating - a.rating)
        .map(p => p.id);

    // Bowling: sorted by bowlingRating descending
    const bowlingRanking = players
        .map(p => ({ id: p.id, rating: calculateBowlingRating(p.bowling, teamMaxes) }))
        .sort((a, b) => b.rating - a.rating)
        .map(p => p.id);

    // Fielding: sorted by totalDismissals descending
    const fieldingRanking = players
        .map(p => ({
            id: p.id,
            totalDismissals: (p.fielding.catches || 0) + (p.fielding.stumpings || 0) + (p.fielding.runOuts || 0)
        }))
        .sort((a, b) => b.totalDismissals - a.totalDismissals)
        .map(p => p.id);

    // Allrounder: filtered (innings >= 10 && overs >= 20), sorted by allrounderRating descending
    const allrounderRanking = players
        .filter(p => (p.batting.innings || 0) >= 10 && (p.bowling.overs || 0) >= 20)
        .map(p => {
            const batRating = calculateBattingRating(p.batting, teamMaxes);
            const bowlRating = calculateBowlingRating(p.bowling, teamMaxes);
            return { id: p.id, rating: Math.round((batRating * bowlRating) / 1000) };
        })
        .sort((a, b) => b.rating - a.rating)
        .map(p => p.id);

    return { batting: battingRanking, bowling: bowlingRanking, fielding: fieldingRanking, allrounder: allrounderRanking };
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

// Print ranking changes to console
function printRankingChanges(previousRankings, newRankings, playersMap) {
    if (!previousRankings) {
        console.log('\nNo previous rankings to compare (first run)');
        return;
    }

    const categories = ['batting', 'bowling', 'fielding', 'allrounder'];
    const categoryLabels = { batting: 'Batting', bowling: 'Bowling', fielding: 'Fielding', allrounder: 'All-rounder' };

    const getPlayerName = (id) => {
        const p = playersMap.get(id);
        return p ? p.name : `Player ${id}`;
    };

    for (const cat of categories) {
        const prevOrder = previousRankings[cat] || [];
        const newOrder = newRankings[cat] || [];
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

                        // Get player name from URL or use fallback
                        const playerNames = {
                            '30000671': 'Arun Balaji',
                            '3179681': 'Prasanth',
                            '31974223': 'Manoj Jeganath',
                            '3224203': 'Praveen J',
                            '3224784': 'Vicky',
                            '3224789': 'Kaviarasu',
                            '3224822': 'Bharathi',
                            '3224827': 'Meghanathan TKM',
                            '3224839': 'Pradeep TKM',
                            '3224846': 'Sathish TKM',
                            '37775058': 'Dinesh Baranitharan',
                            '41473990': 'Muthuraj Anna',
                            '41473991': 'Pon Sundar',
                            '41473993': 'Saravana CPT',
                            '41474287': 'Diwakar Cricket',
                            '41474289': 'VMR',
                            '41832657': 'Harish D',
                            '42047823': 'Sheik',
                            '43183920': 'Parthiban',
                            '43668809': 'Valan'
                        };

                        const playerName = playerNames[playerId] || `Player ${playerId}`;

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

    // Player name mapping
    const playerNames = {
        '30000671': 'Arun Balaji',
        '3179681': 'Prasanth',
        '31974223': 'Manoj Jeganath',
        '3224203': 'Praveen J',
        '3224784': 'Vicky',
        '3224789': 'Kaviarasu',
        '3224822': 'Bharathi',
        '3224827': 'Meghanathan TKM',
        '3224839': 'Pradeep TKM',
        '3224846': 'Sathish TKM',
        '37775058': 'Dinesh Baranitharan',
        '41473990': 'Muthuraj Anna',
        '41473991': 'Pon Sundar',
        '41473993': 'Saravana CPT',
        '41474287': 'Diwakar Cricket',
        '41474289': 'VMR',
        '41832657': 'Harish D',
        '42047823': 'Sheik',
        '43183920': 'Parthiban',
        '43668809': 'Valan'
    };

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

                        const playerName = playerNames[playerId] || `Player ${playerId}`;

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

function finalizeData(playersMap, previousRankings) {
    const playersList = Array.from(playersMap.values());
    playersList.sort((a, b) => a.name.localeCompare(b.name));

    // Compute new rankings and compare with previous
    const newRankings = computeRankings(playersList);

    const dashboardData = {
        teamName: 'Sunday Club',
        teamId: '10442708',
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

        // Player name mapping (extended)
        const playerNames = {
            '30000671': 'Arun Balaji',
            '3179681': 'Prasanth',
            '31974223': 'Manoj Jeganath',
            '3224203': 'Praveen J',
            '3224784': 'Vicky',
            '3224789': 'Kaviarasu',
            '3224822': 'Bharathi',
            '3224827': 'Meghanathan TKM',
            '3224839': 'Pradeep TKM',
            '3224846': 'Sathish TKM',
            '37775058': 'Dinesh Baranitharan',
            '41473990': 'Muthuraj Anna',
            '41473991': 'Pon Sundar',
            '41473993': 'Saravana CPT',
            '41474287': 'Diwakar Cricket',
            '41474289': 'VMR',
            '41832657': 'Harish D',
            '42047823': 'Sheik',
            '43183920': 'Parthiban',
            '43668809': 'Valan'
        };

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

                            const playerName = playerNames[playerId] || `Player ${playerId}`;

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

module.exports = { extractPlayerStats, appendFromHarFile };
