// CORS proxy management, health tracking, and API request handling
import { state } from './state.js';
import { bus, Events } from './events.js';
import { log, error, warn } from './logger.js';

const BGG_API_BASE = 'https://boardgamegeek.com/xmlapi2';

const CORS_PROXIES = [
    { url: 'https://api.allorigins.win/get?url=', name: 'AllOrigins', jsonResponse: true, encode: true },
    { url: 'https://thingproxy.freeboard.io/fetch/', name: 'ThingProxy', encode: false },
    { url: 'https://api.codetabs.com/v1/proxy?quest=', name: 'CodeTabs', encode: true },
    { url: 'https://corsproxy.io/?', name: 'CORSProxy.io', encode: true },
    { url: 'https://cors-proxy.htmldriven.com/?url=', name: 'HTMLDriven', encode: true },
    { url: 'https://proxy.cors.sh/', name: 'CORS.sh', encode: false },
    { url: 'https://cors.bridged.cc/', name: 'Bridged', encode: false },
    { url: 'https://cors-anywhere.herokuapp.com/', name: 'CORS-Anywhere', encode: false },
];

// Proxy health tracking
const proxyHealth = new Map();
let _healthCheckIntervalId = null;
const HEALTH_CHECK_INTERVAL = 300000; // 5 minutes

// Request queue
const requestQueue = [];
let activeRequests = 0;
const MAX_CONCURRENT = 2;

export { BGG_API_BASE };

/** Initialize proxy health from localStorage and start periodic checks */
export function initProxyHealth() {
    const saved = localStorage.getItem('bgg-proxy-health');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            for (const [k, v] of Object.entries(data)) proxyHealth.set(k, v);
        } catch (e) {
            error('Failed to load proxy health:', e);
        }
    }
    _healthCheckIntervalId = setInterval(checkAllProxyHealth, HEALTH_CHECK_INTERVAL);
}

/** Stop health check interval */
export function destroyProxyHealth() {
    if (_healthCheckIntervalId) {
        clearInterval(_healthCheckIntervalId);
        _healthCheckIntervalId = null;
    }
}

/** Make an API request through CORS proxies with automatic failover */
export async function makeApiRequest(url, retryCount = 0) {
    const maxRetries = 3;
    const proxies = getOrderedProxies();

    for (let i = 0; i < proxies.length; i++) {
        const proxy = proxies[i];

        if (isProxyUnhealthy(proxy.name)) {
            log(`Skipping unhealthy proxy: ${proxy.name}`);
            continue;
        }

        const fullUrl = proxy.url + (proxy.encode !== false ? encodeURIComponent(url) : url);

        try {
            bus.emit(Events.STATUS_UPDATE, { message: `Connecting via ${proxy.name} proxy...`, type: 'loading' });

            const headers = { 'Accept': 'application/json, text/plain, */*' };
            if (!proxy.url.includes('allorigins.win')) {
                headers['User-Agent'] = `BoardGamePicker/${state.version}`;
            }

            const fetchOpts = {
                method: 'GET',
                headers,
                ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(30000) } : {}),
            };

            const response = await fetch(fullUrl, fetchOpts);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
            }

            let responseText;
            if (proxy.jsonResponse || proxy.url.includes('allorigins.win')) {
                const clone = response.clone();
                try {
                    const json = await response.json();
                    responseText = json.contents || json.data || json.body;
                } catch {
                    responseText = await clone.text();
                }
            } else {
                responseText = await response.text();
            }

            if (!responseText || responseText.length === 0) {
                throw new Error('Empty response body');
            }

            updateProxyHealth(proxy.name, true);
            return responseText;

        } catch (err) {
            error(`${proxy.name} failed:`, err.message);
            updateProxyHealth(proxy.name, false);

            if (i < proxies.length - 1) continue;

            if (retryCount < maxRetries - 1) {
                const delay = Math.pow(2, retryCount) * 1000;
                log(`Retrying in ${delay / 1000}s...`);
                await new Promise(r => setTimeout(r, delay));
                return makeApiRequest(url, retryCount + 1);
            }

            throw new Error(`All CORS proxies failed after ${maxRetries} attempts. Latest: ${err.message}`);
        }
    }

    throw new Error('All CORS proxies failed');
}

/** Queue a request to limit concurrency */
export function queueRequest(fn) {
    return new Promise((resolve, reject) => {
        requestQueue.push({ fn, resolve, reject });
        processQueue();
    });
}

function processQueue() {
    while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT) {
        const req = requestQueue.shift();
        activeRequests++;
        req.fn()
            .then(req.resolve)
            .catch(req.reject)
            .finally(() => {
                activeRequests--;
                processQueue();
            });
    }
}

/** Check health of all proxies */
export async function checkAllProxyHealth() {
    log('Running proxy health check...');
    const testUrl = `${BGG_API_BASE}/thing?id=13&type=boardgame`;

    for (const proxy of CORS_PROXIES) {
        try {
            const response = await fetch(proxy.url + (proxy.encode !== false ? encodeURIComponent(testUrl) : testUrl), {
                method: 'GET',
                ...(typeof AbortSignal.timeout === 'function' ? { signal: AbortSignal.timeout(10000) } : {}),
            });
            updateProxyHealth(proxy.name, response.ok);
        } catch {
            updateProxyHealth(proxy.name, false);
        }
    }
}

/** Get proxy health data for display */
export function getProxyHealthData() {
    return new Map(proxyHealth);
}

// --- Internal helpers ---

function getOrderedProxies() {
    const list = [...CORS_PROXIES];
    if (state.customProxyUrl) {
        list.unshift({ url: state.customProxyUrl, name: 'Custom Proxy' });
    }
    return list.sort((a, b) => {
        if (a.name === 'Custom Proxy') return -1;
        if (b.name === 'Custom Proxy') return 1;
        const ha = proxyHealth.get(a.name);
        const hb = proxyHealth.get(b.name);
        if (!ha && !hb) return 0;
        if (!ha) return 1;
        if (!hb) return -1;
        return (hb.successRate || 0) - (ha.successRate || 0);
    });
}

function updateProxyHealth(name, success) {
    const h = proxyHealth.get(name) || {
        successCount: 0, failureCount: 0, lastCheck: Date.now(),
        lastSuccess: null, consecutiveFailures: 0,
    };

    if (success) {
        h.successCount++;
        h.lastSuccess = Date.now();
        h.consecutiveFailures = 0;
    } else {
        h.failureCount++;
        h.consecutiveFailures++;
    }

    h.lastCheck = Date.now();
    h.successRate = h.successCount / (h.successCount + h.failureCount);
    proxyHealth.set(name, h);

    // Persist
    localStorage.setItem('bgg-proxy-health', JSON.stringify(Object.fromEntries(proxyHealth)));
}

function isProxyUnhealthy(name) {
    const h = proxyHealth.get(name);
    if (!h) return false;
    const oneHourAgo = Date.now() - 3600000;
    return h.consecutiveFailures >= 5
        || (h.successRate < 0.2 && (h.successCount + h.failureCount) >= 10)
        || (h.lastSuccess && h.lastSuccess < oneHourAgo);
}
