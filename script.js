class BoardGamePicker {
    constructor() {
        this.games = [];
        this.filteredGames = [];
        this.currentUsername = '';
        this.isLoading = false;
        this.playDataCache = new Map(); // Cache play data to avoid duplicate API calls
        this.enablePlayDateFetching = true; // Can be disabled if BGG API is too slow/limited
        this.currentWeightingMethod = 'random'; // Default weighting method
        this.usePersonalRating = false; // Whether to factor in personal ratings
        this.minPersonalRating = 5; // Minimum personal rating for game selection
        this.includeUnrated = true; // Whether to include games without personal ratings
        
        // Rate limiting to prevent API abuse
        this.lastApiRequest = 0;
        this.minimumApiInterval = 60000; // 1 minute between collection refreshes
        this.rateLimitWarningShown = false;
        
        // App version - update this when making releases
        this.version = '1.6.0';
        
        // BGG API endpoints
        this.BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';
        this.CORS_PROXY = 'https://api.allorigins.win/raw?url=';
        
        // Proxy health tracking
        this.proxyHealthCache = new Map();
        this.proxyHealthCheckInterval = 300000; // Check health every 5 minutes
        this.customProxyUrl = localStorage.getItem('bgg-custom-proxy-url') || '';
        
        // Request queue for better performance
        this.requestQueue = [];
        this.activeRequests = 0;
        this.maxConcurrentRequests = 2;
        
        // IndexedDB for better caching
        this.dbName = 'BoardGamePickerDB';
        this.dbVersion = 1;
        this.db = null;
        
        this.initializeEventListeners();
        this.setupDeveloperPanel();
        this.setupVersionDisplay();
        this.initializeProxyHealthCheck();
        this.initializeCarousel();
        this.initializeIndexedDB().then(() => this.loadSavedData());
        this.initializePWA();
    }

    initializeEventListeners() {
        // Username and fetch functionality
        document.getElementById('fetchCollection').addEventListener('click', (e) => {
            // Hold Shift to force refresh from BGG
            const forceRefresh = e.shiftKey;
            this.fetchUserCollection(forceRefresh);
        });
        document.getElementById('syncPlays').addEventListener('click', () => {
            this.syncPlaysData();
        });
        document.getElementById('fullSync').addEventListener('click', () => {
            this.fullSyncData();
        });
        document.getElementById('bggUsername').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.fetchUserCollection();
        });
        document.getElementById('bggUsername').addEventListener('input', () => {
            this.validateUsernameAndUpdateButtons();
        });

        // Filter controls
        document.getElementById('playerCount').addEventListener('change', () => this.applyFilters());
        document.getElementById('playTime').addEventListener('change', () => this.applyFilters());
        document.getElementById('complexity').addEventListener('change', () => this.applyFilters());
        document.getElementById('gameType').addEventListener('change', () => this.applyFilters());

        // Roll dice functionality
        document.getElementById('rollDice').addEventListener('click', () => this.rollDice());
        document.getElementById('rollAgain').addEventListener('click', () => this.rollDice());

        // Collection table functionality
        document.getElementById('toggleTable').addEventListener('click', () => this.toggleCollectionTable());

        // Weighting button functionality
        document.querySelectorAll('.weight-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.selectWeightingMethod(e.target.closest('.weight-btn')));
        });

        // Personal rating checkbox functionality
        document.getElementById('usePersonalRating').addEventListener('change', (e) => {
            this.usePersonalRating = e.target.checked;
            this.toggleRatingSlider();
            this.updateWeightInfo();
            this.applyFilters(); // Re-apply filters when rating toggle changes
            console.log(`📊 Personal rating weighting: ${this.usePersonalRating ? 'enabled' : 'disabled'}`);
        });

        // Personal rating slider functionality
        document.getElementById('minPersonalRating').addEventListener('input', (e) => {
            this.minPersonalRating = parseFloat(e.target.value);
            document.getElementById('ratingSliderValue').textContent = this.minPersonalRating;
            this.updateWeightInfo();
            this.applyFilters(); // Re-apply filters when minimum rating changes
            console.log(`📊 Minimum personal rating set to: ${this.minPersonalRating}`);
        });

        // Include unrated games checkbox functionality
        document.getElementById('includeUnrated').addEventListener('change', (e) => {
            this.includeUnrated = e.target.checked;
            this.updateWeightInfo();
            this.applyFilters(); // Re-apply filters when unrated inclusion changes
            console.log(`🔍 Include unrated games: ${this.includeUnrated ? 'enabled' : 'disabled'}`);
            console.log(`📊 Filtered games after unrated toggle: ${this.filteredGames.length}`);
        });

        // Developer panel functionality (only works when panel is visible)
        document.getElementById('devClearCache')?.addEventListener('click', () => this.devClearCache());
        document.getElementById('devRefreshCache')?.addEventListener('click', () => this.devRefreshCache());
        document.getElementById('devViewCache')?.addEventListener('click', () => this.devViewCache());
        document.getElementById('devTestAPI')?.addEventListener('click', () => this.devTestAPIDialog());
    }

    async loadSavedData() {
        // Try IndexedDB first
        if (this.db) {
            try {
                const cachedData = await this.getFromIndexedDB('collection');
                if (cachedData) {
                    const now = Date.now();
                    const oneDay = 24 * 60 * 60 * 1000;
                    const isLocalDevelopment = window.location.hostname === 'localhost' || 
                                             window.location.hostname === '127.0.0.1' || 
                                             window.location.protocol === 'file:';
                    const cacheValid = isLocalDevelopment || (now - cachedData.timestamp < oneDay);
                    
                    if (cacheValid && cachedData.username) {
                        this.games = cachedData.games || [];
                        this.currentUsername = cachedData.username;
                        document.getElementById('bggUsername').value = this.currentUsername;
                        
                        if (isLocalDevelopment) {
                            const gameTypeFilter = document.getElementById('gameType');
                            if (gameTypeFilter.value === '') {
                                gameTypeFilter.value = 'owned';
                            }
                        }
                        
                        const ageHours = Math.floor((now - cachedData.timestamp) / (60 * 60 * 1000));
                        const cacheInfo = isLocalDevelopment ? 
                            `✅ Loaded ${this.games.length} games from local IndexedDB cache for ${this.currentUsername} (offline mode)` :
                            `✅ Loaded ${this.games.length} games from local cache for ${this.currentUsername} (cached ${ageHours}h ago)`;
                        
                        this.showCollectionStatus(cacheInfo, 'success');
                        this.showGameSection();
                        this.applyFilters();
                        this.handleUrlParameters();
                        return;
                    } else if (!cacheValid) {
                        this.showCollectionStatus('⏰ Cache expired (24h), please re-sync your collection', 'error');
                        await this.clearIndexedDB();
                    }
                }
            } catch (error) {
                console.error('IndexedDB read error:', error);
            }
        }
        
        // Fall back to localStorage
        const savedData = localStorage.getItem('bgg-collection-data');
        if (savedData) {
            try {
                const data = JSON.parse(savedData);
                const now = Date.now();
                const oneDay = 24 * 60 * 60 * 1000;
                const isLocalDevelopment = window.location.hostname === 'localhost' || 
                                         window.location.hostname === '127.0.0.1' || 
                                         window.location.protocol === 'file:';
                const cacheValid = isLocalDevelopment || (now - data.timestamp < oneDay);
                
                if (cacheValid) {
                    this.games = data.games;
                    this.currentUsername = data.username;
                    document.getElementById('bggUsername').value = this.currentUsername;
                    
                    if (isLocalDevelopment) {
                        const gameTypeFilter = document.getElementById('gameType');
                        if (gameTypeFilter.value === '') {
                            gameTypeFilter.value = 'owned';
                        }
                    }
                    
                    const ageHours = Math.floor((now - data.timestamp) / (60 * 60 * 1000));
                    const cacheInfo = isLocalDevelopment ? 
                        `✅ Loaded ${this.games.length} games from localStorage cache for ${this.currentUsername} (fallback mode)` :
                        `✅ Loaded ${this.games.length} games from localStorage cache for ${this.currentUsername} (cached ${ageHours}h ago)`;
                    
                    this.showCollectionStatus(cacheInfo, 'success');
                    this.showGameSection();
                    this.applyFilters();
                    this.handleUrlParameters();
                    
                    // Migrate to IndexedDB if available
                    if (this.db) {
                        await this.saveToIndexedDB('collection', data);
                        console.log('🔄 Migrated cache to IndexedDB');
                    }
                } else {
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
            
            // Update dev panel periodically to show rate limit countdown
            setInterval(() => {
                this.updateDevPanelInfo();
            }, 5000); // Update every 5 seconds
            
            // Set default username for development
            const usernameInput = document.getElementById('bggUsername');
            if (!usernameInput.value) {
                usernameInput.value = 'flapJ4cks';
                usernameInput.setAttribute('placeholder', 'flapJ4cks (dev default)');
                console.log('🛠️ Development mode: Set default BGG username to "flapJ4cks"');
            }
            
            // Validate username and update buttons after setting defaults
            this.validateUsernameAndUpdateButtons();

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
                
                const now = Date.now();
                const timeSinceLastRequest = now - this.lastApiRequest;
                const remainingCooldown = this.minimumApiInterval - timeSinceLastRequest;
                let rateLimitStatus = '';
                
                if (this.lastApiRequest > 0 && remainingCooldown > 0) {
                    const waitSeconds = Math.ceil(remainingCooldown / 1000);
                    rateLimitStatus = `<br>Rate limit: <code style="color: #ef4444;">${waitSeconds}s cooldown</code>`;
                } else if (this.lastApiRequest > 0) {
                    rateLimitStatus = `<br>Rate limit: <code style="color: #10b981;">Ready to refresh</code>`;
                }
                
                devInfo.innerHTML = `
                    <strong>Local Development Mode</strong> <code>v${this.version}</code><br>
                    Cache: <code>${data.games.length} games</code> for <code>${data.username}</code><br>
                    Play cache: <code>${this.playDataCache.size} entries</code><br>
                    Age: <code>${ageText}</code><br>
                    Status: <code>Persistent (never expires locally)</code><br>
                    Default filter: <code>Owned games only</code>${rateLimitStatus}
                `;
            } catch (e) {
                devInfo.innerHTML = `
                    <strong>Local Development Mode</strong> <code>v${this.version}</code><br>
                    Cache: <code>Invalid cache data</code><br>
                    Status: <code>Error parsing cache</code>
                `;
            }
        } else {
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastApiRequest;
            const remainingCooldown = this.minimumApiInterval - timeSinceLastRequest;
            let rateLimitStatus = '';
            
            if (this.lastApiRequest > 0 && remainingCooldown > 0) {
                const waitSeconds = Math.ceil(remainingCooldown / 1000);
                rateLimitStatus = `<br>Rate limit: <code style="color: #ef4444;">${waitSeconds}s cooldown</code>`;
            } else if (this.lastApiRequest > 0) {
                rateLimitStatus = `<br>Rate limit: <code style="color: #10b981;">Ready to refresh</code>`;
            }
            
            devInfo.innerHTML = `
                <strong>Local Development Mode</strong> <code>v${this.version}</code><br>
                Cache: <code>Empty</code><br>
                Play cache: <code>${this.playDataCache.size} entries</code><br>
                Status: <code>No cached data</code><br>
                Default user: <code>flapJ4cks</code><br>
                Default filter: <code>Owned games only</code>${rateLimitStatus}
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
        
        // Check rate limiting for dev refresh too
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastApiRequest;
        const remainingCooldown = this.minimumApiInterval - timeSinceLastRequest;
        
        if (this.lastApiRequest > 0 && remainingCooldown > 0) {
            const waitSeconds = Math.ceil(remainingCooldown / 1000);
            alert(`⏳ Rate limiting active: Please wait ${waitSeconds} seconds before refreshing to avoid API blocks.\n\nToo many rapid requests can cause temporary bans from CORS proxies.`);
            return;
        }
        
        if (confirm(`Force re-sync collection for ${this.currentUsername}? This will fetch fresh data from BGG.\n\n⚠️ Note: Frequent refreshes can trigger rate limiting (1 minute cooldown).`)) {
            // Clear current cache
            localStorage.removeItem('bgg-collection-data');
            this.playDataCache.clear(); // Also clear play data cache
            this.games = [];
            this.filteredGames = [];
            document.getElementById('gameSection').classList.add('hidden');
            document.getElementById('gameCard').classList.add('hidden');
            
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

    async saveCollectionData() {
        const data = {
            username: this.currentUsername,
            games: this.games,
            timestamp: Date.now(),
            version: this.version
        };
        
        // Save to IndexedDB if available
        if (this.db) {
            try {
                await this.saveToIndexedDB('collection', data);
                console.log('💾 Collection data saved to IndexedDB');
            } catch (error) {
                console.error('IndexedDB save error:', error);
                // Fall back to localStorage
                localStorage.setItem('bgg-collection-data', JSON.stringify(data));
                console.log('💾 Collection data saved to localStorage (fallback)');
            }
        } else {
            // Use localStorage if IndexedDB not available
            localStorage.setItem('bgg-collection-data', JSON.stringify(data));
            console.log('💾 Collection data saved to localStorage');
        }
        
        // Update dev panel if visible
        if (document.getElementById('devPanel') && !document.getElementById('devPanel').classList.contains('hidden')) {
            this.updateDevPanelInfo();
        }
    }

    async fetchUserCollection(forceRefresh = false) {
        const username = document.getElementById('bggUsername').value.trim();
        if (!username) {
            this.showCollectionStatus('⚠️ Please enter a BGG username', 'error');
            return;
        }

        if (this.isLoading) return;

        // Check rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastApiRequest;
        const remainingCooldown = this.minimumApiInterval - timeSinceLastRequest;
        
        if (this.lastApiRequest > 0 && remainingCooldown > 0) {
            const waitMinutes = Math.ceil(remainingCooldown / 60000);
            const waitSeconds = Math.ceil(remainingCooldown / 1000);
            
            let waitMessage;
            if (waitMinutes >= 1) {
                waitMessage = `⏳ Please wait ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''} before refreshing your collection to avoid rate limiting`;
            } else {
                waitMessage = `⏳ Please wait ${waitSeconds} second${waitSeconds > 1 ? 's' : ''} before refreshing your collection to avoid rate limiting`;
            }
            
            this.showCollectionStatus(waitMessage, 'error');
            console.log(`🛑 Rate limit: ${remainingCooldown}ms remaining until next allowed request`);
            return;
        }

        // Clear any existing retry timers
        if (this.processingRetryTimeout) {
            clearTimeout(this.processingRetryTimeout);
            this.processingRetryTimeout = null;
        }
        if (this.processingCountdownInterval) {
            clearInterval(this.processingCountdownInterval);
            this.processingCountdownInterval = null;
        }
        
        this.isLoading = true;
        this.lastApiRequest = now;
        this.currentUsername = username;
        this.toggleLoadingState(true);
        this.showCollectionStatus('🔄 Connecting to BoardGameGeek API...', 'loading');

        try {
            // Try backend API first if available
            if (window.apiClient && window.apiClient.hasBackend) {
                try {
                    const result = await window.apiClient.fetchCollection(username, forceRefresh);
                    
                    if (result) {
                        this.games = result.games;
                        console.log(`🎮 Loaded ${this.games.length} games from backend:`, this.games.slice(0, 2));
                        
                        // Update status message based on source
                        const statusMsg = result.source === 'cache' 
                            ? `✅ Loaded ${this.games.length} games from server cache`
                            : `✅ Successfully loaded ${this.games.length} games from BoardGameGeek API (via server)`;
                        
                        this.saveCollectionData();
                        this.showCollectionStatus(statusMsg, 'success');
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
                        
                        // Apply filters
                        console.log('🔍 About to call applyFilters after loading games');
                        this.applyFilters();
                        return;
                    }
                } catch (error) {
                    // If backend fails with BGG processing, propagate it
                    if (error.message.includes('BGG is processing')) {
                        throw error;
                    }
                    // Otherwise fall back to direct API
                    console.warn('Backend API failed, falling back to direct BGG API:', error);
                }
            }
            
            // Fall back to direct BGG API
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

            this.showCollectionStatus(`🔄 Processing ${items.length} games from BGG API...`, 'loading');

            // Parse the collection
            this.games = Array.from(items).map(item => this.parseGameItem(item));

            // Get detailed information for games in batches
            await this.enrichGameData();

            this.saveCollectionData();
            this.showCollectionStatus(`✅ Successfully loaded ${this.games.length} games from BoardGameGeek API (live data)`, 'success');
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
            
            // Handle BGG processing message with automatic retry
            if (error.message.includes('BGG is processing your collection')) {
                this.showCollectionStatus('⏳ BGG is processing your collection. Retrying in 30 seconds...', 'warning');
                
                // Set up automatic retry after 30 seconds
                this.processingRetryTimeout = setTimeout(() => {
                    console.log('🔄 Retrying collection fetch after BGG processing delay...');
                    this.fetchUserCollection();
                }, 30000);
                
                // Show countdown
                let countdown = 30;
                this.processingCountdownInterval = setInterval(() => {
                    countdown--;
                    if (countdown > 0) {
                        this.showCollectionStatus(`⏳ BGG is processing your collection. Retrying in ${countdown} seconds...`, 'warning');
                    } else {
                        clearInterval(this.processingCountdownInterval);
                    }
                }, 1000);
                
                return;
            }
            
            // Clear any existing retry timers
            if (this.processingRetryTimeout) {
                clearTimeout(this.processingRetryTimeout);
                this.processingRetryTimeout = null;
            }
            if (this.processingCountdownInterval) {
                clearInterval(this.processingCountdownInterval);
                this.processingCountdownInterval = null;
            }
            
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
            } else if (error.message.includes('All CORS proxies failed') || error.message.includes('403') || error.message.includes('Forbidden')) {
                // Likely rate limiting or proxy blocking
                const waitMinutes = Math.ceil(this.minimumApiInterval / 60000);
                errorMessage = `❌ API rate limit reached. Please wait ${waitMinutes} minute${waitMinutes > 1 ? 's' : ''} before trying again. Too many requests can cause temporary blocks.`;
                
                // Reset the cooldown to current time to enforce waiting
                this.lastApiRequest = Date.now();
            }
            
            this.showCollectionStatus(errorMessage, 'error');
        } finally {
            this.isLoading = false;
            this.toggleLoadingState(false);
        }
    }

    async syncPlaysData() {
        if (!this.currentUsername) {
            this.showCollectionStatus('❌ Please enter a username first', 'error');
            return;
        }

        if (this.games.length === 0) {
            this.showCollectionStatus('❌ Please sync your collection first', 'error');
            return;
        }

        try {
            // Show loading state
            const button = document.getElementById('syncPlays');
            const buttonText = button.querySelector('.btn-text');
            const spinner = button.querySelector('.spinner');
            
            buttonText.textContent = 'Syncing Plays...';
            spinner.classList.remove('hidden');
            button.disabled = true;

            this.showCollectionStatus('🔄 Syncing play data from BGG...', 'loading');

            // Try backend API first if available
            if (window.apiClient && window.apiClient.hasBackend) {
                try {
                    const data = await window.apiClient.syncPlaysData(this.currentUsername);
                    
                    if (data) {
                        this.showCollectionStatus(`✅ Successfully synced play data for ${data.updated} games`, 'success');
                        
                        // Clear local play cache to force refresh
                        this.playDataCache.clear();
                        
                        // Update any visible table
                        const tableContainer = document.getElementById('collectionTableContainer');
                        if (!tableContainer.classList.contains('hidden')) {
                            await this.populateCollectionTable();
                        }
                        
                        return;
                    } else {
                        console.log('Backend plays sync failed, falling back to direct sync');
                    }
                } catch (error) {
                    console.log('Backend plays sync error:', error.message);
                }
            }

            // Fallback to direct BGG API sync
            let updatedCount = 0;
            const gamesWithPlays = this.games.filter(game => game.numPlays > 0);
            
            this.showCollectionStatus(`🔄 Syncing ${gamesWithPlays.length} games with play data...`, 'loading');

            for (let i = 0; i < gamesWithPlays.length; i++) {
                const game = gamesWithPlays[i];
                
                try {
                    // Update progress
                    if (i % 5 === 0) { // Update every 5 games to avoid too frequent updates
                        this.showCollectionStatus(`🔄 Syncing play data... (${i + 1}/${gamesWithPlays.length})`, 'loading');
                    }

                    // Queue the play data request
                    const playData = await this.queueRequest(() => this.fetchPlayDataForGame(game));
                    
                    if (playData && playData.plays.length > 0) {
                        const latestPlay = playData.plays[0];
                        const playDate = latestPlay.getAttribute('date');
                        
                        if (playDate) {
                            const lastPlayDate = new Date(playDate);
                            const resultText = this.formatDateForDisplay(lastPlayDate);
                            game.lastPlayDate = lastPlayDate;
                            
                            // Update caches
                            const cacheKey = `${this.currentUsername}-${game.id}`;
                            this.playDataCache.set(cacheKey, resultText);
                            
                            // Cache in IndexedDB
                            if (this.db) {
                                const playDataEntry = {
                                    cacheKey,
                                    displayText: resultText,
                                    lastPlayDate: lastPlayDate.toISOString(),
                                    timestamp: Date.now(),
                                    gameId: game.id,
                                    gameName: game.name
                                };
                                try {
                                    await this.saveToIndexedDB('playData', playDataEntry);
                                } catch (indexedDBError) {
                                    console.error('IndexedDB save error for play data:', indexedDBError);
                                }
                            }
                            
                            updatedCount++;
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to sync play data for ${game.name}:`, error.message);
                }
            }

            this.showCollectionStatus(`✅ Successfully synced play data for ${updatedCount} games`, 'success');
            
            // Update any visible table
            const tableContainer = document.getElementById('collectionTableContainer');
            if (!tableContainer.classList.contains('hidden')) {
                await this.populateCollectionTable();
            }

        } catch (error) {
            console.error('Error syncing plays data:', error);
            this.showCollectionStatus(`❌ Error syncing plays: ${error.message}`, 'error');
        } finally {
            // Reset button state
            const button = document.getElementById('syncPlays');
            const buttonText = button.querySelector('.btn-text');
            const spinner = button.querySelector('.spinner');
            
            buttonText.textContent = 'Sync Plays';
            spinner.classList.add('hidden');
            button.disabled = false;
        }
    }

    async fullSyncData() {
        if (!this.currentUsername) {
            this.showCollectionStatus('❌ Please enter a username first', 'error');
            return;
        }

        try {
            // Show loading state
            const button = document.getElementById('fullSync');
            const buttonText = button.querySelector('.btn-text');
            const spinner = button.querySelector('.spinner');
            
            buttonText.textContent = 'Full Syncing...';
            spinner.classList.remove('hidden');
            button.disabled = true;

            this.showCollectionStatus('🔄 Starting full sync (collection + plays)...', 'loading');

            // Try backend API first if available
            if (window.apiClient && window.apiClient.hasBackend) {
                try {
                    const data = await window.apiClient.fullSyncData(this.currentUsername);
                    
                    if (data) {
                        this.showCollectionStatus(`✅ Full sync completed: ${data.collection_games} games, ${data.plays_updated} play records updated`, 'success');
                        
                        // Update local data
                        if (data.collection_data) {
                            this.games = data.collection_data;
                            this.saveCollectionData();
                            this.showGameSection();
                            this.applyFilters();
                        }
                        
                        // Clear local play cache to force refresh
                        this.playDataCache.clear();
                        
                        // Update any visible table
                        const tableContainer = document.getElementById('collectionTableContainer');
                        if (!tableContainer.classList.contains('hidden')) {
                            await this.populateCollectionTable();
                        }
                        
                        // Refresh user info to show updated sync date
                        await this.displayUserInfo(this.currentUsername);
                        
                        return;
                    } else {
                        console.log('Backend full sync failed, falling back to sequential sync');
                    }
                } catch (error) {
                    console.log('Backend full sync error:', error.message);
                }
            }

            // Fallback to sequential sync: collection first, then plays
            this.showCollectionStatus('🔄 Syncing collection data...', 'loading');
            
            // Step 1: Sync collection (force refresh)
            await this.fetchUserCollection(true);
            
            if (this.games.length === 0) {
                throw new Error('Failed to sync collection data');
            }

            // Step 2: Sync plays data
            this.showCollectionStatus('🔄 Syncing play data for all games...', 'loading');
            
            let updatedCount = 0;
            const gamesWithPlays = this.games.filter(game => game.numPlays > 0);
            
            for (let i = 0; i < gamesWithPlays.length; i++) {
                const game = gamesWithPlays[i];
                
                try {
                    // Update progress every 10 games
                    if (i % 10 === 0) {
                        this.showCollectionStatus(`🔄 Full sync: plays data (${i + 1}/${gamesWithPlays.length})...`, 'loading');
                    }

                    // Queue the play data request
                    const playData = await this.queueRequest(() => this.fetchPlayDataForGame(game));
                    
                    if (playData && playData.plays.length > 0) {
                        const latestPlay = playData.plays[0];
                        const playDate = latestPlay.getAttribute('date');
                        
                        if (playDate) {
                            const lastPlayDate = new Date(playDate);
                            const resultText = this.formatDateForDisplay(lastPlayDate);
                            game.lastPlayDate = lastPlayDate;
                            
                            // Update caches
                            const cacheKey = `${this.currentUsername}-${game.id}`;
                            this.playDataCache.set(cacheKey, resultText);
                            
                            // Cache in IndexedDB
                            if (this.db) {
                                const playDataEntry = {
                                    cacheKey,
                                    displayText: resultText,
                                    lastPlayDate: lastPlayDate.toISOString(),
                                    timestamp: Date.now(),
                                    gameId: game.id,
                                    gameName: game.name
                                };
                                try {
                                    await this.saveToIndexedDB('playData', playDataEntry);
                                } catch (indexedDBError) {
                                    console.error('IndexedDB save error for play data:', indexedDBError);
                                }
                            }
                            
                            updatedCount++;
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to sync play data for ${game.name}:`, error.message);
                }
            }

            // Step 3: Fetch additional game details in batches
            this.showCollectionStatus('🔄 Fetching detailed game information...', 'loading');
            await this.enrichGameData();

            this.showCollectionStatus(`✅ Full sync completed: ${this.games.length} games, ${updatedCount} play records updated`, 'success');
            
            // Update any visible table
            const tableContainer = document.getElementById('collectionTableContainer');
            if (!tableContainer.classList.contains('hidden')) {
                await this.populateCollectionTable();
            }
            
            // Refresh user info to show updated sync date (for fallback sync)
            await this.displayUserInfo(this.currentUsername);

        } catch (error) {
            console.error('Error during full sync:', error);
            this.showCollectionStatus(`❌ Full sync error: ${error.message}`, 'error');
        } finally {
            // Reset button state
            const button = document.getElementById('fullSync');
            const buttonText = button.querySelector('.btn-text');
            const spinner = button.querySelector('.spinner');
            
            buttonText.textContent = 'Full Sync';
            spinner.classList.add('hidden');
            
            // Only re-enable if username is still present
            const username = document.getElementById('bggUsername').value.trim();
            button.disabled = !username;
        }
    }

    async makeApiRequest(url, retryCount = 0) {
        const maxRetries = 3;
        const corsProxies = [
            { url: 'https://api.allorigins.win/get?url=', name: 'AllOrigins', jsonResponse: true },
            { url: 'https://thingproxy.freeboard.io/fetch/', name: 'ThingProxy' },
            { url: 'https://api.codetabs.com/v1/proxy?quest=', name: 'CodeTabs' },
            { url: 'https://corsproxy.io/?', name: 'CORSProxy.io' },
            { url: 'https://cors-proxy.htmldriven.com/?url=', name: 'HTMLDriven' },
            { url: 'https://proxy.cors.sh/', name: 'CORS.sh' },
            { url: 'https://cors.bridged.cc/', name: 'Bridged' },
            { url: 'https://cors-anywhere.herokuapp.com/', name: 'CORS-Anywhere' }
        ];
        
        // Add custom proxy if configured
        if (this.customProxyUrl) {
            corsProxies.unshift({ url: this.customProxyUrl, name: 'Custom Proxy' });
        }
        
        // Sort proxies by health score
        const sortedProxies = this.sortProxiesByHealth(corsProxies);

        for (let proxyIndex = 0; proxyIndex < sortedProxies.length; proxyIndex++) {
            const proxy = sortedProxies[proxyIndex];
            
            // Skip unhealthy proxies
            if (this.isProxyUnhealthy(proxy.name)) {
                console.log(`⚠️ Skipping unhealthy proxy: ${proxy.name}`);
                continue;
            }
            const fullUrl = proxy.url + encodeURIComponent(url);
            
            try {
                console.log(`🌐 Attempt ${retryCount + 1}/${maxRetries} with ${proxy.name}:`, fullUrl);
                
                // Update status to show which proxy we're using
                this.showCollectionStatus(`🔄 Connecting via ${proxy.name} proxy...`, 'loading');
                
                // Different headers for different proxies
                let headers = {
                    'Accept': 'application/json, text/plain, */*'
                };
                
                // Only add User-Agent for proxies that support it
                if (!proxy.url.includes('allorigins.win')) {
                    headers['User-Agent'] = `BoardGamePicker/${this.version}`;
                }
                
                const response = await fetch(fullUrl, {
                    method: 'GET',
                    headers: headers,
                    // Add timeout to prevent hanging requests (with fallback for older browsers)
                    ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(30000) } : {})
                });
                
                console.log('📡 Response status:', response.status, response.statusText);
                console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));
                
                // Check if response is from service worker cache
                if (response.headers.get('X-Served-From') === 'cache') {
                    this.showCollectionStatus(`🔄 Loading from service worker cache (offline mode)...`, 'loading');
                }
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ HTTP Error Response:', errorText);
                    throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
                }
                
                let responseText;
                
                // Handle different proxy response formats
                if (proxy.jsonResponse || proxy.url.includes('allorigins.win')) {
                    // JSON response proxies
                    const responseClone = response.clone();
                    try {
                        const jsonResponse = await response.json();
                        responseText = jsonResponse.contents || jsonResponse.data || jsonResponse.body;
                    } catch (e) {
                        console.log('⚠️ JSON parse failed, trying as text');
                        responseText = await responseClone.text();
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
                
                // Update proxy health on success
                this.updateProxyHealth(proxy.name, true);
                
                return responseText;
                
            } catch (error) {
                console.error(`❌ ${proxy.name} failed:`, error.message);
                
                // Update proxy health on failure
                this.updateProxyHealth(proxy.name, false);
                
                // Check if this error indicates rate limiting or temporary issues
                const isRateLimited = error.message.includes('403') || 
                                     error.message.includes('Forbidden') ||
                                     error.message.includes('429') ||
                                     error.message.includes('Too Many Requests');
                
                const isCorsIssue = error.message.includes('CORS') || 
                                   error.message.includes('preflight') ||
                                   error.message.includes('NetworkError');
                
                const isTemporaryError = error.message.includes('Content-Length') || 
                                        error.message.includes('network response') ||
                                        error.message.includes('AbortError') ||
                                        error.message.includes('timeout');
                
                // Log the type of error for debugging
                if (isRateLimited) {
                    console.log('🚫 Rate limiting detected');
                } else if (isCorsIssue) {
                    console.log('🌐 CORS policy issue detected');
                } else if (isTemporaryError) {
                    console.log('⏳ Temporary network issue detected');
                }
                
                // Continue to next proxy if available
                if (proxyIndex < corsProxies.length - 1) {
                    console.log('🔄 Trying next proxy...');
                    continue;
                }
                
                // If we've tried all proxies, decide whether to retry the whole sequence
                if (retryCount < maxRetries - 1) {
                    console.log(`🔄 Retrying in ${Math.pow(2, retryCount)} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
                    return this.makeApiRequest(url, retryCount + 1);
                } else {
                    // Provide a more helpful error message based on the type of failure
                    let errorSummary = `All CORS proxies failed after ${maxRetries} attempts.`;
                    if (isRateLimited) {
                        errorSummary += ' Rate limiting detected - try again later.';
                    } else if (isCorsIssue) {
                        errorSummary += ' CORS policy issues detected.';
                    }
                    throw new Error(`${errorSummary} Latest error: ${error.message}`);
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
            rating: parseFloat(item.querySelector('stats rating[value]')?.getAttribute('value') || '0'), // User's personal rating
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
            
            // Get BGG community average rating - the correct structure is stats > rating > average
            const averageRating = stats.querySelector('rating average');
            if (averageRating) {
                game.bggRating = parseFloat(averageRating.getAttribute('value') || '0');
            } else {
                // Fallback: try alternative selector patterns
                const ratingElement = stats.querySelector('rating[name="average"]');
                if (ratingElement) {
                    game.bggRating = parseFloat(ratingElement.getAttribute('value') || '0');
                } else {
                    // Last fallback: try Bayesian average (BGG Geek rating)
                    const bayesAverage = stats.querySelector('rating bayesaverage');
                    game.bggRating = bayesAverage ? parseFloat(bayesAverage.getAttribute('value') || '0') : 0;
                }
            }
        }

        return game;
    }

    async enrichGameData() {
        // Check if any games need additional data
        const gamesNeedingData = this.games.filter(game => 
            !game.stats?.rating?.average?.value || 
            !game.stats?.averageweight?.value ||
            !game.stats?.minplayers?.value ||
            !game.minPlayers || !game.maxPlayers || !game.playTime || !game.complexity
        );
        
        if (gamesNeedingData.length === 0) {
            console.log('✅ All games have complete data');
            return;
        }
        
        console.log(`🔍 Enriching data for ${gamesNeedingData.length} games...`);
        
        // First apply defaults for basic fields
        for (let game of this.games) {
            if (!game.minPlayers) game.minPlayers = 1;
            if (!game.maxPlayers) game.maxPlayers = 1;
            if (!game.playTime) game.playTime = 60; // Default to 60 minutes
            if (!game.complexity) game.complexity = 2.5; // Default to medium complexity
        }
        
        // Then batch fetch detailed data for games that need it
        const batchSize = 20; // BGG API supports up to 20 items per request
        const batches = [];
        for (let i = 0; i < gamesNeedingData.length; i += batchSize) {
            batches.push(gamesNeedingData.slice(i, i + batchSize));
        }
        
        // Process batches with queue
        if (batches.length > 0) {
            this.showCollectionStatus(`🔄 Fetching detailed data for ${gamesNeedingData.length} games...`, 'loading');
            
            let completedBatches = 0;
            const batchPromises = batches.map((batch, index) => 
                this.queueRequest(async () => {
                    await this.fetchBatchGameDetails(batch);
                    completedBatches++;
                    const progress = Math.round((completedBatches / batches.length) * 100);
                    this.showCollectionStatus(`🔄 Loading game details... ${progress}% complete (${completedBatches}/${batches.length} batches)`, 'loading');
                })
            );
            
            await Promise.all(batchPromises);
        }
    }
    
    async fetchBatchGameDetails(games) {
        if (games.length === 0) return;
        
        const ids = games.map(g => g.id).join(',');
        const batchUrl = `${this.BGG_API_BASE}/thing?id=${ids}&stats=1&type=boardgame`;
        
        try {
            console.log(`📦 Fetching batch of ${games.length} games...`);
            const response = await this.makeApiRequest(batchUrl);
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response, 'text/xml');
            
            const items = xmlDoc.querySelectorAll('item');
            items.forEach(item => {
                const gameId = item.getAttribute('id');
                const game = this.games.find(g => g.id === gameId);
                
                if (game) {
                    // Update missing data
                    if (!game.stats) game.stats = {};
                    
                    // Rating
                    const avgRating = item.querySelector('statistics ratings average')?.getAttribute('value');
                    if (avgRating && !game.stats.rating?.average?.value) {
                        if (!game.stats.rating) game.stats.rating = {};
                        if (!game.stats.rating.average) game.stats.rating.average = {};
                        game.stats.rating.average.value = parseFloat(avgRating);
                    }
                    
                    // Weight/Complexity
                    const avgWeight = item.querySelector('statistics ratings averageweight')?.getAttribute('value');
                    if (avgWeight) {
                        if (!game.stats.averageweight) game.stats.averageweight = {};
                        game.stats.averageweight.value = parseFloat(avgWeight);
                        game.complexity = parseFloat(avgWeight);
                    }
                    
                    // Players
                    const minPlayers = item.querySelector('minplayers')?.getAttribute('value');
                    const maxPlayers = item.querySelector('maxplayers')?.getAttribute('value');
                    if (minPlayers) {
                        game.minPlayers = parseInt(minPlayers);
                        if (!game.stats.minplayers) game.stats.minplayers = {};
                        game.stats.minplayers.value = parseInt(minPlayers);
                    }
                    if (maxPlayers) {
                        game.maxPlayers = parseInt(maxPlayers);
                        if (!game.stats.maxplayers) game.stats.maxplayers = {};
                        game.stats.maxplayers.value = parseInt(maxPlayers);
                    }
                    
                    // Play time
                    const minTime = item.querySelector('minplaytime')?.getAttribute('value');
                    const maxTime = item.querySelector('maxplaytime')?.getAttribute('value');
                    const playTime = item.querySelector('playingtime')?.getAttribute('value');
                    
                    if (playTime) {
                        game.playTime = parseInt(playTime);
                    } else if (maxTime) {
                        game.playTime = parseInt(maxTime);
                    }
                    
                    if (minTime) {
                        if (!game.stats.minplaytime) game.stats.minplaytime = {};
                        game.stats.minplaytime.value = parseInt(minTime);
                    }
                    if (maxTime) {
                        if (!game.stats.maxplaytime) game.stats.maxplaytime = {};
                        game.stats.maxplaytime.value = parseInt(maxTime);
                    }
                }
            });
            
            console.log(`✅ Batch complete: enriched ${items.length} games`);
        } catch (error) {
            console.error('Error fetching batch game details:', error);
        }
    }

    showGameSection() {
        document.getElementById('gameSection').classList.remove('hidden');
        document.getElementById('gameSection').classList.add('fade-in');
        
        // Show all buttons
        document.getElementById('toggleTable').style.display = 'inline-flex';
        document.getElementById('syncPlays').style.display = 'inline-flex';
        document.getElementById('fullSync').style.display = 'inline-flex';
    }

    async validateUsernameAndUpdateButtons() {
        const username = document.getElementById('bggUsername').value.trim();
        const hasUsername = username.length > 0;
        
        // Enable/disable all sync buttons based on username presence
        document.getElementById('fetchCollection').disabled = !hasUsername;
        document.getElementById('syncPlays').disabled = !hasUsername;
        document.getElementById('fullSync').disabled = !hasUsername;
        
        // Also update visual state
        const buttons = ['fetchCollection', 'syncPlays', 'fullSync'];
        buttons.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (hasUsername) {
                button.classList.remove('disabled-state');
            } else {
                button.classList.add('disabled-state');
            }
        });

        // Fetch and display user info if username is provided
        if (hasUsername && window.apiClient && window.apiClient.hasBackend) {
            await this.displayUserInfo(username);
        } else {
            // Hide user info if no username or no backend
            document.getElementById('userInfo').classList.add('hidden');
        }
    }

    async displayUserInfo(username) {
        try {
            const userInfo = await window.apiClient.getUserInfo(username);
            const userInfoContainer = document.getElementById('userInfo');
            const userSyncStatus = document.getElementById('userSyncStatus');
            
            if (userInfo && userInfo.exists) {
                let syncStatusText = '';
                
                if (userInfo.last_full_sync) {
                    const lastSyncDate = new Date(userInfo.last_full_sync);
                    const syncTimeAgo = this.formatDateForDisplay(lastSyncDate);
                    syncStatusText = `📅 Last full sync: ${syncTimeAgo}`;
                } else {
                    syncStatusText = '📅 No full sync yet';
                }
                
                userSyncStatus.innerHTML = `
                    <span class="username-display">👤 ${userInfo.username}</span>
                    <span class="sync-date">${syncStatusText}</span>
                `;
                
                userInfoContainer.classList.remove('hidden');
            } else if (userInfo && !userInfo.exists) {
                userSyncStatus.innerHTML = `
                    <span class="username-display">👤 ${username}</span>
                    <span class="sync-date">📅 New user - ready for first sync</span>
                `;
                userInfoContainer.classList.remove('hidden');
            } else {
                userInfoContainer.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            document.getElementById('userInfo').classList.add('hidden');
        }
    }

    applyFilters() {
        console.log('🔍 applyFilters called, games count:', this.games.length);
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

            // Unrated games filter (independent of personal rating system)
            // Check for unrated games: rating is 0, null, undefined, NaN, or any other falsy value
            const isUnrated = !game.rating || game.rating === 0 || isNaN(game.rating);
            if (isUnrated && !this.includeUnrated) {
                console.log(`🚫 Filtering out unrated game: ${game.name} (rating: ${game.rating})`);
                return false;
            }

            // Personal rating filters (only apply if personal rating system is enabled)
            if (this.usePersonalRating) {
                // If game has a rating, check if it meets minimum threshold
                if (game.rating > 0 && game.rating < this.minPersonalRating) {
                    return false;
                }
            }

            return true;
        });

        this.updateFilteredCount();
        
        // Always update carousel when filters change (if there are games)
        console.log('🔍 Checking carousel update:', {
            filteredGamesCount: this.filteredGames.length,
            carouselContainer: !!this.carouselContainer
        });
        if (this.filteredGames.length > 0 && this.carouselContainer) {
            console.log('🔍 Calling populateCarousel from applyFilters');
            this.populateCarousel();
        }
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
        
        // Update weight info
        this.updateWeightInfo();
    }

    selectWeightingMethod(button) {
        // Remove active class from all buttons
        document.querySelectorAll('.weight-btn').forEach(btn => btn.classList.remove('active'));
        
        // Add active class to clicked button
        button.classList.add('active');
        
        // Update current weighting method
        this.currentWeightingMethod = button.dataset.weight;
        
        // Update weight info
        this.updateWeightInfo();
        
        console.log(`🎯 Weighting method changed to: ${this.currentWeightingMethod}`);
    }

    toggleRatingSlider() {
        const sliderWrapper = document.getElementById('ratingSliderWrapper');
        if (this.usePersonalRating) {
            sliderWrapper.classList.remove('hidden');
            sliderWrapper.style.animation = 'fadeIn 0.3s ease-out';
        } else {
            sliderWrapper.classList.add('hidden');
        }
    }

    updateWeightInfo() {
        const weightInfo = document.getElementById('weightInfo');
        const count = this.filteredGames.length;
        
        if (count === 0) {
            weightInfo.textContent = '';
            return;
        }

        let infoText = '';
        switch (this.currentWeightingMethod) {
            case 'random':
                infoText = 'All games have equal chance of selection';
                break;
            case 'recency':
                const avgDays = this.calculateAverageRecency();
                infoText = avgDays >= 0 ? 
                    `Games played longer ago are more likely to be selected (avg: ${avgDays} days)` :
                    'Games with play history are more likely to be selected';
                break;
            case 'unplayed':
                const unplayedCount = this.filteredGames.filter(g => g.numPlays === 0).length;
                infoText = unplayedCount > 0 ? 
                    `Unplayed games are strongly favored (${unplayedCount} unplayed)` :
                    'No unplayed games available, using play recency';
                break;
        }
        
        // Add rating info
        const ratedGames = this.filteredGames.filter(g => g.rating && g.rating > 0 && !isNaN(g.rating)).length;
        const unratedGames = this.filteredGames.filter(g => !g.rating || g.rating === 0 || isNaN(g.rating)).length;
        
        if (this.usePersonalRating) {
            // Personal rating system is enabled
            const qualifyingRatedGames = this.filteredGames.filter(g => g.rating >= this.minPersonalRating).length;
            const avgRating = ratedGames > 0 ? 
                (this.filteredGames.filter(g => g.rating && g.rating > 0 && !isNaN(g.rating)).reduce((sum, g) => sum + g.rating, 0) / ratedGames).toFixed(1) :
                'N/A';
            
            let ratingInfo = `Personal ratings active: ${qualifyingRatedGames} meet min ${this.minPersonalRating}★`;
            if (this.includeUnrated && unratedGames > 0) {
                ratingInfo += `, ${unratedGames} unrated included`;
            }
            ratingInfo += ` (avg rated: ${avgRating})`;
            
            infoText += ` • ${ratingInfo}`;
        } else if (!this.includeUnrated && unratedGames > 0) {
            // Personal rating system is disabled, but unrated games are being filtered out
            const totalUnratedGames = this.games.filter(g => !g.rating || g.rating === 0 || isNaN(g.rating)).length;
            infoText += ` • Excluding ${totalUnratedGames - unratedGames} unrated games`;
        }
        
        weightInfo.textContent = infoText;
    }

    calculateAverageRecency() {
        const gamesWithDates = this.filteredGames.filter(game => game.lastPlayDate);
        if (gamesWithDates.length === 0) return -1;
        
        const now = new Date();
        const totalDays = gamesWithDates.reduce((sum, game) => {
            const diffTime = Math.abs(now - game.lastPlayDate);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            return sum + diffDays;
        }, 0);
        
        return Math.round(totalDays / gamesWithDates.length);
    }

    rollDice() {
        console.log('🎰 rollDice called - checking prerequisites');
        console.log('🎰 Games loaded:', !!this.games && this.games.length > 0);
        console.log('🎰 Filtered games:', !!this.filteredGames && this.filteredGames.length > 0);
        console.log('🎭 Cover Flow elements:', !!this.carouselContainer && !!this.flipsterElement);
        
        if (!this.games || this.games.length === 0) {
            console.log('🎰 Cannot spin - no games loaded yet');
            return;
        }
        
        if (!this.filteredGames || this.filteredGames.length === 0 || !this.carouselContainer || !this.flipsterElement) {
            console.log('🎰 Cannot spin - missing filtered games or carousel elements');
            this.showCollectionStatus('❌ No games available with current filters', 'error');
            return;
        }

        // Ensure carousel is populated before spinning
        console.log('🎰 About to start carousel spin');
        console.log('🎰 Carousel games count:', this.carouselGames?.length);
        console.log('🎭 Cover Flow items count:', this.flipsterElement.querySelectorAll('li').length);
        
        // Re-populate carousel if needed
        if (!this.carouselGames || this.carouselGames.length === 0 || this.flipsterElement.querySelectorAll('li').length === 0) {
            console.log('🎰 Carousel not populated, populating now...');
            this.populateCarousel();
        }
        
        this.startCarouselSpin();
    }

    selectWeightedGame() {
        const games = this.filteredGames;
        
        if (this.currentWeightingMethod === 'random') {
            // Simple random selection
            const randomIndex = Math.floor(Math.random() * games.length);
            return games[randomIndex];
        }
        
        // Calculate weights for each game
        const weights = games.map(game => this.calculateGameWeight(game));
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        
        // Handle edge case where all weights are 0
        if (totalWeight === 0) {
            const randomIndex = Math.floor(Math.random() * games.length);
            return games[randomIndex];
        }
        
        // Weighted random selection
        let randomValue = Math.random() * totalWeight;
        for (let i = 0; i < games.length; i++) {
            randomValue -= weights[i];
            if (randomValue <= 0) {
                console.log(`🎯 Selected ${games[i].name} (weight: ${weights[i].toFixed(2)}, method: ${this.currentWeightingMethod})`);
                return games[i];
            }
        }
        
        // Fallback (should not reach here)
        return games[games.length - 1];
    }

    calculateGameWeight(game) {
        let baseWeight;
        
        switch (this.currentWeightingMethod) {
            case 'random':
                baseWeight = 1; // All games equal weight
                break;
                
            case 'unplayed':
                if (game.numPlays === 0) {
                    baseWeight = 10; // Unplayed games get 10x weight
                } else if (game.lastPlayDate) {
                    // Played games get weight based on recency (older = higher weight)
                    baseWeight = this.calculateRecencyWeight(game);
                } else {
                    baseWeight = 2; // Games with unknown play dates get moderate weight
                }
                break;
                
            case 'recency':
                if (game.numPlays === 0) {
                    baseWeight = 5; // Unplayed games get 5x weight in recency mode
                } else if (game.lastPlayDate) {
                    baseWeight = this.calculateRecencyWeight(game);
                } else {
                    baseWeight = 3; // Games with unknown play dates get moderate weight
                }
                break;
                
            default:
                baseWeight = 1;
        }
        
        // Apply personal rating multiplier if enabled
        if (this.usePersonalRating && game.rating && game.rating > 0 && !isNaN(game.rating)) {
            const ratingMultiplier = this.calculateRatingWeight(game.rating);
            return baseWeight * ratingMultiplier;
        }
        
        return baseWeight;
    }

    calculateRatingWeight(rating) {
        // Convert personal rating to weight multiplier
        // BGG ratings are typically 1-10, with 5 being average
        // We'll use a curve that strongly favors highly rated games
        if (rating >= 9) {
            return 3.0; // Excellent games (9-10) get 3x weight
        } else if (rating >= 8) {
            return 2.5; // Very good games (8-9) get 2.5x weight
        } else if (rating >= 7) {
            return 2.0; // Good games (7-8) get 2x weight
        } else if (rating >= 6) {
            return 1.5; // Above average games (6-7) get 1.5x weight
        } else if (rating >= 5) {
            return 1.0; // Average games (5-6) get normal weight
        } else if (rating >= 4) {
            return 0.7; // Below average games (4-5) get reduced weight
        } else if (rating >= 3) {
            return 0.5; // Poor games (3-4) get low weight
        } else {
            return 0.3; // Very poor games (1-3) get very low weight
        }
    }

    calculateRecencyWeight(game) {
        if (!game.lastPlayDate) {
            return 1; // Base weight for games without play dates
        }
        
        const now = new Date();
        const diffTime = Math.abs(now - game.lastPlayDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        // Weight formula: games not played for longer get higher weights
        // 1 day = 1.1x, 1 week = 1.7x, 1 month = 4x, 1 year = 16x, 2+ years = 25x
        if (diffDays < 1) {
            return 0.5; // Recently played games get lower weight
        } else if (diffDays < 7) {
            return 1 + (diffDays * 0.1); // 1.1 to 1.6
        } else if (diffDays < 30) {
            const weeks = diffDays / 7;
            return 1 + weeks; // ~2 to 5
        } else if (diffDays < 365) {
            const months = diffDays / 30;
            return 3 + (months * 2); // ~5 to 27
        } else {
            const years = diffDays / 365;
            return Math.min(25, 15 + (years * 5)); // Cap at 25x weight
        }
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
        document.getElementById('gameComplexity').textContent = (game.complexity && !isNaN(game.complexity)) ? game.complexity.toFixed(1) : 'N/A';
        
        // Update ratings
        const personalRatingElement = document.getElementById('gamePersonalRating');
        if (game.rating && game.rating > 0 && !isNaN(game.rating)) {
            personalRatingElement.textContent = `⭐ ${game.rating.toFixed(1)}/10`;
            personalRatingElement.title = `Your personal rating: ${game.rating.toFixed(1)} out of 10`;
        } else {
            personalRatingElement.textContent = 'Not rated';
            personalRatingElement.title = 'You have not rated this game yet';
        }
        
        const bggRatingElement = document.getElementById('gameBggRating');
        if (game.bggRating && game.bggRating > 0 && !isNaN(game.bggRating)) {
            bggRatingElement.textContent = `🎯 ${game.bggRating.toFixed(1)}/10`;
            bggRatingElement.title = `BoardGameGeek community rating: ${game.bggRating.toFixed(1)} out of 10`;
        } else {
            bggRatingElement.textContent = 'No rating';
            bggRatingElement.title = 'No community rating available';
        }
        
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

        // Keep carousel visible after game selection

        // Scroll to the game card
        gameCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add social sharing button
        this.addSocialSharing(game);
    }

    async updateLastPlayedDate(game) {
        if (game.numPlays === 0) {
            return; // No plays to fetch
        }

        const cacheKey = `${this.currentUsername}-${game.id}`;
        
        // Check IndexedDB cache first
        if (this.db) {
            try {
                const cachedPlayData = await this.getFromIndexedDB('playData', cacheKey);
                if (cachedPlayData && this.isPlayDataCacheValid(cachedPlayData)) {
                    document.getElementById('gameLastPlayed').textContent = cachedPlayData.displayText;
                    if (cachedPlayData.lastPlayDate) {
                        game.lastPlayDate = new Date(cachedPlayData.lastPlayDate);
                    }
                    return;
                }
            } catch (error) {
                console.error('Error reading play data from IndexedDB:', error);
            }
        }
        
        // Check in-memory cache
        if (this.playDataCache.has(cacheKey)) {
            const cachedData = this.playDataCache.get(cacheKey);
            document.getElementById('gameLastPlayed').textContent = cachedData;
            return;
        }

        try {
            // Queue the play data request to avoid overwhelming BGG API
            const playData = await this.queueRequest(() => this.fetchPlayDataForGame(game));
            
            let resultText = 'Unable to load';
            let lastPlayDate = null;
            
            if (playData && playData.plays.length > 0) {
                const latestPlay = playData.plays[0];
                const playDate = latestPlay.getAttribute('date');
                
                if (playDate) {
                    lastPlayDate = new Date(playDate);
                    resultText = this.formatDateForDisplay(lastPlayDate);
                    game.lastPlayDate = lastPlayDate;
                    console.log(`✅ Found last play date for ${game.name}: ${resultText}`);
                } else {
                    resultText = 'Date unavailable';
                }
            } else if (game.numPlays > 0) {
                resultText = 'Private or syncing';
            }
            
            // Cache in memory
            this.playDataCache.set(cacheKey, resultText);
            
            // Cache in IndexedDB with structured data
            if (this.db) {
                const playDataEntry = {
                    cacheKey,
                    displayText: resultText,
                    lastPlayDate: lastPlayDate ? lastPlayDate.toISOString() : null,
                    timestamp: Date.now(),
                    gameId: game.id,
                    gameName: game.name
                };
                try {
                    await this.saveToIndexedDB('playData', playDataEntry);
                } catch (indexedDBError) {
                    console.error('IndexedDB save error for play data:', indexedDBError);
                    // Continue anyway - caching failure shouldn't break the display
                }
            }
            
            document.getElementById('gameLastPlayed').textContent = resultText;
            
        } catch (error) {
            console.log(`⚠️ Could not fetch play history for ${game.name}:`, error.message);
            const errorText = 'Unable to load';
            this.playDataCache.set(cacheKey, errorText);
            document.getElementById('gameLastPlayed').textContent = errorText;
        }
    }
    
    async fetchPlayDataForGame(game) {
        // First try backend API if available
        if (window.apiClient && window.apiClient.hasBackend) {
            try {
                const backendResponse = await window.apiClient.fetchPlayData(this.currentUsername, game.id);
                if (backendResponse) {
                    // Backend returns the date string directly
                    return {
                        plays: backendResponse ? [{ getAttribute: () => backendResponse }] : [],
                        xmlDoc: null,
                        fromBackend: true
                    };
                }
            } catch (error) {
                console.log('⚠️ Backend play data failed, falling back to direct BGG API:', error.message);
            }
        }
        
        const playsUrl = `${this.BGG_API_BASE}/plays?username=${encodeURIComponent(this.currentUsername)}&id=${game.id}&page=1`;
        console.log(`🎯 Fetching play history for ${game.name}:`, playsUrl);
        
        const response = await this.makeApiRequest(playsUrl);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(response, 'text/xml');
        
        // Check for parser errors
        const parserError = xmlDoc.querySelector('parsererror');
        if (parserError) {
            console.error('❌ XML parsing error:', parserError.textContent);
            throw new Error('XML parsing failed: ' + parserError.textContent);
        }
        
        return {
            plays: xmlDoc.querySelectorAll('play'),
            xmlDoc
        };
    }
    
    isPlayDataCacheValid(cachedData) {
        const oneWeek = 7 * 24 * 60 * 60 * 1000; // 1 week cache for play data
        return (Date.now() - cachedData.timestamp) < oneWeek;
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
    
    // Proxy health management methods
    initializeProxyHealthCheck() {
        // Load saved proxy health data
        const savedHealth = localStorage.getItem('bgg-proxy-health');
        if (savedHealth) {
            try {
                const healthData = JSON.parse(savedHealth);
                this.proxyHealthCache = new Map(Object.entries(healthData));
            } catch (e) {
                console.error('Failed to load proxy health data:', e);
            }
        }
        
        // Periodically check proxy health
        setInterval(() => this.checkAllProxyHealth(), this.proxyHealthCheckInterval);
    }
    
    updateProxyHealth(proxyName, success) {
        const health = this.proxyHealthCache.get(proxyName) || {
            successCount: 0,
            failureCount: 0,
            lastCheck: Date.now(),
            lastSuccess: null,
            consecutiveFailures: 0
        };
        
        if (success) {
            health.successCount++;
            health.lastSuccess = Date.now();
            health.consecutiveFailures = 0;
        } else {
            health.failureCount++;
            health.consecutiveFailures++;
        }
        
        health.lastCheck = Date.now();
        health.successRate = health.successCount / (health.successCount + health.failureCount);
        
        this.proxyHealthCache.set(proxyName, health);
        
        // Save to localStorage
        const healthData = Object.fromEntries(this.proxyHealthCache);
        localStorage.setItem('bgg-proxy-health', JSON.stringify(healthData));
    }
    
    isProxyUnhealthy(proxyName) {
        const health = this.proxyHealthCache.get(proxyName);
        if (!health) return false;
        
        // Consider a proxy unhealthy if:
        // - It has 5+ consecutive failures
        // - Its success rate is below 20% with at least 10 attempts
        // - It hasn't had a success in the last hour
        const oneHourAgo = Date.now() - 3600000;
        
        return health.consecutiveFailures >= 5 ||
               (health.successRate < 0.2 && (health.successCount + health.failureCount) >= 10) ||
               (health.lastSuccess && health.lastSuccess < oneHourAgo);
    }
    
    sortProxiesByHealth(proxies) {
        return proxies.sort((a, b) => {
            const healthA = this.proxyHealthCache.get(a.name);
            const healthB = this.proxyHealthCache.get(b.name);
            
            // Prioritize custom proxy
            if (a.name === 'Custom Proxy') return -1;
            if (b.name === 'Custom Proxy') return 1;
            
            // If no health data, treat as neutral
            if (!healthA && !healthB) return 0;
            if (!healthA) return 1;
            if (!healthB) return -1;
            
            // Sort by success rate
            return (healthB.successRate || 0) - (healthA.successRate || 0);
        });
    }
    
    async checkAllProxyHealth() {
        console.log('🔍 Running proxy health check...');
        const testUrl = `${this.BGG_API_BASE}/thing?id=13&type=boardgame`; // Small test request
        
        const proxies = [
            { url: 'https://api.allorigins.win/get?url=', name: 'AllOrigins', jsonResponse: true },
            { url: 'https://thingproxy.freeboard.io/fetch/', name: 'ThingProxy' },
            { url: 'https://api.codetabs.com/v1/proxy?quest=', name: 'CodeTabs' },
            { url: 'https://corsproxy.io/?', name: 'CORSProxy.io' },
            { url: 'https://cors-proxy.htmldriven.com/?url=', name: 'HTMLDriven' },
            { url: 'https://proxy.cors.sh/', name: 'CORS.sh' },
            { url: 'https://cors.bridged.cc/', name: 'Bridged' }
        ];
        
        for (const proxy of proxies) {
            try {
                const response = await fetch(proxy.url + encodeURIComponent(testUrl), {
                    method: 'GET',
                    ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(10000) } : {})
                });
                
                if (response.ok) {
                    console.log(`✅ ${proxy.name} is healthy`);
                    this.updateProxyHealth(proxy.name, true);
                } else {
                    console.log(`❌ ${proxy.name} returned ${response.status}`);
                    this.updateProxyHealth(proxy.name, false);
                }
            } catch (e) {
                console.log(`❌ ${proxy.name} failed health check:`, e.message);
                this.updateProxyHealth(proxy.name, false);
            }
        }
    }
    
    showAdvancedSettings() {
        const modal = document.createElement('div');
        modal.className = 'settings-modal';
        modal.innerHTML = `
            <div class="settings-content">
                <h3>Advanced Settings</h3>
                <div class="setting-item">
                    <label for="customProxy">Custom CORS Proxy URL:</label>
                    <input type="text" id="customProxy" value="${this.customProxyUrl}" placeholder="https://your-proxy.com/?url=">
                    <small>Leave empty to use default proxies</small>
                </div>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" id="enablePlayDates" ${this.enablePlayDateFetching ? 'checked' : ''}>
                        Enable play date fetching (may slow down selection)
                    </label>
                </div>
                <div class="proxy-health">
                    <h4>Proxy Health Status</h4>
                    <div id="proxyHealthList"></div>
                    <button class="btn-secondary" onclick="window.boardGamePickerInstance.checkAllProxyHealth()">Check Now</button>
                </div>
                <div class="modal-buttons">
                    <button class="btn-primary" onclick="window.boardGamePickerInstance.saveAdvancedSettings()">Save</button>
                    <button class="btn-secondary" onclick="window.boardGamePickerInstance.closeAdvancedSettings()">Cancel</button>
                </div>
                
                <div class="advanced-actions">
                    <h4>Data Export</h4>
                    <button class="btn-secondary" onclick="window.boardGamePickerInstance.exportCollection('json')">Export as JSON</button>
                    <button class="btn-secondary" onclick="window.boardGamePickerInstance.exportCollection('csv')">Export as CSV</button>
                    <button class="btn-secondary" onclick="window.boardGamePickerInstance.exportCollection('text')">Export as Text</button>
                </div>
                
                <div class="advanced-actions">
                    <h4>Analytics</h4>
                    <button class="btn-secondary" onclick="window.boardGamePickerInstance.showAnalyticsDashboard()">View Collection Analytics</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Show proxy health
        this.updateProxyHealthDisplay();
    }
    
    updateProxyHealthDisplay() {
        const healthList = document.getElementById('proxyHealthList');
        if (!healthList) return;
        
        let html = '<ul class="proxy-list">';
        this.proxyHealthCache.forEach((health, name) => {
            const rate = Math.round((health.successRate || 0) * 100);
            const status = this.isProxyUnhealthy(name) ? 'unhealthy' : 'healthy';
            html += `<li class="proxy-${status}">${name}: ${rate}% success rate</li>`;
        });
        html += '</ul>';
        healthList.innerHTML = html;
    }
    
    saveAdvancedSettings() {
        const customProxy = document.getElementById('customProxy').value;
        const enablePlayDates = document.getElementById('enablePlayDates').checked;
        
        this.customProxyUrl = customProxy;
        localStorage.setItem('bgg-custom-proxy-url', customProxy);
        
        this.enablePlayDateFetching = enablePlayDates;
        
        this.closeAdvancedSettings();
        this.showStatusMessage('Settings saved successfully', 'success');
    }
    
    closeAdvancedSettings() {
        const modal = document.querySelector('.settings-modal');
        if (modal) {
            modal.remove();
        }
    }
    
    // Request queue implementation for better performance
    async processRequestQueue() {
        while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
            const request = this.requestQueue.shift();
            this.activeRequests++;
            
            try {
                const result = await request.fn();
                request.resolve(result);
            } catch (error) {
                request.reject(error);
            } finally {
                this.activeRequests--;
                this.processRequestQueue();
            }
        }
    }
    
    queueRequest(fn) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ fn, resolve, reject });
            this.processRequestQueue();
        });
    }
    
    // IndexedDB implementation
    async initializeIndexedDB() {
        return new Promise((resolve) => {
            try {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                
                request.onerror = () => {
                    console.error('IndexedDB error:', request.error);
                    resolve(); // Continue without IndexedDB
                };
                
                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('✅ IndexedDB initialized');
                    resolve();
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    
                    // Create object stores
                    if (!db.objectStoreNames.contains('collection')) {
                        db.createObjectStore('collection');
                    }
                    if (!db.objectStoreNames.contains('playData')) {
                        const playStore = db.createObjectStore('playData', { keyPath: 'cacheKey' });
                        playStore.createIndex('timestamp', 'timestamp');
                    }
                    if (!db.objectStoreNames.contains('gameDetails')) {
                        const detailsStore = db.createObjectStore('gameDetails', { keyPath: 'id' });
                        detailsStore.createIndex('timestamp', 'timestamp');
                    }
                    
                    console.log('🔧 IndexedDB schema created/updated');
                };
            } catch (error) {
                console.error('Failed to initialize IndexedDB:', error);
                resolve(); // Continue without IndexedDB
            }
        });
    }
    
    async saveToIndexedDB(storeName, data) {
        if (!this.db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            let request;
            if (storeName === 'collection') {
                // Collection store uses manual key
                request = store.put(data, 'main');
            } else {
                // Other stores use keyPath (no explicit key needed)
                request = store.put(data);
            }
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    async getFromIndexedDB(storeName, key = 'main') {
        if (!this.db) return null;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async clearIndexedDB() {
        if (!this.db) return;
        
        const stores = ['collection', 'playData', 'gameDetails'];
        for (const storeName of stores) {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            store.clear();
        }
        console.log('🗑️ IndexedDB cleared');
    }
    
    // PWA Support
    async initializePWA() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('./sw.js');
                console.log('✅ Service Worker registered:', registration.scope);
                
                // Handle service worker updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.showUpdateNotification();
                        }
                    });
                });
                
                // Check for updates every hour
                setInterval(() => {
                    registration.update();
                }, 3600000);
                
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
        
        // Handle app install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPrompt();
        });
        
        // Handle app installed
        window.addEventListener('appinstalled', () => {
            console.log('✅ PWA installed successfully');
            this.deferredPrompt = null;
            this.hideInstallPrompt();
        });
        
        // Handle offline/online status
        window.addEventListener('online', () => {
            this.showStatusMessage('Back online! Data will sync automatically.', 'success');
            this.handleOnlineStatus(true);
        });
        
        window.addEventListener('offline', () => {
            this.showStatusMessage('You\'re offline. Some features may be limited.', 'warning');
            this.handleOnlineStatus(false);
        });
    }
    
    showUpdateNotification() {
        const notification = document.createElement('div');
        notification.className = 'update-notification';
        notification.innerHTML = `
            <div class="update-content">
                <p>A new version is available!</p>
                <button onclick="window.location.reload()" class="btn-primary">Update Now</button>
                <button onclick="this.parentElement.parentElement.remove()" class="btn-secondary">Later</button>
            </div>
        `;
        document.body.appendChild(notification);
    }
    
    showInstallPrompt() {
        const installButton = document.createElement('button');
        installButton.className = 'install-prompt';
        installButton.innerHTML = '📥 Install App';
        installButton.onclick = () => this.promptInstall();
        
        // Add to header
        const header = document.querySelector('.header');
        if (header) {
            header.appendChild(installButton);
        }
    }
    
    hideInstallPrompt() {
        const prompt = document.querySelector('.install-prompt');
        if (prompt) {
            prompt.remove();
        }
    }
    
    async promptInstall() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const result = await this.deferredPrompt.userChoice;
            
            if (result.outcome === 'accepted') {
                console.log('✅ User accepted the install prompt');
            } else {
                console.log('❌ User dismissed the install prompt');
            }
            
            this.deferredPrompt = null;
            this.hideInstallPrompt();
        }
    }
    
    handleOnlineStatus(isOnline) {
        // Update UI to reflect online/offline status
        document.body.classList.toggle('offline', !isOnline);
        
        if (isOnline && this.pendingSyncOperations) {
            // Sync any pending operations
            this.syncPendingOperations();
        }
    }
    
    async syncPendingOperations() {
        // Implement sync logic for when back online
        console.log('🔄 Syncing pending operations...');
        
        // Re-check proxy health
        await this.checkAllProxyHealth();
        
        // Clear any stale cache entries
        if (this.db) {
            // Clean up old play data
            const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            // Implementation would go here
        }
    }
    
    // Export functionality
    exportCollection(format) {
        if (!this.games || this.games.length === 0) {
            this.showStatusMessage('No collection data to export', 'error');
            return;
        }
        
        let exportData;
        let filename;
        let mimeType;
        
        switch (format) {
            case 'json':
                exportData = JSON.stringify({
                    username: this.currentUsername,
                    exportDate: new Date().toISOString(),
                    totalGames: this.games.length,
                    games: this.games.map(game => ({
                        id: game.id,
                        name: game.name,
                        yearPublished: game.yearPublished,
                        minPlayers: game.minPlayers,
                        maxPlayers: game.maxPlayers,
                        playTime: game.playTime,
                        complexity: game.complexity,
                        personalRating: game.personalRating,
                        bggRating: game.bggRating,
                        numPlays: game.numPlays,
                        owned: game.owned,
                        wishlist: game.wishlist,
                        lastPlayDate: game.lastPlayDate
                    }))
                }, null, 2);
                filename = `bgg-collection-${this.currentUsername}-${new Date().toISOString().split('T')[0]}.json`;
                mimeType = 'application/json';
                break;
                
            case 'csv':
                const headers = ['ID', 'Name', 'Year', 'Min Players', 'Max Players', 'Play Time', 'Complexity', 'Personal Rating', 'BGG Rating', 'Plays', 'Owned', 'Wishlist', 'Last Played'];
                const csvRows = [headers];
                
                this.games.forEach(game => {
                    csvRows.push([
                        game.id,
                        `"${game.name}"`,
                        game.yearPublished || '',
                        game.minPlayers || '',
                        game.maxPlayers || '',
                        game.playTime || '',
                        game.complexity || '',
                        game.personalRating || '',
                        game.bggRating || '',
                        game.numPlays || 0,
                        game.owned ? 'Yes' : 'No',
                        game.wishlist ? 'Yes' : 'No',
                        game.lastPlayDate ? game.lastPlayDate.toDateString() : 'Never'
                    ]);
                });
                
                exportData = csvRows.map(row => row.join(',')).join('\n');
                filename = `bgg-collection-${this.currentUsername}-${new Date().toISOString().split('T')[0]}.csv`;
                mimeType = 'text/csv';
                break;
                
            case 'text':
                exportData = `Board Game Collection - ${this.currentUsername}\n`;
                exportData += `Exported: ${new Date().toLocaleString()}\n`;
                exportData += `Total Games: ${this.games.length}\n\n`;
                
                this.games.forEach((game, index) => {
                    exportData += `${index + 1}. ${game.name}\n`;
                    exportData += `   Year: ${game.yearPublished || 'Unknown'}\n`;
                    exportData += `   Players: ${game.minPlayers}-${game.maxPlayers}\n`;
                    exportData += `   Time: ${game.playTime} minutes\n`;
                    exportData += `   Complexity: ${game.complexity}/5\n`;
                    if (game.personalRating) {
                        exportData += `   My Rating: ${game.personalRating}/10\n`;
                    }
                    exportData += `   BGG Rating: ${game.bggRating || 'N/A'}\n`;
                    exportData += `   Plays: ${game.numPlays || 0}\n`;
                    exportData += `   Status: ${game.owned ? 'Owned' : 'Wishlist'}\n\n`;
                });
                
                filename = `bgg-collection-${this.currentUsername}-${new Date().toISOString().split('T')[0]}.txt`;
                mimeType = 'text/plain';
                break;
        }
        
        // Create and download file
        const blob = new Blob([exportData], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showStatusMessage(`Collection exported as ${format.toUpperCase()}`, 'success');
    }
    
    // Analytics dashboard
    showAnalyticsDashboard() {
        if (!this.games || this.games.length === 0) {
            this.showStatusMessage('No collection data for analytics', 'error');
            return;
        }
        
        const analytics = this.calculateAnalytics();
        
        const modal = document.createElement('div');
        modal.className = 'analytics-modal';
        modal.innerHTML = `
            <div class="analytics-content">
                <h3>Collection Analytics</h3>
                <div class="analytics-grid">
                    <div class="stat-card">
                        <h4>Collection Overview</h4>
                        <p>Total Games: <strong>${analytics.totalGames}</strong></p>
                        <p>Owned Games: <strong>${analytics.ownedGames}</strong></p>
                        <p>Wishlist Games: <strong>${analytics.wishlistGames}</strong></p>
                        <p>Games Played: <strong>${analytics.playedGames}</strong></p>
                        <p>Unplayed Games: <strong>${analytics.unplayedGames}</strong></p>
                    </div>
                    
                    <div class="stat-card">
                        <h4>Ratings</h4>
                        <p>Average Personal Rating: <strong>${analytics.avgPersonalRating}</strong></p>
                        <p>Average BGG Rating: <strong>${analytics.avgBggRating}</strong></p>
                        <p>Highest Rated: <strong>${analytics.highestRated?.name || 'N/A'}</strong></p>
                        <p>Most Played: <strong>${analytics.mostPlayed?.name || 'N/A'}</strong> (${analytics.mostPlayed?.numPlays || 0} plays)</p>
                    </div>
                    
                    <div class="stat-card">
                        <h4>Game Mechanics</h4>
                        <p>Average Complexity: <strong>${analytics.avgComplexity}/5</strong></p>
                        <p>Average Play Time: <strong>${analytics.avgPlayTime} min</strong></p>
                        <p>Player Count Range: <strong>${analytics.minPlayers}-${analytics.maxPlayers}</strong></p>
                        <p>Collection Value Est.: <strong>$${analytics.estimatedValue}</strong></p>
                    </div>
                    
                    <div class="stat-card">
                        <h4>Play Patterns</h4>
                        <p>Total Plays: <strong>${analytics.totalPlays}</strong></p>
                        <p>Plays per Game: <strong>${analytics.playsPerGame}</strong></p>
                        <p>Recently Played: <strong>${analytics.recentlyPlayed}</strong></p>
                        <p>Play Frequency: <strong>${analytics.playFrequency}</strong></p>
                    </div>
                </div>
                
                <div class="analytics-charts">
                    <div class="chart-container">
                        <h4>Complexity Distribution</h4>
                        <div class="bar-chart" id="complexityChart"></div>
                    </div>
                    
                    <div class="chart-container">
                        <h4>Rating Distribution</h4>
                        <div class="bar-chart" id="ratingChart"></div>
                    </div>
                </div>
                
                <div class="modal-buttons">
                    <button class="btn-secondary" onclick="window.boardGamePickerInstance.exportAnalytics()">Export Analytics</button>
                    <button class="btn-secondary" onclick="window.boardGamePickerInstance.closeAnalyticsDashboard()">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Generate charts
        this.generateAnalyticsCharts(analytics);
    }
    
    calculateAnalytics() {
        const analytics = {
            totalGames: this.games.length,
            ownedGames: this.games.filter(g => g.owned).length,
            wishlistGames: this.games.filter(g => g.wishlist).length,
            playedGames: this.games.filter(g => g.numPlays > 0).length,
            unplayedGames: this.games.filter(g => g.numPlays === 0).length,
            totalPlays: this.games.reduce((sum, g) => sum + (g.numPlays || 0), 0)
        };
        
        // Rating analytics
        const personalRatings = this.games.filter(g => g.personalRating).map(g => g.personalRating);
        const bggRatings = this.games.filter(g => g.bggRating).map(g => g.bggRating);
        
        analytics.avgPersonalRating = personalRatings.length > 0 ? 
            (personalRatings.reduce((sum, r) => sum + r, 0) / personalRatings.length).toFixed(1) : 'N/A';
        analytics.avgBggRating = bggRatings.length > 0 ? 
            (bggRatings.reduce((sum, r) => sum + r, 0) / bggRatings.length).toFixed(1) : 'N/A';
        
        // Find highest rated and most played
        analytics.highestRated = this.games.reduce((prev, curr) => 
            (curr.personalRating || 0) > (prev.personalRating || 0) ? curr : prev, this.games[0]);
        analytics.mostPlayed = this.games.reduce((prev, curr) => 
            (curr.numPlays || 0) > (prev.numPlays || 0) ? curr : prev, this.games[0]);
        
        // Game mechanics
        const complexities = this.games.filter(g => g.complexity).map(g => g.complexity);
        const playTimes = this.games.filter(g => g.playTime).map(g => g.playTime);
        
        analytics.avgComplexity = complexities.length > 0 ? 
            (complexities.reduce((sum, c) => sum + c, 0) / complexities.length).toFixed(1) : 'N/A';
        analytics.avgPlayTime = playTimes.length > 0 ? 
            Math.round(playTimes.reduce((sum, t) => sum + t, 0) / playTimes.length) : 'N/A';
        
        analytics.minPlayers = Math.min(...this.games.map(g => g.minPlayers || 1));
        analytics.maxPlayers = Math.max(...this.games.map(g => g.maxPlayers || 1));
        
        // Estimated collection value (rough estimate based on BGG data)
        analytics.estimatedValue = Math.round(analytics.ownedGames * 45); // $45 average game price
        
        // Play patterns
        analytics.playsPerGame = analytics.totalPlays > 0 ? 
            (analytics.totalPlays / analytics.playedGames).toFixed(1) : '0';
        
        const recentlyPlayedCount = this.games.filter(g => {
            if (!g.lastPlayDate) return false;
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            return g.lastPlayDate > thirtyDaysAgo;
        }).length;
        
        analytics.recentlyPlayed = recentlyPlayedCount;
        analytics.playFrequency = analytics.totalPlays > 0 ? 
            `${(analytics.totalPlays / 365).toFixed(1)} plays/year` : 'N/A';
        
        return analytics;
    }
    
    generateAnalyticsCharts(analytics) {
        // Simple text-based charts
        this.generateComplexityChart();
        this.generateRatingChart();
    }
    
    generateComplexityChart() {
        const complexityBuckets = { '1-2': 0, '2-3': 0, '3-4': 0, '4-5': 0 };
        
        this.games.forEach(game => {
            const complexity = game.complexity || 2.5;
            if (complexity <= 2) complexityBuckets['1-2']++;
            else if (complexity <= 3) complexityBuckets['2-3']++;
            else if (complexity <= 4) complexityBuckets['3-4']++;
            else complexityBuckets['4-5']++;
        });
        
        const chartEl = document.getElementById('complexityChart');
        let html = '';
        const maxCount = Math.max(...Object.values(complexityBuckets));
        
        Object.entries(complexityBuckets).forEach(([range, count]) => {
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            html += `
                <div class="chart-bar">
                    <div class="bar-label">${range}</div>
                    <div class="bar" style="width: ${percentage}%"></div>
                    <div class="bar-value">${count}</div>
                </div>
            `;
        });
        
        chartEl.innerHTML = html;
    }
    
    generateRatingChart() {
        const ratingBuckets = { '1-3': 0, '4-6': 0, '7-8': 0, '9-10': 0, 'Unrated': 0 };
        
        this.games.forEach(game => {
            if (!game.personalRating) {
                ratingBuckets['Unrated']++;
            } else {
                const rating = game.personalRating;
                if (rating <= 3) ratingBuckets['1-3']++;
                else if (rating <= 6) ratingBuckets['4-6']++;
                else if (rating <= 8) ratingBuckets['7-8']++;
                else ratingBuckets['9-10']++;
            }
        });
        
        const chartEl = document.getElementById('ratingChart');
        let html = '';
        const maxCount = Math.max(...Object.values(ratingBuckets));
        
        Object.entries(ratingBuckets).forEach(([range, count]) => {
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            html += `
                <div class="chart-bar">
                    <div class="bar-label">${range}</div>
                    <div class="bar" style="width: ${percentage}%"></div>
                    <div class="bar-value">${count}</div>
                </div>
            `;
        });
        
        chartEl.innerHTML = html;
    }
    
    exportAnalytics() {
        const analytics = this.calculateAnalytics();
        const exportData = JSON.stringify(analytics, null, 2);
        const filename = `bgg-analytics-${this.currentUsername}-${new Date().toISOString().split('T')[0]}.json`;
        
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.showStatusMessage('Analytics exported successfully', 'success');
    }
    
    closeAnalyticsDashboard() {
        const modal = document.querySelector('.analytics-modal');
        if (modal) {
            modal.remove();
        }
    }
    
    // Social sharing functionality
    addSocialSharing(game) {
        const shareButton = document.createElement('button');
        shareButton.className = 'share-btn';
        shareButton.innerHTML = '📲 Share';
        shareButton.onclick = () => this.shareGame(game);
        
        const gameCard = document.getElementById('gameCard');
        const existingShareBtn = gameCard.querySelector('.share-btn');
        if (existingShareBtn) {
            existingShareBtn.remove();
        }
        
        gameCard.appendChild(shareButton);
    }
    
    async shareGame(game) {
        const shareData = {
            title: `🎲 ${game.name}`,
            text: `Check out this board game: ${game.name} (${game.yearPublished})\n\n` +
                  `Players: ${game.minPlayers}-${game.maxPlayers} | ` +
                  `Time: ${game.playTime} min | ` +
                  `Complexity: ${game.complexity}/5\n` +
                  (game.personalRating ? `My Rating: ${game.personalRating}/10\n` : '') +
                  `BGG Rating: ${game.bggRating || 'N/A'}\n\n` +
                  `Selected by Board Game Picker`,
            url: `https://boardgamegeek.com/boardgame/${game.id}`
        };
        
        // Use Web Share API if available
        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                console.log('✅ Game shared successfully');
                return;
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error sharing:', error);
                }
            }
        }
        
        // Fallback to custom share modal
        this.showShareModal(game, shareData);
    }
    
    showShareModal(game, shareData) {
        const modal = document.createElement('div');
        modal.className = 'share-modal';
        
        const gameUrl = `https://boardgamegeek.com/boardgame/${game.id}`;
        const encodedText = encodeURIComponent(shareData.text);
        const encodedUrl = encodeURIComponent(gameUrl);
        const encodedTitle = encodeURIComponent(shareData.title);
        
        modal.innerHTML = `
            <div class="share-content">
                <h3>Share ${game.name}</h3>
                
                <div class="share-preview">
                    <h4>${game.name}</h4>
                    <p>Players: ${game.minPlayers}-${game.maxPlayers} | Time: ${game.playTime} min | Complexity: ${game.complexity}/5</p>
                    ${game.personalRating ? `<p>My Rating: ${game.personalRating}/10</p>` : ''}
                    <p>BGG Rating: ${game.bggRating || 'N/A'}</p>
                </div>
                
                <div class="share-buttons">
                    <a href="https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}" 
                       target="_blank" class="share-twitter">
                        🐦 Twitter
                    </a>
                    
                    <a href="https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}" 
                       target="_blank" class="share-facebook">
                        🟦 Facebook
                    </a>
                    
                    <a href="https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}" 
                       target="_blank" class="share-reddit">
                        🟠 Reddit
                    </a>
                    
                    <button onclick="window.boardGamePickerInstance.copyToClipboard('${gameUrl.replace(/'/g, "\\'")}')"
                            class="share-copy">
                        📋 Copy Link
                    </button>
                </div>
                
                <div class="share-text-area">
                    <h4>Share Text:</h4>
                    <textarea readonly onclick="this.select()">${shareData.text}\n\n${gameUrl}</textarea>
                </div>
                
                <div class="modal-buttons">
                    <button class="btn-secondary" onclick="window.boardGamePickerInstance.closeShareModal()">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            this.showStatusMessage('Link copied to clipboard!', 'success');
        } catch (error) {
            console.error('Failed to copy:', error);
            this.showStatusMessage('Failed to copy link', 'error');
        }
    }
    
    closeShareModal() {
        const modal = document.querySelector('.share-modal');
        if (modal) {
            modal.remove();
        }
    }
    
    // URL parameter handling for shared games
    handleUrlParameters() {
        const urlParams = new URLSearchParams(window.location.search);
        const gameId = urlParams.get('game');
        const action = urlParams.get('action');
        
        if (action === 'quick-roll' && this.games.length > 0) {
            // Quick roll from PWA shortcut
            setTimeout(() => this.rollDice(), 1000);
        }
        
        if (gameId && this.games.length > 0) {
            // Show specific game from shared link
            const game = this.games.find(g => g.id === gameId);
            if (game) {
                setTimeout(() => this.displaySelectedGame(game), 1000);
            }
        }
    }

    // Collection Table Methods
    async toggleCollectionTable() {
        const container = document.getElementById('collectionTableContainer');
        const button = document.getElementById('toggleTable');
        const isHidden = container.classList.contains('hidden');

        if (isHidden) {
            // Show loading state
            button.innerHTML = '<span class="table-icon">⏳</span><span class="btn-text">Loading Table...</span>';
            button.disabled = true;
            
            await this.populateCollectionTable();
            
            container.classList.remove('hidden');
            button.innerHTML = '<span class="table-icon">📋</span><span class="btn-text">Hide Collection Table</span>';
            button.disabled = false;
        } else {
            container.classList.add('hidden');
            button.innerHTML = '<span class="table-icon">📋</span><span class="btn-text">Show Collection Table</span>';
        }
    }

    async populateCollectionTable() {
        const tbody = document.getElementById('collectionTableBody');
        const stats = document.getElementById('tableStats');
        
        // Clear existing content
        tbody.innerHTML = '';
        
        // Get filtered games based on current filters
        const filteredGames = this.filteredGames;
        
        // Update stats
        stats.textContent = `Showing ${filteredGames.length} of ${this.games.length} games`;
        
        // Populate table rows
        for (const game of filteredGames) {
            const row = document.createElement('tr');
            const lastPlayedText = await this.formatLastPlayed(game);
            
            row.innerHTML = `
                <td class="game-title">
                    <strong>${game.name}</strong>
                </td>
                <td class="game-year">${game.yearPublished || 'N/A'}</td>
                <td class="game-players">${this.formatPlayers(game)}</td>
                <td class="game-playtime">${this.formatPlayTime(game)}</td>
                <td class="game-user-rating">${this.formatUserRating(game)}</td>
                <td class="game-bgg-rating">${this.formatBggRating(game)}</td>
                <td class="game-plays">${game.numPlays || 0}</td>
                <td class="game-last-played">${lastPlayedText}</td>
            `;
            tbody.appendChild(row);
        }

        // Initialize sorting
        this.initializeTableSorting();
    }

    formatPlayers(game) {
        if (game.minPlayers === game.maxPlayers) {
            return game.minPlayers || 'N/A';
        }
        return `${game.minPlayers || '?'}-${game.maxPlayers || '?'}`;
    }

    formatPlayTime(game) {
        if (game.playTime) {
            return `${game.playTime} min`;
        } else if (game.minPlayTime && game.maxPlayTime) {
            return `${game.minPlayTime}-${game.maxPlayTime} min`;
        }
        return 'N/A';
    }

    formatUserRating(game) {
        if (game.userRating && game.userRating > 0) {
            return `⭐ ${game.userRating.toFixed(1)}`;
        }
        return 'Unrated';
    }

    formatBggRating(game) {
        if (game.rating && game.rating > 0) {
            return game.rating.toFixed(1);
        }
        return 'N/A';
    }

    async formatLastPlayed(game) {
        if (game.lastPlayDate) {
            return this.formatDateForDisplay(game.lastPlayDate);
        } else if (game.numPlays === 0) {
            return 'Never played';
        }

        // Check cached play data
        const cacheKey = `${this.currentUsername}-${game.id}`;
        
        // Check IndexedDB cache first
        if (this.db) {
            try {
                const cachedPlayData = await this.getFromIndexedDB('playData', cacheKey);
                if (cachedPlayData && this.isPlayDataCacheValid(cachedPlayData)) {
                    if (cachedPlayData.lastPlayDate) {
                        game.lastPlayDate = new Date(cachedPlayData.lastPlayDate);
                        return this.formatDateForDisplay(game.lastPlayDate);
                    }
                    return cachedPlayData.displayText;
                }
            } catch (error) {
                console.error('Error reading play data from IndexedDB:', error);
            }
        }
        
        // Check in-memory cache
        if (this.playDataCache.has(cacheKey)) {
            return this.playDataCache.get(cacheKey);
        }

        return 'Unknown';
    }

    initializeTableSorting() {
        const table = document.getElementById('collectionTable');
        const headers = table.querySelectorAll('th.sortable');
        
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const column = header.dataset.column;
                this.sortTable(column, header);
            });
        });
    }

    sortTable(column, headerElement) {
        const table = document.getElementById('collectionTable');
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        // Determine sort direction
        const isAscending = !headerElement.classList.contains('sort-asc');
        
        // Clear all sort indicators
        table.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            th.querySelector('.sort-indicator').textContent = '';
        });
        
        // Set sort indicator for current column
        headerElement.classList.add(isAscending ? 'sort-asc' : 'sort-desc');
        headerElement.querySelector('.sort-indicator').textContent = isAscending ? '↑' : '↓';
        
        // Sort rows
        rows.sort((a, b) => {
            let aValue = this.getCellValue(a, column);
            let bValue = this.getCellValue(b, column);
            
            // Handle different data types
            if (column === 'yearPublished' || column === 'numPlays') {
                aValue = parseInt(aValue) || 0;
                bValue = parseInt(bValue) || 0;
            } else if (column === 'userRating' || column === 'rating') {
                aValue = parseFloat(aValue.replace(/[^\d.]/g, '')) || 0;
                bValue = parseFloat(bValue.replace(/[^\d.]/g, '')) || 0;
            } else if (column === 'playTime') {
                aValue = parseInt(aValue.replace(/[^\d]/g, '')) || 0;
                bValue = parseInt(bValue.replace(/[^\d]/g, '')) || 0;
            } else if (column === 'lastPlayed') {
                aValue = this.parseDateForSorting(aValue);
                bValue = this.parseDateForSorting(bValue);
            }
            
            if (aValue < bValue) return isAscending ? -1 : 1;
            if (aValue > bValue) return isAscending ? 1 : -1;
            return 0;
        });
        
        // Re-append sorted rows
        rows.forEach(row => tbody.appendChild(row));
    }

    getCellValue(row, column) {
        const columnMap = {
            name: 0,
            yearPublished: 1,
            players: 2,
            playTime: 3,
            userRating: 4,
            rating: 5,
            numPlays: 6,
            lastPlayed: 7
        };
        
        const cellIndex = columnMap[column];
        return row.cells[cellIndex].textContent.trim();
    }

    parseDateForSorting(dateText) {
        if (dateText === 'Never played' || dateText === 'Unknown' || dateText === 'N/A') {
            return new Date(0); // Very old date for sorting
        }
        
        // Try to parse relative dates like "2 weeks ago", "1 month ago"
        const now = new Date();
        
        if (dateText === 'Yesterday') {
            return new Date(now - 24 * 60 * 60 * 1000);
        }
        
        const match = dateText.match(/(\d+)\s+(day|week|month|year)s?\s+ago/);
        if (match) {
            const amount = parseInt(match[1]);
            const unit = match[2];
            const multipliers = {
                day: 24 * 60 * 60 * 1000,
                week: 7 * 24 * 60 * 60 * 1000,
                month: 30 * 24 * 60 * 60 * 1000,
                year: 365 * 24 * 60 * 60 * 1000
            };
            return new Date(now - amount * multipliers[unit]);
        }
        
        // Fallback to parsing as regular date
        return new Date(dateText);
    }

    // Cover Flow Carousel Methods
    initializeCarousel() {
        this.carouselGames = [];
        this.isSpinning = false;
        this.selectedGameIndex = 0;
        
        // Cover Flow DOM elements
        this.carouselContainer = document.getElementById('coverflowCarouselContainer');
        this.flipsterElement = document.getElementById('gameFlipster');
        this.flipsterInstance = null;
        
        console.log('🎭 Cover Flow initialized');
        console.log('🎭 Container found:', !!this.carouselContainer);
        console.log('🎭 Flipster element found:', !!this.flipsterElement);
    }

    populateCarousel() {
        console.log('🎭 populateCarousel called with', this.filteredGames?.length, 'games');
        
        // Check if we have base games loaded first
        if (!this.games || this.games.length === 0) {
            console.log('🎭 Cannot populate carousel - no base games loaded');
            return;
        }
        
        if (!this.filteredGames || this.filteredGames.length === 0 || !this.carouselContainer || !this.flipsterElement) {
            console.log('🎭 Cannot populate carousel - missing filtered games or DOM elements');
            return;
        }

        // Safety check: ensure games have required properties
        const validGames = this.filteredGames.filter(game => game && game.name && typeof game.name === 'string');
        if (validGames.length === 0) {
            console.log('🎭 No valid games for carousel - creating test items');
            // Create test items to verify Cover Flow works
            this.createTestCoverFlow();
            return;
        }

        // Store all available games
        this.carouselGames = [...validGames];
        
        // Shuffle the array for random display order
        for (let i = this.carouselGames.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.carouselGames[i], this.carouselGames[j]] = [this.carouselGames[j], this.carouselGames[i]];
        }

        // Get the UL element inside flipster
        const flipsterUl = this.flipsterElement.querySelector('ul');
        if (!flipsterUl) {
            console.error('🎭 Flipster UL element not found');
            return;
        }

        // Clear existing items
        flipsterUl.innerHTML = '';

        // Create Cover Flow items for all games
        const maxItems = this.carouselGames.length;
        
        for (let i = 0; i < maxItems; i++) {
            const game = this.carouselGames[i];
            
            const listItem = document.createElement('li');
            listItem.dataset.gameId = game.id;
            listItem.dataset.gameName = game.name;
            
            // Create image or placeholder
            const imageUrl = game.image || game.thumbnail;
            console.log(`🎭 Game ${game.name}: image="${game.image}", thumbnail="${game.thumbnail}"`);
            
            if (imageUrl && typeof imageUrl === 'string') {
                const img = document.createElement('img');
                img.src = imageUrl;
                img.alt = game.name;
                img.title = game.name;
                
                img.onerror = () => {
                    // Replace with placeholder on error
                    img.remove();
                    const placeholder = document.createElement('div');
                    placeholder.className = 'game-cover';
                    placeholder.textContent = '🎮';
                    placeholder.title = game.name;
                    listItem.appendChild(placeholder);
                };
                
                listItem.appendChild(img);
            } else {
                // No thumbnail - create placeholder
                const placeholder = document.createElement('div');
                placeholder.className = 'game-cover';
                placeholder.textContent = '🎮';
                placeholder.title = game.name;
                listItem.appendChild(placeholder);
            }
            
            flipsterUl.appendChild(listItem);
        }

        // Initialize or update Flipster
        this.initializeFlipster();
        
        // Show carousel
        console.log('🎭 Removing hidden class from container');
        this.carouselContainer.classList.remove('hidden');
        console.log('🎭 Container hidden class removed, current classes:', this.carouselContainer.className);
        
        console.log(`🎭 Cover Flow populated with ${maxItems} games`);
    }

    createTestCoverFlow() {
        console.log('🎧 Creating test Cover Flow');
        
        // Get the UL element inside flipster
        const flipsterUl = this.flipsterElement.querySelector('ul');
        if (!flipsterUl) {
            console.error('🎭 Flipster UL element not found for test');
            return;
        }

        // Clear existing items
        flipsterUl.innerHTML = '';

        // Create test games with placeholder colors (no CORS issues)
        const testGames = [
            { id: '1', name: 'Gloomhaven', color: '#2563eb' },
            { id: '2', name: 'Wingspan', color: '#dc2626' },
            { id: '3', name: 'Azul', color: '#059669' },
            { id: '4', name: 'Scythe', color: '#7c3aed' },
            { id: '5', name: 'Catan', color: '#ea580c' }
        ];

        for (const game of testGames) {
            const listItem = document.createElement('li');
            listItem.dataset.gameId = game.id;
            listItem.dataset.gameName = game.name;
            
            // Create colored placeholder instead of image
            const placeholder = document.createElement('div');
            placeholder.className = 'game-cover';
            placeholder.style.backgroundColor = game.color;
            placeholder.style.color = 'white';
            placeholder.style.fontSize = '2rem';
            placeholder.style.fontWeight = 'bold';
            placeholder.textContent = game.name.substring(0, 2).toUpperCase();
            placeholder.title = game.name;
            
            listItem.appendChild(placeholder);
            flipsterUl.appendChild(listItem);
        }

        // Initialize Flipster
        this.initializeFlipster();
        
        // Show carousel
        console.log('🎧 Showing test Cover Flow');
        this.carouselContainer.classList.remove('hidden');
        console.log('🎧 Test Cover Flow created with', testGames.length, 'games');
    }

    initializeFlipster() {
        console.log('🎭 initializeFlipster called');
        console.log('🎭 jQuery available:', typeof $ !== 'undefined');
        console.log('🎭 Flipster element:', this.flipsterElement);
        
        if (typeof $ === 'undefined') {
            console.error('🎭 jQuery not loaded!');
            return;
        }
        
        if (typeof $.fn.flipster === 'undefined') {
            console.error('🎭 Flipster plugin not loaded!');
            return;
        }
        
        // Check if Flipster CSS is loaded by testing for a known class
        const testElement = document.createElement('div');
        testElement.className = 'flipster';
        document.body.appendChild(testElement);
        const styles = window.getComputedStyle(testElement);
        console.log('🎭 Flipster CSS check - position:', styles.position);
        document.body.removeChild(testElement);
        
        // Destroy existing instance if it exists
        if (this.flipsterInstance) {
            try {
                $(this.flipsterElement).flipster('destroy');
            } catch (e) {
                console.warn('🎭 Error destroying previous Flipster instance:', e);
            }
        }
        
        // Initialize Flipster with basic Cover Flow settings
        try {
            console.log('🎭 Attempting Flipster initialization with basic config...');
            
            // Basic config with looping enabled
            $(this.flipsterElement).flipster({
                style: 'coverflow',
                spacing: -0.6,
                loop: true,
                keyboard: true,
                touch: true,
                click: 'center'
            });
            
            // Retrieve instance
            this.flipsterInstance = $(this.flipsterElement).data('flipster');
            console.log('🎭 Flipster initialized with looping, instance exists:', !!this.flipsterInstance);
            
        } catch (error) {
            console.error('🎭 Flipster initialization error:', error);
        }
        
        // Check if items were created
        const items = this.flipsterElement.querySelectorAll('li');
        console.log(`🎭 Created ${items.length} Cover Flow items`);
        console.log('🎭 Flipster element classes:', this.flipsterElement.className);
        
        // Final check after full initialization
        setTimeout(() => {
            console.log('🎭 Final initialization check:');
            console.log('🎭 Flipster classes:', this.flipsterElement.className);
            const activeItem = this.flipsterElement.querySelector('.flipster-active');
            console.log('🎭 Active item found:', !!activeItem);
            console.log('🎭 Flipster fully initialized:', !!this.flipsterInstance);
        }, 150);
    }

    getCenterGame() {
        if (!this.flipsterInstance) return null;
        
        const activeItem = this.flipsterElement.querySelector('.flipster-active');
        if (!activeItem) return null;
        
        const gameId = activeItem.dataset.gameId;
        return this.carouselGames.find(g => g.id == gameId);
    }

    jumpToGame(targetGame) {
        if (!this.flipsterInstance || !targetGame) return;
        
        const items = this.flipsterElement.querySelectorAll('li');
        let targetIndex = -1;
        
        items.forEach((item, index) => {
            if (item.dataset.gameId == targetGame.id) {
                targetIndex = index;
            }
        });
        
        if (targetIndex >= 0) {
            $(this.flipsterElement).flipster('jump', targetIndex);
            console.log(`🎭 Jumped to ${targetGame.name} at index ${targetIndex}`);
        }
    }

    startCarouselSpin() {
        if (this.isSpinning || !this.flipsterInstance) return;
        
        console.log('🎭 Starting Cover Flow spin');
        this.isSpinning = true;
        
        // Select random target game using weighted selection
        const selectedGame = this.selectWeightedGame();
        console.log('🎯 Selected game:', selectedGame?.name, 'ID:', selectedGame?.id);
        
        // Add spinning class for visual feedback
        this.flipsterElement.classList.add('spinning');
        
        // Animate through several games before landing on target
        this.animateCoverFlowSpin(selectedGame);
    }

    animateCoverFlowSpin(targetGame) {
        const items = this.flipsterElement.querySelectorAll('li');
        const totalItems = items.length;
        
        if (totalItems === 0) {
            this.onCarouselComplete();
            return;
        }
        
        // Find target index
        let targetIndex = -1;
        items.forEach((item, index) => {
            if (item.dataset.gameId == targetGame.id) {
                targetIndex = index;
            }
        });
        
        if (targetIndex === -1) {
            // If target game not in visible items, just pick a random one
            targetIndex = Math.floor(Math.random() * totalItems);
            const fallbackGameId = items[targetIndex].dataset.gameId;
            targetGame = this.carouselGames.find(g => g.id == fallbackGameId) || targetGame;
        }
        
        this.carouselSelectedGame = targetGame;
        
        // Spin through several items quickly then land on target
        let currentIndex = 0;
        let spinsLeft = 8 + Math.floor(Math.random() * 8); // Random 8-16 spins
        const spinInterval = 150; // ms between spins
        
        const spinStep = () => {
            if (spinsLeft <= 0) {
                // Final jump to target
                $(this.flipsterElement).flipster('jump', targetIndex);
                setTimeout(() => {
                    this.flipsterElement.classList.remove('spinning');
                    this.isSpinning = false;
                    this.onCarouselComplete();
                }, 500);
                return;
            }
            
            // Jump to next item
            $(this.flipsterElement).flipster('jump', currentIndex);
            currentIndex = (currentIndex + 1) % totalItems;
            spinsLeft--;
            
            // Increase delay as we get closer to target
            const delay = spinsLeft <= 3 ? spinInterval * (4 - spinsLeft) : spinInterval;
            setTimeout(spinStep, delay);
        };
        
        spinStep();
    }


    onCarouselComplete() {
        console.log('🎭 Cover Flow spin complete');
        
        // Display the selected game
        setTimeout(() => {
            this.displaySelectedGame(this.carouselSelectedGame);
        }, 300);
    }

    stopCarouselSpin() {
        this.isSpinning = false;
        if (this.flipsterElement) {
            this.flipsterElement.classList.remove('spinning');
        }
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.boardGamePickerInstance = new BoardGamePicker();
});

// Add some utility functions for debugging
window.debugBGP = {
    testCoverFlow: () => {
        const app = window.boardGamePickerInstance;
        if (app) {
            console.log('🎧 Manual Cover Flow test triggered');
            app.createTestCoverFlow();
        }
    },
    testBasicFlipster: () => {
        console.log('🧪 Testing basic Flipster functionality...');
        
        // Create a minimal test structure
        const testContainer = document.createElement('div');
        testContainer.innerHTML = `
            <div class="flipster-test" style="margin: 20px;">
                <ul>
                    <li style="width:100px;height:100px;background:red;display:flex;align-items:center;justify-content:center;color:white;">1</li>
                    <li style="width:100px;height:100px;background:blue;display:flex;align-items:center;justify-content:center;color:white;">2</li>
                    <li style="width:100px;height:100px;background:green;display:flex;align-items:center;justify-content:center;color:white;">3</li>
                </ul>
            </div>
        `;
        document.body.appendChild(testContainer);
        
        // Try to initialize Flipster on it
        try {
            $('.flipster-test').flipster();
            console.log('🧪 Basic Flipster test: SUCCESS');
        } catch (e) {
            console.error('🧪 Basic Flipster test: FAILED', e);
        }
        
        // Clean up after 5 seconds
        setTimeout(() => {
            document.body.removeChild(testContainer);
        }, 5000);
    },
    testProxies: async () => {
        const app = window.boardGamePickerInstance;
        if (app) {
            await app.checkAllProxyHealth();
            console.log('Proxy health data:', Object.fromEntries(app.proxyHealthCache));
        }
    },
    setCustomProxy: (url) => {
        localStorage.setItem('bgg-custom-proxy-url', url);
        console.log(`Custom proxy set to: ${url}`);
        console.log('Reload the page to use the custom proxy');
    },
    clearIndexedDB: async () => {
        const app = window.boardGamePickerInstance;
        if (app) {
            await app.clearIndexedDB();
            localStorage.removeItem('bgg-collection-data');
            console.log('🗑️ All cache cleared');
            location.reload();
        }
    },
    getIndexedDBData: async () => {
        const app = window.boardGamePickerInstance;
        if (app && app.db) {
            const collection = await app.getFromIndexedDB('collection');
            console.log('IndexedDB collection data:', collection);
            return collection;
        }
        return null;
    },
    clearCache: async () => {
        const app = window.boardGamePickerInstance;
        if (app) {
            await app.clearIndexedDB();
            localStorage.removeItem('bgg-collection-data');
            location.reload();
        }
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
            console.log('🔧 Testing all CORS proxies...');
            const testUrl = 'https://boardgamegeek.com/xmlapi2/collection?username=Geekdo-BoardGameGeek&stats=1';
            try {
                const result = await app.makeApiRequest(testUrl);
                console.log('✅ Proxy test successful:', result.length, 'characters received');
                return true;
            } catch (error) {
                console.error('❌ Proxy test failed:', error.message);
                return false;
            }
        }
        return false;
    }
}; 