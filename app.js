// Configuration
const DATA_FILE = 'dashboard-data.json';

// State
let dashboardData = null;
let battingLeaderboard = [];
let bowlingLeaderboard = [];
let fieldingLeaderboard = [];

// Sorting state
let battingSortBy = 'runs';
let bowlingSortBy = 'wickets';
let fieldingSortBy = 'totalDismissals';

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

// Load dashboard data from static JSON file
async function loadDashboardData() {
    try {
        showLoading();

        // Fetch static data file
        const response = await fetch(DATA_FILE + '?t=' + new Date().getTime());

        if (!response.ok) {
            throw new Error('Failed to load data');
        }

        dashboardData = await response.json();

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

    // Create batting leaderboard
    battingLeaderboard = players.map(player => ({
        playerId: player.id,
        playerName: player.name,
        ...player.batting
    }));
    sortBattingLeaderboard();

    // Create bowling leaderboard
    bowlingLeaderboard = players.map(player => ({
        playerId: player.id,
        playerName: player.name,
        ...player.bowling
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

// Display dashboard
function displayDashboard() {
    displayBattingLeaderboard();
    displayBowlingLeaderboard();
    displayFieldingLeaderboard();
    displayHighlights();
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
                <div class="player-header">
                    <div class="rank-badge-small">${index + 1}</div>
                    <div class="player-name">${player.playerName}</div>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <span class="stat-item-label">Runs</span>
                        <span class="stat-item-value">${player.runs}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Mat</span>
                        <span class="stat-item-value">${player.matches || 0}</span>
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
                <div class="player-header">
                    <div class="rank-badge-small">${index + 1}</div>
                    <div class="player-name">${player.playerName}</div>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <span class="stat-item-label">Wickets</span>
                        <span class="stat-item-value">${player.wickets}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-item-label">Mat</span>
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
                        <span class="stat-item-label">Mat</span>
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
