// Entry point — orchestrates all modules
import { $, $$, show, hide, createElement, escapeHtml } from './modules/dom.js';
import { state, setState, subscribe, isLocalDevelopment } from './modules/state.js';
import { bus, Events } from './modules/events.js';
import { log, warn, error, group, groupEnd } from './modules/logger.js';
import * as cache from './modules/cache.js';
import { initProxyHealth, destroyProxyHealth, makeApiRequest, queueRequest } from './modules/api-proxy.js';
import { fetchCollection, enrichGameData, fetchPlayData, syncAllPlayData } from './modules/bgg-api.js';
import { applyFilters, initFilterListeners } from './modules/filters.js';
import { selectWeightedGame, getWeightInfoText } from './modules/weighting.js';
import { displaySelectedGame, initGameDisplayListeners, formatDateForDisplay } from './modules/game-display.js';
import { GameCarousel } from './modules/carousel.js';
import { toggleTable, populateTable } from './modules/table.js';
import { showSettings, showAnalytics, shareGame } from './modules/modals.js';
import { exportCollection } from './modules/export.js';
import { initPWA, destroyPWA } from './modules/pwa.js';

let carousel = null;
let _devPanelIntervalId = null;
let _processingRetryTimeout = null;
let _processingCountdownInterval = null;

// --- Initialization ---

async function init() {
    log(`Board Game Picker v${state.version} initializing...`);

    // Initialize subsystems
    await cache.initDB();
    initProxyHealth();
    initEventListeners();
    initFilterListeners();
    initGameDisplayListeners();
    initCarousel();
    setupDevPanel();
    setupVersionDisplay();
    await initPWA();

    // Load cached data
    await loadSavedData();

    // Handle URL parameters
    handleUrlParameters();

    log(`Board Game Picker v${state.version} ready`);
}

// --- Event Listeners ---

function initEventListeners() {
    // Username + sync buttons
    $('#fetchCollection')?.addEventListener('click', (e) => {
        fetchUserCollection(e.shiftKey);
    });
    $('#syncPlays')?.addEventListener('click', syncPlaysData);
    $('#fullSync')?.addEventListener('click', fullSyncData);
    $('#bggUsername')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchUserCollection();
    });
    $('#bggUsername')?.addEventListener('input', validateUsernameAndUpdateButtons);

    // Roll / spin
    $('#rollDice')?.addEventListener('click', rollDice);
    $('#rollAgain')?.addEventListener('click', () => bus.emit('roll:again'));

    // Table toggle
    $('#toggleTable')?.addEventListener('click', toggleTable);

    // Weighting buttons
    $$('.weight-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.target.closest('.weight-btn');
            $$('.weight-btn').forEach(b => b.classList.remove('active'));
            target.classList.add('active');
            setState('currentWeightingMethod', target.dataset.weight);
            updateWeightInfo();
        });
    });

    // Personal rating controls
    $('#usePersonalRating')?.addEventListener('change', (e) => {
        setState('usePersonalRating', e.target.checked);
        toggleRatingSlider();
        updateWeightInfo();
        applyFilters();
    });

    $('#minPersonalRating')?.addEventListener('input', (e) => {
        setState('minPersonalRating', parseFloat(e.target.value));
        const display = $('#ratingSliderValue');
        if (display) display.textContent = state.minPersonalRating;
        updateWeightInfo();
        applyFilters();
    });

    $('#includeUnrated')?.addEventListener('change', (e) => {
        setState('includeUnrated', e.target.checked);
        updateWeightInfo();
        applyFilters();
    });

    // Settings button — replace inline onclick
    const settingsBtn = $('.settings-btn');
    if (settingsBtn) {
        settingsBtn.removeAttribute('onclick');
        settingsBtn.addEventListener('click', showSettings);
    }

    // Dev panel buttons
    $('#devClearCache')?.addEventListener('click', devClearCache);
    $('#devRefreshCache')?.addEventListener('click', devRefreshCache);
    $('#devViewCache')?.addEventListener('click', devViewCache);
    $('#devTestAPI')?.addEventListener('click', devTestAPIDialog);

    // Event bus listeners
    bus.on(Events.STATUS_UPDATE, ({ message, type }) => showCollectionStatus(message, type));
    bus.on(Events.FILTERS_CHANGED, onFiltersChanged);
    bus.on(Events.CAROUSEL_COMPLETE, onCarouselComplete);
    bus.on('roll:again', rollDice);
}

// --- Collection Fetching ---

