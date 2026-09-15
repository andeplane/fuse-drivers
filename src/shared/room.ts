import { NEUTRAL_INPUT, type TruckInput } from './input.ts';
import type { UpgradeKind } from './series.ts';

/** ADR 008: party rooms. Pure seat and input bookkeeping plus socket-boundary validation; no sockets here. */

export const MAX_SEATS = 5;
/** A seat whose latest input is older than this many ticks brakes (ADR 008). */
export const STALE_INPUT_TICKS = 15;

export interface Seat {
  slot: number;
  token: string;
  name: string;
  connected: boolean;
  input: TruckInput;
  /** Server tick the latest accepted input arrived. */
  inputTick: number;
  /** Highest accepted input sequence; older or equal ones are dropped. */
  seq: number;
  ready: boolean;
}

export interface Room {
  code: string;
  seats: Seat[];
}

export type ClientMessage =
  /** A display creates a room, or reclaims one with the host key from its link (ADR 008 host capability). */
  | { t: 'host'; code?: string; key?: string }
  | { t: 'join'; code: string; token?: string; name?: string }
  | { t: 'input'; seq: number; input: TruckInput }
  | { t: 'start'; races: number; track?: string }
  | { t: 'next' }
  | { t: 'buy'; kind: UpgradeKind }
  | { t: 'ready' };

const UPGRADE_KINDS: readonly string[] = ['topSpeed', 'accel', 'tires', 'shocks', 'armor', 'nitro'];
const INPUT_KEYS = ['left', 'right', 'brake', 'nitro', 'item', 'itemAlt'] as const;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{4}$/.test(v);
const isToken = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9]{8,64}$/.test(v);

/** Strict runtime validation at the socket boundary: anything unexpected is null. TypeScript types are not validation. */
export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > 512) return null;
  let m: unknown;
  try { m = JSON.parse(raw); } catch { return null; }
  if (!isObj(m)) return null;
  switch (m.t) {
    case 'host': return m.code === undefined ? { t: 'host' } : isCode(m.code) && isToken(m.key) ? { t: 'host', code: m.code, key: m.key } : null;
    case 'join': {
      if (!isCode(m.code) || (m.token !== undefined && !isToken(m.token)) || (m.name !== undefined && typeof m.name !== 'string')) return null;
      const name = typeof m.name === 'string' ? m.name.replace(/[^\w .-]/g, '').slice(0, 12) : undefined;
      return { t: 'join', code: m.code, ...(m.token ? { token: m.token as string } : {}), ...(name ? { name } : {}) };
    }
    case 'input': {
      const i = m.input;
      if (!Number.isSafeInteger(m.seq) || (m.seq as number) < 0 || !isObj(i) || !INPUT_KEYS.every((k) => typeof i[k] === 'boolean')) return null;
      return { t: 'input', seq: m.seq as number, input: Object.fromEntries(INPUT_KEYS.map((k) => [k, i[k]])) as unknown as TruckInput };
    }
    case 'start': {
      if (!Number.isInteger(m.races) || (m.races as number) < 1 || (m.races as number) > 9) return null;
      if (m.track !== undefined && (typeof m.track !== 'string' || !/^[a-z]+(\.(mirror|reverse))?$/.test(m.track))) return null;
      return { t: 'start', races: m.races as number, ...(m.track ? { track: m.track as string } : {}) };
    }
    case 'next': return { t: 'next' };
    case 'ready': return { t: 'ready' };
    case 'buy': return typeof m.kind === 'string' && UPGRADE_KINDS.includes(m.kind) ? { t: 'buy', kind: m.kind as UpgradeKind } : null;
    default: return null;
  }
}

export const createRoom = (code: string): Room => ({ code, seats: [] });

/**
 * A controller joins: a known token resumes its seat (reconnect), otherwise it takes the lowest free slot.
 * `newToken` is supplied by the caller so the reducer stays pure. Returns the room and the slot, or null when full.
 */
export function joinRoom(room: Room, token: string | undefined, newToken: string, name: string | undefined, tick: number): [Room, Seat | null] {
  const existing = token ? room.seats.find((s) => s.token === token) : undefined;
  if (existing) {
    const seat = { ...existing, connected: true, inputTick: tick, input: NEUTRAL_INPUT, name: name ?? existing.name };
    return [{ ...room, seats: room.seats.map((s) => (s.slot === seat.slot ? seat : s)) }, seat];
  }
  const taken = new Set(room.seats.map((s) => s.slot));
  const slot = Array.from({ length: MAX_SEATS }, (_, i) => i).find((i) => !taken.has(i));
  if (slot === undefined) return [room, null];
  const seat: Seat = { slot, token: newToken, name: name ?? `P${slot + 1}`, connected: true, input: NEUTRAL_INPUT, inputTick: tick, seq: -1, ready: false };
  return [{ ...room, seats: [...room.seats, seat].sort((a, b) => a.slot - b.slot) }, seat];
}

/** A controller socket closed: the seat is kept for reconnect and immediately brakes. */
export function disconnectSeat(room: Room, slot: number): Room {
  return { ...room, seats: room.seats.map((s) => (s.slot === slot ? { ...s, connected: false, input: NEUTRAL_INPUT } : s)) };
}

/** Latest input wins; duplicated and reordered (older sequence) inputs are dropped. */
export function applyInput(room: Room, slot: number, seq: number, input: TruckInput, tick: number): Room {
  return { ...room, seats: room.seats.map((s) => (s.slot === slot && seq > s.seq ? { ...s, seq, input, inputTick: tick } : s)) };
}

export const setReady = (room: Room, slot: number, ready: boolean): Room => ({ ...room, seats: room.seats.map((s) => (s.slot === slot || slot < 0 ? { ...s, ready } : s)) });

/** Per-slot inputs for the race step; a silent or disconnected seat is fed neutral with brake. */
export function seatInputs(room: Room, tick: number): (TruckInput | undefined)[] {
  const out: (TruckInput | undefined)[] = Array(MAX_SEATS).fill(undefined);
  for (const s of room.seats) out[s.slot] = s.connected && tick - s.inputTick <= STALE_INPUT_TICKS ? s.input : { ...NEUTRAL_INPUT, brake: true };
  return out;
}
