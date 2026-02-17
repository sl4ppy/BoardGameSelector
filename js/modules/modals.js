// Modal dialogs: settings, analytics, share
import { $, createElement, escapeHtml, show, hide } from './dom.js';
import { state, setState } from './state.js';
import { bus, Events } from './events.js';
import { log } from './logger.js';
import { getProxyHealthData, checkAllProxyHealth } from './api-proxy.js';
import { exportCollection, exportAnalytics } from './export.js';

// --- Advanced Settings Modal ---

export function showSettings() {
    closeModal('.settings-modal');

    const modal = createElement('div', { className: 'settings-modal' }, [
        createElement('div', { className: 'settings-content' }, [
            createElement('h3', { textContent: 'Advanced Settings' }),
            buildSettingItem(),
            buildPlayDateToggle(),
            buildProxyHealthSection(),
            buildModalButtons('settings'),
            buildExportSection(),
            buildAnalyticsButton(),
        ]),
    ]);

    document.body.appendChild(modal);
    updateProxyHealthDisplay();
}

function buildSettingItem() {
    const wrapper = createElement('div', { className: 'setting-item' });
    wrapper.appendChild(createElement('label', { for: 'customProxy', textContent: 'Custom CORS Proxy URL:' }));

    const input = createElement('input', {
        type: 'text',
        id: 'customProxy',
        placeholder: 'https://your-proxy.com/?url=',
    });
    input.value = state.customProxyUrl;
    wrapper.appendChild(input);
    wrapper.appendChild(createElement('small', { textContent: 'Leave empty to use default proxies' }));
    return wrapper;
}

function buildPlayDateToggle() {
    const wrapper = createElement('div', { className: 'setting-item' });
    const label = createElement('label');
    const checkbox = createElement('input', { type: 'checkbox', id: 'enablePlayDates' });
    checkbox.checked = state.enablePlayDateFetching !== false;
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(' Enable play date fetching (may slow down selection)'));
    wrapper.appendChild(label);
    return wrapper;
}

function buildProxyHealthSection() {
    const section = createElement('div', { className: 'proxy-health' }, [
        createElement('h4', { textContent: 'Proxy Health Status' }),
        createElement('div', { id: 'proxyHealthList' }),
    ]);

    const btn = createElement('button', { className: 'btn-secondary', textContent: 'Check Now' });
    btn.addEventListener('click', () => {
        checkAllProxyHealth();
        setTimeout(updateProxyHealthDisplay, 2000);
    });
    section.appendChild(btn);
    return section;
}

function buildModalButtons(type) {
    const wrapper = createElement('div', { className: 'modal-buttons' });

    const saveBtn = createElement('button', { className: 'btn-primary', textContent: 'Save' });
    saveBtn.addEventListener('click', saveSettings);
    wrapper.appendChild(saveBtn);

    const cancelBtn = createElement('button', { className: 'btn-secondary', textContent: 'Cancel' });
    cancelBtn.addEventListener('click', () => closeModal('.settings-modal'));
    wrapper.appendChild(cancelBtn);

    return wrapper;
}

function buildExportSection() {
    const section = createElement('div', { className: 'advanced-actions' }, [
        createElement('h4', { textContent: 'Data Export' }),
    ]);

    for (const fmt of ['json', 'csv', 'text']) {
        const btn = createElement('button', {
            className: 'btn-secondary',
            textContent: `Export as ${fmt.toUpperCase()}`,
        });
        btn.addEventListener('click', () => exportCollection(fmt));
        section.appendChild(btn);
    }
    return section;
}

function buildAnalyticsButton() {
    const section = createElement('div', { className: 'advanced-actions' }, [
        createElement('h4', { textContent: 'Analytics' }),
    ]);
    const btn = createElement('button', {
        className: 'btn-secondary',
        textContent: 'View Collection Analytics',
    });
    btn.addEventListener('click', showAnalytics);
    section.appendChild(btn);
    return section;
}

function saveSettings() {
    const proxyInput = $('#customProxy');
    const playDatesInput = $('#enablePlayDates');

    if (proxyInput) {
        setState('customProxyUrl', proxyInput.value);
        localStorage.setItem('bgg-custom-proxy-url', proxyInput.value);
    }
    if (playDatesInput) {
        setState('enablePlayDateFetching', playDatesInput.checked);
    }

    closeModal('.settings-modal');
    bus.emit(Events.STATUS_UPDATE, { message: 'Settings saved successfully', type: 'success' });
}

