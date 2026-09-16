/**
 * Party server (ADR 008): one Node process is the authority. Serves the built client from dist/, accepts
 * WebSockets on /ws, runs each room's race runner on a timer and streams 30 Hz snapshots to displays.
 * Usage: `npm start` (builds, then serves) or `npm run server` next to `npm run dev` (Vite proxies /ws).
 */
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { BOT_LEVELS, TICK_MS } from '../shared/config.ts';
import type { RaceEvent, RaceState } from '../shared/race.ts';
import { applyInput, createRoom, disconnectSeat, joinRoom, leaveSeat, parseClientMessage, seatInputs, setReady, type Room } from '../shared/room.ts';
import { createRaceRunner, type RaceRunner } from '../shared/runner.ts';
import { applyRace, botShop, buy, createSeries, statsFor, type Series } from '../shared/series.ts';
import { parseTrack, type Track } from '../shared/track.ts';

/** 8787 is Cloudflare wrangler's default and often taken; without an explicit PORT the server walks up to the next free port. */
const PORT = Number(process.env.PORT ?? 8790);
/** Where the chosen port is written so `npm run dev` proxies /ws to the right place. */
export const PORT_FILE = 'node_modules/.fuse-party-port';
const DIST = resolve('dist');
const MAX_ROOMS = 100, MAX_MSGS_PER_SEC = 60, ROOM_IDLE_MS = 10 * 60_000, SHOP_MS = 30_000, RESULTS_DELAY_MS = 2500;

const tracks: Record<string, Track> = Object.fromEntries(
  readdirSync('tracks').filter((f) => f.endsWith('.tmj')).map((f) => { const n = f.slice(0, -4); return [n, parseTrack(JSON.parse(readFileSync(join('tracks', f), 'utf8')), n)]; }),
);

type Phase = 'lobby' | 'race' | 'results' | 'shop';
interface Party {
  room: Room;
  key: string;
  phase: Phase;
  hosts: Set<WebSocket>;
  pads: Map<WebSocket, number>;
  created: number;
  lastActive: number;
  series?: Series;
  runner?: RaceRunner;
  trackName?: string;
  final?: RaceState;
  lastSentTick: number;
  events: RaceEvent[];
  resultsAt: number;
  shopUntil: number;
  /** Seats that had a phone when the current race started; the others are bots until the next race. */
  raceSlots: Set<number>;
}
const parties = new Map<string, Party>();

const send = (ws: WebSocket, msg: unknown) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
const toHosts = (p: Party, msg: unknown) => { for (const h of p.hosts) send(h, msg); };
const token = () => randomBytes(12).toString('hex');
/** Room clock in ticks; input freshness is measured on it (ADR 008). */
const clock = (p: Party) => Math.floor((Date.now() - p.created) / TICK_MS);
const names = (p: Party) => Object.fromEntries(p.room.seats.map((s) => [s.slot, s.name]));
const seatsView = (p: Party) => p.room.seats.map((s) => ({ slot: s.slot, name: s.name, connected: s.connected, ready: s.ready }));

function newCode(): string {
  for (;;) {
    const code = Array.from(randomBytes(4), (b) => String.fromCharCode(65 + (b % 26))).join('');
    if (!parties.has(code)) return code;
  }
}

function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) return a.address;
  return 'localhost';
}

// A phone that joined mid-race waits: the runner's bots were fixed when the race started.
const padView = (p: Party, slot: number) => ({ t: 'phase', phase: p.phase === 'race' && !p.raceSlots.has(slot) ? 'lobby' : p.phase, slot, driver: p.series?.drivers[slot], shopUntil: p.phase === 'shop' ? p.shopUntil : 0, ready: p.room.seats.find((s) => s.slot === slot)?.ready ?? false });
const syncPads = (p: Party) => { for (const [ws, slot] of p.pads) send(ws, padView(p, slot)); };
const syncSeats = (p: Party) => toHosts(p, { t: 'seats', seats: seatsView(p) });
const phaseMessage = (p: Party) =>
  p.phase === 'race' && p.runner ? { t: 'race', series: p.series, track: p.trackName, state: p.runner.state, names: names(p) }
  : p.phase === 'results' ? { t: 'results', state: p.final, series: p.series, names: names(p) }
  : p.phase === 'shop' ? { t: 'shop', series: p.series, until: p.shopUntil, names: names(p), seats: seatsView(p) }
  : { t: 'lobby' };

function enter(p: Party, phase: Phase) {
  p.phase = phase;
  toHosts(p, phaseMessage(p));
  syncPads(p);
}

