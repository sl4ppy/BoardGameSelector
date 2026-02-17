// Collection table rendering and sorting
import { $, $$, createElement, escapeHtml, show, hide } from './dom.js';
import { state } from './state.js';
import { log } from './logger.js';

let _sortInitialized = false;

/** Toggle collection table visibility */
export function toggleTable() {
    const container = $('#collectionTableContainer');
    const btn = $('#toggleTable');
    if (!container) return;

    const isHidden = container.classList.contains('hidden');
    if (isHidden) {
        show(container);
        populateTable();
        if (btn) btn.querySelector('.btn-text').textContent = 'Hide Collection Table';
    } else {
        hide(container);
        if (btn) btn.querySelector('.btn-text').textContent = 'Show Collection Table';
    }
}

/** Populate the collection table with current filtered games */
export async function populateTable() {
    const tbody = $('#collectionTableBody');
    const stats = $('#tableStats');
    if (!tbody) return;

    const games = state.filteredGames;
    tbody.innerHTML = '';

    if (stats) {
        stats.textContent = `${games.length} games`;
    }

    for (const game of games) {
        const row = createElement('tr', {}, [
            createElement('td', { className: 'game-title' }, [
                createElement('strong', { textContent: game.name }),
            ]),
            createElement('td', { className: 'game-year', textContent: game.yearPublished || '' }),
            createElement('td', { className: 'game-players', textContent: formatPlayers(game) }),
            createElement('td', { className: 'game-playtime', textContent: game.playTime ? `${game.playTime} min` : '' }),
            createElement('td', { className: 'game-user-rating', textContent: formatRating(game.personalRating) }),
            createElement('td', { className: 'game-bgg-rating', textContent: formatRating(game.bggRating) }),
            createElement('td', { className: 'game-plays', textContent: String(game.numPlays || 0) }),
            createElement('td', { className: 'game-last-played', textContent: formatLastPlayed(game) }),
        ]);
        tbody.appendChild(row);
    }

    initSorting();
}

function formatPlayers(game) {
    if (!game.minPlayers && !game.maxPlayers) return '';
    if (game.minPlayers === game.maxPlayers) return String(game.minPlayers);
    return `${game.minPlayers || '?'}-${game.maxPlayers || '?'}`;
}

function formatRating(rating) {
    if (rating && rating > 0 && !isNaN(rating)) return rating.toFixed(1);
    return '-';
}

function formatLastPlayed(game) {
    if (game.lastPlayDate) {
        const date = new Date(game.lastPlayDate);
        if (!isNaN(date)) {
            return date.toLocaleDateString();
        }
    }
    if (game.numPlays === 0) return 'Never';
    return '';
}

/** Initialize table sorting via event delegation (once) */
function initSorting() {
    if (_sortInitialized) return;
    _sortInitialized = true;

    const thead = $('#collectionTable thead');
    if (!thead) return;

    thead.addEventListener('click', (e) => {
        const header = e.target.closest('th.sortable');
        if (!header) return;

        const column = header.dataset.column;
        const isAscending = !header.classList.contains('sort-asc');

        // Clear all sort indicators
        $$('th.sortable', thead).forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            const indicator = th.querySelector('.sort-indicator');
            if (indicator) indicator.textContent = '';
        });

        header.classList.add(isAscending ? 'sort-asc' : 'sort-desc');
        const indicator = header.querySelector('.sort-indicator');
        if (indicator) indicator.textContent = isAscending ? '\u2191' : '\u2193';

        sortTableByColumn(column, isAscending);
    });
}

function sortTableByColumn(column, ascending) {
    const tbody = $('#collectionTableBody');
    if (!tbody) return;

    const rows = Array.from(tbody.querySelectorAll('tr'));
    const columnIndex = getColumnIndex(column);
    if (columnIndex === -1) return;

    rows.sort((a, b) => {
        const aVal = getCellValue(a.cells[columnIndex], column);
        const bVal = getCellValue(b.cells[columnIndex], column);

        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return ascending ? aVal - bVal : bVal - aVal;
        }
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return ascending ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });

    tbody.innerHTML = '';
    for (const row of rows) tbody.appendChild(row);
}

function getColumnIndex(column) {
    const columns = ['name', 'yearPublished', 'players', 'playTime', 'userRating', 'rating', 'numPlays', 'lastPlayed'];
    return columns.indexOf(column);
}

function getCellValue(cell, column) {
    if (!cell) return '';
    const text = cell.textContent.trim();
    if (['yearPublished', 'userRating', 'rating', 'numPlays'].includes(column)) {
        const num = parseFloat(text);
        return isNaN(num) ? 0 : num;
    }
    if (column === 'playTime') {
        return parseInt(text) || 0;
    }
    if (column === 'lastPlayed') {
        if (text === 'Never') return new Date(8640000000000000).getTime(); // Sort to bottom
        const d = new Date(text);
        return isNaN(d) ? 0 : d.getTime();
    }
    return text;
}