function updateProxyHealthDisplay() {
    const list = $('#proxyHealthList');
    if (!list) return;

    const healthData = getProxyHealthData();
    list.innerHTML = '';

    const ul = createElement('ul', { className: 'proxy-list' });
    for (const [name, health] of healthData) {
        const rate = Math.round((health.successRate || 0) * 100);
        const unhealthy = health.consecutiveFailures >= 5;
        const li = createElement('li', {
            className: unhealthy ? 'proxy-unhealthy' : 'proxy-healthy',
            textContent: `${name}: ${rate}% success rate`,
        });
        ul.appendChild(li);
    }
    list.appendChild(ul);
}

// --- Analytics Modal ---

export function showAnalytics() {
    if (!state.games || state.games.length === 0) {
        bus.emit(Events.STATUS_UPDATE, { message: 'No collection data for analytics', type: 'error' });
        return;
    }

    closeModal('.analytics-modal');
    const analytics = calculateAnalytics();

    const modal = createElement('div', { className: 'analytics-modal' }, [
        createElement('div', { className: 'analytics-content' }, [
            createElement('h3', { textContent: 'Collection Analytics' }),
            buildAnalyticsGrid(analytics),
            buildChartsSection(),
            buildAnalyticsButtons(analytics),
        ]),
    ]);

    document.body.appendChild(modal);
    generateCharts();
}

function calculateAnalytics() {
    const games = state.games;
    const personalRatings = games.filter(g => g.personalRating && g.personalRating > 0).map(g => g.personalRating);
    const bggRatings = games.filter(g => g.bggRating && g.bggRating > 0).map(g => g.bggRating);
    const complexities = games.filter(g => g.complexity).map(g => g.complexity);
    const playTimes = games.filter(g => g.playTime).map(g => g.playTime);
    const played = games.filter(g => g.numPlays > 0);
    const totalPlays = games.reduce((s, g) => s + (g.numPlays || 0), 0);

    const recentlyPlayed = games.filter(g => {
        if (!g.lastPlayDate) return false;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        return new Date(g.lastPlayDate) > cutoff;
    }).length;

    return {
        totalGames: games.length,
        ownedGames: games.filter(g => g.owned).length,
        wishlistGames: games.filter(g => g.wishlist).length,
        playedGames: played.length,
        unplayedGames: games.filter(g => g.numPlays === 0).length,
        totalPlays,
        avgPersonalRating: personalRatings.length > 0
            ? (personalRatings.reduce((s, r) => s + r, 0) / personalRatings.length).toFixed(1) : 'N/A',
        avgBggRating: bggRatings.length > 0
            ? (bggRatings.reduce((s, r) => s + r, 0) / bggRatings.length).toFixed(1) : 'N/A',
        highestRated: games.reduce((prev, curr) =>
            (curr.personalRating || 0) > (prev.personalRating || 0) ? curr : prev, games[0]),
        mostPlayed: games.reduce((prev, curr) =>
            (curr.numPlays || 0) > (prev.numPlays || 0) ? curr : prev, games[0]),
        avgComplexity: complexities.length > 0
            ? (complexities.reduce((s, c) => s + c, 0) / complexities.length).toFixed(1) : 'N/A',
        avgPlayTime: playTimes.length > 0
            ? Math.round(playTimes.reduce((s, t) => s + t, 0) / playTimes.length) : 'N/A',
        minPlayers: Math.min(...games.map(g => g.minPlayers || 1)),
        maxPlayers: Math.max(...games.map(g => g.maxPlayers || 1)),
        estimatedValue: Math.round(games.filter(g => g.owned).length * 45),
        playsPerGame: played.length > 0 ? (totalPlays / played.length).toFixed(1) : '0',
        recentlyPlayed,
        playFrequency: totalPlays > 0 ? `${(totalPlays / 365).toFixed(1)} plays/year` : 'N/A',
    };
}

