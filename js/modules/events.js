// Lightweight event bus for inter-module communication
class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        const listeners = this._listeners.get(event);
        if (listeners) listeners.delete(callback);
    }

    emit(event, data) {
        const listeners = this._listeners.get(event);
        if (listeners) {
            for (const cb of listeners) {
                try { cb(data); } catch (e) { console.error(`Event handler error [${event}]:`, e); }
            }
        }
    }
}

export const bus = new EventBus();

// Event name constants
export const Events = {
    COLLECTION_LOADED: 'collection:loaded',
    FILTERS_CHANGED: 'filters:changed',
    GAME_SELECTED: 'game:selected',
    STATUS_UPDATE: 'status:update',
    CAROUSEL_COMPLETE: 'carousel:spin-complete',
    LOADING_STATE: 'loading:state',
};
