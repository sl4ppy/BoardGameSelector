// API Client for Board Game Selector
// This module handles communication with the backend server

class ApiClient {
    constructor() {
        // Detect if we're running with a backend server
        this.baseUrl = window.location.origin;
        this.hasBackend = false;
        this.backendChecked = false;
        
        // Check if backend is available
        this.checkBackendAvailability();
    }
    
    async checkBackendAvailability() {
        try {
            const response = await fetch(`${this.baseUrl}/api/health`);
            if (response.ok) {
                this.hasBackend = true;
                console.log('✅ Backend server detected at', this.baseUrl);
            }
        } catch (error) {
            console.log('📡 No backend server detected, using direct BGG API');
        } finally {
            this.backendChecked = true;
        }
    }
    
    async fetchCollection(username, forceRefresh = false) {
        // Wait for backend check to complete if it hasn't yet
        while (!this.backendChecked) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
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
}

// Export as global variable for the main script
window.apiClient = new ApiClient();