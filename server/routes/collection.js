const express = require('express');
const router = express.Router();
const db = require('../services/database');
const bggApi = require('../services/bggApi');

// Get user info (including last sync dates)
router.get('/:username/info', async (req, res) => {
    try {
        const { username } = req.params;
        
        const user = await db.getUser(username);
        if (!user) {
            return res.json({
                exists: false,
                username: username
            });
        }
        
        res.json({
            exists: true,
            username: user.username,
            created_at: user.created_at,
            last_accessed: user.last_accessed,
            last_full_sync: user.last_full_sync
        });
    } catch (error) {
        console.error('User info fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch user info',
            message: error.message 
        });
    }
});

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

// Sync all play data for a user's collection
router.post('/:username/sync-plays', async (req, res) => {
    try {
        const { username } = req.params;
        
        // Get user
        const user = await db.getUser(username);
        if (!user) {
            return res.status(404).json({ error: 'User not found. Please sync collection first.' });
        }
        
        // Get user's collection
        const collection = await db.getCollection(user.id);
        if (!collection || !collection.data) {
            return res.status(404).json({ error: 'Collection not found. Please sync collection first.' });
        }
        
        const games = JSON.parse(collection.data);
        const gamesWithPlays = games.filter(game => game.numPlays > 0);
        
        console.log(`🔄 Starting bulk play sync for ${username} - ${gamesWithPlays.length} games with plays`);
        
        let updatedCount = 0;
        const errors = [];
        
        // Process games in batches to avoid overwhelming BGG API
        const batchSize = 5;
        for (let i = 0; i < gamesWithPlays.length; i += batchSize) {
            const batch = gamesWithPlays.slice(i, i + batchSize);
            
            await Promise.all(batch.map(async (game) => {
                try {
                    // Check if we already have recent play data (less than 24 hours old)
                    const cachedPlay = await db.getPlayData(username, game.id);
                    if (cachedPlay) {
                        const cacheAge = Date.now() - new Date(cachedPlay.fetched_at).getTime();
                        const maxCacheAge = 24 * 60 * 60 * 1000; // 24 hours
                        
                        if (cacheAge < maxCacheAge) {
                            return; // Skip if recent
                        }
                    }
                    
                    // Fetch fresh play data from BGG
                    const lastPlayed = await bggApi.fetchPlayData(username, game.id);
                    
                    if (lastPlayed) {
                        await db.savePlayData(username, game.id, lastPlayed);
                        updatedCount++;
                        console.log(`✅ Updated play data for ${game.name}: ${lastPlayed}`);
                    }
                } catch (error) {
                    console.warn(`⚠️  Failed to sync play data for ${game.name}:`, error.message);
                    errors.push({ game: game.name, error: error.message });
                }
            }));
            
            // Add delay between batches to be respectful to BGG API
            if (i + batchSize < gamesWithPlays.length) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
            }
        }
        
        console.log(`✅ Bulk play sync completed for ${username}: ${updatedCount} games updated`);
        
        res.json({
            message: 'Play data sync completed',
            updated: updatedCount,
            total_games_with_plays: gamesWithPlays.length,
            errors: errors.length > 0 ? errors : undefined
        });
        
    } catch (error) {
        console.error('Bulk play sync error:', error);
        res.status(500).json({ 
            error: 'Failed to sync play data',
            message: error.message 
        });
    }
});

// Full sync: collection + all play data + game details
router.post('/:username/full-sync', async (req, res) => {
    try {
        const { username } = req.params;
        
        console.log(`🚀 Starting full sync for ${username}`);
        
        // Get or create user
        let user = await db.getUser(username);
        if (!user) {
            user = await db.createUser(username);
        } else {
            await db.updateUserAccess(user.id);
        }
        
        // Step 1: Fetch fresh collection from BGG
        console.log(`📦 Step 1: Fetching collection from BGG...`);
        let collectionData;
        try {
            collectionData = await bggApi.fetchCollection(username);
        } catch (error) {
            if (error.message === 'BGG_PROCESSING') {
                return res.status(202).json({
                    code: 'BGG_PROCESSING',
                    message: 'BGG is processing your collection. Please wait 30-60 seconds and try again.'
                });
            }
            throw error; // Re-throw other errors
        }
        
        // Save collection to database
        await db.saveCollection(user.id, collectionData);
        console.log(`✅ Collection saved: ${collectionData.length} games`);
        
        // Step 2: Sync play data for games with plays
        const gamesWithPlays = collectionData.filter(game => game.numPlays > 0);
        console.log(`🎯 Step 2: Syncing play data for ${gamesWithPlays.length} games...`);
        
        let playsUpdated = 0;
        const playErrors = [];
        
        // Process in smaller batches for plays
        const playBatchSize = 3;
        for (let i = 0; i < gamesWithPlays.length; i += playBatchSize) {
            const batch = gamesWithPlays.slice(i, i + playBatchSize);
            
            await Promise.all(batch.map(async (game) => {
                try {
                    const lastPlayed = await bggApi.fetchPlayData(username, game.id);
                    if (lastPlayed) {
                        await db.savePlayData(username, game.id, lastPlayed);
                        playsUpdated++;
                        console.log(`✅ Play data updated for ${game.name}: ${lastPlayed}`);
                    }
                } catch (error) {
                    console.warn(`⚠️  Failed to sync play data for ${game.name}:`, error.message);
                    playErrors.push({ game: game.name, error: error.message });
                }
            }));
            
            // Delay between batches
            if (i + playBatchSize < gamesWithPlays.length) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
        
        // Step 3: Fetch and cache game details in batches
        console.log(`🔍 Step 3: Fetching detailed game information...`);
        let gameDetailsUpdated = 0;
        const detailErrors = [];
        
        // Process game details in larger batches (BGG supports up to 20 IDs per request)
        const detailBatchSize = 15;
        for (let i = 0; i < collectionData.length; i += detailBatchSize) {
            const batch = collectionData.slice(i, i + detailBatchSize);
            const gameIds = batch.map(game => game.id);
            
            try {
                const gameDetails = await bggApi.fetchGameDetails(gameIds);
                
                // Save each game's details
                for (const gameDetail of gameDetails) {
                    await db.saveGameCache(gameDetail.id, gameDetail);
                    gameDetailsUpdated++;
                }
                
                console.log(`✅ Cached details for ${gameDetails.length} games`);
            } catch (error) {
                console.warn(`⚠️  Failed to fetch game details for batch:`, error.message);
                detailErrors.push({ batch: gameIds, error: error.message });
            }
            
            // Delay between detail batches
            if (i + detailBatchSize < collectionData.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        // Update the user's last full sync timestamp
        await db.updateUserFullSync(user.id);
        
        console.log(`✅ Full sync completed for ${username}: ${collectionData.length} games, ${playsUpdated} plays, ${gameDetailsUpdated} details`);
        
        res.json({
            message: 'Full sync completed successfully',
            collection_games: collectionData.length,
            plays_updated: playsUpdated,
            game_details_cached: gameDetailsUpdated,
            collection_data: collectionData, // Return collection data for frontend
            errors: {
                plays: playErrors.length > 0 ? playErrors : undefined,
                details: detailErrors.length > 0 ? detailErrors : undefined
            }
        });
        
    } catch (error) {
        console.error('Full sync error:', error);
        res.status(500).json({ 
            error: 'Full sync failed',
            message: error.message 
        });
    }
});

module.exports = router;