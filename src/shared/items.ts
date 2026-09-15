import { config } from './config.ts';
import { nextRandom } from './rng.ts';
import { crosses } from './geometry.ts';
import type { Point, Track } from './track.ts';
import { wrapAngle, type ItemKind, type Truck } from './truck.ts';

/** Items shipped in M1; the rest of the ADR 005 table arrives in M2 and rolls with weight zero until then. */
export const ACTIVE_ITEMS: readonly ItemKind[] = ['mine', 'nitro', 'shield', 'missile'];

export interface Missile { id: number; owner: number; x: number; y: number; heading: number; launchedTick: number; target: number | null }
export interface Mine { id: number; owner: number; x: number; y: number; droppedTick: number }

export interface Hit { slot: number; by: number; item: ItemKind }

/** Weighted roll by race position: t=0 leader, t=1 last (ADR 005). Returns the item and the new RNG state. */
export function rollItem(position: number, count: number, rng: number): [ItemKind, number] {
  const t = count <= 1 ? 0 : (position - 1) / (count - 1);
  const weights = config.itemOdds
    .filter((o) => ACTIVE_ITEMS.includes(o.kind))
    .map((o) => ({ kind: o.kind, w: t <= 0.5 ? o.first + (o.mid - o.first) * (t / 0.5) : o.mid + (o.last - o.mid) * ((t - 0.5) / 0.5) }));
  const total = weights.reduce((s, w) => s + w.w, 0);
  const [r, next] = nextRandom(rng);
  let acc = r * total;
  for (const w of weights) {
    acc -= w.w;
    if (acc < 0) return [w.kind, next];
  }
  return [weights[weights.length - 1].kind, next];
}

function nearestTargetAhead(owner: Truck, trucks: Truck[], tick: number): number | null {
  const m = config.items.missile;
  let best: number | null = null, bestD = Infinity;
  for (const t of trucks) {
    if (t.slot === owner.slot || t.respawnAtTick || tick < t.invulnerableUntilTick) continue;
    const dx = t.x - owner.x, dy = t.y - owner.y;
    const d = Math.hypot(dx, dy);
    if (d > m.lockRange || d >= bestD) continue;
    if (Math.abs(wrapAngle(Math.atan2(dy, dx) - owner.heading)) > m.lockCone) continue;
    best = t.slot; bestD = d;
  }
  return best;
}

export interface UseResult { truck: Truck; missiles: Missile[]; mines: Mine[]; nextId: number; lockedSlot: number | null }

/** Consume the held item at the committed position (ADR 005). Pure. */
export function useItem(t: Truck, alt: boolean, trucks: Truck[], missiles: Missile[], mines: Mine[], nextId: number, tick: number): UseResult {
  const none = { truck: t, missiles, mines, nextId, lockedSlot: null };
  if (!t.item) return none;
  const c = config.items;
  switch (t.item) {
    case 'nitro':
      return { ...none, truck: { ...t, item: null, nitros: Math.min(config.truck.nitroMax, t.nitros + c.nitroRefill) } };
    case 'shield':
      return { ...none, truck: { ...t, item: null, shieldUntilTick: tick + c.shieldTicks } };
    case 'mine': {
      const back = c.mine.dropBehind;
      const mine: Mine = { id: nextId, owner: t.slot, x: t.x - Math.cos(t.heading) * back, y: t.y - Math.sin(t.heading) * back, droppedTick: tick };
      return { ...none, truck: { ...t, item: null }, mines: [...mines, mine], nextId: nextId + 1 };
    }
    case 'missile': {
      const heading = alt ? wrapAngle(t.heading + Math.PI) : t.heading;
      const target = alt ? null : nearestTargetAhead(t, trucks, tick);
      const m: Missile = { id: nextId, owner: t.slot, x: t.x, y: t.y, heading, launchedTick: tick, target };
      return { truck: { ...t, item: null }, missiles: [...missiles, m], mines, nextId: nextId + 1, lockedSlot: target };
    }
    default:
      return { ...none, truck: { ...t, item: null } };
  }
}

