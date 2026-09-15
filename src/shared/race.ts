import { BASE_STATS, config, type TruckStats } from './config.ts';
import { NEUTRAL_INPUT, type TruckInput } from './input.ts';
import { createTruck, stepTruck, wrapAngle, type Truck } from './truck.ts';
import { surfaceAt, type Point, type Segment, type Track } from './track.ts';

export type Phase = 'countdown' | 'racing' | 'finished';

/** Plain JSON race snapshot (ADR 002). */
export interface RaceState {
  tick: number;
  phase: Phase;
  rngState: number;
  trackName: string;
  trucks: Truck[];
  countdownEndTick: number;
  raceEndTick: number;
  /** Slots ordered by placement, best first. */
  placements: number[];
}

export type RaceEvent =
  | { tick: number; type: 'lap'; slot: number; lap: number }
  | { tick: number; type: 'finish'; slot: number; place: number }
  | { tick: number; type: 'wrongWay'; slot: number }
  | { tick: number; type: 'wall'; slot: number }
  | { tick: number; type: 'land'; slot: number }
  | { tick: number; type: 'start' };

export interface StepResult { state: RaceState; events: RaceEvent[] }

export function createRace(track: Track, seed: number, stats: TruckStats[] = [BASE_STATS]): RaceState {
  const trucks = stats.map((s, i) => {
    const sp = track.spawns[i];
    return createTruck(i, sp.x, sp.y, sp.heading, s);
  });
  return { tick: 0, phase: 'countdown', rngState: seed >>> 0, trackName: track.name, trucks, countdownEndTick: config.countdownTicks, raceEndTick: 0, placements: trucks.map((t) => t.slot) };
}

const dot = (ax: number, ay: number, bx: number, by: number) => ax * bx + ay * by;

function closestOnSegment(p: Point, s: Segment): Point {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2));
  return { x: s.a.x + t * dx, y: s.a.y + t * dy };
}

/** Does the directed segment p0→p1 cross segment s (either direction)? */
export function crosses(p0: Point, p1: Point, s: Segment): boolean {
  const d1 = (s.b.x - s.a.x) * (p0.y - s.a.y) - (s.b.y - s.a.y) * (p0.x - s.a.x);
  const d2 = (s.b.x - s.a.x) * (p1.y - s.a.y) - (s.b.y - s.a.y) * (p1.x - s.a.x);
  const d3 = (p1.x - p0.x) * (s.a.y - p0.y) - (p1.y - p0.y) * (s.a.x - p0.x);
  const d4 = (p1.x - p0.x) * (s.b.y - p0.y) - (p1.y - p0.y) * (s.b.x - p0.x);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function resolveWalls(t: Truck, track: Track, wasTouching: boolean): [Truck, boolean] {
  const r = config.truck.radius;
  let x = t.x, y = t.y, touched = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const w of track.walls) {
      const c = closestOnSegment({ x, y }, w);
      const dx = x - c.x, dy = y - c.y;
      const d = Math.hypot(dx, dy);
      if (d >= r) continue;
      touched = true;
      if (d < 1e-9) { x += r; continue; }
      x += (dx / d) * (r - d);
      y += (dy / d) * (r - d);
    }
  }
  // The 4-unit strip below the map and anything outside it counts as wall (ADR 003).
  const maxX = track.cols * track.tile, maxY = track.rows * track.tile;
  if (x < r || y < r || x > maxX - r || y > maxY - r) {
    touched = true;
    x = Math.max(r, Math.min(maxX - r, x));
    y = Math.max(r, Math.min(maxY - r, y));
  }
  if (!touched) return [t.x === x && t.y === y ? t : { ...t, x, y }, false];
  const speed = t.speed * (wasTouching ? config.truck.wallSlideTick : config.truck.wallFirstHit);
  return [{ ...t, x, y, speed }, true];
}

