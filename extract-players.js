// Node.js script to extract complete player statistics from HAR file
const fs = require('fs');

function extractPlayerStats() {
    try {
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
                return extractWithRegex(harData);
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
                            '43183920': 'Parthiban'
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

        // Create the data structure
        const dashboardData = {
            teamName: 'Sunday Club',
            teamId: '10442708',
            lastSync: new Date().toISOString(),
            totalPlayers: playersList.length,
            players: playersList
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
        console.log('\n');

        return dashboardData;

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    }
}

// Fallback regex extraction for truncated HAR files
function extractWithRegex(harData) {
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
        '43183920': 'Parthiban'
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

    return finalizeData(playersMap);
}

function finalizeData(playersMap) {
    const playersList = Array.from(playersMap.values());
    playersList.sort((a, b) => a.name.localeCompare(b.name));

    const dashboardData = {
        teamName: 'Sunday Club',
        teamId: '10442708',
        lastSync: new Date().toISOString(),
        totalPlayers: playersList.length,
        players: playersList
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
    console.log('\n');

    return dashboardData;
}

// Run if called directly
if (require.main === module) {
    extractPlayerStats();
}

module.exports = { extractPlayerStats };
