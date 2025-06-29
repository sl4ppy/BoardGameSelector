class BoardGamePicker {
    constructor() {
        this.games = [];
        this.filteredGames = [];
        this.currentUsername = '';
        this.isLoading = false;
        this.playDataCache = new Map(); // Cache play data to avoid duplicate API calls
        this.enablePlayDateFetching = true; // Can be disabled if BGG API is too slow/limited
        
        // App version - update this when making releases
        this.version = '1.2.2';
        
        // BGG API endpoints
        this.BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';
        this.CORS_PROXY = 'https://api.allorigins.win/raw?url=';
        
        this.initializeEventListeners();
        this.setupDeveloperPanel();
        this.setupVersionDisplay();
        this.loadSavedData();
    }

    initializeEventListeners() {
        // Username and fetch functionality
        document.getElementById('fetchCollection').addEventListener('click', () => this.fetchUserCollection());
        document.getElementById('bggUsername').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.fetchUserCollection();
        });

        // Filter controls
        document.getElementById('playerCount').addEventListener('change', () => this.applyFilters());
        document.getElementById('playTime').addEventListener('change', () => this.applyFilters());
        document.getElementById('complexity').addEventListener('change', () => this.applyFilters());
        document.getElementById('gameType').addEventListener('change', () => this.applyFilters());

        // Roll dice functionality
        document.getElementById('rollDice').addEventListener('click', () => this.rollDice());
        document.getElementById('rollAgain').addEventListener('click', () => this.rollDice());

        // Developer panel functionality (only works when panel is visible)
        document.getElementById('devClearCache')?.addEventListener('click', () => this.devClearCache());
        document.getElementById('devRefreshCache')?.addEventListener('click', () => this.devRefreshCache());
        document.getElementById('devViewCache')?.addEventListener('click', () => this.devViewCache());
        document.getElementById('devTestAPI')?.addEventListener('click', () => this.devTestAPIDialog());
    }

    loadSavedData() {
        const savedData = localStorage.getItem('bgg-collection-data');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                const now = Date.now();
                const oneDay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
                
                // Check if we're running locally (for development)
                const isLocalDevelopment = window.location.hostname === 'localhost' || 
                                         window.location.hostname === '127.0.0.1' || 
                                         window.location.protocol === 'file:';

                // For local development: never expire cache
                // For production: use 24-hour expiration
                const cacheValid = isLocalDevelopment || (now - data.timestamp < oneDay);

                if (cacheValid) {
                    this.games = data.games;
                    this.currentUsername = data.username;
                    document.getElementById('bggUsername').value = this.currentUsername;
                    
                    // Set default filter to "owned" in development mode
                    if (isLocalDevelopment) {
                        const gameTypeFilter = document.getElementById('gameType');
                        if (gameTypeFilter.value === '') {
                            gameTypeFilter.value = 'owned';
                        }
                    }
                    
                    const ageHours = Math.floor((now - data.timestamp) / (60 * 60 * 1000));
                    const cacheInfo = isLocalDevelopment ? 
                        `✅ Loaded ${this.games.length} games from persistent cache for ${this.currentUsername}` :
                        `✅ Loaded ${this.games.length} games from cache for ${this.currentUsername} (${ageHours}h old)`;
                    
                    this.showCollectionStatus(cacheInfo, 'success');
                    this.showGameSection();
                    this.applyFilters();
                } else {
                    // Cache expired, show info and clear it
                    this.showCollectionStatus('⏰ Cache expired (24h), please re-sync your collection', 'error');
                    localStorage.removeItem('bgg-collection-data');
                }
            } catch (e) {
                console.error('Error loading saved data:', e);
            }
        }
    }

    setupVersionDisplay() {
        // Add version info to the footer
        const footer = document.querySelector('.footer p');
        if (footer) {
            const versionSpan = document.createElement('span');
            versionSpan.className = 'version-info';
            versionSpan.innerHTML = ` • <strong>v${this.version}</strong>`;
            footer.appendChild(versionSpan);
        }

        // Add version to window for debugging
        window.boardGamePickerVersion = this.version;
        console.log(`🎲 Board Game Picker v${this.version} initialized`);
    }

    setupDeveloperPanel() {
        // Check if we're running locally (for development)
        const isLocalDevelopment = window.location.hostname === 'localhost' || 
                                 window.location.hostname === '127.0.0.1' || 
                                 window.location.protocol === 'file:';

        if (isLocalDevelopment) {
            const devPanel = document.getElementById('devPanel');
            devPanel.classList.remove('hidden');
            this.updateDevPanelInfo();
            
            // Set default username for development
            const usernameInput = document.getElementById('bggUsername');
            if (!usernameInput.value) {
                usernameInput.value = 'flapJ4cks';
                usernameInput.setAttribute('placeholder', 'flapJ4cks (dev default)');
                console.log('🛠️ Development mode: Set default BGG username to "flapJ4cks"');
            }

            // Set default filter to "owned" games only in development
            const gameTypeFilter = document.getElementById('gameType');
            if (gameTypeFilter.value === '') {
                gameTypeFilter.value = 'owned';
                console.log('🛠️ Development mode: Set default filter to "owned" games only');
                
                // Update the option text to show it's the dev default
                const ownedOption = gameTypeFilter.querySelector('option[value="owned"]');
                if (ownedOption && !ownedOption.textContent.includes('(dev default)')) {
                    ownedOption.textContent = 'Owned only (dev default)';
                }
            }
        }
    }

    updateDevPanelInfo() {
        const devInfo = document.getElementById('devPanelInfo');
        const cachedData = localStorage.getItem('bgg-collection-data');
        
        if (cachedData) {
            try {
                const data = JSON.parse(cachedData);
                const ageHours = Math.floor((Date.now() - data.timestamp) / (60 * 60 * 1000));
                const ageDays = Math.floor(ageHours / 24);
                
                let ageText;
                if (ageDays > 0) {
                    ageText = `${ageDays} day${ageDays > 1 ? 's' : ''}, ${ageHours % 24} hour${ageHours % 24 !== 1 ? 's' : ''}`;
                } else {
                    ageText = `${ageHours} hour${ageHours !== 1 ? 's' : ''}`;
                }
                
                devInfo.innerHTML = `
                    <strong>Local Development Mode</strong> <code>v${this.version}</code><br>
                    Cache: <code>${data.games.length} games</code> for <code>${data.username}</code><br>
                    Play cache: <code>${this.playDataCache.size} entries</code><br>
                    Age: <code>${ageText}</code><br>
                    Status: <code>Persistent (never expires locally)</code><br>
                    Default filter: <code>Owned games only</code>
                `;
            } catch (e) {
                devInfo.innerHTML = `
                    <strong>Local Development Mode</strong> <code>v${this.version}</code><br>
                    Cache: <code>Invalid cache data</code><br>
                    Status: <code>Error parsing cache</code>
                `;
            }
        } else {
            devInfo.innerHTML = `
                <strong>Local Development Mode</strong> <code>v${this.version}</code><br>
                Cache: <code>Empty</code><br>
                Play cache: <code>${this.playDataCache.size} entries</code><br>
                Status: <code>No cached data</code><br>
                Default user: <code>flapJ4cks</code><br>
                Default filter: <code>Owned games only</code>
            `;
        }
    }

    devClearCache() {
        if (confirm('Clear all cached BGG data? You will need to re-sync your collection.')) {
            localStorage.removeItem('bgg-collection-data');
            this.playDataCache.clear(); // Clear play data cache too
            this.games = [];
            this.filteredGames = [];
            this.currentUsername = '';
            document.getElementById('bggUsername').value = '';
            document.getElementById('gameSection').classList.add('hidden');
            document.getElementById('gameCard').classList.add('hidden');
            document.getElementById('collectionStatus').textContent = '';
            this.updateDevPanelInfo();
            
            console.log('🗑️ Cache cleared by developer action');
            alert('Cache cleared! Enter a BGG username and sync to reload.');
        }
    }

    devRefreshCache() {
        if (!this.currentUsername) {
            alert('No username set. Enter a BGG username first.');
            return;
        }
        
        if (confirm(`Force re-sync collection for ${this.currentUsername}? This will fetch fresh data from BGG.`)) {
            // Clear current cache
            localStorage.removeItem('bgg-collection-data');
            // Trigger fresh fetch
            this.fetchUserCollection();
            console.log('🔄 Force refresh triggered by developer action');
        }
    }

    devViewCache() {
        const cachedData = localStorage.getItem('bgg-collection-data');
        if (cachedData) {
            try {
                const data = JSON.parse(cachedData);
                console.group('🎲 BGG Cache Data');
                console.log('Username:', data.username);
                console.log('Game Count:', data.games.length);
                console.log('Cached:', new Date(data.timestamp));
                console.log('Cache Version:', data.version || 'Legacy (pre-1.2.0)');
                console.log('Current App Version:', this.version);
                console.log('Games:', data.games);
                console.log('Full Data:', data);
                console.groupEnd();
                
                const versionInfo = data.version ? `\nCache Version: ${data.version}` : '\nCache Version: Legacy (pre-1.2.0)';
                alert(`Cache data logged to console!\n\nUser: ${data.username}\nGames: ${data.games.length}\nCached: ${new Date(data.timestamp).toLocaleString()}${versionInfo}\n\nCheck browser console (F12) for full details.`);
            } catch (e) {
                console.error('Error parsing cache data:', e);
                alert('Error: Cache data is corrupted.');
            }
        } else {
            console.log('🎲 No BGG cache data found');
            alert('No cache data found.');
        }
    }

    // Test different BGG API approaches
    async devTestBGGUser(username) {
        console.group(`🧪 Testing BGG API for user: ${username}`);
        
        // Test 1: Direct collection API
        try {
            const directUrl = `${this.BGG_API_BASE}/collection?username=${username}`;
            console.log('Test 1 - Direct API:', directUrl);
            const response1 = await this.makeApiRequest(directUrl);
            console.log('✅ Direct API success');
        } catch (e) {
            console.error('❌ Direct API failed:', e.message);
        }

        // Test 2: Collection with stats
        try {
            const statsUrl = `${this.BGG_API_BASE}/collection?username=${username}&stats=1`;
            console.log('Test 2 - With stats:', statsUrl);
            const response2 = await this.makeApiRequest(statsUrl);
            console.log('✅ Stats API success');
        } catch (e) {
            console.error('❌ Stats API failed:', e.message);
        }

        // Test 3: User info API
        try {
            const userUrl = `${this.BGG_API_BASE}/user?name=${username}`;
            console.log('Test 3 - User info:', userUrl);
            const response3 = await this.makeApiRequest(userUrl);
            console.log('✅ User info success');
        } catch (e) {
            console.error('❌ User info failed:', e.message);
        }

        console.groupEnd();
    }

    devTestAPIDialog() {
        const username = prompt('Enter BGG username to test:\n\nSuggested test users:\n• flapJ4cks (dev default)\n• Geekdo-BoardGameGeek\n• boardgamegeek\n• thedicetower', 
                              document.getElementById('bggUsername').value || 'flapJ4cks');
        
        if (username) {
            console.log(`🧪 Starting BGG API test for: ${username}`);
            this.devTestBGGUser(username.trim());
            alert(`Testing BGG API for "${username}"\n\nCheck browser console (F12) for detailed results.`);
        }
    }

    saveCollectionData() {
        const data = {
            username: this.currentUsername,
            games: this.games,
            timestamp: Date.now(),
            version: this.version
        };
        localStorage.setItem('bgg-collection-data', JSON.stringify(data));
        
        // Update dev panel if visible
        if (document.getElementById('devPanel') && !document.getElementById('devPanel').classList.contains('hidden')) {
            this.updateDevPanelInfo();
        }
    }

    async fetchUserCollection() {
        const username = document.getElementById('bggUsername').value.trim();
        if (!username) {
            this.showCollectionStatus('⚠️ Please enter a BGG username', 'error');
            return;
        }

        if (this.isLoading) return;

        this.isLoading = true;
        this.currentUsername = username;
        this.toggleLoadingState(true);
        this.showCollectionStatus('🔄 Fetching your collection...', 'loading');

        try {
            // First, get the collection list
            const collectionUrl = `${this.BGG_API_BASE}/collection?username=${encodeURIComponent(username)}&stats=1&excludesubtype=boardgameexpansion`;
            console.log('🔗 Fetching BGG collection from:', collectionUrl);
            
            const response = await this.makeApiRequest(collectionUrl);
            console.log('📦 Raw BGG API response length:', response.length);
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response, 'text/xml');
            
            // Log the parsed XML for debugging
            console.log('📋 Parsed XML document:', xmlDoc);
            
            // Check for errors
            const error = xmlDoc.querySelector('error');
            if (error) {
                console.error('❌ BGG API returned error:', error.textContent);
                throw new Error(`BGG API Error: ${error.textContent}`);
            }

            // Check for specific BGG API messages
            const message = xmlDoc.querySelector('message');
            if (message) {
                console.log('💬 BGG API message:', message.textContent);
                // BGG sometimes returns "Your request for this collection has been accepted and will be processed"
                if (message.textContent.includes('accepted and will be processed')) {
                    throw new Error('BGG is processing your collection. Please wait 30-60 seconds and try again.');
                }
            }

            const items = xmlDoc.querySelectorAll('item');
            console.log('🎲 Found items in collection:', items.length);
            
            // More detailed error checking
            if (items.length === 0) {
                // Check if the collection root exists but is empty
                const collection = xmlDoc.querySelector('items');
                if (collection) {
                    const totalItems = collection.getAttribute('totalitems') || '0';
                    console.log('📊 BGG reports total items:', totalItems);
                    
                    if (totalItems === '0') {
                        throw new Error(`User "${username}" exists but has no games in their collection. Make sure games are marked as "Owned" in your BGG collection.`);
                    } else {
                        throw new Error(`User "${username}" has ${totalItems} items but none match the current filters. Try checking your BGG collection privacy settings.`);
                    }
                } else {
                    // Check if it's a user not found vs other issue
                    const rootElement = xmlDoc.documentElement;
                    console.log('🔍 Root element:', rootElement?.tagName, rootElement?.textContent);
                    
                    throw new Error(`No collection data found for user "${username}". Please check: 1) Username spelling, 2) Collection privacy settings on BGG, 3) That you have games marked as "Owned"`);
                }
            }

            this.showCollectionStatus(`🔄 Processing ${items.length} games...`, 'loading');

            // Parse the collection
            this.games = Array.from(items).map(item => this.parseGameItem(item));

            // Get detailed information for games in batches
            await this.enrichGameData();

            this.saveCollectionData();
            this.showCollectionStatus(`✅ Successfully loaded ${this.games.length} games!`, 'success');
            this.showGameSection();
            
            // Set default filter to "owned" in development mode after loading collection
            const isLocalDevelopment = window.location.hostname === 'localhost' || 
                                     window.location.hostname === '127.0.0.1' || 
                                     window.location.protocol === 'file:';
            if (isLocalDevelopment) {
                const gameTypeFilter = document.getElementById('gameType');
                if (gameTypeFilter.value === '') {
                    gameTypeFilter.value = 'owned';
                }
            }
            
            this.applyFilters();

        } catch (error) {
            console.error('Error fetching collection:', error);
            
            let errorMessage = `❌ Error: ${error.message}`;
            
            // Provide specific guidance for common errors
            if (error.message.includes('Content-Length') || error.message.includes('network response')) {
                errorMessage = `❌ Network error occurred (Content-Length mismatch). This is usually temporary - please try again in a moment.`;
            } else if (error.message.includes('CORS') || error.message.includes('proxy')) {
                errorMessage = `❌ Network connectivity issue. Please check your internet connection and try again.`;
            } else if (error.message.includes('timeout') || error.message.includes('AbortError')) {
                errorMessage = `❌ Request timed out. BGG servers may be slow - please wait and try again.`;
            } else if (error.message.includes('202')) {
                errorMessage = `❌ BGG is still processing your collection. Please wait a moment and try again.`;
            } else if (error.message.includes('All CORS proxies failed')) {
                errorMessage = `❌ Multiple network issues detected. Please check your connection and try again later.`;
            }
            
            this.showCollectionStatus(errorMessage, 'error');
        } finally {
            this.isLoading = false;
            this.toggleLoadingState(false);
        }
    }

    async makeApiRequest(url, retryCount = 0) {
        const maxRetries = 3;
        const corsProxies = [
            'https://api.allorigins.win/get?url=',
            'https://corsproxy.io/?',
            'https://api.codetabs.com/v1/proxy/?quest=',
            'https://cors.eu.org/',
            'https://crossorigin.me/'
        ];

        for (let proxyIndex = 0; proxyIndex < corsProxies.length; proxyIndex++) {
            const proxy = corsProxies[proxyIndex];
            const fullUrl = proxy + encodeURIComponent(url);
            
            try {
                console.log(`🌐 Attempt ${retryCount + 1}/${maxRetries} with proxy ${proxyIndex + 1}:`, fullUrl);
                
                const response = await fetch(fullUrl, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json, text/plain, */*'
                        // Removed User-Agent header as it causes CORS issues with some proxies
                    },
                    // Add timeout to prevent hanging requests (with fallback for older browsers)
                    ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(30000) } : {})
                });
                
                console.log('📡 Response status:', response.status, response.statusText);
                console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ HTTP Error Response:', errorText);
                    throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
                }
                
                let responseText;
                
                // Handle different proxy response formats
                if (proxy.includes('allorigins.win')) {
                    // AllOrigins returns JSON with 'contents' field
                    try {
                        const jsonResponse = await response.json();
                        responseText = jsonResponse.contents;
                        console.log('📦 AllOrigins JSON response parsed successfully');
                    } catch (e) {
                        console.log('⚠️ AllOrigins JSON parse failed, trying as text');
                        responseText = await response.text();
                    }
                } else {
                    // Other proxies return raw text
                    responseText = await response.text();
                }
                
                if (!responseText || responseText.length === 0) {
                    throw new Error('Empty response body');
                }
                
                console.log('📝 Response preview:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
                console.log('✅ Successfully fetched', responseText.length, 'characters');
                
                return responseText;
                
            } catch (error) {
                console.error(`❌ Proxy ${proxyIndex + 1} failed:`, error.message);
                
                // If this is a network/CORS error and we haven't tried all proxies, continue
                if (error.message.includes('Content-Length') || 
                    error.message.includes('network response') ||
                    error.message.includes('NetworkError') ||
                    error.message.includes('CORS') ||
                    error.message.includes('preflight') ||
                    error.message.includes('AbortError')) {
                    
                    if (proxyIndex < corsProxies.length - 1) {
                        console.log('🔄 Trying next proxy...');
                        continue;
                    }
                }
                
                // If we've tried all proxies and this is our last retry, throw the error
                if (proxyIndex === corsProxies.length - 1) {
                    if (retryCount < maxRetries - 1) {
                        console.log(`🔄 Retrying in ${Math.pow(2, retryCount)} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
                        return this.makeApiRequest(url, retryCount + 1);
                    } else {
                        // Last resort: try a direct request as fallback
                        console.log('🚨 All proxies failed, attempting direct request (will likely fail due to CORS)');
                        try {
                            const directResponse = await fetch(url);
                            if (directResponse.ok) {
                                const directText = await directResponse.text();
                                console.log('🎉 Direct request succeeded unexpectedly!');
                                return directText;
                            }
                        } catch (directError) {
                            console.log('⚠️ Direct request failed as expected:', directError.message);
                        }
                        
                        throw new Error(`All CORS proxies failed after ${maxRetries} attempts. Latest error: ${error.message}`);
                    }
                }
            }
        }
        
        throw new Error('All CORS proxies failed');
    }

    parseGameItem(item) {
        const game = {
            id: item.getAttribute('objectid'),
            name: item.querySelector('name')?.textContent || 'Unknown Game',
            image: item.querySelector('image')?.textContent || item.querySelector('thumbnail')?.textContent || '',
            thumbnail: item.querySelector('thumbnail')?.textContent || '',
            yearPublished: item.querySelector('yearpublished')?.textContent || 'Unknown',
            owned: item.getAttribute('subtype') === 'boardgame' && item.querySelector('status[own="1"]') !== null,
            wishlist: item.querySelector('status[wishlist="1"]') !== null,
            rating: parseFloat(item.querySelector('stats rating[value]')?.getAttribute('value') || '0'),
            numPlays: parseInt(item.querySelector('numplays')?.textContent || '0'),
        };

        // Note: Play dates are fetched separately from the BGG plays API
        // The collection API doesn't include last play dates

        // Parse stats if available
        const stats = item.querySelector('stats');
        if (stats) {
            game.minPlayers = parseInt(stats.getAttribute('minplayers') || '1');
            game.maxPlayers = parseInt(stats.getAttribute('maxplayers') || '1');
            game.playTime = parseInt(stats.getAttribute('playingtime') || '0');
            game.complexity = parseFloat(stats.querySelector('rating[name="averageweight"] value')?.getAttribute('value') || '0');
        }

        return game;
    }

    async enrichGameData() {
        // For now, we'll work with the data we have from the collection API
        // The collection API already provides most of the information we need
        // If we need more detailed info, we could batch request game details
        
        // Fill in missing complexity and other details for games that don't have them
        for (let game of this.games) {
            if (!game.minPlayers) game.minPlayers = 1;
            if (!game.maxPlayers) game.maxPlayers = 1;
            if (!game.playTime) game.playTime = 60; // Default to 60 minutes
            if (!game.complexity) game.complexity = 2.5; // Default to medium complexity
        }
    }

    showGameSection() {
        document.getElementById('gameSection').classList.remove('hidden');
        document.getElementById('gameSection').classList.add('fade-in');
    }

    applyFilters() {
        if (this.games.length === 0) return;

        const playerCount = document.getElementById('playerCount').value;
        const playTime = document.getElementById('playTime').value;
        const complexity = document.getElementById('complexity').value;
        const gameType = document.getElementById('gameType').value;

        this.filteredGames = this.games.filter(game => {
            // Player count filter
            if (playerCount) {
                const playerNum = parseInt(playerCount);
                if (playerNum === 5) {
                    // 5+ players
                    if (game.maxPlayers < 5) return false;
                } else {
                    if (game.minPlayers > playerNum || game.maxPlayers < playerNum) return false;
                }
            }

            // Play time filter
            if (playTime) {
                const gameTime = game.playTime;
                switch (playTime) {
                    case '0-30':
                        if (gameTime > 30) return false;
                        break;
                    case '30-60':
                        if (gameTime <= 30 || gameTime > 60) return false;
                        break;
                    case '60-120':
                        if (gameTime <= 60 || gameTime > 120) return false;
                        break;
                    case '120+':
                        if (gameTime <= 120) return false;
                        break;
                }
            }

            // Complexity filter
            if (complexity) {
                const gameComplexity = game.complexity;
                switch (complexity) {
                    case '1-2':
                        if (gameComplexity < 1 || gameComplexity > 2) return false;
                        break;
                    case '2-3':
                        if (gameComplexity < 2 || gameComplexity > 3) return false;
                        break;
                    case '3-4':
                        if (gameComplexity < 3 || gameComplexity > 4) return false;
                        break;
                    case '4-5':
                        if (gameComplexity < 4 || gameComplexity > 5) return false;
                        break;
                }
            }

            // Game type filter
            if (gameType) {
                switch (gameType) {
                    case 'owned':
                        if (!game.owned) return false;
                        break;
                    case 'wishlist':
                        if (!game.wishlist) return false;
                        break;
                }
            }

            return true;
        });

        this.updateFilteredCount();
    }

    updateFilteredCount() {
        const count = this.filteredGames.length;
        const countElement = document.getElementById('filteredCount');
        if (count === 0) {
            countElement.textContent = 'No games match your filters';
            countElement.style.color = '#ef4444';
        } else {
            countElement.textContent = `${count} game${count === 1 ? '' : 's'} available`;
            countElement.style.color = '#6b7280';
        }
    }

    rollDice() {
        if (this.filteredGames.length === 0) {
            this.showCollectionStatus('❌ No games available with current filters', 'error');
            return;
        }

        // Add rolling animation
        const diceIcon = document.querySelector('.dice-icon');
        diceIcon.style.animation = 'spin 0.5s ease-in-out';
        
        setTimeout(() => {
            diceIcon.style.animation = '';
            const randomIndex = Math.floor(Math.random() * this.filteredGames.length);
            const selectedGame = this.filteredGames[randomIndex];
            this.displaySelectedGame(selectedGame);
        }, 500);
    }

    displaySelectedGame(game) {
        const gameCard = document.getElementById('gameCard');
        const gameImage = document.getElementById('gameImage');
        const imageLoader = gameCard.querySelector('.image-loader');
        
        // Show the card
        gameCard.classList.remove('hidden');
        gameCard.classList.add('fade-in');

        // Update game information
        document.getElementById('gameName').textContent = game.name;
        document.getElementById('gameYear').textContent = game.yearPublished;
        document.getElementById('gamePlayers').textContent = 
            game.minPlayers === game.maxPlayers ? game.minPlayers : `${game.minPlayers}-${game.maxPlayers}`;
        document.getElementById('gamePlayTime').textContent = `${game.playTime} min`;
        document.getElementById('gameComplexity').textContent = game.complexity.toFixed(1);
        
        // Update play history
        document.getElementById('gameNumPlays').textContent = game.numPlays > 0 ? game.numPlays : 'Never played';
        
        // Try to get last played date from plays API if enabled
        if (this.enablePlayDateFetching && game.numPlays > 0) {
            document.getElementById('gameLastPlayed').textContent = 'Loading...';
            this.updateLastPlayedDate(game);
        } else if (game.numPlays === 0) {
            document.getElementById('gameLastPlayed').textContent = 'Never played';
        } else {
            document.getElementById('gameLastPlayed').textContent = 'Available in play log';
        }
        
        document.getElementById('bggLink').href = `https://boardgamegeek.com/boardgame/${game.id}`;

        // Handle image loading
        if (game.image) {
            imageLoader.style.display = 'flex';
            gameImage.style.opacity = '0';
            
            gameImage.onload = () => {
                imageLoader.style.display = 'none';
                gameImage.style.opacity = '1';
            };
            
            gameImage.onerror = () => {
                imageLoader.style.display = 'none';
                gameImage.style.opacity = '1';
                gameImage.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDMwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMjUgMTI1SDE3NVYxNzVIMTI1VjEyNVoiIGZpbGw9IiNEMUQ1REIiLz4KPC9zdmc+';
            };
            
            gameImage.src = game.image;
        } else {
            // No image available
            imageLoader.style.display = 'none';
            gameImage.style.opacity = '1';
            gameImage.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDMwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIiBmaWxsPSIjRjNGNEY2Ii8+CjxwYXRoIGQ9Ik0xMjUgMTI1SDE3NVYxNzVIMTI1VjEyNVoiIGZpbGw9IiNEMUQ1REIiLz4KPC9zdmc+';
        }

        // Scroll to the game card
        gameCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async updateLastPlayedDate(game) {
        if (game.numPlays === 0) {
            return; // No plays to fetch
        }

        // Check if we already have cached play data for this game
        const cacheKey = `${this.currentUsername}-${game.id}`;
        if (this.playDataCache.has(cacheKey)) {
            const cachedData = this.playDataCache.get(cacheKey);
            document.getElementById('gameLastPlayed').textContent = cachedData;
            return;
        }

        try {
            // BGG Plays API call - get recent plays for this game
            const playsUrl = `${this.BGG_API_BASE}/plays?username=${encodeURIComponent(this.currentUsername)}&id=${game.id}&page=1`;
            console.log(`🎯 Fetching play history for ${game.name}:`, playsUrl);
            
            const response = await this.makeApiRequest(playsUrl);
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response, 'text/xml');
            
            // Check for plays
            const plays = xmlDoc.querySelectorAll('play');
            let resultText = 'Unable to load';
            
            if (plays.length > 0) {
                // Get the most recent play (they should be sorted by date desc)
                const latestPlay = plays[0];
                const playDate = latestPlay.getAttribute('date');
                
                if (playDate) {
                    const lastPlayedDate = new Date(playDate);
                    const formattedDate = this.formatDateForDisplay(lastPlayedDate);
                    resultText = formattedDate;
                    
                    // Cache the play date on the game object for future reference
                    game.lastPlayDate = lastPlayedDate;
                    console.log(`✅ Found last play date for ${game.name}: ${formattedDate}`);
                } else {
                    resultText = 'Date unavailable';
                }
            } else {
                // BGG says there are plays but API returned none (privacy/sync issue)
                resultText = 'Private or syncing';
            }
            
            // Cache the result
            this.playDataCache.set(cacheKey, resultText);
            document.getElementById('gameLastPlayed').textContent = resultText;
            
        } catch (error) {
            console.log(`⚠️ Could not fetch play history for ${game.name}:`, error.message);
            const errorText = 'Unable to load';
            this.playDataCache.set(cacheKey, errorText);
            document.getElementById('gameLastPlayed').textContent = errorText;
        }
    }

    formatDateForDisplay(date) {
        if (!date || !(date instanceof Date) || isNaN(date)) {
            return 'Unknown';
        }

        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return 'Today';
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
        } else if (diffDays < 365) {
            const months = Math.floor(diffDays / 30);
            return `${months} month${months > 1 ? 's' : ''} ago`;
        } else {
            const years = Math.floor(diffDays / 365);
            return `${years} year${years > 1 ? 's' : ''} ago`;
        }
    }

    showCollectionStatus(message, type) {
        const statusElement = document.getElementById('collectionStatus');
        statusElement.textContent = message;
        statusElement.className = `collection-status ${type}`;
        statusElement.style.display = 'block';
    }

    toggleLoadingState(loading) {
        const fetchBtn = document.getElementById('fetchCollection');
        const spinner = fetchBtn.querySelector('.spinner');
        const btnText = fetchBtn.querySelector('.btn-text');

        if (loading) {
            fetchBtn.disabled = true;
            spinner.classList.remove('hidden');
            btnText.textContent = 'Syncing...';
        } else {
            fetchBtn.disabled = false;
            spinner.classList.add('hidden');
            btnText.textContent = 'Sync Collection';
        }
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.boardGamePickerInstance = new BoardGamePicker();
});

// Add some utility functions for debugging
window.debugBGP = {
    clearCache: () => {
        localStorage.removeItem('bgg-collection-data');
        location.reload();
    },
    getCache: () => {
        const data = localStorage.getItem('bgg-collection-data');
        return data ? JSON.parse(data) : null;
    },
    testUser: async (username) => {
        const app = window.boardGamePickerInstance;
        if (app) {
            await app.devTestBGGUser(username || 'flapJ4cks');
        } else {
            console.error('App instance not found');
        }
    },
    directAPITest: async (username) => {
        try {
            const url = `https://boardgamegeek.com/xmlapi2/collection?username=${username}`;
            console.log('Testing direct BGG API (will likely fail due to CORS):', url);
            const response = await fetch(url);
            console.log('Direct API Response:', response);
        } catch (e) {
            console.log('Expected CORS error:', e.message);
            console.log('This is why we use the CORS proxy');
        }
    },
    togglePlayDates: () => {
        const app = window.boardGamePickerInstance;
        if (app) {
            app.enablePlayDateFetching = !app.enablePlayDateFetching;
            console.log(`🎯 Play date fetching: ${app.enablePlayDateFetching ? 'ENABLED' : 'DISABLED'}`);
            return app.enablePlayDateFetching;
        }
        return false;
    },
    clearPlayCache: () => {
        const app = window.boardGamePickerInstance;
        if (app) {
            app.playDataCache.clear();
            console.log('🗑️ Play data cache cleared');
            return true;
        }
        return false;
    },
    testProxies: async () => {
        const app = window.boardGamePickerInstance;
        if (app) {
            console.log('🔧 Testing all CORS proxies individually...');
            const testUrl = 'https://boardgamegeek.com/xmlapi2/collection?username=Geekdo-BoardGameGeek&stats=1';
            
            // Test the full makeApiRequest function first
            try {
                const result = await app.makeApiRequest(testUrl);
                console.log('✅ Overall proxy test successful:', result.length, 'characters received');
                return true;
            } catch (error) {
                console.error('❌ Overall proxy test failed:', error.message);
                console.log('🔍 Testing individual proxies for debugging...');
                
                // Test each proxy individually for debugging
                const corsProxies = [
                    'https://api.allorigins.win/get?url=',
                    'https://corsproxy.io/?',
                    'https://api.codetabs.com/v1/proxy/?quest=',
                    'https://cors.eu.org/',
                    'https://crossorigin.me/'
                ];
                
                for (let i = 0; i < corsProxies.length; i++) {
                    try {
                        const proxy = corsProxies[i];
                        const fullUrl = proxy + encodeURIComponent(testUrl);
                        console.log(`Testing proxy ${i + 1}: ${proxy}`);
                        const response = await fetch(fullUrl);
                        console.log(`Proxy ${i + 1} status:`, response.status, response.statusText);
                    } catch (proxyError) {
                        console.log(`Proxy ${i + 1} failed:`, proxyError.message);
                    }
                }
                
                return false;
            }
        }
        return false;
    }
}; 