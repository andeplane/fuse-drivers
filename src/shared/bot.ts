import { config } from './config.ts';
import { NEUTRAL_INPUT, type TruckInput } from './input.ts';
import type { RaceState } from './race.ts';
import type { Point, Track } from './track.ts';
import { wrapAngle, type Truck } from './truck.ts';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface BotMemory {
  /** Pending steering decisions, oldest first, for the difficulty delay. */
  queue: TruckInput[];
  lateral: number;
}

const DELAY: Record<Difficulty, number> = { easy: 6, normal: 3, hard: 0 };
const BRAKE_TAP: Record<Difficulty, number> = { easy: 3, normal: 1, hard: 0 };
const STEER_DEADBAND = (6 * Math.PI) / 180;
const STRAIGHT_CONE = (15 * Math.PI) / 180;
const STRAIGHT_LENGTH = 600;

export function createBotMemory(seed: number, slot: number): BotMemory {
  const lateral = ((((seed >>> 0) * 7919 + slot * 104729) >>> 0) % 49) - 24;
  return { queue: [], lateral };
}

/** Nearest waypoint segment and the distance along it of the projection; full scan, the polyline is small. */
function closestSegment(wp: Point[], p: Point): { i: number; along: number } {
  const n = wp.length;
  let best = 0, bestAlong = 0, bestD = Infinity;
  for (let i = 0; i < n; i++) {
    const a = wp[i], b = wp[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    if (d < bestD) { bestD = d; best = i; bestAlong = t * Math.sqrt(len2); }
  }
  return { i: best, along: bestAlong };
}

/** Walk `distance` units forward along the closed polyline from segment `i`; returns the point and its tangent. */
function ahead(wp: Point[], i: number, distance: number): { p: Point; tangent: number } {
  const n = wp.length;
  let remaining = distance;
  for (let k = 0; k < n; k++) {
    const a = wp[(i + k) % n], b = wp[(i + k + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    if (remaining <= len) {
      const t = remaining / len;
      return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, tangent: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    remaining -= len;
  }
  return { p: wp[i], tangent: 0 };
}

/** ADR 007 item rules: missile at a truck ahead in the cone, mine at a truck behind, shield when locked, nitro at once. */
function wantsItem(state: RaceState, t: Truck): boolean {
  if (!t.item || state.tick < t.airborneUntilTick) return false;
  const others = state.trucks.filter((o) => o.slot !== t.slot && !o.respawnAtTick);
  const rel = (o: Truck) => ({ d: Math.hypot(o.x - t.x, o.y - t.y), a: Math.abs(wrapAngle(Math.atan2(o.y - t.y, o.x - t.x) - t.heading)) });
  switch (t.item) {
    case 'missile': return others.some((o) => { const r = rel(o); return r.d < 500 && r.a < config.items.missile.lockCone; });
    case 'mine': return others.some((o) => { const r = rel(o); return r.d < 300 && r.a > Math.PI / 2; });
    case 'shield': return t.lockedUntilTick > state.tick;
    case 'nitro': return true;
    default: return false;
  }
}

/** Ordinary inputs only (ADR 007). Pure: returns the input and the next memory. */
export function botInput(state: RaceState, slot: number, memory: BotMemory, track: Track, difficulty: Difficulty): [TruckInput, BotMemory] {
  const t = state.trucks[slot];
  if (state.phase === 'countdown') {
    return [{ ...NEUTRAL_INPUT, nitro: state.tick >= state.countdownEndTick - config.truck.rocketStartWindow }, memory];
  }
  const wp = track.waypoints;
  const { i: segment, along } = closestSegment(wp, t);
  const look = ahead(wp, segment, along + Math.max(80, 0.35 * t.speed));
  const nx = -Math.sin(look.tangent), ny = Math.cos(look.tangent);
  const target = { x: look.p.x + nx * memory.lateral, y: look.p.y + ny * memory.lateral };
  const err = wrapAngle(Math.atan2(target.y - t.y, target.x - t.x) - t.heading);

  const here = ahead(wp, segment, along).tangent;
  let straight = true;
  for (let d = 100; d <= STRAIGHT_LENGTH && straight; d += 100) {
    if (Math.abs(wrapAngle(ahead(wp, segment, along + d).tangent - here)) > STRAIGHT_CONE) straight = false;
  }
  const airborneOrSpun = state.tick < t.airborneUntilTick || state.tick < t.spinUntilTick;
  const decided: TruckInput = {
    ...NEUTRAL_INPUT,
    left: err < -STEER_DEADBAND,
    right: err > STEER_DEADBAND,
    nitro: straight && !airborneOrSpun && t.nitros > 0,
    brake: straight && state.tick % 30 < BRAKE_TAP[difficulty],
    item: wantsItem(state, t),
  };
  const queue = [...memory.queue, decided];
  const delay = DELAY[difficulty];
  const input = queue.length > delay ? queue.shift()! : NEUTRAL_INPUT;
  return [input, { queue, lateral: memory.lateral }];
}
