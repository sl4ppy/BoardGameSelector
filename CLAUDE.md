# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Board Game Picker is a Progressive Web App (PWA) that helps users intelligently select board games from their BoardGameGeek (BGG) collection. Originally a simple vanilla JavaScript app, it has evolved into a feature-rich application with advanced caching, analytics, and social sharing capabilities.

## Architecture

The application follows an object-oriented architecture with a single main class:

- **`BoardGamePicker` class** (script.js:1): Core application logic containing:
  - Enhanced BGG API integration with 8 CORS proxy fallbacks and health monitoring
  - Advanced caching system using IndexedDB with localStorage fallback
  - Batch API calls for improved performance (up to 20 games per request)
  - Request queuing system to prevent API overwhelming (max 2 concurrent)
  - Game weighting algorithms (random, favor old, favor unplayed)
  - Personal rating integration with comprehensive filtering
  - Collection analytics and export functionality (JSON, CSV, text)
  - Social sharing capabilities with Web Share API
  - PWA support with service worker and offline functionality

## Key Files

- **index.html**: Main HTML structure with PWA manifest links
- **style.css**: Modern glassmorphism design with PWA and analytics styling
- **script.js**: All JavaScript logic (2000+ lines) - the main application file
- **manifest.json**: PWA manifest defining app metadata and icons
- **sw.js**: Service worker for offline functionality and caching

## Development Commands

This is a static site with no build process. To develop locally:

```bash
# Serve locally (choose one):
python -m http.server 8000
npx serve .
# Or simply open index.html in a browser
```

**Note**: For PWA features (service worker, manifest) to work properly, you must serve the app over HTTP/HTTPS, not file:// protocol.

## Git Workflow

The project uses a dual-branch strategy:
- **`main`**: Production branch (auto-deploys to GitHub Pages)
- **`dev`**: Development branch for new features

```bash
# Daily development
git checkout dev
git pull origin dev
# Make changes
git add .
git commit -m "Type: description"  # Types: Add, Fix, Update, Remove, Refactor, Style, Docs
git push origin dev

# Deploy to production
git checkout main
git merge dev
git push origin main
git checkout dev
```

## BGG API Integration

The app integrates with BoardGameGeek's XML API v2:
- **Collection endpoint**: `/xmlapi2/collection?username={username}&stats=1`
- **Thing endpoint**: `/xmlapi2/thing?id={ids}&stats=1` (batch requests)
- **Plays endpoint**: `/xmlapi2/plays?username={username}&id={gameId}`

CORS proxies used (in health-sorted order):
1. AllOrigins: `https://api.allorigins.win/get?url=` (JSON response)
2. ThingProxy: `https://thingproxy.freeboard.io/fetch/`
3. CodeTabs: `https://api.codetabs.com/v1/proxy?quest=`
4. CORSProxy.io: `https://corsproxy.io/?`
5. HTMLDriven: `https://cors-proxy.htmldriven.com/?url=`
6. CORS.sh: `https://proxy.cors.sh/`
7. Bridged: `https://cors.bridged.cc/`
8. CORS-Anywhere: `https://cors-anywhere.herokuapp.com/` (often restricted)

**Proxy Health System**: Automatically monitors proxy success rates and prioritizes healthy proxies.

## Key Algorithms

### Game Weighting
- **Random**: Equal probability for all games
- **Favor Old**: Exponential curve based on days since last played
- **Favor Unplayed**: 10x weight for unplayed games, falls back to recency

### Rating Integration
- Personal ratings apply multipliers (0.3x to 3.0x)
- Handles unrated games with include/exclude option
- Robust validation for null/undefined/NaN ratings

### Performance Optimizations
- **Batch API Calls**: Groups up to 20 games per BGG API request
- **Request Queuing**: Limits concurrent requests to prevent API overwhelming
- **IndexedDB Caching**: Structured storage for collections, play data, and game details
- **Proxy Health Monitoring**: Automatic failover to healthy proxies

## Caching System

### IndexedDB (Primary)
- **Collection Store**: Main game collection data
- **Play Data Store**: Last played dates with 1-week cache
- **Game Details Store**: Enriched game data from batch API calls

### LocalStorage (Fallback)
- Legacy support for collection data
- Automatic migration to IndexedDB when available

## Testing & Debugging

No formal test suite exists. Debug functions available in browser console:

```javascript
window.debugBGP.clearCache()          // Clear all cached data (localStorage + IndexedDB)
window.debugBGP.getCache()            // View cached collection from localStorage
window.debugBGP.testProxies()         // Test all proxy health
window.debugBGP.clearIndexedDB()      // Clear IndexedDB only
window.debugBGP.getIndexedDBData()    // View IndexedDB collection data
window.debugBGP.setCustomProxy(url)   // Set custom CORS proxy
window.debugBGP.clearPlayCache()      // Clear play data cache
```

## Common Development Tasks

### Adding a New Filter
1. Add HTML controls in index.html
2. Add event listener in `initializeEventListeners()`
3. Implement filter logic in `applyFilters()`

### Adding a New Weighting Method
1. Add button in HTML with `data-weight` attribute
2. Add case in `calculateGameWeight()` switch statement
3. Update `updateWeightInfo()` for statistics display

### Modifying API Integration
- CORS proxy system: `makeApiRequest()` with health-sorted proxy fallback
- Collection parsing: `parseCollectionData()` with batch enrichment
- Play data fetching: `fetchPlayDataForGame()` with IndexedDB caching
- Batch game details: `fetchBatchGameDetails()` for efficient API usage

### PWA Features
- Service worker: `sw.js` handles caching and offline functionality
- Manifest: `manifest.json` defines app metadata and install prompts
- Install prompts: Automatic PWA installation prompts on supported devices
- Offline support: Collection data and core functionality work offline

### Analytics & Export
- Collection analytics: `calculateAnalytics()` generates comprehensive stats
- Export formats: JSON, CSV, and plain text export options
- Social sharing: Web Share API with fallback to custom share modal
- URL parameters: Support for direct game links and quick actions

## Important Considerations

1. **Rate Limiting**: 60-second cooldown between collection refreshes to prevent API abuse
2. **Cache Management**: 
   - IndexedDB primary storage with localStorage fallback
   - Collection data: 24-hour expiration (persistent in dev)
   - Play data: 1-week expiration with structured caching
   - Proxy health: Persistent tracking with 5-minute health checks
3. **Error Handling**: Comprehensive error categorization and user-friendly messaging
4. **Mobile First**: Touch targets minimum 44px, responsive design, PWA support
5. **Performance**: Request queuing, batch API calls, lazy loading of play data
6. **Offline Support**: Service worker caches static files and API responses
7. **No Dependencies**: Pure vanilla JavaScript - no build steps required
8. **Privacy**: All data stored locally, no external tracking or analytics

## New Features (v1.6.0)

- **Enhanced CORS Proxy System**: 8 proxies with automatic health monitoring
- **IndexedDB Integration**: Better caching and offline support  
- **Batch API Calls**: Improved performance for large collections
- **PWA Support**: Installable app with offline functionality
- **Collection Analytics**: Comprehensive statistics and visualizations
- **Export Functionality**: JSON, CSV, and text export options
- **Social Sharing**: Native Web Share API with fallback options
- **Advanced Settings**: Custom proxy configuration and app preferences
- **Request Queuing**: Prevents API overwhelming with intelligent rate limiting