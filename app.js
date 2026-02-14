// State
// dashboardData is loaded from data.js
let battingLeaderboard = [];
let bowlingLeaderboard = [];
let fieldingLeaderboard = [];
let allrounderLeaderboard = [];

// Sorting state
let battingSortBy = 'battingRating';
let bowlingSortBy = 'bowlingRating';
let fieldingSortBy = 'totalDismissals';
let allrounderSortBy = 'allrounderRating';

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    loadDashboardData();
    setupSyncButton();
    setupSortControls();
});

// Setup sync button
function setupSyncButton() {
    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', handleSync);
    }
}

// Setup sort controls
function setupSortControls() {
    const battingSort = document.getElementById('batting-sort');
    const bowlingSort = document.getElementById('bowling-sort');
    const fieldingSort = document.getElementById('fielding-sort');

    if (battingSort) {
        battingSort.addEventListener('change', (e) => {
            battingSortBy = e.target.value;
            sortBattingLeaderboard();
            displayBattingLeaderboard();
        });
    }

    if (bowlingSort) {
        bowlingSort.addEventListener('change', (e) => {
            bowlingSortBy = e.target.value;
            sortBowlingLeaderboard();
            displayBowlingLeaderboard();
        });
    }

    if (fieldingSort) {
        fieldingSort.addEventListener('change', (e) => {
            fieldingSortBy = e.target.value;
            sortFieldingLeaderboard();
            displayFieldingLeaderboard();
        });
    }

    const allrounderSort = document.getElementById('allrounder-sort');
    if (allrounderSort) {
        allrounderSort.addEventListener('change', (e) => {
            allrounderSortBy = e.target.value;
            sortAllrounderLeaderboard();
            displayAllrounderLeaderboard();
        });
    }
}

// Handle sync button click
async function handleSync() {
    const syncBtn = document.getElementById('sync-btn');
    const syncIcon = syncBtn.querySelector('.sync-icon');

    try {
        // Add spinning animation
        syncIcon.classList.add('syncing');
        syncBtn.disabled = true;

        // Call sync endpoint
        const response = await fetch('/sync', {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Sync failed');
        }

        const result = await response.json();

        // Reload data
        await loadDashboardData();

        // Show success message briefly
        showSyncSuccess();

    } catch (error) {
        console.error('Sync error:', error);
        showSyncError();
    } finally {
        // Remove spinning animation
        syncIcon.classList.remove('syncing');
        syncBtn.disabled = false;
    }
}

// Show sync success message
function showSyncSuccess() {
    const syncBtn = document.getElementById('sync-btn');
    const originalHTML = syncBtn.innerHTML;
    syncBtn.innerHTML = '<span class="sync-icon">✓</span>';
    syncBtn.classList.add('sync-success');

    setTimeout(() => {
        syncBtn.innerHTML = originalHTML;
        syncBtn.classList.remove('sync-success');
    }, 2000);
}

// Show sync error message
function showSyncError() {
    const syncBtn = document.getElementById('sync-btn');
    const originalHTML = syncBtn.innerHTML;
    syncBtn.innerHTML = '<span class="sync-icon">✗</span>';
    syncBtn.classList.add('sync-error');

    setTimeout(() => {
        syncBtn.innerHTML = originalHTML;
        syncBtn.classList.remove('sync-error');
    }, 2000);
}

// Tab functionality
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Update active tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName).classList.add('active');
}

// Load dashboard data (data is already embedded from data.js)
function loadDashboardData() {
    try {
        showLoading();

        // dashboardData is already loaded from data.js
        if (!dashboardData || !dashboardData.players || dashboardData.players.length === 0) {
            throw new Error('No player data found');
        }

        // Process and display data
        processPlayerData();
        displayDashboard();
        hideLoading();

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError();
    }
}