function resolveContacts(trucks: Truck[]): Truck[] {
  const out = trucks.slice();
  const r2 = config.truck.radius * 2;
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i], b = out[j];
      if (a.respawnAtTick || b.respawnAtTick) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= r2) continue;
      const nx = d < 1e-9 ? 1 : dx / d, ny = d < 1e-9 ? 0 : dy / d;
      const push = r2 - d;
      const total = a.stats.mass + b.stats.mass;
      const aShare = b.stats.mass / total, bShare = a.stats.mass / total;
      out[i] = { ...a, x: a.x - nx * push * aShare, y: a.y - ny * push * aShare };
      out[j] = { ...b, x: b.x + nx * push * bShare, y: b.y + ny * push * bShare };
    }
  }
  return out;
}

function applySurface(t: Truck, track: Track, tick: number, events: RaceEvent[]): Truck {
  const c = config.truck;
  const kind = surfaceAt(track, t.x, t.y);
  const airborne = tick < t.airborneUntilTick;
  let n = t;
  if (n.landAtTick === tick) {
    n = { ...n, speed: n.speed * n.stats.landingMul, landAtTick: 0 };
    events.push({ tick, type: 'land', slot: n.slot });
  }
  if (airborne) return n;
  switch (kind) {
    case 'oil': return { ...n, oilUntilTick: tick + c.oilTicks };
    case 'boost': return { ...n, padUntilTick: tick + c.boostPadTicks };
    case 'ramp': {
      const frac = Math.max(0, Math.min(1, n.speed / n.stats.topSpeed));
      const until = tick + c.airborneBase + Math.round(c.airborneSpeedTicks * frac);
      return { ...n, airborneUntilTick: until, landAtTick: until };
    }
    case 'mogul': return { ...n, airborneUntilTick: tick + c.mogulHopTicks };
    case 'toxic': {
      if (tick < n.toxicNextTick) return n;
      return { ...n, armor: Math.max(1, n.armor - 1), toxicNextTick: tick + c.toxicIntervalTicks };
    }
    default: return n.toxicNextTick === 0 ? n : { ...n, toxicNextTick: 0 };
  }
}

export function progressOf(t: Truck, track: Track): number {
  const n = track.checkpoints.length;
  const next = track.checkpoints[t.checkpoint];
  const last = track.checkpoints[(t.checkpoint - 1 + n) % n];
  const span = Math.hypot(next.mid.x - last.mid.x, next.mid.y - last.mid.y) || 1;
  const d = Math.max(0, Math.min(1, Math.hypot(next.mid.x - t.x, next.mid.y - t.y) / span));
  return t.laps * n + t.checkpoint + (1 - d);
}

function applyCheckpoints(prev: Truck, t: Truck, track: Track, tick: number, events: RaceEvent[]): Truck {
  const n = track.checkpoints.length;
  let n2 = t;
  if (!t.finishedTick) {
    const cp = track.checkpoints[t.checkpoint];
    if (crosses({ x: prev.x, y: prev.y }, { x: t.x, y: t.y }, cp)) {
      if (t.checkpoint === n - 1) {
        const laps = t.laps + 1;
        n2 = { ...t, laps, checkpoint: 0 };
        events.push({ tick, type: 'lap', slot: t.slot, lap: laps });
        if (laps >= config.laps) n2 = { ...n2, finishedTick: tick };
      } else {
        n2 = { ...t, checkpoint: t.checkpoint + 1 };
      }
    }
  }
  const next = track.checkpoints[n2.checkpoint];
  const facing = dot(Math.cos(n2.heading), Math.sin(n2.heading), next.mid.x - n2.x, next.mid.y - n2.y);
  const wrongWayTicks = facing < 0 && !n2.finishedTick ? n2.wrongWayTicks + 1 : 0;
  if (wrongWayTicks === config.truck.wrongWayTicks) events.push({ tick, type: 'wrongWay', slot: n2.slot });
  return { ...n2, wrongWayTicks, progress: progressOf(n2, track) };
}

export function respawnPose(t: Truck, track: Track): { x: number; y: number; heading: number } {
  const n = track.checkpoints.length;
  const last = track.checkpoints[(t.checkpoint - 1 + n) % n];
  const next = track.checkpoints[t.checkpoint];
  return { x: last.mid.x, y: last.mid.y, heading: Math.atan2(next.mid.y - last.mid.y, next.mid.x - last.mid.x) };
}

