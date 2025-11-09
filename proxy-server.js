// Simple CORS Proxy Server
// Run with: node proxy-server.js

const express = require('express');
const cors = require('cors');
const { extractPlayerStats } = require('./extract-players');

const app = express();
const PORT = 3000;

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Serve static files from the current directory
app.use(express.static(__dirname));

// Sync endpoint to re-extract data from HAR file
app.post('/sync', async (req, res) => {
    try {
        console.log('\n🔄 Starting data sync from HAR file...');

        // Run the extraction
        const data = extractPlayerStats();

        console.log('✓ Sync completed successfully\n');

        res.json({
            success: true,
            message: 'Data synced successfully',
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
  • View player statistics from HAR file
  • Click sync button to refresh data
  • Works completely offline

Sync Endpoint: POST http://localhost:${PORT}/sync

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
