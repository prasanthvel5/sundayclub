// State
// dashboardData is loaded from data.js
let battingLeaderboard = [];
let bowlingLeaderboard = [];
let fieldingLeaderboard = [];
let allrounderLeaderboard = [];

// Active cricket format ('overall' | 'box' | 'tennis')
let currentFormat = 'overall';

// Sorting state
let battingSortBy = 'battingRating';
let bowlingSortBy = 'bowlingRating';
let fieldingSortBy = 'totalDismissals';
let allrounderSortBy = 'allrounderRating';

// Rank change tracking
let rankChanges = {
    batting: {},
    bowling: {},
    fielding: {},
    allrounder: {}
};

// Pull the right batting/bowling/fielding block for a given format.
// Returns null when the player has no data for the requested format.
function getPlayerStatsForFormat(player, format) {
    if (format === 'overall') {
        return {
            batting: player.batting,
            bowling: player.bowling,
            fielding: player.fielding
        };
    }
    const fmt = player.formats && player.formats[format];
    if (!fmt) return null;
    return {
        batting: fmt.batting || null,
        bowling: fmt.bowling || null,
        fielding: fmt.fielding || null
    };
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeFormatTabs();
    loadDashboardData();
    setupSyncButton();
    setupSortControls();
});

// Format tab functionality
function initializeFormatTabs() {
    document.querySelectorAll('.format-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const format = btn.getAttribute('data-format');
            if (format === currentFormat) return;
            currentFormat = format;
            document.querySelectorAll('.format-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            processPlayerData();
            calculateRankChanges();
            displayDashboard();
        });
    });
}

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

