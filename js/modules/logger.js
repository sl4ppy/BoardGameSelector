// Dev-only logging — silent in production
const isDev = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.protocol === 'file:';

export const log = isDev ? console.log.bind(console) : () => {};
export const warn = isDev ? console.warn.bind(console) : () => {};
export const error = console.error.bind(console); // Always log errors
export const group = isDev ? console.group.bind(console) : () => {};
export const groupEnd = isDev ? console.groupEnd.bind(console) : () => {};
export { isDev as isLocalDevelopment };