const DT = 1 / 30;

/** Advance missiles one tick: home, die on walls or age, hit the first eligible truck. Hits are in launch order. */
export function stepMissiles(missiles: Missile[], trucks: Truck[], track: Track, tick: number): { missiles: Missile[]; hits: Hit[] } {
  const m = config.items.missile;
  const hits: Hit[] = [];
  const alive: Missile[] = [];
  for (const p of missiles) {
    if (tick - p.launchedTick > m.lifeTicks) continue;
    let heading = p.heading;
    const target = p.target === null ? undefined : trucks[p.target];
    if (target && !target.respawnAtTick) {
      const err = wrapAngle(Math.atan2(target.y - p.y, target.x - p.x) - heading);
      heading = wrapAngle(heading + Math.sign(err) * Math.min(Math.abs(err), m.turnRate * DT));
    }
    const from: Point = { x: p.x, y: p.y };
    const to: Point = { x: p.x + Math.cos(heading) * m.speed * DT, y: p.y + Math.sin(heading) * m.speed * DT };
    if (track.walls.some((w) => crosses(from, to, w))) continue;
    if (to.x < 0 || to.y < 0 || to.x > config.world.width || to.y > config.world.height) continue;
    let hit: Truck | undefined;
    if (tick - p.launchedTick >= m.armTicks) {
      hit = trucks.find((t) => t.slot !== p.owner && !t.respawnAtTick && tick >= t.invulnerableUntilTick && Math.hypot(t.x - to.x, t.y - to.y) < m.radius + config.truck.radius);
    }
    if (hit) { hits.push({ slot: hit.slot, by: p.owner, item: 'missile' }); continue; }
    alive.push({ ...p, x: to.x, y: to.y, heading });
  }
  return { missiles: alive, hits };
}

/** Expire mines and trigger armed ones. A mine hits at most one truck, lowest slot wins. Owner is not immune. */
export function stepMines(mines: Mine[], trucks: Truck[], tick: number): { mines: Mine[]; hits: Hit[] } {
  const c = config.items.mine;
  const hits: Hit[] = [];
  const alive: Mine[] = [];
  for (const mine of mines) {
    if (tick - mine.droppedTick > c.lifeTicks) continue;
    if (tick - mine.droppedTick >= c.armTicks) {
      const victim = trucks.find((t) => !t.respawnAtTick && tick >= t.invulnerableUntilTick && Math.hypot(t.x - mine.x, t.y - mine.y) < c.radius + config.truck.radius);
      if (victim) { hits.push({ slot: victim.slot, by: mine.owner, item: 'mine' }); continue; }
    }
    alive.push(mine);
  }
  return { mines: alive, hits };
}

export interface DamageResult { truck: Truck; absorbed: boolean; killed: boolean }

/** One hit: shield absorbs, otherwise 1 armor and a spin-out; zero armor explodes (ADR 005). */
export function applyHit(t: Truck, tick: number): DamageResult {
  if (tick < t.invulnerableUntilTick) return { truck: t, absorbed: true, killed: false };
  if (tick < t.shieldUntilTick) return { truck: { ...t, shieldUntilTick: 0 }, absorbed: true, killed: false };
  const armor = t.armor - 1;
  const c = config.truck;
  if (armor <= 0) {
    return {
      truck: { ...t, armor: 0, item: null, shieldUntilTick: 0, deaths: t.deaths + 1, respawnAtTick: tick + c.respawnTicks, speed: 0, spinUntilTick: 0, airborneUntilTick: 0, landAtTick: 0, oilUntilTick: 0, nitroUntilTick: 0, boostUntilTick: 0, padUntilTick: 0, lockedUntilTick: 0, driftDir: 0, driftTicks: 0 },
      absorbed: false,
      killed: true,
    };
  }
  return { truck: { ...t, armor, spinUntilTick: tick + c.spinOutTicks, speed: t.speed * c.spinOutSpeedMul, driftDir: 0, driftTicks: 0 }, absorbed: false, killed: false };
}
