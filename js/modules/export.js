// Collection export: JSON, CSV, text
import { state } from './state.js';
import { bus, Events } from './events.js';

/** Export the collection in the given format */
export function exportCollection(format) {
    const games = state.games;
    if (!games || games.length === 0) {
        bus.emit(Events.STATUS_UPDATE, { message: 'No collection data to export', type: 'error' });
        return;
    }

    let data, filename, mime;
    const dateStr = new Date().toISOString().split('T')[0];
    const user = state.currentUsername;

    switch (format) {
        case 'json':
            data = JSON.stringify({
                username: user,
                exportDate: new Date().toISOString(),
                totalGames: games.length,
                games: games.map(g => ({
                    id: g.id,
                    name: g.name,
                    yearPublished: g.yearPublished,
                    minPlayers: g.minPlayers,
                    maxPlayers: g.maxPlayers,
                    playTime: g.playTime,
                    complexity: g.complexity,
                    personalRating: g.personalRating,
                    bggRating: g.bggRating,
                    numPlays: g.numPlays,
                    owned: g.owned,
                    wishlist: g.wishlist,
                    lastPlayDate: g.lastPlayDate,
                })),
            }, null, 2);
            filename = `bgg-collection-${user}-${dateStr}.json`;
            mime = 'application/json';
            break;

        case 'csv':
            data = buildCSV(games);
            filename = `bgg-collection-${user}-${dateStr}.csv`;
            mime = 'text/csv';
            break;

        case 'text':
            data = buildText(games, user);
            filename = `bgg-collection-${user}-${dateStr}.txt`;
            mime = 'text/plain';
            break;

        default:
            return;
    }

    downloadBlob(data, filename, mime);
    bus.emit(Events.STATUS_UPDATE, { message: `Collection exported as ${format.toUpperCase()}`, type: 'success' });
}

/** Export analytics as JSON */
export function exportAnalytics(analytics) {
    const data = JSON.stringify(analytics, null, 2);
    const dateStr = new Date().toISOString().split('T')[0];
    downloadBlob(data, `bgg-analytics-${state.currentUsername}-${dateStr}.json`, 'application/json');
    bus.emit(Events.STATUS_UPDATE, { message: 'Analytics exported successfully', type: 'success' });
}

// --- Helpers ---

function buildCSV(games) {
    const headers = ['ID', 'Name', 'Year', 'Min Players', 'Max Players', 'Play Time', 'Complexity', 'Personal Rating', 'BGG Rating', 'Plays', 'Owned', 'Wishlist', 'Last Played'];
    const rows = [headers];

    for (const g of games) {
        rows.push([
            g.id,
            `"${(g.name || '').replace(/"/g, '""')}"`,
            g.yearPublished || '',
            g.minPlayers || '',
            g.maxPlayers || '',
            g.playTime || '',
            g.complexity || '',
            g.personalRating || '',
            g.bggRating || '',
            g.numPlays || 0,
            g.owned ? 'Yes' : 'No',
            g.wishlist ? 'Yes' : 'No',
            g.lastPlayDate ? new Date(g.lastPlayDate).toDateString() : 'Never',
        ]);
    }

    return rows.map(r => r.join(',')).join('\n');
}

function buildText(games, username) {
    let out = `Board Game Collection - ${username}\n`;
    out += `Exported: ${new Date().toLocaleString()}\n`;
    out += `Total Games: ${games.length}\n\n`;

    games.forEach((g, i) => {
        out += `${i + 1}. ${g.name}\n`;
        out += `   Year: ${g.yearPublished || 'Unknown'}\n`;
        out += `   Players: ${g.minPlayers}-${g.maxPlayers}\n`;
        out += `   Time: ${g.playTime} minutes\n`;
        out += `   Complexity: ${g.complexity}/5\n`;
        if (g.personalRating) out += `   My Rating: ${g.personalRating}/10\n`;
        out += `   BGG Rating: ${g.bggRating || 'N/A'}\n`;
        out += `   Plays: ${g.numPlays || 0}\n`;
        out += `   Status: ${g.owned ? 'Owned' : 'Wishlist'}\n\n`;
    });

    return out;
}

function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