// Process player data and create leaderboards
function processPlayerData() {
    const players = dashboardData.players;
    const teamMaxes = calculateTeamMaxes(players);

    // Create batting leaderboard
    battingLeaderboard = players.map(player => ({
        playerId: player.id,
        playerName: player.name,
        ...player.batting,
        battingRating: calculateBattingRating(player.batting, teamMaxes)
    }));
    sortBattingLeaderboard();

    // Create bowling leaderboard
    bowlingLeaderboard = players.map(player => ({
        playerId: player.id,
        playerName: player.name,
        ...player.bowling,
        bowlingRating: calculateBowlingRating(player.bowling, teamMaxes)
    }));
    sortBowlingLeaderboard();

    // Create fielding leaderboard
    fieldingLeaderboard = players.map(player => ({
        playerId: player.id,
        playerName: player.name,
        ...player.fielding,
        totalDismissals: player.fielding.catches + player.fielding.stumpings + player.fielding.runOuts
    }));
    sortFieldingLeaderboard();

    // Create allrounder leaderboard
    allrounderLeaderboard = players
        .filter(p => (p.batting.innings || 0) >= 10 && (p.bowling.overs || 0) >= 20)
        .map(player => {
            const battingRating = calculateBattingRating(player.batting, teamMaxes);
            const bowlingRating = calculateBowlingRating(player.bowling, teamMaxes);
            const allrounderRating = Math.round((battingRating * bowlingRating) / 1000);
            return {
                playerId: player.id,
                playerName: player.name,
                battingRating,
                bowlingRating,
                allrounderRating,
                runs: player.batting.runs,
                average: player.batting.average,
                strikeRate: player.batting.strikeRate,
                wickets: player.bowling.wickets,
                economy: player.bowling.economy,
                bowlAvg: player.bowling.average
            };
        });
    sortAllrounderLeaderboard();
}

// Sort batting leaderboard
function sortBattingLeaderboard() {
    battingLeaderboard.sort((a, b) => {
        // Handle highestScore specially (it might have * character)
        if (battingSortBy === 'highestScore') {
            const scoreA = parseInt(String(a.highestScore).replace(/[*]/g, '')) || 0;
            const scoreB = parseInt(String(b.highestScore).replace(/[*]/g, '')) || 0;
            return scoreB - scoreA;
        }
        // For all other numeric fields, sort descending
        return (b[battingSortBy] || 0) - (a[battingSortBy] || 0);
    });
}

// Sort bowling leaderboard
function sortBowlingLeaderboard() {
    bowlingLeaderboard.sort((a, b) => {
        // Economy should be sorted ascending (lower is better)
        if (bowlingSortBy === 'economy') {
            return (a[bowlingSortBy] || 999) - (b[bowlingSortBy] || 999);
        }
        // All others sort descending (higher is better)
        return (b[bowlingSortBy] || 0) - (a[bowlingSortBy] || 0);
    });
}

// Sort fielding leaderboard
function sortFieldingLeaderboard() {
    fieldingLeaderboard.sort((a, b) => {
        // All fielding stats sort descending (higher is better)
        return (b[fieldingSortBy] || 0) - (a[fieldingSortBy] || 0);
    });
}

// Calculate team max/min values for normalization
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

    // Handle edge cases where all values are the same
    if (maxes.economyMin === Infinity) maxes.economyMin = 0;
    if (maxes.bowlAvgMin === Infinity) maxes.bowlAvgMin = 0;

    return maxes;
}

// Calculate batting rating (0-1000)
function calculateBattingRating(batting, maxes) {
    const normalize = (val, max) => max > 0 ? (val / max) * 1000 : 0;

    const quality = normalize(batting.average || 0, maxes.average);
    const intent = normalize(batting.strikeRate || 0, maxes.strikeRate);
    const volume = normalize(batting.runs || 0, maxes.runs);
    const cons = (batting.thirties || 0) + ((batting.fifties || 0) * 2);
    const consistency = normalize(cons, maxes.consistency);

    return Math.round(quality * 0.30 + intent * 0.25 + volume * 0.25 + consistency * 0.20);
}

// Calculate bowling rating (0-1000)
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

// Sort allrounder leaderboard
function sortAllrounderLeaderboard() {
    allrounderLeaderboard.sort((a, b) => (b[allrounderSortBy] || 0) - (a[allrounderSortBy] || 0));
}