function buildAnalyticsGrid(a) {
    const grid = createElement('div', { className: 'analytics-grid' });

    const cards = [
        { title: 'Collection Overview', rows: [
            `Total Games: ${a.totalGames}`, `Owned: ${a.ownedGames}`,
            `Wishlist: ${a.wishlistGames}`, `Played: ${a.playedGames}`, `Unplayed: ${a.unplayedGames}`,
        ]},
        { title: 'Ratings', rows: [
            `Avg Personal: ${a.avgPersonalRating}`, `Avg BGG: ${a.avgBggRating}`,
            `Highest Rated: ${escapeHtml(a.highestRated?.name || 'N/A')}`,
            `Most Played: ${escapeHtml(a.mostPlayed?.name || 'N/A')} (${a.mostPlayed?.numPlays || 0})`,
        ]},
        { title: 'Game Mechanics', rows: [
            `Avg Complexity: ${a.avgComplexity}/5`, `Avg Play Time: ${a.avgPlayTime} min`,
            `Player Range: ${a.minPlayers}-${a.maxPlayers}`, `Est. Value: $${a.estimatedValue}`,
        ]},
        { title: 'Play Patterns', rows: [
            `Total Plays: ${a.totalPlays}`, `Plays/Game: ${a.playsPerGame}`,
            `Recently Played: ${a.recentlyPlayed}`, `Frequency: ${a.playFrequency}`,
        ]},
    ];

    for (const card of cards) {
        const el = createElement('div', { className: 'stat-card' });
        el.appendChild(createElement('h4', { textContent: card.title }));
        for (const row of card.rows) {
            const [label, ...rest] = row.split(': ');
            const val = rest.join(': ');
            const p = createElement('p');
            p.textContent = `${label}: `;
            p.appendChild(createElement('strong', { textContent: val }));
            el.appendChild(p);
        }
        grid.appendChild(el);
    }

    return grid;
}

function buildChartsSection() {
    return createElement('div', { className: 'analytics-charts' }, [
        createElement('div', { className: 'chart-container' }, [
            createElement('h4', { textContent: 'Complexity Distribution' }),
            createElement('div', { className: 'bar-chart', id: 'complexityChart' }),
        ]),
        createElement('div', { className: 'chart-container' }, [
            createElement('h4', { textContent: 'Rating Distribution' }),
            createElement('div', { className: 'bar-chart', id: 'ratingChart' }),
        ]),
    ]);
}

function buildAnalyticsButtons(analytics) {
    const wrapper = createElement('div', { className: 'modal-buttons' });

    const exportBtn = createElement('button', { className: 'btn-secondary', textContent: 'Export Analytics' });
    exportBtn.addEventListener('click', () => exportAnalytics(analytics));
    wrapper.appendChild(exportBtn);

    const closeBtn = createElement('button', { className: 'btn-secondary', textContent: 'Close' });
    closeBtn.addEventListener('click', () => closeModal('.analytics-modal'));
    wrapper.appendChild(closeBtn);

    return wrapper;
}

function generateCharts() {
    generateBarChart('complexityChart', {
        '1-2': g => (g.complexity || 2.5) <= 2,
        '2-3': g => g.complexity > 2 && g.complexity <= 3,
        '3-4': g => g.complexity > 3 && g.complexity <= 4,
        '4-5': g => g.complexity > 4,
    });

    generateBarChart('ratingChart', {
        '1-3': g => g.personalRating && g.personalRating <= 3,
        '4-6': g => g.personalRating > 3 && g.personalRating <= 6,
        '7-8': g => g.personalRating > 6 && g.personalRating <= 8,
        '9-10': g => g.personalRating > 8,
        'Unrated': g => !g.personalRating || g.personalRating === 0,
    });
}

function generateBarChart(containerId, buckets) {
    const el = $(`#${containerId}`);
    if (!el) return;

    const counts = {};
    for (const [label, filter] of Object.entries(buckets)) {
        counts[label] = state.games.filter(filter).length;
    }

    const max = Math.max(...Object.values(counts), 1);
    el.innerHTML = '';

    for (const [label, count] of Object.entries(counts)) {
        const pct = (count / max) * 100;
        const row = createElement('div', { className: 'chart-bar' }, [
            createElement('div', { className: 'bar-label', textContent: label }),
            createElement('div', { className: 'bar', style: { width: `${pct}%` } }),
            createElement('div', { className: 'bar-value', textContent: String(count) }),
        ]);
        el.appendChild(row);
    }
}

