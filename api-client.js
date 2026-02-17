// API Client for Board Game Selector
// This module handles communication with the backend server

class ApiClient {
    constructor() {
        // Detect if we're running with a backend server
        this.baseUrl = window.location.origin;
        this.hasBackend = false;

        // Promise-based initialization (replaces busy-wait polling)
        this._readyPromise = this._checkBackendAvailability();
    }

    async _checkBackendAvailability() {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`);
            if (response.ok) {
                this.hasBackend = true;
                console.log('Backend server detected at', this.baseUrl);
            }
        } catch (error) {
            console.log('No backend server detected, using direct BGG API');
        }
    }

    async ensureReady() {
        await this._readyPromise;
    }

    async fetchCollection(username, forceRefresh = false) {
        await this.ensureReady();
        
        if (!this.hasBackend) {
            console.log('❌ No backend available, falling back to direct BGG API');
            return null; // Frontend will fall back to direct BGG API
        }
        
        try {
            const url = `${this.baseUrl}/api/collection/${encodeURIComponent(username)}${forceRefresh ? '?refresh=true' : ''}`;
            console.log(`🔄 Fetching from backend: ${url} (forceRefresh: ${forceRefresh})`);
            const response = await fetch(url);
            
            if (response.status === 202) {
                const data = await response.json();
                if (data.code === 'BGG_PROCESSING') {
                    throw new Error('BGG is processing your collection. Please wait 30-60 seconds and try again.');
                }
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`📦 Collection loaded from ${data.source === 'cache' ? 'server cache' : 'BGG API'}`);
            
            return {
                games: data.data,
                source: data.source,
                cachedAt: data.cached_at
            };
        } catch (error) {
            console.error('Backend API error:', error);
            throw error;
        }
    }
    
    async fetchGameDetails(gameIds) {
        if (!this.hasBackend) {
            return null;
        }
        
        try {
            const response = await fetch(`${this.baseUrl}/api/collection/games/details`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ gameIds })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`📦 Fetched ${data.fetched} games from BGG, ${data.cached} from cache`);
            
            return data.games;
        } catch (error) {
            console.error('Game details API error:', error);
            return null;
        }
    }
    
    async fetchPlayData(username, gameId) {
        if (!this.hasBackend) {
            return null;
        }
        
        try {
            const response = await fetch(`${this.baseUrl}/api/collection/${encodeURIComponent(username)}/plays/${gameId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data.last_played;
        } catch (error) {
            console.error('Play data API error:', error);
            return null;
        }
    }
    
    async syncPlaysData(username) {
        if (!this.hasBackend) {
            return null;
        }
        
        try {
            const response = await fetch(`${this.baseUrl}/api/collection/${encodeURIComponent(username)}/sync-plays`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Sync plays API error:', error);
            return null;
        }
    }
    
    async fullSyncData(username) {
        if (!this.hasBackend) {
            return null;
        }
        
        try {
            const response = await fetch(`${this.baseUrl}/api/collection/${encodeURIComponent(username)}/full-sync`, {
                method: 'POST'
            });
            
            if (response.status === 202) {
                const data = await response.json();
                if (data.code === 'BGG_PROCESSING') {
                    throw new Error('BGG is processing your collection. Please wait 30-60 seconds and try again.');
                }
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Full sync API error:', error);
            return null;
        }
    }
    
    async getUserInfo(username) {
        if (!this.hasBackend) {
            return null;
        }
        
        try {
            const response = await fetch(`${this.baseUrl}/api/collection/${encodeURIComponent(username)}/info`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('User info API error:', error);
            return null;
        }
    }
}

// Export as global variable for the main script
window.apiClient = new ApiClient();