async function fetchUserCollection(forceRefresh = false) {
    const username = $('#bggUsername')?.value.trim();
    if (!username) {
        showCollectionStatus('Please enter a BGG username', 'error');
        return;
    }

    if (state.isLoading) return;

    // Rate limiting
    const now = Date.now();
    const remaining = state.minimumApiInterval - (now - state.lastApiRequest);
    if (state.lastApiRequest > 0 && remaining > 0) {
        const secs = Math.ceil(remaining / 1000);
        showCollectionStatus(`Please wait ${secs}s before refreshing to avoid rate limiting`, 'error');
        return;
    }

    clearRetryTimers();
    setState('isLoading', true);
    setState('lastApiRequest', now);
    setState('currentUsername', username);
    toggleLoadingState(true);
    showCollectionStatus('Connecting to BoardGameGeek API...', 'loading');

    try {
        // Try backend first
        if (window.apiClient?.hasBackend) {
            try {
                const result = await window.apiClient.fetchCollection(username, forceRefresh);
                if (result) {
                    setState('games', result.games);
                    await cache.saveCollection(username, result.games, state.version);
                    showCollectionStatus(`Loaded ${result.games.length} games from ${result.source === 'cache' ? 'server cache' : 'BGG API'}`, 'success');
                    showGameSection();
                    setDevDefaults();
                    applyFilters();
                    return;
                }
            } catch (err) {
                if (err.message.includes('BGG is processing')) throw err;
                warn('Backend failed, falling back to direct API:', err.message);
            }
        }

        // Direct BGG API
        showCollectionStatus('Processing collection from BGG API...', 'loading');
        const games = await fetchCollection(username, forceRefresh);

        showCollectionStatus(`Enriching ${games.length} games...`, 'loading');
        await enrichGameData(games);

        setState('games', games);
        await cache.saveCollection(username, games, state.version);
        showCollectionStatus(`Successfully loaded ${games.length} games from BoardGameGeek`, 'success');
        showGameSection();
        setDevDefaults();
        applyFilters();

    } catch (err) {
        error('Collection fetch error:', err);
        handleFetchError(err);
    } finally {
        setState('isLoading', false);
        toggleLoadingState(false);
    }
}

function handleFetchError(err) {
    if (err.message.includes('BGG is processing')) {
        showCollectionStatus('BGG is processing your collection. Retrying in 30s...', 'warning');
        let countdown = 30;
        _processingRetryTimeout = setTimeout(() => fetchUserCollection(), 30000);
        _processingCountdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                showCollectionStatus(`BGG is processing. Retrying in ${countdown}s...`, 'warning');
            } else {
                clearInterval(_processingCountdownInterval);
            }
        }, 1000);
        return;
    }

    clearRetryTimers();

    let msg = `Error: ${err.message}`;
    if (err.message.includes('Content-Length') || err.message.includes('network response')) {
        msg = 'Network error (temporary). Please try again.';
    } else if (err.message.includes('All CORS proxies failed') || err.message.includes('403')) {
        msg = 'API rate limit reached. Please wait before trying again.';
        setState('lastApiRequest', Date.now());
    }

    showCollectionStatus(msg, 'error');
}

function clearRetryTimers() {
    if (_processingRetryTimeout) { clearTimeout(_processingRetryTimeout); _processingRetryTimeout = null; }
    if (_processingCountdownInterval) { clearInterval(_processingCountdownInterval); _processingCountdownInterval = null; }
}

// --- Play Data Sync ---

async function syncPlaysData() {
    if (!state.currentUsername || state.games.length === 0) {
        showCollectionStatus('Please sync your collection first', 'error');
        return;
    }

    const btn = $('#syncPlays');
    const btnText = btn?.querySelector('.btn-text');
    const spinner = btn?.querySelector('.spinner');

    try {
        if (btnText) btnText.textContent = 'Syncing Plays...';
        if (spinner) show(spinner);
        if (btn) btn.disabled = true;

        showCollectionStatus('Syncing play data from BGG...', 'loading');

        // Try backend first
        if (window.apiClient?.hasBackend) {
            const data = await window.apiClient.syncPlaysData(state.currentUsername);
            if (data) {
                showCollectionStatus(`Synced play data for ${data.updated} games`, 'success');
                refreshTableIfVisible();
                return;
            }
        }

        // Direct BGG fallback
        const updated = await syncAllPlayData(state.games, state.currentUsername);
        showCollectionStatus(`Synced play data for ${updated} games`, 'success');
        refreshTableIfVisible();

    } catch (err) {
        error('Sync plays error:', err);
        showCollectionStatus(`Error syncing plays: ${err.message}`, 'error');
    } finally {
        if (btnText) btnText.textContent = 'Sync Plays';
        if (spinner) hide(spinner);
        if (btn) btn.disabled = !state.currentUsername;
    }
}

