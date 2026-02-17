// Central application state with subscription support

const _subscribers = new Map();

export const state = {
    games: [],
    filteredGames: [],
    currentUsername: '',
    isLoading: false,
    currentWeightingMethod: 'random',
    usePersonalRating: false,
    minPersonalRating: 5,
    includeUnrated: true,
    version: '2.0.0',
    lastApiRequest: 0,
    minimumApiInterval: 60000,
    customProxyUrl: localStorage.getItem('bgg-custom-proxy-url') || '',
};

export const isLocalDevelopment = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.protocol === 'file:';

/** Update state and notify subscribers */
export function setState(key, value) {
    if (state[key] === value) return;
    state[key] = value;
    const subs = _subscribers.get(key);
    if (subs) {
        for (const cb of subs) {
            try { cb(value, key); } catch (e) { console.error(`State subscriber error [${key}]:`, e); }
        }
    }
}

/** Subscribe to state changes for a key */
export function subscribe(key, callback) {
    if (!_subscribers.has(key)) _subscribers.set(key, new Set());
    _subscribers.get(key).add(callback);
    return () => _subscribers.get(key).delete(callback);
}