function startRace(p: Party) {
  const series = p.series!;
  const seated = new Set(p.room.seats.map((s) => s.slot));
  // Bots fill empty seats (ADR 008), using the single-player levels for slots 1..4.
  const bots = Object.fromEntries(series.drivers.filter((d) => !seated.has(d.slot)).map((d) => [d.slot, BOT_LEVELS[(d.slot + BOT_LEVELS.length - 1) % BOT_LEVELS.length]]));
  p.raceSlots = seated;
  p.trackName = series.tracks[series.raceIndex];
  p.runner = createRaceRunner(tracks[p.trackName], randomBytes(4).readUInt32LE(0), series.drivers.map((d) => statsFor(d.levels)), bots);
  p.final = undefined;
  p.events = [];
  p.lastSentTick = 0;
  p.resultsAt = 0;
  p.room = setReady(p.room, -1, false);
  enter(p, 'race');
}

function next(p: Party) {
  if (p.phase === 'shop') { startRace(p); return; }
  if (p.phase !== 'results' || !p.series) return;
  if (p.series.raceIndex >= p.series.tracks.length) { p.series = undefined; enter(p, 'lobby'); return; }
  const seated = new Set(p.room.seats.map((s) => s.slot));
  p.series = { ...p.series, drivers: p.series.drivers.map((d) => (seated.has(d.slot) ? d : botShop(d))) };
  p.shopUntil = Date.now() + SHOP_MS;
  enter(p, 'shop');
}

let last = Date.now();
setInterval(() => {
  const now = Date.now(), elapsed = now - last;
  last = now;
  for (const [code, p] of parties) {
    if (!p.hosts.size && !p.room.seats.some((s) => s.connected) && now - p.lastActive > ROOM_IDLE_MS) { parties.delete(code); continue; }
    if (p.phase === 'race' && p.runner) {
      const { state, events } = p.runner.advance(elapsed, seatInputs(p.room, clock(p)));
      p.events.push(...events);
      // Every tick (30 Hz): at 15 Hz a phone press waited up to a tick for the next snapshot and the TV drew two ticks behind.
      if (state.tick - p.lastSentTick >= 1) {
        toHosts(p, { t: 'snap', state, events: p.events });
        p.events = [];
        p.lastSentTick = state.tick;
      }
      if (state.phase === 'finished' && !p.final) { p.final = state; p.resultsAt = now + RESULTS_DELAY_MS; }
      if (p.final && now >= p.resultsAt) {
        p.series = applyRace(p.series!, p.final);
        p.runner = undefined;
        enter(p, 'results');
      }
    }
    const present = p.room.seats.filter((s) => s.connected);
    if (p.phase === 'shop' && (now >= p.shopUntil || (present.length && present.every((s) => s.ready)))) startRace(p);
  }
}, TICK_MS / 2);

const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let path: string;
  try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  // Hosting platforms poll this to know the process is up and how busy it is.
  // Cloud Run's frontend intercepts some paths ending in 'z', so /api/health is the public check.
  if (path === '/healthz' || path === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, rooms: parties.size })); return; }
  if (path === '/') path = '/index.html';
  if (path === '/pad') path = '/pad.html';
  const file = resolve(DIST, `.${path}`);
  if (!file.startsWith(DIST + sep) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});

