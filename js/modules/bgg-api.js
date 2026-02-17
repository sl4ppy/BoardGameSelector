// BGG XML API: collection fetching, parsing, enrichment, play data
import { state, setState, isLocalDevelopment } from './state.js';
import { bus, Events } from './events.js';
import { log, error, warn } from './logger.js';
import { makeApiRequest, queueRequest, BGG_API_BASE } from './api-proxy.js';
import * as cache from './cache.js';

/** Fetch a user's collection from BGG (with backend fallback) */
export async function fetchCollection(username, forceRefresh = false) {
    const collectionUrl = `${BGG_API_BASE}/collection?username=${encodeURIComponent(username)}&stats=1&excludesubtype=boardgameexpansion`;
    log('Fetching BGG collection:', collectionUrl);

    const response = await makeApiRequest(collectionUrl);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(response, 'text/xml');

    // Check for errors
    const err = xmlDoc.querySelector('error');
    if (err) throw new Error(`BGG API Error: ${err.textContent}`);

    // Check for BGG processing message
    const msg = xmlDoc.querySelector('message');
    if (msg && msg.textContent.includes('accepted and will be processed')) {
        throw new Error('BGG is processing your collection. Please wait 30-60 seconds and try again.');
    }

    const items = xmlDoc.querySelectorAll('item');

    if (items.length === 0) {
        const collection = xmlDoc.querySelector('items');
        if (collection) {
            const total = collection.getAttribute('totalitems') || '0';
            if (total === '0') {
                throw new Error(`User "${username}" exists but has no games in their collection.`);
            }
            throw new Error(`User "${username}" has ${total} items but none match current filters.`);
        }
        throw new Error(`No collection data found for user "${username}".`);
    }

    const games = Array.from(items).map(parseGameItem);
    return games;
}

/** Parse a single <item> from the BGG collection XML */
export function parseGameItem(item) {
    const game = {
        id: item.getAttribute('objectid'),
        name: item.querySelector('name')?.textContent || 'Unknown Game',
        image: item.querySelector('image')?.textContent || item.querySelector('thumbnail')?.textContent || '',
        thumbnail: item.querySelector('thumbnail')?.textContent || '',
        yearPublished: item.querySelector('yearpublished')?.textContent || 'Unknown',
        owned: item.getAttribute('subtype') === 'boardgame' && item.querySelector('status[own="1"]') !== null,
        wishlist: item.querySelector('status[wishlist="1"]') !== null,
        personalRating: parseFloat(item.querySelector('stats rating[value]')?.getAttribute('value') || '0'),
        numPlays: parseInt(item.querySelector('numplays')?.textContent || '0'),
    };

    const stats = item.querySelector('stats');
    if (stats) {
        game.minPlayers = parseInt(stats.getAttribute('minplayers') || '1');
        game.maxPlayers = parseInt(stats.getAttribute('maxplayers') || '1');
        game.playTime = parseInt(stats.getAttribute('playingtime') || '0');
        game.complexity = parseFloat(stats.querySelector('rating[name="averageweight"] value')?.getAttribute('value') || '0');

        const avg = stats.querySelector('rating average');
        if (avg) {
            game.bggRating = parseFloat(avg.getAttribute('value') || '0');
        } else {
            const alt = stats.querySelector('rating[name="average"]');
            if (alt) {
                game.bggRating = parseFloat(alt.getAttribute('value') || '0');
            } else {
                const bayes = stats.querySelector('rating bayesaverage');
                game.bggRating = bayes ? parseFloat(bayes.getAttribute('value') || '0') : 0;
            }
        }
    }

    return game;
}

/** Enrich games with detailed data from the BGG Thing API */
export async function enrichGameData(games) {
    // Apply defaults for missing fields
    for (const game of games) {
        if (!game.minPlayers) game.minPlayers = 1;
        if (!game.maxPlayers) game.maxPlayers = 1;
        if (!game.playTime) game.playTime = 60;
        if (!game.complexity) game.complexity = 2.5;
    }

    const needsData = games.filter(g =>
        !g.minPlayers || !g.maxPlayers || !g.playTime || !g.complexity
    );

    if (needsData.length === 0) return games;

    const batchSize = 20;
    const batches = [];
    for (let i = 0; i < needsData.length; i += batchSize) {
        batches.push(needsData.slice(i, i + batchSize));
    }

    let completed = 0;
    const batchPromises = batches.map(batch =>
        queueRequest(async () => {
            await fetchBatchDetails(batch, games);
            completed++;
            const pct = Math.round((completed / batches.length) * 100);
            bus.emit(Events.STATUS_UPDATE, {
                message: `Loading game details... ${pct}% (${completed}/${batches.length} batches)`,
                type: 'loading',
            });
        })
    );

    await Promise.all(batchPromises);
    return games;
}