// Display allrounder leaderboard
function displayAllrounderLeaderboard() {
    const container = document.getElementById('allrounder-leaderboard');

    container.innerHTML = allrounderLeaderboard.map((player, index) => `
        <div class="player-card rank-${index + 1}">
            <div class="player-info">
                <div class="allrounder-player-header">
                    <div class="rank-badge-small">${index + 1}</div>
                    <div class="player-name">${player.playerName}</div>
                    <div class="allrounder-rating-badge">${player.allrounderRating}</div>
                </div>
                <div class="rating-bars">
                    <div class="rating-bar-row">
                        <span class="rating-bar-label">BAT</span>
                        <div class="rating-bar-track">
                            <div class="rating-bar-fill rating-bar-bat" style="width: ${player.battingRating / 10}%"></div>
                        </div>
                        <span class="rating-bar-value">${player.battingRating}</span>
                    </div>
                    <div class="rating-bar-row">
                        <span class="rating-bar-label">BOWL</span>
                        <div class="rating-bar-track">
                            <div class="rating-bar-fill rating-bar-bowl" style="width: ${player.bowlingRating / 10}%"></div>
                        </div>
                        <span class="rating-bar-value">${player.bowlingRating}</span>
                    </div>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <span class="stat-item-label">Runs</span>
                        <span class="stat-item-value">${player.runs}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Bat Avg</span>
                        <span class="stat-item-value">${player.average.toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">SR</span>
                        <span class="stat-item-value">${player.strikeRate.toFixed(1)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Wkts</span>
                        <span class="stat-item-value">${player.wickets}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Econ</span>
                        <span class="stat-item-value">${player.economy.toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Bowl Avg</span>
                        <span class="stat-item-value">${player.bowlAvg.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Display dashboard
function displayDashboard() {
    displayBattingLeaderboard();
    displayBowlingLeaderboard();
    displayFieldingLeaderboard();
    displayHighlights();
    displayAllrounderLeaderboard();
    updateLastUpdated();

    document.getElementById('dashboard').style.display = 'block';
}

// Display batting leaderboard
function displayBattingLeaderboard() {
    const container = document.getElementById('batting-leaderboard');

    // Display leaderboard
    container.innerHTML = battingLeaderboard.map((player, index) => `
        <div class="player-card rank-${index + 1}">
            <div class="player-info">
                <div class="allrounder-player-header">
                    <div class="rank-badge-small">${index + 1}</div>
                    <div class="player-name">${player.playerName}</div>
                    <div class="rating-badge-small">${player.battingRating}</div>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <span class="stat-item-label">Runs</span>
                        <span class="stat-item-value">${player.runs}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Inn</span>
                        <span class="stat-item-value">${player.innings || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Avg</span>
                        <span class="stat-item-value">${player.average.toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">SR</span>
                        <span class="stat-item-value">${player.strikeRate.toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">HS</span>
                        <span class="stat-item-value">${player.highestScore}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">30s/50s</span>
                        <span class="stat-item-value">${player.thirties || 0}/${player.fifties || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">4s/6s</span>
                        <span class="stat-item-value">${player.fours}/${player.sixes}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Display bowling leaderboard
function displayBowlingLeaderboard() {
    const container = document.getElementById('bowling-leaderboard');

    // Display leaderboard
    container.innerHTML = bowlingLeaderboard.map((player, index) => `
        <div class="player-card rank-${index + 1}">
            <div class="player-info">
                <div class="allrounder-player-header">
                    <div class="rank-badge-small">${index + 1}</div>
                    <div class="player-name">${player.playerName}</div>
                    <div class="rating-badge-small">${player.bowlingRating}</div>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <span class="stat-item-label">Wickets</span>
                        <span class="stat-item-value">${player.wickets}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Inn</span>
                        <span class="stat-item-value">${player.matches || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Overs</span>
                        <span class="stat-item-value">${player.overs.toFixed(1)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Econ</span>
                        <span class="stat-item-value">${player.economy.toFixed(2)}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Best</span>
                        <span class="stat-item-value">${player.bestBowling}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">3wkts</span>
                        <span class="stat-item-value">${player.threeWickets || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Dots</span>
                        <span class="stat-item-value">${player.dotBalls || 0}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Display fielding leaderboard
function displayFieldingLeaderboard() {
    const container = document.getElementById('fielding-leaderboard');

    // Display leaderboard
    container.innerHTML = fieldingLeaderboard.map((player, index) => `
        <div class="player-card rank-${index + 1}">
            <div class="player-info">
                <div class="player-header">
                    <div class="rank-badge-small">${index + 1}</div>
                    <div class="player-name">${player.playerName}</div>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <span class="stat-item-label">Catches</span>
                        <span class="stat-item-value">${player.catches}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Inn</span>
                        <span class="stat-item-value">${player.matches || 0}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Stumpings</span>
                        <span class="stat-item-value">${player.stumpings}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Run Outs</span>
                        <span class="stat-item-value">${player.runOuts}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Total</span>
                        <span class="stat-item-value">${player.totalDismissals}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Display highlights
function displayHighlights() {
    const container = document.getElementById('highlights-grid');

    // Calculate highlights
    const highlights = [];

    // Highest Score (single innings)
    const highestScore = [...battingLeaderboard].sort((a, b) => {
        const scoreA = parseInt(String(a.highestScore).replace(/[*]/g, '')) || 0;
        const scoreB = parseInt(String(b.highestScore).replace(/[*]/g, '')) || 0;
        return scoreB - scoreA;
    })[0];
    highlights.push({
        icon: '🏏',
        title: 'Highest Score',
        player: highestScore.playerName,
        stat: highestScore.highestScore,
        label: 'runs'
    });

    // Most Runs
    const topScorer = [...battingLeaderboard].sort((a, b) => b.runs - a.runs)[0];
    highlights.push({
        icon: '💯',
        title: 'Most Runs',
        player: topScorer.playerName,
        stat: topScorer.runs,
        label: 'runs'
    });

    // Most Thirties
    const mostThirties = [...battingLeaderboard].sort((a, b) => (b.thirties || 0) - (a.thirties || 0))[0];
    highlights.push({
        icon: '3️⃣',
        title: 'Most Thirties',
        player: mostThirties.playerName,
        stat: mostThirties.thirties || 0,
        label: '30s'
    });

    // Most Fifties
    const mostFifties = [...battingLeaderboard].sort((a, b) => b.fifties - a.fifties)[0];
    highlights.push({
        icon: '5️⃣',
        title: 'Most Fifties',
        player: mostFifties.playerName,
        stat: mostFifties.fifties,
        label: '50s'
    });

    // Most Wickets
    const mostWickets = [...bowlingLeaderboard].sort((a, b) => b.wickets - a.wickets)[0];
    highlights.push({
        icon: '🎯',
        title: 'Most Wickets',
        player: mostWickets.playerName,
        stat: mostWickets.wickets,
        label: 'wickets'
    });

    // Most Fours
    const mostFours = [...battingLeaderboard].sort((a, b) => b.fours - a.fours)[0];
    highlights.push({
        icon: '4️⃣',
        title: 'Most Fours',
        player: mostFours.playerName,
        stat: mostFours.fours,
        label: 'fours'
    });

    // Most Sixes
    const mostSixes = [...battingLeaderboard].sort((a, b) => b.sixes - a.sixes)[0];
    highlights.push({
        icon: '6️⃣',
        title: 'Most Sixes',
        player: mostSixes.playerName,
        stat: mostSixes.sixes,
        label: 'sixes'
    });

    // Best Economy (Minimum 20 overs)
    const bestEconomy = [...bowlingLeaderboard]
        .filter(p => p.overs >= 20)
        .sort((a, b) => a.economy - b.economy)[0];
    if (bestEconomy) {
        highlights.push({
            icon: '💎',
            title: 'Best Economy',
            player: bestEconomy.playerName,
            stat: bestEconomy.economy.toFixed(2),
            label: 'economy (20+ overs)'
        });
    }

    // Most Catches
    const mostCatches = [...fieldingLeaderboard].sort((a, b) => b.catches - a.catches)[0];
    highlights.push({
        icon: '🧤',
        title: 'Most Catches',
        player: mostCatches.playerName,
        stat: mostCatches.catches,
        label: 'catches'
    });

    // Most Stumpings
    const mostStumpings = [...fieldingLeaderboard].sort((a, b) => b.stumpings - a.stumpings)[0];
    highlights.push({
        icon: '🎪',
        title: 'Most Stumpings',
        player: mostStumpings.playerName,
        stat: mostStumpings.stumpings,
        label: 'stumpings'
    });

    // Best Bowling Figure (highest wickets in bestBowling)
    const bestBowlingFigure = [...bowlingLeaderboard].sort((a, b) => {
        const wicketsA = parseInt(a.bestBowling.split('/')[0]) || 0;
        const wicketsB = parseInt(b.bestBowling.split('/')[0]) || 0;
        if (wicketsB !== wicketsA) return wicketsB - wicketsA;
        // If wickets are same, lower runs is better
        const runsA = parseInt(a.bestBowling.split('/')[1]) || 999;
        const runsB = parseInt(b.bestBowling.split('/')[1]) || 999;
        return runsA - runsB;
    })[0];
    highlights.push({
        icon: '🔥',
        title: 'Best Bowling Figure',
        player: bestBowlingFigure.playerName,
        stat: bestBowlingFigure.bestBowling,
        label: 'wickets/runs'
    });

    // Display highlights
    container.innerHTML = highlights.map(h => `
        <div class="achievement-card">
            <div class="achievement-icon">${h.icon}</div>
            <div class="achievement-content">
                <div class="achievement-title">${h.title}</div>
                <div class="achievement-player">${h.player}</div>
                <div class="achievement-stat">
                    ${h.stat}
                    <span class="achievement-stat-label">${h.label}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Update last updated timestamp
function updateLastUpdated() {
    const lastSync = new Date(dashboardData.lastSync);
    const timeString = lastSync.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    document.getElementById('last-updated').textContent = timeString;
}

// UI State Management
function showLoading() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('error').style.display = 'none';
    document.getElementById('dashboard').style.display = 'none';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showError() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
}
