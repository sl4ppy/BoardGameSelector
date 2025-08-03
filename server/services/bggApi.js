const axios = require('axios');
const xml2js = require('xml2js');

const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';
const parser = new xml2js.Parser();

// Simple delay function for rate limiting
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class BGGApiService {
    constructor() {
        this.lastRequest = 0;
        this.minDelay = 1000; // 1 second between requests
    }

    async makeRequest(url) {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequest;
        if (timeSinceLastRequest < this.minDelay) {
            await delay(this.minDelay - timeSinceLastRequest);
        }
        this.lastRequest = Date.now();

        try {
            console.log(`🌐 Fetching from BGG: ${url}`);
            const response = await axios.get(url, {
                timeout: 30000,
                headers: {
                    'User-Agent': 'BoardGameSelector/1.0'
                }
            });
            
            return response.data;
        } catch (error) {
            console.error('BGG API Error:', error.message);
            throw error;
        }
    }

    async fetchCollection(username) {
        const url = `${BGG_API_BASE}/collection?username=${encodeURIComponent(username)}&stats=1&excludesubtype=boardgameexpansion&own=1`;
        const xmlData = await this.makeRequest(url);
        
        // Parse XML to JSON
        const result = await parser.parseStringPromise(xmlData);
        
        // Check for processing message
        if (result.message) {
            throw new Error('BGG_PROCESSING');
        }
        
        if (!result.items || !result.items.item) {
            throw new Error('NO_COLLECTION');
        }
        
        // Transform the data to our format
        const games = result.items.item.map(item => ({
            id: item.$.objectid,
            name: item.name[0]._ || item.name[0],
            yearPublished: item.yearpublished ? parseInt(item.yearpublished[0]) : null,
            image: item.image ? item.image[0] : null,
            thumbnail: item.thumbnail ? item.thumbnail[0] : null,
            minPlayers: item.stats[0].$.minplayers ? parseInt(item.stats[0].$.minplayers) : null,
            maxPlayers: item.stats[0].$.maxplayers ? parseInt(item.stats[0].$.maxplayers) : null,
            minPlayTime: item.stats[0].$.minplaytime ? parseInt(item.stats[0].$.minplaytime) : null,
            maxPlayTime: item.stats[0].$.maxplaytime ? parseInt(item.stats[0].$.maxplaytime) : null,
            playTime: item.stats[0].$.playingtime ? parseInt(item.stats[0].$.playingtime) : null,
            numPlays: item.numplays ? parseInt(item.numplays[0]) : 0,
            rating: item.stats[0].rating[0].average[0].$.value !== 'N/A' ? 
                parseFloat(item.stats[0].rating[0].average[0].$.value) : null,
            userRating: item.stats[0].rating[0].$.value !== 'N/A' ? 
                parseFloat(item.stats[0].rating[0].$.value) : null,
            complexity: item.stats[0].rating[0].averageweight ? 
                parseFloat(item.stats[0].rating[0].averageweight[0].$.value) : null
        }));
        
        return games;
    }

    async fetchGameDetails(gameIds) {
        if (!Array.isArray(gameIds)) gameIds = [gameIds];
        
        const url = `${BGG_API_BASE}/thing?id=${gameIds.join(',')}&stats=1&type=boardgame`;
        const xmlData = await this.makeRequest(url);
        
        const result = await parser.parseStringPromise(xmlData);
        
        if (!result.items || !result.items.item) {
            return [];
        }
        
        const items = Array.isArray(result.items.item) ? result.items.item : [result.items.item];
        
        return items.map(item => ({
            id: item.$.id,
            name: item.name[0].$.value,
            description: item.description ? item.description[0] : '',
            yearPublished: item.yearpublished ? parseInt(item.yearpublished[0].$.value) : null,
            minPlayers: item.minplayers ? parseInt(item.minplayers[0].$.value) : null,
            maxPlayers: item.maxplayers ? parseInt(item.maxplayers[0].$.value) : null,
            playTime: item.playingtime ? parseInt(item.playingtime[0].$.value) : null,
            minPlayTime: item.minplaytime ? parseInt(item.minplaytime[0].$.value) : null,
            maxPlayTime: item.maxplaytime ? parseInt(item.maxplaytime[0].$.value) : null,
            complexity: item.statistics && item.statistics[0].ratings[0].averageweight ? 
                parseFloat(item.statistics[0].ratings[0].averageweight[0].$.value) : null,
            rating: item.statistics && item.statistics[0].ratings[0].average ? 
                parseFloat(item.statistics[0].ratings[0].average[0].$.value) : null,
            categories: item.link ? 
                item.link.filter(l => l.$.type === 'boardgamecategory').map(l => l.$.value) : [],
            mechanics: item.link ? 
                item.link.filter(l => l.$.type === 'boardgamemechanic').map(l => l.$.value) : []
        }));
    }

    async fetchPlayData(username, gameId) {
        const url = `${BGG_API_BASE}/plays?username=${encodeURIComponent(username)}&id=${gameId}`;
        const xmlData = await this.makeRequest(url);
        
        const result = await parser.parseStringPromise(xmlData);
        
        if (!result.plays || !result.plays.play || result.plays.play.length === 0) {
            return null;
        }
        
        // Get the most recent play date
        const mostRecentPlay = result.plays.play[0];
        return mostRecentPlay.$.date;
    }
}

module.exports = new BGGApiService();