async function fullSyncData() {
    if (!state.currentUsername) {
        showCollectionStatus('Please enter a username first', 'error');
        return;
    }

    const btn = $('#fullSync');
    const btnText = btn?.querySelector('.btn-text');
    const spinner = btn?.querySelector('.spinner');

    try {
        if (btnText) btnText.textContent = 'Full Syncing...';
        if (spinner) show(spinner);
        if (btn) btn.disabled = true;

        showCollectionStatus('Starting full sync...', 'loading');

        // Try backend first
        if (window.apiClient?.hasBackend) {
            try {
                const data = await window.apiClient.fullSyncData(state.currentUsername);
                if (data) {
                    showCollectionStatus(`Full sync: ${data.collection_games} games, ${data.plays_updated} plays updated`, 'success');
                    if (data.collection_data) {
                        setState('games', data.collection_data);
                        await cache.saveCollection(state.currentUsername, data.collection_data, state.version);
                        showGameSection();
                        applyFilters();
                    }
                    refreshTableIfVisible();
                    return;
                }
            } catch (err) {
                if (err.message.includes('BGG is processing')) throw err;
                warn('Backend full sync failed, using sequential fallback');
            }
        }

        // Sequential fallback
        await fetchUserCollection(true);
        if (state.games.length === 0) throw new Error('Failed to sync collection');

        showCollectionStatus('Syncing play data...', 'loading');
        const updated = await syncAllPlayData(state.games, state.currentUsername);

        showCollectionStatus('Fetching detailed game information...', 'loading');
        await enrichGameData(state.games);

        showCollectionStatus(`Full sync: ${state.games.length} games, ${updated} plays updated`, 'success');
        refreshTableIfVisible();

    } catch (err) {
        error('Full sync error:', err);
        showCollectionStatus(`Full sync error: ${err.message}`, 'error');
    } finally {
        if (btnText) btnText.textContent = 'Full Sync';
        if (spinner) hide(spinner);
        if (btn) btn.disabled = !state.currentUsername;
    }
}

// --- Rolling / Carousel ---

function rollDice() {
    if (!state.games?.length || !state.filteredGames?.length) {
        showCollectionStatus('No games available with current filters', 'error');
        return;
    }

    if (!carousel || carousel.items.length === 0) {
        populateCarousel();
    }

    const selectedGame = selectWeightedGame();
    if (!selectedGame) return;

    const targetIndex = carousel.games.findIndex(g => g.id === selectedGame.id);
    if (targetIndex >= 0) {
        carousel.spin(targetIndex);
    } else {
        // Game not in carousel — display directly
        displaySelectedGame(selectedGame);
    }
}

function initCarousel() {
    const container = $('#coverflowCarouselContainer');
    if (!container) return;
    carousel = new GameCarousel(container);
}

function populateCarousel() {
    if (!carousel || !state.filteredGames?.length) return;

    // Shuffle games for display variety
    const shuffled = [...state.filteredGames];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    carousel.populate(shuffled);
}

function onCarouselComplete(game) {
    if (game) {
        displaySelectedGame(game);
        addShareButton(game);
    }
}

function addShareButton(game) {
    const card = $('#gameCard');
    if (!card) return;

    card.querySelector('.share-btn')?.remove();

    const btn = createElement('button', { className: 'share-btn', textContent: 'Share' });
    btn.addEventListener('click', () => shareGame(game));
    card.appendChild(btn);
}

// --- Filters / Weights ---

function onFiltersChanged(filtered) {
    updateWeightInfo();
    if (filtered.length > 0 && carousel) {
        populateCarousel();
    }
}

function updateWeightInfo() {
    const el = $('#weightInfo');
    if (el) el.textContent = getWeightInfoText();
}

function toggleRatingSlider() {
    const wrapper = $('#ratingSliderWrapper');
    if (!wrapper) return;
    if (state.usePersonalRating) {
        show(wrapper);
    } else {
        hide(wrapper);
    }
}

// --- UI Helpers ---

