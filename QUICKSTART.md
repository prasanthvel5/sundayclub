# Quick Start Guide - Offline Dashboard

## Overview

This is an **offline dashboard** that reads player statistics from a HAR file. No internet connection or API calls required!

## How It Works

1. Player data is extracted from `cricheroes.com.har` file
2. Data is stored in `dashboard-data.json`
3. Dashboard reads from the static JSON file
4. Click the sync button (⟳) to refresh data from HAR file

## Quick Start (3 Steps)

### Step 1: Extract Initial Data
```bash
node extract-players.js
```

This creates `dashboard-data.json` with all player statistics.

### Step 2: Start the Server
```bash
npm install
npm start
```

### Step 3: Open Dashboard
Visit: **http://localhost:3000/index.html**

## Features

### Sync Button
- Located in top-right corner of dashboard
- Click to re-extract latest data from HAR file
- Deletes old data and inserts fresh data
- Shows success (✓) or error (✗) feedback

### Three Leaderboards
- **Batting**: Runs, Average, Strike Rate, Highest Score, 4s/6s
- **Bowling**: Wickets, Economy, Average, Best Figures
- **Fielding**: Catches, Stumpings, Run Outs

### Mobile Optimized
- Responsive design for all screen sizes
- Touch-friendly interface
- Optimized for mobile viewing

## Updating Data

### Method 1: Use Sync Button
1. Open the dashboard
2. Click sync button (⟳) in top-right
3. Wait for success message
4. Data is automatically refreshed

### Method 2: Manual Extraction
1. Replace `cricheroes.com.har` with new HAR file
2. Run: `node extract-players.js`
3. Refresh dashboard in browser

## How to Get New HAR File

1. Open Chrome/Edge browser
2. Press F12 to open DevTools
3. Go to "Network" tab
4. Visit CricHeroes team page
5. Right-click in Network tab → "Save all as HAR"
6. Replace `cricheroes.com.har` with new file
7. Click sync button or run extraction script

## Mobile Access (Same WiFi)

### Find Your Computer's IP
**Windows:**
```bash
ipconfig
```
Look for "IPv4 Address" (e.g., 192.168.1.100)

**Mac/Linux:**
```bash
ifconfig
```

### Access from Phone
Visit: `http://YOUR_IP:3000/index.html`

Example: `http://192.168.1.100:3000/index.html`

## File Structure

```
Dashboard/
├── index.html              # Main dashboard page
├── styles.css              # Mobile-responsive styles
├── app.js                  # Dashboard logic
├── extract-players.js      # HAR extraction script
├── proxy-server.js         # Local server with sync endpoint
├── cricheroes.com.har      # HAR file with API responses
├── dashboard-data.json     # Extracted player statistics
├── package.json            # Dependencies
└── start.bat              # Windows quick start
```

## Troubleshooting

### "No player data found"
- Run: `node extract-players.js`
- Check if `dashboard-data.json` exists
- Verify HAR file contains player statistics

### Sync button not working
- Check browser console (F12)
- Make sure server is running
- Verify `/sync` endpoint is accessible

### Dashboard shows old data
- Click sync button to refresh
- Hard refresh browser (Ctrl+Shift+R)
- Check `lastSync` in footer

### Players missing or incorrect
- Update player names in `extract-players.js` (lines 40-60)
- Re-run extraction
- Check HAR file has all player data

## Customization

### Update Team Name
Edit `extract-players.js` line 132:
```javascript
teamName: 'Your Team Name',
```

### Add/Remove Players
Edit the `playerNames` object in `extract-players.js`:
```javascript
const playerNames = {
    'player_id': 'Player Name',
    // Add more...
};
```

### Change Port
Edit `proxy-server.js` line 9:
```javascript
const PORT = 3000; // Change to your preferred port
```

## Advanced Usage

### Extract Specific Stats
Modify `extract-players.js` to extract additional fields from HAR file.

### Custom Leaderboards
Edit `app.js` to create custom sorting or filtering.

### Styling
Modify `styles.css` CSS variables:
```css
:root {
    --primary-color: #your-color;
    --secondary-color: #your-color;
}
```

## No Server? Simple Alternative

Just open `demo.html` in your browser to see the UI with sample data (no server needed).

## Production Deployment

Since this is offline, you can:
1. Extract data from HAR file
2. Deploy static files (HTML, CSS, JS, JSON) to any web host
3. Users can view without server (except sync functionality)

For sync functionality, deploy `proxy-server.js` to a Node.js host.

## Support

- Check browser console for errors (F12)
- Verify all files are in the same directory
- Ensure Node.js is installed
- Check file permissions

## Next Steps

1. Customize team name and colors
2. Add your team's HAR file
3. Extract player statistics
4. Share the dashboard URL with your team!