// Browsers always send Origin: only pages served from this same host, or from an origin the host explicitly
// allows, may open a party socket. Pages serves the client from another origin, so that origin is listed there.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
const sameOrigin = (origin: string | undefined, host: string | undefined) => {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return u.host === host || ALLOWED_ORIGINS.includes(u.origin);
  } catch { return false; }
};
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024, verifyClient: ({ origin, req }: { origin: string; req: { headers: { host?: string } } }) => sameOrigin(origin, req.headers.host) });
// An oversized or malformed frame emits 'error'; without a listener Node would crash and end every room.
wss.on('error', (e: NodeJS.ErrnoException) => { if (e.code !== 'EADDRINUSE') console.error('socket server:', e.message); });
wss.on('connection', (ws) => {
  ws.on('error', () => ws.terminate());
  let party: Party | undefined, role: 'host' | 'pad' | undefined, slot = -1;
  let windowStart = Date.now(), count = 0;
  ws.on('message', (data, isBinary) => {
    const now = Date.now();
    if (now - windowStart >= 1000) { windowStart = now; count = 0; }
    if (isBinary || ++count > MAX_MSGS_PER_SEC) { ws.close(1008, 'rate limit'); return; }
    const msg = parseClientMessage(data.toString());
    if (!msg) { send(ws, { t: 'error', reason: 'bad message' }); return; }
    if (party) party.lastActive = now;
    switch (msg.t) {
      case 'host': {
        if (role) return;
        let p = msg.code ? parties.get(msg.code) : undefined;
        if (p && p.key !== msg.key) { send(ws, { t: 'error', reason: 'not the host' }); return; }
        if (!p) {
          if (parties.size >= MAX_ROOMS) { send(ws, { t: 'error', reason: 'server full' }); return; }
          const code = newCode();
          p = { room: createRoom(code), key: token(), phase: 'lobby', hosts: new Set(), pads: new Map(), created: now, lastActive: now, lastSentTick: 0, events: [], resultsAt: 0, shopUntil: 0, raceSlots: new Set() };
          parties.set(code, p);
        }
        party = p;
        role = 'host';
        p.hosts.add(ws);
        send(ws, { t: 'room', code: p.room.code, key: p.key, lan: lanAddress(), tracks: Object.keys(tracks).sort() });
        send(ws, { t: 'seats', seats: seatsView(p) });
        send(ws, phaseMessage(p));
        return;
      }
      case 'join': {
        if (role) return;
        const p = parties.get(msg.code);
        if (!p) { send(ws, { t: 'error', reason: 'no such room' }); return; }
        const [room, seat] = joinRoom(p.room, msg.token, token(), msg.name, clock(p));
        if (!seat) { send(ws, { t: 'error', reason: 'room full' }); return; }
        // An older socket still holding this seat is replaced; its close handler sees it is no longer registered.
        for (const [other, s] of p.pads) if (s === seat.slot) { p.pads.delete(other); other.close(4000, 'replaced'); }
        p.room = room;
        party = p;
        role = 'pad';
        slot = seat.slot;
        p.pads.set(ws, slot);
        send(ws, { t: 'seat', slot, token: seat.token, code: p.room.code, name: seat.name });
        send(ws, padView(p, slot));
        syncSeats(p);
        return;
      }
      case 'input':
        if (role === 'pad' && party) party.room = applyInput(party.room, slot, msg.seq, msg.input, clock(party));
        return;
      case 'buy': {
        if (role !== 'pad' || party?.phase !== 'shop' || !party.series) return;
        const d = buy(party.series.drivers[slot], msg.kind);
        if (!d) return;
        party.series = { ...party.series, drivers: party.series.drivers.map((x) => (x.slot === slot ? d : x)) };
        send(ws, padView(party, slot));
        toHosts(party, phaseMessage(party));
        return;
      }
      case 'ready':
        if (role !== 'pad' || party?.phase !== 'shop') return;
        party.room = setReady(party.room, slot, true);
        syncPads(party);
        toHosts(party, phaseMessage(party));
        return;
      case 'start': {
        if (role !== 'host' || party?.phase !== 'lobby' || (msg.track && !tracks[msg.track])) return;
        party.series = createSeries(msg.track ? [msg.track] : Object.keys(tracks).sort(), 5, randomBytes(4).readUInt32LE(0), msg.races);
        startRace(party);
        return;
      }
      case 'next':
        if (role === 'host' && party) next(party);
        return;
    }
  });
  ws.on('close', () => {
    if (!party) return;
    if (role === 'host') party.hosts.delete(ws);
    if (role === 'pad' && party.pads.get(ws) === slot) {
      party.pads.delete(ws);
      // In the lobby a leaving phone frees its seat; once racing, the seat is kept for a reconnect.
      party.room = party.phase === 'lobby' ? leaveSeat(party.room, slot) : disconnectSeat(party.room, slot);
      syncSeats(party);
    }
  });
});

if (!existsSync(join(DIST, 'index.html'))) console.warn('dist/ is missing: run `npm run build` (or use `npm run dev`, which proxies /ws here).');
function listen(port: number, triesLeft: number) {
  // One listener pair per attempt, each removing the other, so a failed attempt never logs or records its port later.
  const onListening = () => {
    server.off('error', onError);
    try { writeFileSync(PORT_FILE, String(port)); } catch { /* no node_modules (container): nothing to tell the dev server */ }
    console.log(`Fuse Drivers party server: http://${lanAddress()}:${port}`);
  };
  const onError = (e: NodeJS.ErrnoException) => {
    server.off('listening', onListening);
    if (e.code !== 'EADDRINUSE') throw e;
    if (process.env.PORT || triesLeft === 0) {
      console.error(`Port ${port} is already in use. Stop whatever uses it, or run with another port, e.g. PORT=${port + 1} npm start`);
      process.exit(1);
    }
    console.warn(`Port ${port} is busy, trying ${port + 1}`);
    listen(port + 1, triesLeft - 1);
  };
  server.once('listening', onListening);
  server.once('error', onError);
  server.listen(port);
}
listen(PORT, 20);
