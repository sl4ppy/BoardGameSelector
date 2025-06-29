class BoardGamePicker {
    constructor() {
        this.games = [];
        this.filteredGames = [];
        this.currentUsername = '';
        this.isLoading = false;
        
        // BGG API endpoints
        this.BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';
        this.CORS_PROXY = 'https://api.allorigins.win/raw?url=';
        
        this.initializeEventListeners();
        this.setupDeveloperPanel();
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

    setupDeveloperPanel() {
        // Check if we're running locally (for development)
        const isLocalDevelopment = window.location.hostname === 'localhost' || 
                                 window.location.hostname === '127.0.0.1' || 
                                 window.location.protocol === 'file:';

        if (isLocalDevelopment) {
            const devPanel = document.getElementById('devPanel');
            devPanel.classList.remove('hidden');
            this.updateDevPanelInfo();
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
                    <strong>Local Development Mode</strong><br>
                    Cache: <code>${data.games.length} games</code> for <code>${data.username}</code><br>
                    Age: <code>${ageText}</code><br>
                    Status: <code>Persistent (never expires locally)</code>
                `;
            } catch (e) {
                devInfo.innerHTML = `
                    <strong>Local Development Mode</strong><br>
                    Cache: <code>Invalid cache data</code><br>
                    Status: <code>Error parsing cache</code>
                `;
            }
        } else {
            devInfo.innerHTML = `
                <strong>Local Development Mode</strong><br>
                Cache: <code>Empty</code><br>
                Status: <code>No cached data</code>
            `;
        }
    }

    devClearCache() {
        if (confirm('Clear all cached BGG data? You will need to re-sync your collection.')) {
            localStorage.removeItem('bgg-collection-data');
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
                console.log('Games:', data.games);
                console.log('Full Data:', data);
                console.groupEnd();
                
                alert(`Cache data logged to console!\n\nUser: ${data.username}\nGames: ${data.games.length}\nCached: ${new Date(data.timestamp).toLocaleString()}\n\nCheck browser console (F12) for full details.`);
            } catch (e) {
                console.error('Error parsing cache data:', e);
                alert('Error: Cache data is corrupted.');
            }
        } else {
            console.log('🎲 No BGG cache data found');
            alert('No cache data found.');
        }
    }

    saveCollectionData() {
        const data = {
            username: this.currentUsername,
            games: this.games,
            timestamp: Date.now()
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
            const response = await this.makeApiRequest(collectionUrl);
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response, 'text/xml');
            
            // Check for errors
            const error = xmlDoc.querySelector('error');
            if (error) {
                throw new Error(`BGG API Error: ${error.textContent}`);
            }

            const items = xmlDoc.querySelectorAll('item');
            if (items.length === 0) {
                throw new Error('No games found in collection or user does not exist');
            }

            this.showCollectionStatus(`🔄 Processing ${items.length} games...`, 'loading');

            // Parse the collection
            this.games = Array.from(items).map(item => this.parseGameItem(item));

            // Get detailed information for games in batches
            await this.enrichGameData();

            this.saveCollectionData();
            this.showCollectionStatus(`✅ Successfully loaded ${this.games.length} games!`, 'success');
            this.showGameSection();
            this.applyFilters();

        } catch (error) {
            console.error('Error fetching collection:', error);
            this.showCollectionStatus(`❌ Error: ${error.message}`, 'error');
        } finally {
            this.isLoading = false;
            this.toggleLoadingState(false);
        }
    }

    async makeApiRequest(url) {
        const fullUrl = this.CORS_PROXY + encodeURIComponent(url);
        const response = await fetch(fullUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.text();
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
    new BoardGamePicker();
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
    }
}; 