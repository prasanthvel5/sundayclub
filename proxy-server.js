// Simple CORS Proxy Server
// Run with: node proxy-server.js

const fs = require('fs');
const express = require('express');
const cors = require('cors');
const { extractPlayerStats } = require('./extract-players');
const { scrape } = require('./scrape');

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Serve static files from the current directory
app.use(express.static(__dirname));

// Sync endpoint — by default scrapes live from the CricHeroes API.
// Falls back to HAR extraction if ?source=har is passed.
app.post('/sync', async (req, res) => {
    try {
        const source = req.query.source === 'har' ? 'har' : 'api';
        console.log(`\n🔄 Starting data sync (source=${source})...`);

        if (source === 'har') {
            extractPlayerStats();
        } else {
            await scrape();
        }

        const data = JSON.parse(fs.readFileSync('dashboard-data.json', 'utf8'));
        console.log('✓ Sync completed successfully\n');

        res.json({
            success: true,
            message: 'Data synced successfully',
            source,
            totalPlayers: data.totalPlayers,
            lastSync: data.lastSync
        });

    } catch (error) {
        console.error('❌ Sync error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Sync failed',
            message: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║  Cricket Dashboard Server (Offline Mode)                  ║
╚═══════════════════════════════════════════════════════════╝

Server running at: http://localhost:${PORT}
Dashboard URL: http://localhost:${PORT}/index.html

Features:
  • View player statistics from CricHeroes
  • Click sync button to fetch fresh data via the public API
  • Falls back to HAR extraction if the API is unreachable

Sync Endpoint:
  POST http://localhost:${PORT}/sync                # live API (default)
  POST http://localhost:${PORT}/sync?source=har     # re-parse HAR file

Press Ctrl+C to stop the server
    `);
});

// Setup instructions if dependencies are missing
process.on('uncaughtException', (error) => {
    if (error.code === 'MODULE_NOT_FOUND') {
        console.error(`
╔═══════════════════════════════════════════════════════════╗
║  Missing Dependencies                                      ║
╚═══════════════════════════════════════════════════════════╝

Please install the required packages:

    npm install express cors axios

Then run again:

    node proxy-server.js

        `);
        process.exit(1);
    } else {
        console.error('Error:', error);
        process.exit(1);
    }
});