async function fetchBatchDetails(batch, allGames) {
    const ids = batch.map(g => g.id).join(',');
    const url = `${BGG_API_BASE}/thing?id=${ids}&stats=1&type=boardgame`;

    try {
        const response = await makeApiRequest(url);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(response, 'text/xml');

        for (const item of xmlDoc.querySelectorAll('item')) {
            const gameId = item.getAttribute('id');
            const game = allGames.find(g => g.id === gameId);
            if (!game) continue;

            const avgWeight = item.querySelector('statistics ratings averageweight')?.getAttribute('value');
            if (avgWeight) game.complexity = parseFloat(avgWeight);

            const minP = item.querySelector('minplayers')?.getAttribute('value');
            const maxP = item.querySelector('maxplayers')?.getAttribute('value');
            if (minP) game.minPlayers = parseInt(minP);
            if (maxP) game.maxPlayers = parseInt(maxP);

            const playTime = item.querySelector('playingtime')?.getAttribute('value');
            const maxTime = item.querySelector('maxplaytime')?.getAttribute('value');
            if (playTime) game.playTime = parseInt(playTime);
            else if (maxTime) game.playTime = parseInt(maxTime);

            const minTime = item.querySelector('minplaytime')?.getAttribute('value');
            if (minTime) game.minPlayTime = parseInt(minTime);
            if (maxTime) game.maxPlayTime = parseInt(maxTime);
        }
    } catch (err) {
        error('Batch game details error:', err);
    }
}

/** Fetch play data for a single game */
export async function fetchPlayData(game, username) {
    // Try backend first
    if (window.apiClient?.hasBackend) {
        try {
            const result = await window.apiClient.fetchPlayData(username, game.id);
            if (result) {
                return {
                    plays: [{ getAttribute: () => result }],
                    fromBackend: true,
                };
            }
        } catch (err) {
            warn('Backend play data failed, falling back to direct API:', err.message);
        }
    }

    const playsUrl = `${BGG_API_BASE}/plays?username=${encodeURIComponent(username)}&id=${game.id}&page=1`;
    const response = await makeApiRequest(playsUrl);
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(response, 'text/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('XML parsing failed: ' + parserError.textContent);
    }

    return {
        plays: xmlDoc.querySelectorAll('play'),
        xmlDoc,
    };
}

/** Sync play data for all games with plays */
export async function syncAllPlayData(games, username) {
    const gamesWithPlays = games.filter(g => g.numPlays > 0);
    let updated = 0;

    for (let i = 0; i < gamesWithPlays.length; i++) {
        const game = gamesWithPlays[i];

        if (i % 5 === 0) {
            bus.emit(Events.STATUS_UPDATE, {
                message: `Syncing play data... (${i + 1}/${gamesWithPlays.length})`,
                type: 'loading',
            });
        }

        try {
            const playData = await queueRequest(() => fetchPlayData(game, username));

            if (playData && playData.plays.length > 0) {
                const latestPlay = playData.plays[0];
                const playDate = latestPlay.getAttribute('date');

                if (playDate) {
                    game.lastPlayDate = new Date(playDate);

                    // Cache in IndexedDB
                    try {
                        await cache.save('playData', {
                            cacheKey: `${username}-${game.id}`,
                            displayText: formatRelativeDate(game.lastPlayDate),
                            lastPlayDate: game.lastPlayDate.toISOString(),
                            timestamp: Date.now(),
                            gameId: game.id,
                            gameName: game.name,
                        });
                    } catch { /* non-critical */ }

                    updated++;
                }
            }
        } catch (err) {
            warn(`Failed to sync play data for ${game.name}:`, err.message);
        }
    }

    return updated;
}

/** Format a date as a relative string (e.g. "3 days ago") */
function formatRelativeDate(date) {
    if (!(date instanceof Date) || isNaN(date)) return 'Unknown';
    const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
}
