// Board Game Picker Service Worker
const CACHE_NAME = 'bgg-picker-v1.6.0';
const STATIC_CACHE = 'bgg-picker-static-v1.6.0';

// Files to cache for offline functionality
const STATIC_FILES = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];

// BGG API patterns to cache
const BGG_API_PATTERNS = [
    /^https:\/\/boardgamegeek\.com\/xmlapi2\//,
    /^https:\/\/api\.allorigins\.win\//,
    /^https:\/\/thingproxy\.freeboard\.io\//,
    /^https:\/\/api\.codetabs\.com\//,
    /^https:\/\/corsproxy\.io\//
];

self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('Caching static files...');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('Service Worker installed successfully');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker installation failed:', error);
            })
    );
});

self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker activated');
                return self.clients.claim();
            })
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // Handle different types of requests
    if (request.method === 'GET') {
        // Static files - cache first strategy
        if (isStaticFile(url)) {
            event.respondWith(cacheFirst(request));
        }
        // BGG API calls - network first with cache fallback
        else if (isBGGApiCall(url)) {
            event.respondWith(networkFirstWithCache(request));
        }
        // Other requests - network first
        else {
            event.respondWith(networkFirst(request));
        }
    }
});

// Cache first strategy for static files
async function cacheFirst(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        const networkResponse = await fetch(request);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, networkResponse.clone());
        return networkResponse;
    } catch (error) {
        console.error('Cache first failed:', error);
        return new Response('Offline - Resource not available', { status: 503 });
    }
}

// Network first with cache fallback for API calls
async function networkFirstWithCache(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Cache successful API responses
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('Network failed, trying cache:', error.message);
        
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            // Add offline indicator header
            const offlineResponse = cachedResponse.clone();
            offlineResponse.headers.set('X-Served-From', 'cache');
            return offlineResponse;
        }
        
        return new Response(
            JSON.stringify({ 
                error: 'Offline - No cached data available',
                offline: true 
            }), 
            { 
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// Network first strategy
async function networkFirst(request) {
    try {
        return await fetch(request);
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        return new Response('Offline - Resource not available', { status: 503 });
    }
}

// Utility functions
function isStaticFile(url) {
    const pathname = url.pathname;
    return pathname === '/' || 
           pathname.endsWith('.html') ||
           pathname.endsWith('.css') ||
           pathname.endsWith('.js') ||
           pathname.endsWith('.json') ||
           pathname.includes('fonts.googleapis.com');
}

function isBGGApiCall(url) {
    return BGG_API_PATTERNS.some(pattern => pattern.test(url.href));
}

// Handle background sync for when connection is restored
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
        console.log('Background sync triggered');
        event.waitUntil(syncData());
    }
});

async function syncData() {
    // Attempt to sync any pending operations when back online
    console.log('Syncing data...');
    
    // Clear old cache entries
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    
    // Remove entries older than 24 hours
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    
    for (const request of requests) {
        const response = await cache.match(request);
        const date = response.headers.get('date');
        
        if (date && new Date(date).getTime() < oneDayAgo) {
            await cache.delete(request);
        }
    }
}

// Handle push notifications (for future use)
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        
        const options = {
            body: data.body,
            icon: './icon-192.png',
            badge: './badge-72.png',
            vibrate: [100, 50, 100],
            data: data.data,
            actions: [
                {
                    action: 'open',
                    title: 'Open App'
                },
                {
                    action: 'close',
                    title: 'Dismiss'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open' || !event.action) {
        event.waitUntil(
            clients.openWindow('./')
        );
    }
});

// Periodic background sync for updating collections
self.addEventListener('periodicsync', event => {
    if (event.tag === 'update-collection') {
        event.waitUntil(updateCollectionInBackground());
    }
});

async function updateCollectionInBackground() {
    console.log('Running periodic collection update...');
    // This would trigger a collection refresh if the user is logged in
    // and the cache is getting stale
}