function showCollectionStatus(message, type) {
    const el = $('#collectionStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `collection-status ${type}`;
    el.style.display = 'block';

    // Auto-hide non-errors
    if (type === 'success') {
        setTimeout(() => {
            if (el.textContent === message) el.style.display = 'none';
        }, 5000);
    }
}

function toggleLoadingState(loading) {
    const btn = $('#fetchCollection');
    const spinner = btn?.querySelector('.spinner');
    const text = btn?.querySelector('.btn-text');

    if (loading) {
        if (btn) btn.disabled = true;
        if (spinner) show(spinner);
        if (text) text.textContent = 'Syncing...';
    } else {
        if (btn) btn.disabled = false;
        if (spinner) hide(spinner);
        if (text) text.textContent = 'Sync Collection';
    }
}

function showGameSection() {
    const section = $('#gameSection');
    if (section) {
        show(section);
        section.classList.add('fade-in');
    }
    ['toggleTable', 'syncPlays', 'fullSync'].forEach(id => {
        const el = $(`#${id}`);
        if (el) el.style.display = 'inline-flex';
    });
}

function refreshTableIfVisible() {
    const container = $('#collectionTableContainer');
    if (container && !container.classList.contains('hidden')) {
        populateTable();
    }
}

function validateUsernameAndUpdateButtons() {
    const username = $('#bggUsername')?.value.trim();
    const has = username && username.length > 0;

    ['fetchCollection', 'syncPlays', 'fullSync'].forEach(id => {
        const btn = $(`#${id}`);
        if (btn) btn.disabled = !has;
    });

    // Display user info if backend is available
    if (has && window.apiClient?.hasBackend) {
        displayUserInfo(username);
    } else {
        hide($('#userInfo'));
    }
}

async function displayUserInfo(username) {
    if (!window.apiClient?.hasBackend) return;

    try {
        const info = await window.apiClient.getUserInfo(username);
        const container = $('#userInfo');
        const status = $('#userSyncStatus');
        if (!container || !status) return;

        if (info?.exists) {
            let syncText = info.last_full_sync
                ? `Last full sync: ${formatDateForDisplay(new Date(info.last_full_sync))}`
                : 'No full sync yet';

            status.textContent = '';
            status.appendChild(createElement('span', { className: 'username-display', textContent: escapeHtml(info.username) }));
            status.appendChild(createElement('span', { className: 'sync-date', textContent: syncText }));
            show(container);
        } else if (info && !info.exists) {
            status.textContent = '';
            status.appendChild(createElement('span', { className: 'username-display', textContent: escapeHtml(username) }));
            status.appendChild(createElement('span', { className: 'sync-date', textContent: 'New user - ready for first sync' }));
            show(container);
        } else {
            hide(container);
        }
    } catch (err) {
        error('Error fetching user info:', err);
        hide($('#userInfo'));
    }
}

// --- Data Loading ---

async function loadSavedData() {
    const data = await cache.loadCollection();
    if (!data) return;

    const oneDay = 24 * 60 * 60 * 1000;
    const cacheValid = isLocalDevelopment || (Date.now() - data.timestamp < oneDay);

    if (cacheValid && data.username) {
        setState('games', data.games || []);
        setState('currentUsername', data.username);

        const usernameInput = $('#bggUsername');
        if (usernameInput) usernameInput.value = data.username;

        setDevDefaults();

        const ageHours = Math.floor((Date.now() - data.timestamp) / (60 * 60 * 1000));
        const cacheInfo = isLocalDevelopment
            ? `Loaded ${state.games.length} games from cache for ${data.username} (offline mode)`
            : `Loaded ${state.games.length} games from cache for ${data.username} (${ageHours}h ago)`;

        showCollectionStatus(cacheInfo, 'success');
        showGameSection();
        applyFilters();
    } else if (!cacheValid) {
        showCollectionStatus('Cache expired (24h), please re-sync', 'error');
        await cache.clearAll();
    }
}

function setDevDefaults() {
    if (!isLocalDevelopment) return;
    const gameType = $('#gameType');
    if (gameType && gameType.value === '') {
        gameType.value = 'owned';
    }
}

// --- URL Parameters ---

function handleUrlParameters() {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game');
    const action = params.get('action');

    if (action === 'quick-roll' && state.games.length > 0) {
        setTimeout(rollDice, 1000);
    }

    if (gameId && state.games.length > 0) {
        const game = state.games.find(g => g.id === gameId);
        if (game) setTimeout(() => displaySelectedGame(game), 1000);
    }
}

// --- Version Display ---

function setupVersionDisplay() {
    const footer = $('footer p, .footer p');
    if (footer) {
        const span = createElement('span', { className: 'version-info' });
        span.innerHTML = ` &bull; <strong>v${state.version}</strong>`;
        footer.appendChild(span);
    }
    window.boardGamePickerVersion = state.version;
}

// --- Developer Panel ---

function setupDevPanel() {
    if (!isLocalDevelopment) return;

    const devPanel = $('#devPanel');
    if (devPanel) show(devPanel);

    const input = $('#bggUsername');
    if (input && !input.value) {
        input.value = 'flapJ4cks';
        input.placeholder = 'flapJ4cks (dev default)';
    }

    validateUsernameAndUpdateButtons();
    updateDevPanelInfo();
    _devPanelIntervalId = setInterval(updateDevPanelInfo, 5000);
}

function updateDevPanelInfo() {
    const el = $('#devPanelInfo');
    if (!el) return;

    const info = [];
    info.push(`<strong>Local Development Mode</strong> <code>v${state.version}</code>`);

    if (state.games.length > 0) {
        info.push(`Cache: <code>${state.games.length} games</code> for <code>${escapeHtml(state.currentUsername)}</code>`);
    } else {
        info.push('Cache: <code>Empty</code>');
    }

    info.push(`Default user: <code>flapJ4cks</code>`);
    info.push(`Default filter: <code>Owned games only</code>`);

    // Rate limit status
    if (state.lastApiRequest > 0) {
        const remaining = state.minimumApiInterval - (Date.now() - state.lastApiRequest);
        if (remaining > 0) {
            info.push(`Rate limit: <code style="color: #ef4444;">${Math.ceil(remaining / 1000)}s cooldown</code>`);
        } else {
            info.push('Rate limit: <code style="color: #10b981;">Ready</code>');
        }
    }

    el.innerHTML = info.join('<br>');
}

function devClearCache() {
    if (!confirm('Clear all cached BGG data?')) return;
    cache.clearAll();
    localStorage.removeItem('bgg-collection-data');
    setState('games', []);
    setState('filteredGames', []);
    setState('currentUsername', '');
    const input = $('#bggUsername');
    if (input) input.value = '';
    hide($('#gameSection'));
    hide($('#gameCard'));
    showCollectionStatus('', '');
    updateDevPanelInfo();
}

function devRefreshCache() {
    if (!state.currentUsername) {
        alert('No username set.');
        return;
    }
    if (!confirm(`Force re-sync for ${state.currentUsername}?`)) return;
    cache.clearAll();
    localStorage.removeItem('bgg-collection-data');
    setState('games', []);
    setState('filteredGames', []);
    hide($('#gameSection'));
    hide($('#gameCard'));
    fetchUserCollection(true);
}

function devViewCache() {
    const data = localStorage.getItem('bgg-collection-data');
    if (data) {
        const parsed = JSON.parse(data);
        group('BGG Cache Data');
        log('Username:', parsed.username);
        log('Games:', parsed.games.length);
        log('Cached:', new Date(parsed.timestamp));
        log('Data:', parsed);
        groupEnd();
        alert(`Cache: ${parsed.games.length} games for ${parsed.username}\nSee console for details.`);
    } else {
        alert('No cache data found.');
    }
}

function devTestAPIDialog() {
    const username = prompt('Enter BGG username to test:', $('#bggUsername')?.value || 'flapJ4cks');
    if (!username) return;
    log(`Testing BGG API for: ${username}`);
    alert(`Testing BGG API for "${username}". Check console (F12).`);
}

// --- Debug API (replaces window.debugBGP) ---

window.debugBGP = {
    clearCache: () => { cache.clearAll(); localStorage.removeItem('bgg-collection-data'); location.reload(); },
    getCache: () => { const d = localStorage.getItem('bgg-collection-data'); return d ? JSON.parse(d) : null; },
    clearIndexedDB: () => { cache.clearAll(); location.reload(); },
    getIndexedDBData: () => cache.loadCollection(),
    setCustomProxy: (url) => { localStorage.setItem('bgg-custom-proxy-url', url); log(`Custom proxy: ${url} (reload to apply)`); },
    clearPlayCache: () => { cache.clear('playData'); log('Play cache cleared'); },
};

// --- Expose settings for backwards compat ---
window.boardGamePickerInstance = {
    showAdvancedSettings: showSettings,
    showAnalyticsDashboard: showAnalytics,
    exportCollection,
    checkAllProxyHealth: () => import('./modules/api-proxy.js').then(m => m.checkAllProxyHealth()),
};

// --- Bootstrap ---

document.addEventListener('DOMContentLoaded', init);
