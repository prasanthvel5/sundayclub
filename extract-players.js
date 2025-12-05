// Node.js script to extract complete player statistics from HAR file
const fs = require('fs');

function extractPlayerStats() {
    try {
        console.log('Reading HAR file...');
        const harData = fs.readFileSync('cricheroes.com.har', 'utf8');
        const har = JSON.parse(harData);

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

// Run if called directly
if (require.main === module) {
    extractPlayerStats();
}

module.exports = { extractPlayerStats };
