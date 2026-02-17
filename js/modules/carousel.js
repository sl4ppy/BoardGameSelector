// Pure vanilla JS Cover Flow carousel — replaces jQuery Flipster
import { bus, Events } from './events.js';
import { createElement, escapeHtml } from './dom.js';
import { log } from './logger.js';

export class GameCarousel {
    constructor(container) {
        this.container = container;
        this.track = container.querySelector('.carousel-track');
        this.items = [];
        this.games = [];
        this.currentIndex = 0;
        this.isSpinning = false;
        this._selectedGame = null;
        this._initTouch();
    }

    populate(games) {
        this.games = games;
        this.track.innerHTML = '';
        this.items = games.map((game, i) => {
            const item = createElement('div', {
                className: 'carousel-item',
                dataset: { index: String(i), gameId: game.id },
            }, [
                this._createCover(game),
            ]);
            this.track.appendChild(item);
            return item;
        });
        if (games.length > 0) {
            this.goTo(Math.floor(games.length / 2), false);
        }
        this.container.classList.remove('hidden');
    }

    _createCover(game) {
        if (game.thumbnail || game.image) {
            const img = createElement('img', {
                src: game.thumbnail || game.image,
                alt: `Cover art for ${escapeHtml(game.name)}`,
                loading: 'lazy',
            });
            img.onerror = () => {
                img.replaceWith(this._createPlaceholder(game));
            };
            return img;
        }
        return this._createPlaceholder(game);
    }

    _createPlaceholder(game) {
        return createElement('div', {
            className: 'carousel-placeholder',
            textContent: game.name,
        });
    }

    goTo(index, animate = true) {
        this.currentIndex = ((index % this.items.length) + this.items.length) % this.items.length;
        this._updatePositions(animate);
    }

    _updatePositions(animate = true) {
        const len = this.items.length;
        if (len === 0) return;

        this.items.forEach((item, i) => {
            // Calculate shortest distance (wrapping)
            let offset = i - this.currentIndex;
            if (offset > len / 2) offset -= len;
            if (offset < -len / 2) offset += len;

            const absOffset = Math.abs(offset);
            const scale = Math.max(0.55, 1 - absOffset * 0.15);
            const translateX = offset * 130;
            const translateZ = -absOffset * 100;
            const rotateY = offset * -30;
            const opacity = Math.max(0.2, 1 - absOffset * 0.25);
            const zIndex = 100 - absOffset;

            if (animate) {
                item.style.transition = 'all 180ms ease-out';
            } else {
                item.style.transition = 'none';
            }

            item.style.transform = `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
            item.style.opacity = opacity;
            item.style.zIndex = zIndex;
            item.classList.toggle('active', i === this.currentIndex);

            // Hide items far from center for performance
            item.style.visibility = absOffset > 6 ? 'hidden' : 'visible';
        });
    }

    /** Spin to a target game index with easing */
    async spin(targetIndex, onComplete) {
        if (this.isSpinning || this.items.length === 0) return;
        this.isSpinning = true;
        this.container.classList.add('spinning');
        this._selectedGame = this.games[targetIndex] || null;

        const len = this.items.length;

        // Calculate number of steps: at least 1.5 full rotations + path to target
        let forwardDist = ((targetIndex - this.currentIndex) % len + len) % len;
        const totalSteps = len + forwardDist + Math.floor(Math.random() * Math.floor(len / 2));

        for (let step = 0; step < totalSteps; step++) {
            const progress = step / totalSteps;
            // Cubic ease-out: fast start, slow finish
            const delay = 25 + Math.pow(progress, 2.5) * 350;

            await new Promise(r => setTimeout(r, delay));
            this.currentIndex = (this.currentIndex + 1) % len;
            this._updatePositions(true);
        }

        // Final snap to exact target
        this.goTo(targetIndex, true);

        this.isSpinning = false;
        this.container.classList.remove('spinning');

        bus.emit(Events.CAROUSEL_COMPLETE, this._selectedGame);
        onComplete?.(this._selectedGame);
    }

    /** Get the currently centered game */
    getCenterGame() {
        return this.games[this.currentIndex] || null;
    }

    _initTouch() {
        let startX = 0;
        let isDragging = false;

        this.container.addEventListener('touchstart', (e) => {
            if (this.isSpinning) return;
            startX = e.touches[0].clientX;
            isDragging = true;
        }, { passive: true });

        this.container.addEventListener('touchmove', (e) => {
            if (!isDragging || this.isSpinning) return;
            const dx = e.touches[0].clientX - startX;
            if (Math.abs(dx) > 40) {
                this.goTo(this.currentIndex + (dx > 0 ? -1 : 1));
                startX = e.touches[0].clientX;
            }
        }, { passive: true });

        this.container.addEventListener('touchend', () => {
            isDragging = false;
        }, { passive: true });

        // Mouse wheel navigation
        this.container.addEventListener('wheel', (e) => {
            if (this.isSpinning) return;
            e.preventDefault();
            this.goTo(this.currentIndex + (e.deltaY > 0 ? 1 : -1));
        }, { passive: false });

        // Click on items to navigate
        this.container.addEventListener('click', (e) => {
            if (this.isSpinning) return;
            const item = e.target.closest('.carousel-item');
            if (item) {
                const idx = parseInt(item.dataset.index);
                if (!isNaN(idx)) this.goTo(idx);
            }
        });
    }

    destroy() {
        this.track.innerHTML = '';
        this.items = [];
        this.games = [];
    }
}