function rank(trucks: Truck[]): number[] {
  return trucks
    .slice()
    .sort((a, b) => {
      if (a.finishedTick && b.finishedTick) return a.finishedTick - b.finishedTick || a.slot - b.slot;
      if (a.finishedTick !== b.finishedTick) return a.finishedTick ? -1 : 1;
      return b.progress - a.progress || a.slot - b.slot;
    })
    .map((t) => t.slot);
}

/** One deterministic tick (ADR 002). Never mutates `state`. */
export function step(state: RaceState, inputs: readonly TruckInput[], track: Track): StepResult {
  const tick = state.tick + 1;
  const events: RaceEvent[] = [];
  const c = config.truck;
  let rng = state.rngState;

  if (state.phase === 'countdown') {
    const trucks = state.trucks.map((t, i) => {
      const input = inputs[i] ?? NEUTRAL_INPUT;
      const armed = input.nitro && tick >= state.countdownEndTick - c.rocketStartWindow;
      return { ...t, prevNitro: input.nitro, boostUntilTick: armed ? state.countdownEndTick + c.boostTicks : t.boostUntilTick };
    });
    if (tick >= state.countdownEndTick) events.push({ tick, type: 'start' });
    return { state: { ...state, tick, trucks, phase: tick >= state.countdownEndTick ? 'racing' : 'countdown' }, events };
  }

  const prev = state.trucks;
  let trucks = prev.map((t, i) => {
    if (t.respawnAtTick) {
      if (tick < t.respawnAtTick) return t;
      const pose = respawnPose(t, track);
      return { ...t, ...pose, speed: 0, respawnAtTick: 0, respawnedTick: tick, armor: t.stats.maxArmor, invulnerableUntilTick: tick + c.invulnerableTicks, item: null, shieldUntilTick: 0, spinUntilTick: 0, airborneUntilTick: 0, landAtTick: 0, oilUntilTick: 0, nitroUntilTick: 0, boostUntilTick: 0, padUntilTick: 0, driftDir: 0 as const, driftTicks: 0 };
    }
    const input = t.finishedTick ? NEUTRAL_INPUT : inputs[i] ?? NEUTRAL_INPUT;
    const surface = surfaceAt(track, t.x, t.y);
    const [moved, r] = stepTruck(t, input, surface, tick, rng);
    rng = r;
    return moved;
  });

  trucks = trucks.map((t, i) => {
    if (t.respawnAtTick) return t;
    const [resolved, touching] = resolveWalls(t, track, prev[i].wallTicks > 0);
    if (touching && prev[i].wallTicks === 0) events.push({ tick, type: 'wall', slot: t.slot });
    return { ...resolved, wallTicks: touching ? prev[i].wallTicks + 1 : 0 };
  });
  trucks = resolveContacts(trucks);
  trucks = trucks.map((t) => (t.respawnAtTick ? t : applySurface(t, track, tick, events)));
  trucks = trucks.map((t, i) => (t.respawnAtTick ? t : applyCheckpoints(prev[i], t, track, tick, events)));

  const placements = rank(trucks);
  let raceEndTick = state.raceEndTick;
  for (const t of trucks) {
    if (t.finishedTick === tick) {
      events.push({ tick, type: 'finish', slot: t.slot, place: placements.indexOf(t.slot) + 1 });
      if (!raceEndTick) raceEndTick = tick + config.raceEndGraceTicks;
    }
  }
  const allDone = trucks.every((t) => t.finishedTick);
  const phase: Phase = allDone || (raceEndTick && tick >= raceEndTick) ? 'finished' : 'racing';
  const heading = trucks.map((t) => wrapAngle(t.heading));
  trucks = trucks.map((t, i) => (t.heading === heading[i] ? t : { ...t, heading: heading[i] }));

  return { state: { ...state, tick, rngState: rng, trucks, placements, raceEndTick, phase }, events };
}
