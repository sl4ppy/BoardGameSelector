const express = require('express');
const router = express.Router();
const db = require('../services/database');
const bggApi = require('../services/bggApi');

// Get collection for a user
router.get('/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const forceRefresh = req.query.refresh === 'true';
        
        // Get or create user
        let user = await db.getUser(username);
        if (!user) {
            user = await db.createUser(username);
        } else {
            await db.updateUserAccess(user.id);
        }
        
        // Check cache first (unless force refresh)
        if (!forceRefresh) {
            const cachedCollection = await db.getCollection(user.id);
            if (cachedCollection) {
                const cacheAge = Date.now() - new Date(cachedCollection.fetched_at).getTime();
                const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
                
                if (cacheAge < maxCacheAge) {
                    console.log(`📦 Serving cached collection for ${username} (${Math.round(cacheAge / 1000 / 60)} minutes old)`);
                    return res.json({
                        source: 'cache',
                        cached_at: cachedCollection.fetched_at,
                        data: JSON.parse(cachedCollection.data)
                    });
                }
            }
        }
        
        // Fetch fresh data from BGG
        console.log(`🔄 Fetching fresh collection for ${username}`);
        try {
            const collection = await bggApi.fetchCollection(username);
            
            // Save to cache
            await db.saveCollection(user.id, collection);
            
            res.json({
                source: 'bgg',
                cached_at: new Date(),
                data: collection
            });
        } catch (error) {
            if (error.message === 'BGG_PROCESSING') {
                res.status(202).json({
                    error: 'BGG is processing your collection. Please try again in 30-60 seconds.',
                    code: 'BGG_PROCESSING'
                });
            } else if (error.message === 'NO_COLLECTION') {
                res.status(404).json({
                    error: 'No collection found for this user.',
                    code: 'NO_COLLECTION'
                });
            } else {
                throw error;
            }
        }
    } catch (error) {
        console.error('Collection fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch collection',
            message: error.message 
        });
    }
});

// Get enriched game details
router.post('/games/details', async (req, res) => {
    try {
        const { gameIds } = req.body;
        if (!gameIds || !Array.isArray(gameIds)) {
            return res.status(400).json({ error: 'gameIds array required' });
        }
        
        // Check cache first
        const cachedGames = await db.getGameCache(gameIds);
        const cachedGameIds = cachedGames.map(g => g.game_id);
        const uncachedIds = gameIds.filter(id => !cachedGameIds.includes(id));
        
        let allGames = cachedGames.map(g => JSON.parse(g.data));
        
        // Fetch uncached games
        if (uncachedIds.length > 0) {
            console.log(`🔄 Fetching ${uncachedIds.length} uncached games`);
            const batchSize = 20; // BGG limit
            
            for (let i = 0; i < uncachedIds.length; i += batchSize) {
                const batch = uncachedIds.slice(i, i + batchSize);
                const gameDetails = await bggApi.fetchGameDetails(batch);
                
                // Cache the results
                for (const game of gameDetails) {
                    await db.saveGameCache(game.id, game);
                    allGames.push(game);
                }
            }
        }
        
        res.json({
            games: allGames,
            cached: cachedGameIds.length,
            fetched: uncachedIds.length
        });
    } catch (error) {
        console.error('Game details fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch game details',
            message: error.message 
        });
    }
});

// Get play data for a game
router.get('/:username/plays/:gameId', async (req, res) => {
    try {
        const { username, gameId } = req.params;
        
        // Check cache first
        const cachedPlay = await db.getPlayData(username, gameId);
        if (cachedPlay) {
            const cacheAge = Date.now() - new Date(cachedPlay.fetched_at).getTime();
            const maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 days
            
            if (cacheAge < maxCacheAge) {
                return res.json({
                    source: 'cache',
                    last_played: cachedPlay.last_played
                });
            }
        }
        
        // Fetch from BGG
        const lastPlayed = await bggApi.fetchPlayData(username, gameId);
        
        // Cache the result
        if (lastPlayed) {
            await db.savePlayData(username, gameId, lastPlayed);
        }
        
        res.json({
            source: 'bgg',
            last_played: lastPlayed
        });
    } catch (error) {
        console.error('Play data fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch play data',
            message: error.message 
        });
    }
});

module.exports = router;