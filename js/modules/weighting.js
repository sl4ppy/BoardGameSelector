// Game selection weighting algorithms
import { state } from './state.js';
import { log } from './logger.js';

/** Select a random game using the current weighting method */
export function selectWeightedGame() {
    const games = state.filteredGames;
    if (games.length === 0) return null;

    const weights = games.map(g => calculateGameWeight(g));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);

    if (totalWeight <= 0) {
        return games[Math.floor(Math.random() * games.length)];
    }

    let random = Math.random() * totalWeight;
    for (let i = 0; i < games.length; i++) {
        random -= weights[i];
        if (random <= 0) return games[i];
    }

    return games[games.length - 1];
}

function calculateGameWeight(game) {
    let baseWeight;

    switch (state.currentWeightingMethod) {
        case 'recency': {
            if (game.lastPlayDate) {
                const daysSince = (Date.now() - new Date(game.lastPlayDate).getTime()) / (1000 * 60 * 60 * 24);
                baseWeight = Math.pow(1.05, Math.min(daysSince, 365));
            } else if (game.numPlays === 0) {
                baseWeight = Math.pow(1.05, 365);
            } else {
                baseWeight = Math.pow(1.05, 180);
            }
            break;
        }
        case 'unplayed': {
            if (game.numPlays === 0) {
                baseWeight = 10;
            } else if (game.lastPlayDate) {
                const daysSince = (Date.now() - new Date(game.lastPlayDate).getTime()) / (1000 * 60 * 60 * 24);
                baseWeight = Math.pow(1.03, Math.min(daysSince, 365));
            } else {
                baseWeight = 2;
            }
            break;
        }
        default:
            baseWeight = 1;
    }

    // Apply personal rating multiplier if enabled
    if (state.usePersonalRating && game.personalRating && game.personalRating > 0 && !isNaN(game.personalRating)) {
        baseWeight *= calculateRatingWeight(game.personalRating);
    }

    return baseWeight;
}

function calculateRatingWeight(rating) {
    if (rating >= 9) return 3.0;
    if (rating >= 8) return 2.0;
    if (rating >= 7) return 1.5;
    if (rating >= 6) return 1.0;
    if (rating >= 5) return 0.7;
    if (rating >= 4) return 0.5;
    return 0.3;
}

/** Get weight info text for display */
export function getWeightInfoText() {
    const games = state.filteredGames;
    let text = '';

    switch (state.currentWeightingMethod) {
        case 'random':
            text = `Equal chance for all ${games.length} games`;
            break;
        case 'recency':
            text = `Favoring games not played recently (${games.length} games)`;
            break;
        case 'unplayed':
            text = `Favoring unplayed games (${games.filter(g => g.numPlays === 0).length} unplayed of ${games.length})`;
            break;
    }

    if (state.usePersonalRating) {
        const rated = games.filter(g => g.personalRating && g.personalRating > 0 && !isNaN(g.personalRating));
        const qualifying = games.filter(g => g.personalRating >= state.minPersonalRating);
        const avg = rated.length > 0
            ? (rated.reduce((sum, g) => sum + g.personalRating, 0) / rated.length).toFixed(1)
            : 'N/A';
        text += ` | Ratings: ${qualifying.length} meet min ${state.minPersonalRating}★ (avg ${avg})`;
    }

    return text;
}