// --- Share Modal ---

export async function shareGame(game) {
    const shareData = {
        title: `${game.name}`,
        text: `Check out this board game: ${game.name} (${game.yearPublished})\n\n` +
            `Players: ${game.minPlayers}-${game.maxPlayers} | Time: ${game.playTime} min | Complexity: ${game.complexity}/5\n` +
            (game.personalRating ? `My Rating: ${game.personalRating}/10\n` : '') +
            `BGG Rating: ${game.bggRating || 'N/A'}\n\n` +
            `Selected by Board Game Picker`,
        url: `https://boardgamegeek.com/boardgame/${game.id}`,
    };

    if (navigator.share && navigator.canShare?.(shareData)) {
        try {
            await navigator.share(shareData);
            return;
        } catch (err) {
            if (err.name === 'AbortError') return;
        }
    }

    showShareModal(game, shareData);
}

function showShareModal(game, shareData) {
    closeModal('.share-modal');

    const gameUrl = `https://boardgamegeek.com/boardgame/${game.id}`;
    const encodedText = encodeURIComponent(shareData.text);
    const encodedUrl = encodeURIComponent(gameUrl);
    const encodedTitle = encodeURIComponent(shareData.title);

    const modal = createElement('div', { className: 'share-modal' }, [
        createElement('div', { className: 'share-content' }, [
            createElement('h3', { textContent: `Share ${game.name}` }),
            buildSharePreview(game),
            buildShareLinks(encodedText, encodedUrl, encodedTitle, gameUrl),
            buildShareTextArea(shareData.text, gameUrl),
            buildShareCloseButton(),
        ]),
    ]);

    document.body.appendChild(modal);
}

function buildSharePreview(game) {
    const preview = createElement('div', { className: 'share-preview' }, [
        createElement('h4', { textContent: game.name }),
        createElement('p', { textContent: `Players: ${game.minPlayers}-${game.maxPlayers} | Time: ${game.playTime} min | Complexity: ${game.complexity}/5` }),
    ]);
    if (game.personalRating) {
        preview.appendChild(createElement('p', { textContent: `My Rating: ${game.personalRating}/10` }));
    }
    preview.appendChild(createElement('p', { textContent: `BGG Rating: ${game.bggRating || 'N/A'}` }));
    return preview;
}

function buildShareLinks(text, url, title, rawUrl) {
    const container = createElement('div', { className: 'share-buttons' });

    const links = [
        { href: `https://twitter.com/intent/tweet?text=${text}&url=${url}`, className: 'share-twitter', label: 'Twitter' },
        { href: `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, className: 'share-facebook', label: 'Facebook' },
        { href: `https://www.reddit.com/submit?url=${url}&title=${title}`, className: 'share-reddit', label: 'Reddit' },
    ];

    for (const link of links) {
        container.appendChild(createElement('a', {
            href: link.href,
            target: '_blank',
            className: link.className,
            textContent: link.label,
        }));
    }

    const copyBtn = createElement('button', { className: 'share-copy', textContent: 'Copy Link' });
    copyBtn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(rawUrl);
            bus.emit(Events.STATUS_UPDATE, { message: 'Link copied to clipboard!', type: 'success' });
        } catch {
            bus.emit(Events.STATUS_UPDATE, { message: 'Failed to copy link', type: 'error' });
        }
    });
    container.appendChild(copyBtn);

    return container;
}

function buildShareTextArea(text, url) {
    const section = createElement('div', { className: 'share-text-area' }, [
        createElement('h4', { textContent: 'Share Text:' }),
    ]);
    const textarea = createElement('textarea', { readOnly: true });
    textarea.value = `${text}\n\n${url}`;
    textarea.addEventListener('click', function () { this.select(); });
    section.appendChild(textarea);
    return section;
}

function buildShareCloseButton() {
    const wrapper = createElement('div', { className: 'modal-buttons' });
    const btn = createElement('button', { className: 'btn-secondary', textContent: 'Close' });
    btn.addEventListener('click', () => closeModal('.share-modal'));
    wrapper.appendChild(btn);
    return wrapper;
}

// --- Utility ---

function closeModal(selector) {
    const existing = $(selector);
    if (existing) existing.remove();
}
