// Game card display and rendering
import { $, escapeHtml, createElement, show, hide } from './dom.js';
import { bus, Events } from './events.js';
import { state } from './state.js';
import { log } from './logger.js';

/** Display the selected game in the game card */
export function displaySelectedGame(game) {
    if (!game) return;

    const card = $('#gameCard');
    if (!card) return;

    // Use View Transitions API if available
    const render = () => {
        const nameEl = $('#gameName');
        const imageEl = $('#gameImage');
        const yearEl = $('#gameYear');
        const playersEl = $('#gamePlayers');
        const playTimeEl = $('#gamePlayTime');
        const complexityEl = $('#gameComplexity');
        const personalRatingEl = $('#gamePersonalRating');
        const bggRatingEl = $('#gameBggRating');
        const playsEl = $('#gameNumPlays');
        const lastPlayedEl = $('#gameLastPlayed');
        const bggLinkEl = $('#bggLink');

        nameEl.textContent = game.name;
        imageEl.src = game.image || game.thumbnail || '';
        imageEl.alt = `Cover art for ${game.name}`;
        yearEl.textContent = game.yearPublished || 'Unknown';
        playersEl.textContent = formatPlayers(game);
        playTimeEl.textContent = formatPlayTime(game);
        complexityEl.textContent = game.complexity && !isNaN(game.complexity) ? game.complexity.toFixed(1) : 'N/A';

        // Personal rating
        if (game.personalRating && game.personalRating > 0 && !isNaN(game.personalRating)) {
            personalRatingEl.textContent = `${game.personalRating.toFixed(1)}/10`;
            personalRatingEl.title = `Your personal rating: ${game.personalRating.toFixed(1)} out of 10`;
        } else {
            personalRatingEl.textContent = 'Not rated';
            personalRatingEl.title = 'You have not rated this game yet';
        }

        // BGG rating
        if (game.bggRating && game.bggRating > 0 && !isNaN(game.bggRating)) {
            bggRatingEl.textContent = `${game.bggRating.toFixed(1)}/10`;
            bggRatingEl.title = `BGG community rating: ${game.bggRating.toFixed(1)} out of 10`;
        } else {
            bggRatingEl.textContent = 'No rating';
            bggRatingEl.title = 'No BoardGameGeek community rating available';
        }

        playsEl.textContent = game.numPlays || '0';
        lastPlayedEl.textContent = game.lastPlayDate
            ? formatDateForDisplay(new Date(game.lastPlayDate))
            : (game.numPlays > 0 ? 'Unknown' : 'Never');

        bggLinkEl.href = `https://boardgamegeek.com/boardgame/${game.id}`;

        show(card);
        card.classList.add('fade-in');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    if (document.startViewTransition) {
        document.startViewTransition(render);
    } else {
        render();
    }
}

function formatPlayers(game) {
    if (!game.minPlayers && !game.maxPlayers) return 'N/A';
    if (game.minPlayers === game.maxPlayers) return String(game.minPlayers);
    return `${game.minPlayers || '?'}-${game.maxPlayers || '?'}`;
}

function formatPlayTime(game) {
    if (game.playTime) return `${game.playTime} min`;
    if (game.minPlayTime && game.maxPlayTime) return `${game.minPlayTime}-${game.maxPlayTime} min`;
    return 'N/A';
}

export function formatDateForDisplay(date) {
    if (!(date instanceof Date) || isNaN(date)) return 'Unknown';
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
}

/** Initialize game display event listeners */
export function initGameDisplayListeners() {
    $('#rollAgain')?.addEventListener('click', () => {
        bus.emit('roll:again');
    });
}
