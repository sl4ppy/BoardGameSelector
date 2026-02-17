// Safe DOM utilities

const _escapeEl = document.createElement('div');

/** Escape HTML entities to prevent XSS */
export function escapeHtml(str) {
    if (str == null) return '';
    _escapeEl.textContent = String(str);
    return _escapeEl.innerHTML;
}

/** querySelector shorthand */
export function $(selector, parent = document) {
    return parent.querySelector(selector);
}

/** querySelectorAll shorthand */
export function $$(selector, parent = document) {
    return parent.querySelectorAll(selector);
}

/** Create an element with attributes and children */
export function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') el.className = value;
        else if (key === 'textContent') el.textContent = value;
        else if (key === 'innerHTML') el.innerHTML = value; // Use only with safe strings
        else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        }
        else if (key === 'dataset') {
            for (const [dk, dv] of Object.entries(value)) el.dataset[dk] = dv;
        }
        else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        }
        else el.setAttribute(key, value);
    }
    for (const child of children) {
        if (typeof child === 'string') el.appendChild(document.createTextNode(child));
        else if (child instanceof Node) el.appendChild(child);
    }
    return el;
}

/** Show an element by removing the hidden class */
export function show(el) {
    if (el) el.classList.remove('hidden');
}

/** Hide an element by adding the hidden class */
export function hide(el) {
    if (el) el.classList.add('hidden');
}

/** Debounce a function */
export function debounce(fn, ms = 150) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}
