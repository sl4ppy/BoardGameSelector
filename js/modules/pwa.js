// PWA support: service worker, install prompt, online/offline
import { bus, Events } from './events.js';
import { log, error } from './logger.js';
import { createElement } from './dom.js';

let _swUpdateIntervalId = null;
let _deferredPrompt = null;

/** Initialize all PWA functionality */
export async function initPWA() {
    await registerServiceWorker();
    listenForInstallPrompt();
    listenForOnlineStatus();
}

/** Clean up intervals */
export function destroyPWA() {
    if (_swUpdateIntervalId) {
        clearInterval(_swUpdateIntervalId);
        _swUpdateIntervalId = null;
    }
}

// --- Service Worker ---

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        log('Service Worker registered:', registration.scope);

        registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateNotification();
                }
            });
        });

        // Check for updates hourly
        _swUpdateIntervalId = setInterval(() => registration.update(), 3600000);
    } catch (err) {
        error('Service Worker registration failed:', err);
    }
}

function showUpdateNotification() {
    const notification = createElement('div', { className: 'update-notification' }, [
        createElement('div', { className: 'update-content' }, [
            createElement('p', { textContent: 'A new version is available!' }),
        ]),
    ]);

    const updateBtn = createElement('button', { className: 'btn-primary', textContent: 'Update Now' });
    updateBtn.addEventListener('click', () => window.location.reload());
    notification.querySelector('.update-content').appendChild(updateBtn);

    const laterBtn = createElement('button', { className: 'btn-secondary', textContent: 'Later' });
    laterBtn.addEventListener('click', () => notification.remove());
    notification.querySelector('.update-content').appendChild(laterBtn);

    document.body.appendChild(notification);
}

// --- Install Prompt ---

function listenForInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        _deferredPrompt = e;
        showInstallButton();
    });

    window.addEventListener('appinstalled', () => {
        log('PWA installed successfully');
        _deferredPrompt = null;
        hideInstallButton();
    });
}

function showInstallButton() {
    const header = document.querySelector('.header, .site-header');
    if (!header) return;

    const btn = createElement('button', { className: 'install-prompt', textContent: 'Install App' });
    btn.addEventListener('click', promptInstall);
    header.appendChild(btn);
}

function hideInstallButton() {
    document.querySelector('.install-prompt')?.remove();
}

async function promptInstall() {
    if (!_deferredPrompt) return;
    _deferredPrompt.prompt();
    const result = await _deferredPrompt.userChoice;
    log(`Install prompt ${result.outcome}`);
    _deferredPrompt = null;
    hideInstallButton();
}

// --- Online/Offline ---

function listenForOnlineStatus() {
    window.addEventListener('online', () => {
        bus.emit(Events.STATUS_UPDATE, { message: 'Back online! Data will sync automatically.', type: 'success' });
        document.body.classList.remove('offline');
    });

    window.addEventListener('offline', () => {
        bus.emit(Events.STATUS_UPDATE, { message: "You're offline. Some features may be limited.", type: 'warning' });
        document.body.classList.add('offline');
    });
}
