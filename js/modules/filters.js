// Game filtering logic
import { state, setState } from './state.js';
import { bus, Events } from './events.js';
import { $, escapeHtml, debounce } from './dom.js';
import { log } from './logger.js';

/** Apply all active filters to the game collection */
export function applyFilters() {
    const playerCount = $('#playerCount')?.value;
    const playTime = $('#playTime')?.value;
    const complexity = $('#complexity')?.value;
    const gameType = $('#gameType')?.value;

    const filtered = state.games.filter(game => {
        // Game type filter
        if (gameType === 'owned' && !game.owned) return false;
        if (gameType === 'wishlist' && !game.wishlist) return false;

        // Player count filter
        if (playerCount) {
            const count = parseInt(playerCount);
            if (count === 5) {
                if (game.maxPlayers < 5) return false;
            } else {
                if (game.minPlayers > count || game.maxPlayers < count) return false;
            }
        }

        // Play time filter
        if (playTime) {
            const [min, max] = playTime.includes('+')
                ? [parseInt(playTime), Infinity]
                : playTime.split('-').map(Number);
            if (game.playTime < min || game.playTime > max) return false;
        }

        // Complexity filter
        if (complexity) {
            const [min, max] = complexity.split('-').map(Number);
            if (!game.complexity || game.complexity < min || game.complexity > max) return false;
        }

        // Unrated games filter
        const isUnrated = !game.personalRating || game.personalRating === 0 || isNaN(game.personalRating);
        if (isUnrated && !state.includeUnrated) return false;

        // Personal rating minimum filter
        if (state.usePersonalRating) {
            if (game.personalRating > 0 && game.personalRating < state.minPersonalRating) {
                return false;
            }
        }

        return true;
    });

    setState('filteredGames', filtered);
    updateFilteredCount();
    bus.emit(Events.FILTERS_CHANGED, filtered);
}

function updateFilteredCount() {
    const el = $('#filteredCount');
    if (!el) return;
    const total = state.games.length;
    const filtered = state.filteredGames.length;
    el.textContent = total === filtered
        ? `${total} games in collection`
        : `${filtered} of ${total} games match filters`;
}

/** Initialize filter event listeners (debounced) */
export function initFilterListeners() {
    const debouncedApply = debounce(applyFilters, 100);
    const filterIds = ['playerCount', 'playTime', 'complexity', 'gameType'];
    for (const id of filterIds) {
        $(`#${id}`)?.addEventListener('change', debouncedApply);
    }
}
