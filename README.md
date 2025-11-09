# Crazy Boyz Cricket Statistics Dashboard

A mobile-responsive, **offline cricket statistics dashboard** that extracts and displays player statistics from HAR files. Built for the Crazy Boyz team.

## Features

### Offline-First Architecture
- No API calls - works completely offline
- Data extracted from HAR files
- One-click sync to refresh statistics
- Fast loading and instant updates

### Comprehensive Statistics
- **Batting**: Runs, Average, Strike Rate, Highest Score, 50s, 100s, 4s, 6s
- **Bowling**: Wickets, Economy, Average, Best Bowling, Maidens, Overs
- **Fielding**: Catches, Stumpings, Run Outs

### Mobile-Optimized Design
- Responsive layout adapts to all screen sizes
- Touch-friendly interface
- Smooth animations and transitions
- Dark theme optimized for mobile viewing
- Gold, Silver, Bronze highlights for top 3 players

### Smart Leaderboards
- Automatic sorting by key metrics
- Summary statistics for quick insights
- Real-time last updated timestamp
- Visual rank indicators

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- HAR file from CricHeroes

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Extract player data from HAR file:**
   ```bash
   node extract-players.js
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open dashboard:**
   Visit: http://localhost:3000/index.html

## Usage

### Sync Button
Click the sync button (⟳) in the top-right corner to:
- Re-extract data from HAR file
- Delete old statistics
- Insert fresh data
- Auto-refresh dashboard

### Navigation
Switch between tabs to view different statistics:
- 🏏 **Batting** - Run scorers and batting averages
- 🎾 **Bowling** - Wicket takers and economy rates
- 🧤 **Fielding** - Catches and dismissals

## File Structure

```
Dashboard/
├── index.html              # Main dashboard page
├── styles.css              # Mobile-responsive styles
├── app.js                  # Dashboard logic (offline mode)
├── extract-players.js      # HAR extraction script
├── proxy-server.js         # Local server with sync endpoint
├── cricheroes.com.har      # HAR file with API responses (15MB)
├── dashboard-data.json     # Extracted player statistics
├── demo.html              # Preview UI with sample data
├── package.json           # Dependencies
├── start.bat              # Windows quick start script
├── QUICKSTART.md          # Quick start guide
└── README.md              # This file
```

## How It Works

### Data Flow

1. **Capture HAR File**
   - Visit CricHeroes team page
   - Open DevTools (F12) → Network tab
   - Save network activity as HAR file

2. **Extract Statistics**
   - Run `extract-players.js`
   - Parses HAR file for player statistics
   - Generates `dashboard-data.json`

3. **Display Dashboard**
   - Dashboard loads static JSON file
   - Processes and sorts player data
   - Renders interactive leaderboards

4. **Sync Updates**
   - Click sync button
   - Server re-runs extraction
   - Dashboard auto-refreshes with new data

### Technical Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express
- **Data**: Static JSON (extracted from HAR)
- **Design**: Mobile-first responsive design

## Updating Statistics

### Method 1: Sync Button (Easiest)
1. Replace `cricheroes.com.har` with new HAR file
2. Open dashboard
3. Click sync button (⟳)
4. Wait for success confirmation

### Method 2: Manual Extraction
1. Replace `cricheroes.com.har` with new HAR file
2. Run: `node extract-players.js`
3. Refresh browser

### Method 3: Command Line
```bash
# Extract and restart server
node extract-players.js && npm start
```

## Customization

### Team Configuration

Edit `extract-players.js` (lines 130-135):
```javascript
const dashboardData = {
    teamName: 'Your Team Name',
    teamId: 'your_team_id',
    // ...
};
```

### Player Names

Edit `extract-players.js` (lines 40-60):
```javascript
const playerNames = {
    'player_id': 'Player Name',
    '12345': 'John Doe',
    // Add more players...
};
```

### Colors and Theme

Edit `styles.css` (lines 10-20):
```css
:root {
    --primary-color: #1e88e5;      /* Main theme color */
    --secondary-color: #43a047;     /* Accent color */
    --dark-bg: #1a1a2e;            /* Background */
    /* ... more variables */
}
```

### Leaderboard Sorting

Edit `app.js` to change sorting logic:
```javascript
// Batting by runs (default)
.sort((a, b) => b.runs - a.runs);

// Batting by average
.sort((a, b) => b.average - a.average);

// Bowling by economy
.sort((a, b) => a.economy - b.economy);
```

## Mobile Access

### Same WiFi Network

1. **Find your computer's IP address:**
   - Windows: `ipconfig`
   - Mac/Linux: `ifconfig`

2. **Access from mobile:**
   - Visit: `http://YOUR_IP:3000/index.html`
   - Example: `http://192.168.1.100:3000/index.html`

### Public Access

Deploy to any web host:
- Vercel, Netlify, GitHub Pages (static files only)
- Heroku, Railway, Render (with sync functionality)

## Browser Compatibility

| Browser | Version | Status |
|---------|---------|--------|
| Chrome  | 90+     | ✅ Full Support |
| Edge    | 90+     | ✅ Full Support |
| Firefox | 88+     | ✅ Full Support |
| Safari  | 14+     | ✅ Full Support |
| Mobile  | All     | ✅ Optimized |

## Troubleshooting

### Dashboard Not Loading

**Problem**: Blank page or loading forever

**Solution**:
1. Check browser console (F12)
2. Verify `dashboard-data.json` exists
3. Run: `node extract-players.js`
4. Refresh browser (Ctrl+Shift+R)

### No Player Data

**Problem**: Empty leaderboards

**Solution**:
1. Ensure HAR file contains player statistics
2. Run extraction: `node extract-players.js`
3. Check output: "Total Players: 19"
4. Verify `dashboard-data.json` file size > 0

### Sync Not Working

**Problem**: Sync button shows error

**Solution**:
1. Check if server is running
2. Look at server console for errors
3. Verify HAR file exists and is valid
4. Check browser console for errors

### Players Missing

**Problem**: Some players not showing

**Solution**:
1. Check HAR file has all player data
2. Update `playerNames` in `extract-players.js`
3. Re-run: `node extract-players.js`
4. Click sync button

### Mobile Layout Issues

**Problem**: Dashboard looks broken on mobile

**Solution**:
1. Hard refresh (clear cache)
2. Check viewport meta tag in HTML
3. Verify `styles.css` is loading
4. Test in different browsers

## Data Privacy

- All data is local (no external API calls)
- HAR files may contain sensitive information
- Do not share HAR files publicly
- Dashboard runs entirely offline

## Performance

- Lightning fast load times (< 100ms)
- Minimal memory footprint
- No network requests (offline)
- Efficient data processing
- Smooth animations (60fps)

## Future Enhancements

- [ ] Player comparison view
- [ ] Match history timeline
- [ ] Performance trends graph
- [ ] Export to PDF/Excel
- [ ] Dark/Light theme toggle
- [ ] Custom stat filters
- [ ] Team vs Team comparison

## Contributing

Suggestions and improvements welcome!

1. Fork the repository
2. Create feature branch
3. Make your changes
4. Test thoroughly
5. Submit pull request

## Credits

- **Data Source**: [CricHeroes](https://cricheroes.com)
- **Team**: Crazy Boyz
- **Built with**: Node.js, Express, Vanilla JavaScript

## License

MIT License - Feel free to use and modify for your team!

## Support

For issues or questions:
1. Check QUICKSTART.md
2. Review troubleshooting section
3. Check browser console (F12)
4. Verify file structure

---

Made with ❤️ for cricket enthusiasts