// Handle sync button click. Hits /sync (live scrape) and refreshes the
// in-memory dashboardData from the server so the UI updates without a reload.
async function handleSync() {
    const syncBtn = document.getElementById('sync-btn');
    const syncIcon = syncBtn.querySelector('.sync-icon');

    try {
        syncIcon.classList.add('syncing');
        syncBtn.disabled = true;

        const response = await fetch('/sync', { method: 'POST' });
        if (!response.ok) {
            throw new Error('Sync failed');
        }
        await response.json();

        // Re-fetch the freshly-written dashboard data (data.js on disk is now
        // stale relative to the page's in-memory copy). dashboardData is a
        // const, so swap its contents in place rather than reassigning.
        const dataRes = await fetch('/dashboard-data.json?_=' + Date.now());
        if (!dataRes.ok) throw new Error('Could not reload dashboard data');
        const fresh = await dataRes.json();
        Object.keys(dashboardData).forEach(k => delete dashboardData[k]);
        Object.assign(dashboardData, fresh);

        loadDashboardData();
        showSyncSuccess();

    } catch (error) {
        console.error('Sync error:', error);
        showSyncError();
    } finally {
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

// localStorage stores rankings keyed by format ('overall' | 'box' | 'tennis').
// Older builds wrote a flat shape — migrate transparently so a returning user
// doesn't lose their Overall baseline.
function migrateLegacyRankings(obj) {
    if (!obj) return null;
    if (obj.overall || obj.box || obj.tennis) return obj;
    if (obj.batting || obj.bowling || obj.fielding || obj.allrounder) return { overall: obj };
    return obj;
}

// Save current rankings to localStorage under the active format key. Persisting
// per-format means rank-change deltas show on every tab, not just Overall.
function saveCurrentRankings() {
    let allRankings = {};
    try {
        const stored = localStorage.getItem('previousRankings');
        allRankings = migrateLegacyRankings(stored ? JSON.parse(stored) : {}) || {};
    } catch (e) {
        allRankings = {};
    }
    allRankings[currentFormat] = {
        batting: battingLeaderboard.map(p => p.playerId),
        bowling: bowlingLeaderboard.map(p => p.playerId),
        fielding: fieldingLeaderboard.map(p => p.playerId),
        allrounder: allrounderLeaderboard.map(p => p.playerId)
    };
    localStorage.setItem('previousRankings', JSON.stringify(allRankings));
}

// Calculate rank changes by comparing current vs previous rankings for the
// active format. Falls back to the legacy flat shape (treated as Overall) so
// dashboards extracted before per-format rankings still render.
function calculateRankChanges() {
    rankChanges = { batting: {}, bowling: {}, fielding: {}, allrounder: {} };

    let allPrevious = null;
    if (dashboardData && dashboardData.previousRankings) {
        allPrevious = dashboardData.previousRankings;
    } else {
        const stored = localStorage.getItem('previousRankings');
        if (stored) {
            try { allPrevious = JSON.parse(stored); } catch (e) {}
        }
    }
    allPrevious = migrateLegacyRankings(allPrevious);
    if (!allPrevious) return;

    const previous = allPrevious[currentFormat];
    if (!previous) return;

    const calcChanges = (currentList, prevOrder, idKey) => {
        const changes = {};
        const prevRankMap = {};
        prevOrder.forEach((id, idx) => { prevRankMap[id] = idx + 1; });

        currentList.forEach((player, idx) => {
            const currentRank = idx + 1;
            const prevRank = prevRankMap[player[idKey]];
            if (prevRank === undefined) {
                changes[player[idKey]] = 'new';
            } else if (prevRank === currentRank) {
                changes[player[idKey]] = 0;
            } else {
                changes[player[idKey]] = prevRank - currentRank; // positive = moved up, negative = moved down
            }
        });
        return changes;
    };

    rankChanges.batting = calcChanges(battingLeaderboard, previous.batting || [], 'playerId');
    rankChanges.bowling = calcChanges(bowlingLeaderboard, previous.bowling || [], 'playerId');
    rankChanges.fielding = calcChanges(fieldingLeaderboard, previous.fielding || [], 'playerId');
    rankChanges.allrounder = calcChanges(allrounderLeaderboard, previous.allrounder || [], 'playerId');
}

// Generate HTML for rank change indicator
function getRankChangeHTML(change) {
    if (change === 'new') {
        return '<span class="rank-change rank-new">NEW</span>';
    }
    if (change === undefined || change === 0) {
        return '<span class="rank-change rank-same">&#8211;</span>';
    }
    if (change > 0) {
        return `<span class="rank-change rank-up">&#9650; ${change}</span>`;
    }
    return `<span class="rank-change rank-down">&#9660; ${Math.abs(change)}</span>`;
}

// Load dashboard data (data is already embedded from data.js)
function loadDashboardData() {
    try {
        showLoading();

        // dashboardData is already loaded from data.js
        if (!dashboardData || !dashboardData.players || dashboardData.players.length === 0) {
            throw new Error('No player data found');
        }

        // Save current rankings before reprocessing
        if (battingLeaderboard.length > 0) {
            saveCurrentRankings();
        }

        // Process and display data
        processPlayerData();

        // Calculate rank changes
        calculateRankChanges();

        // Save new rankings
        saveCurrentRankings();

        displayDashboard();
        hideLoading();

    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError();
    }
}

// Process player data and create leaderboards (uses currentFormat).
function processPlayerData() {
    // Pair each player with the stat block for the active format. Players that
    // have no data for the active format are dropped per category. Also hide
    // anyone with 0 runs AND 0 overs in this format — they didn't bat or bowl,
    // so showing them at the bottom of every leaderboard adds no signal.
    const playersWithStats = dashboardData.players
        .map(player => ({ player, stats: getPlayerStatsForFormat(player, currentFormat) }))
        .filter(item => item.stats)
        .filter(({ stats }) => (stats.batting?.runs || 0) > 0 || (stats.bowling?.overs || 0) > 0);

    // For team-wide normalization use only players that contributed to this format.
    const normalizedPlayers = playersWithStats.map(({ player, stats }) => ({
        batting: stats.batting || {},
        bowling: stats.bowling || {}
    }));
    const teamMaxes = calculateTeamMaxes(normalizedPlayers);

    // Sample-size thresholds shrink for non-overall formats since players have
    // played fewer Turf/Ground matches. These drive both the soft-penalty
    // confidence multiplier inside the rating functions AND the hard allrounder
    // filter below.
    const minInnings = currentFormat === 'overall' ? 10 : 5;
    const minOvers = currentFormat === 'overall' ? 20 : 5;
    const ratingOpts = { fullCreditInnings: minInnings, fullCreditOvers: minOvers };

    // Create batting leaderboard (drop players with no batting block in this format).
    battingLeaderboard = playersWithStats
        .filter(({ stats }) => stats.batting)
        .map(({ player, stats }) => ({
            playerId: player.id,
            playerName: player.name,
            ...stats.batting,
            battingRating: calculateBattingRating(stats.batting, teamMaxes, ratingOpts)
        }));
    sortBattingLeaderboard();

    // Create bowling leaderboard.
    bowlingLeaderboard = playersWithStats
        .filter(({ stats }) => stats.bowling)
        .map(({ player, stats }) => ({
            playerId: player.id,
            playerName: player.name,
            ...stats.bowling,
            bowlingRating: calculateBowlingRating(stats.bowling, teamMaxes, ratingOpts)
        }));
    sortBowlingLeaderboard();

    // Create fielding leaderboard.
    fieldingLeaderboard = playersWithStats
        .filter(({ stats }) => stats.fielding)
        .map(({ player, stats }) => ({
            playerId: player.id,
            playerName: player.name,
            ...stats.fielding,
            totalDismissals: (stats.fielding.catches || 0) + (stats.fielding.stumpings || 0) + (stats.fielding.runOuts || 0)
        }));
    sortFieldingLeaderboard();

    allrounderLeaderboard = playersWithStats
        .filter(({ stats }) => stats.batting && stats.bowling)
        .filter(({ stats }) => (stats.batting.innings || 0) >= minInnings && (stats.bowling.overs || 0) >= minOvers)
        .map(({ player, stats }) => {
            const battingRating = calculateBattingRating(stats.batting, teamMaxes, ratingOpts);
            const bowlingRating = calculateBowlingRating(stats.bowling, teamMaxes, ratingOpts);
            const allrounderRating = Math.round((battingRating * bowlingRating) / 1000);
            return {
                playerId: player.id,
                playerName: player.name,
                battingRating,
                bowlingRating,
                allrounderRating,
                runs: stats.batting.runs,
                average: stats.batting.average,
                strikeRate: stats.batting.strikeRate,
                wickets: stats.bowling.wickets,
                economy: stats.bowling.economy,
                bowlAvg: stats.bowling.average
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

// Calculate batting rating (0-1000).
// Applies a sample-size confidence multiplier `min(1, innings / fullCreditInnings)`
// so cameos with great per-innings stats but tiny volume don't outrank regulars.
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

// Calculate bowling rating (0-1000).
// Applies a sample-size confidence multiplier `min(1, overs / fullCreditOvers)`
// so a one-over wicket with 4-run economy can't ride to the top of the table.
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

// Sort allrounder leaderboard
function sortAllrounderLeaderboard() {
    allrounderLeaderboard.sort((a, b) => (b[allrounderSortBy] || 0) - (a[allrounderSortBy] || 0));
}

// Display allrounder leaderboard
function displayAllrounderLeaderboard() {
    const container = document.getElementById('allrounder-leaderboard');

    if (allrounderLeaderboard.length === 0) {
        container.innerHTML = '<div class="empty-state">No allrounder data available for this format yet.</div>';
        return;
    }

    container.innerHTML = allrounderLeaderboard.map((player, index) => `
        <div class="player-card rank-${index + 1}">
            <div class="player-info">
                <div class="allrounder-player-header">
                    <div class="rank-badge-small">${index + 1}</div>
                    ${getRankChangeHTML(rankChanges.allrounder[player.playerId])}
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

    if (battingLeaderboard.length === 0) {
        container.innerHTML = '<div class="empty-state">No batting data available for this format.</div>';
        return;
    }

    // Display leaderboard
    container.innerHTML = battingLeaderboard.map((player, index) => `
        <div class="player-card rank-${index + 1}">
            <div class="player-info">
                <div class="allrounder-player-header">
                    <div class="rank-badge-small">${index + 1}</div>
                    ${getRankChangeHTML(rankChanges.batting[player.playerId])}
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

    if (bowlingLeaderboard.length === 0) {
        container.innerHTML = '<div class="empty-state">No bowling data available for this format.</div>';
        return;
    }

    // Display leaderboard
    container.innerHTML = bowlingLeaderboard.map((player, index) => `
        <div class="player-card rank-${index + 1}">
            <div class="player-info">
                <div class="allrounder-player-header">
                    <div class="rank-badge-small">${index + 1}</div>
                    ${getRankChangeHTML(rankChanges.bowling[player.playerId])}
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

    if (fieldingLeaderboard.length === 0) {
        container.innerHTML = '<div class="empty-state">No fielding data available for this format.</div>';
        return;
    }

    // Display leaderboard
    container.innerHTML = fieldingLeaderboard.map((player, index) => `
        <div class="player-card rank-${index + 1}">
            <div class="player-info">
                <div class="player-header">
                    <div class="rank-badge-small">${index + 1}</div>
                    ${getRankChangeHTML(rankChanges.fielding[player.playerId])}
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

    if (battingLeaderboard.length === 0 && bowlingLeaderboard.length === 0 && fieldingLeaderboard.length === 0) {
        container.innerHTML = '<div class="empty-state">No data available for this format yet.</div>';
        return;
    }

    // Calculate highlights
    const highlights = [];
    const pushIfPresent = (h) => { if (h && h.player) highlights.push(h); };

    // Highest Score (single innings)
    const highestScore = [...battingLeaderboard].sort((a, b) => {
        const scoreA = parseInt(String(a.highestScore).replace(/[*]/g, '')) || 0;
        const scoreB = parseInt(String(b.highestScore).replace(/[*]/g, '')) || 0;
        return scoreB - scoreA;
    })[0];
    pushIfPresent(highestScore && {
        icon: '🏏',
        title: 'Highest Score',
        player: highestScore.playerName,
        stat: highestScore.highestScore,
        label: 'runs'
    });

    // Most Runs
    const topScorer = [...battingLeaderboard].sort((a, b) => b.runs - a.runs)[0];
    pushIfPresent(topScorer && {
        icon: '💯',
        title: 'Most Runs',
        player: topScorer.playerName,
        stat: topScorer.runs,
        label: 'runs'
    });

    // Most Thirties
    const mostThirties = [...battingLeaderboard].sort((a, b) => (b.thirties || 0) - (a.thirties || 0))[0];
    pushIfPresent(mostThirties && {
        icon: '3️⃣',
        title: 'Most Thirties',
        player: mostThirties.playerName,
        stat: mostThirties.thirties || 0,
        label: '30s'
    });

    // Most Fifties
    const mostFifties = [...battingLeaderboard].sort((a, b) => b.fifties - a.fifties)[0];
    pushIfPresent(mostFifties && {
        icon: '5️⃣',
        title: 'Most Fifties',
        player: mostFifties.playerName,
        stat: mostFifties.fifties,
        label: '50s'
    });

    // Most Wickets
    const mostWickets = [...bowlingLeaderboard].sort((a, b) => b.wickets - a.wickets)[0];
    pushIfPresent(mostWickets && {
        icon: '🎯',
        title: 'Most Wickets',
        player: mostWickets.playerName,
        stat: mostWickets.wickets,
        label: 'wickets'
    });

    // Most Fours
    const mostFours = [...battingLeaderboard].sort((a, b) => b.fours - a.fours)[0];
    pushIfPresent(mostFours && {
        icon: '4️⃣',
        title: 'Most Fours',
        player: mostFours.playerName,
        stat: mostFours.fours,
        label: 'fours'
    });

    // Most Sixes
    const mostSixes = [...battingLeaderboard].sort((a, b) => b.sixes - a.sixes)[0];
    pushIfPresent(mostSixes && {
        icon: '6️⃣',
        title: 'Most Sixes',
        player: mostSixes.playerName,
        stat: mostSixes.sixes,
        label: 'sixes'
    });

    // Best Economy (Minimum overs threshold scales with format).
    const minOversForEconomy = currentFormat === 'overall' ? 20 : 5;
    const bestEconomy = [...bowlingLeaderboard]
        .filter(p => p.overs >= minOversForEconomy)
        .sort((a, b) => a.economy - b.economy)[0];
    if (bestEconomy) {
        highlights.push({
            icon: '💎',
            title: 'Best Economy',
            player: bestEconomy.playerName,
            stat: bestEconomy.economy.toFixed(2),
            label: `economy (${minOversForEconomy}+ overs)`
        });
    }

    // Most Catches
    const mostCatches = [...fieldingLeaderboard].sort((a, b) => b.catches - a.catches)[0];
    pushIfPresent(mostCatches && {
        icon: '🧤',
        title: 'Most Catches',
        player: mostCatches.playerName,
        stat: mostCatches.catches,
        label: 'catches'
    });

    // Most Stumpings
    const mostStumpings = [...fieldingLeaderboard].sort((a, b) => b.stumpings - a.stumpings)[0];
    pushIfPresent(mostStumpings && {
        icon: '🎪',
        title: 'Most Stumpings',
        player: mostStumpings.playerName,
        stat: mostStumpings.stumpings,
        label: 'stumpings'
    });

    // Best Bowling Figure (highest wickets in bestBowling)
    const bestBowlingFigure = [...bowlingLeaderboard].sort((a, b) => {
        const wicketsA = parseInt(String(a.bestBowling || '0/0').split('/')[0]) || 0;
        const wicketsB = parseInt(String(b.bestBowling || '0/0').split('/')[0]) || 0;
        if (wicketsB !== wicketsA) return wicketsB - wicketsA;
        const runsA = parseInt(String(a.bestBowling || '0/0').split('/')[1]) || 999;
        const runsB = parseInt(String(b.bestBowling || '0/0').split('/')[1]) || 999;
        return runsA - runsB;
    })[0];
    pushIfPresent(bestBowlingFigure && {
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
