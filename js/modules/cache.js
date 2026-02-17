// IndexedDB + localStorage caching abstraction
import { log, error } from './logger.js';

const DB_NAME = 'BoardGamePickerDB';
const DB_VERSION = 1;

let db = null;

/** Initialize IndexedDB */
export async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            error('IndexedDB open failed:', request.error);
            resolve(false);
        };

        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains('collection')) {
                database.createObjectStore('collection', { keyPath: 'id' });
            }
            if (!database.objectStoreNames.contains('playData')) {
                database.createObjectStore('playData', { keyPath: 'cacheKey' });
            }
            if (!database.objectStoreNames.contains('gameDetails')) {
                database.createObjectStore('gameDetails', { keyPath: 'id' });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            log('IndexedDB initialized');
            resolve(true);
        };
    });
}

/** Save data to IndexedDB */
export async function save(storeName, data) {
    if (!db) return false;
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.put(data);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => {
                error(`IndexedDB save error [${storeName}]:`, tx.error);
                reject(tx.error);
            };
        } catch (e) {
            error('IndexedDB transaction error:', e);
            reject(e);
        }
    });
}

/** Get data from IndexedDB */
export async function get(storeName, key) {
    if (!db) return null;
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = key ? store.get(key) : store.getAll();
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => {
                error(`IndexedDB get error [${storeName}]:`, request.error);
                resolve(null);
            };
        } catch (e) {
            error('IndexedDB read error:', e);
            resolve(null);
        }
    });
}

/** Clear an IndexedDB store */
export async function clear(storeName) {
    if (!db) return;
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        } catch (e) {
            resolve(); // Fail silently
        }
    });
}

/** Clear all IndexedDB stores */
export async function clearAll() {
    if (!db) return;
    await Promise.all([clear('collection'), clear('playData'), clear('gameDetails')]);
}

/** Save collection to IndexedDB with localStorage fallback */
export async function saveCollection(username, games, version) {
    const data = {
        id: 'main',
        username,
        games,
        timestamp: Date.now(),
        version,
    };

    if (db) {
        try {
            await save('collection', data);
            log('Collection saved to IndexedDB');
            return;
        } catch (e) {
            error('IndexedDB fallback to localStorage:', e);
        }
    }

    // Fallback
    localStorage.setItem('bgg-collection-data', JSON.stringify(data));
    log('Collection saved to localStorage');
}

/** Load collection from IndexedDB with localStorage fallback */
export async function loadCollection() {
    // Try IndexedDB first
    if (db) {
        try {
            const data = await get('collection', 'main');
            if (data) return data;
        } catch (e) {
            error('IndexedDB load error:', e);
        }
    }

    // Fallback to localStorage
    const saved = localStorage.getItem('bgg-collection-data');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch (e) {
            error('localStorage parse error:', e);
        }
    }

    return null;
}

/** Check if play data cache is valid (< 1 week old) */
export function isPlayDataValid(cachedData) {
    if (!cachedData || !cachedData.timestamp) return false;
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - cachedData.timestamp) < oneWeek;
}

export function getDB() { return db; }
