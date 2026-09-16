/**
 * Where the party server lives, for both the TV page and the phone pad.
 *
 * Self-hosted (`npm start`, Docker, LAN) the one Node process serves the pages and the socket, so the
 * socket is same-origin. On GitHub Pages the client is static files with no server behind them, so the
 * build sets `VITE_PARTY_ORIGIN` to the hosted server's HTTPS origin and the socket goes there instead.
 */
const configured = (import.meta.env.VITE_PARTY_ORIGIN ?? '').trim();

export const partyOrigin = (): string => configured || location.origin;

/** `https://host` becomes `wss://host/ws`, `http://host` becomes `ws://host/ws`. */
export const partySocketUrl = (): string => `${partyOrigin().replace(/^http/, 'ws')}/ws`;

/** The phone page always comes from wherever this page came from, including a Pages subpath. */
export const padUrl = (code: string, host = location.host): string =>
  `${location.protocol}//${host}${import.meta.env.BASE_URL}pad.html?room=${code}`;
