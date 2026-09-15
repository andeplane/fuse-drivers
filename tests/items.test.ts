import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE_STATS, config } from '../src/shared/config.ts';
import { NEUTRAL_INPUT } from '../src/shared/input.ts';
import { applyHit, rollItem, stepMissiles, useItem } from '../src/shared/items.ts';
import { createRace, step, type RaceState } from '../src/shared/race.ts';
import { parseTrack } from '../src/shared/track.ts';
import { createTruck, type Truck } from '../src/shared/truck.ts';

const track = parseTrack(JSON.parse(readFileSync('tracks/refinery.tmj', 'utf8')), 'refinery');
const racing = (seed: number, n: number): RaceState => ({ ...createRace(track, seed, Array(n).fill(BASE_STATS)), phase: 'racing', tick: 100 });
const at = (t: Truck, x: number, y: number, heading = 0, extra: Partial<Truck> = {}): Truck => ({ ...t, x, y, heading, ...extra });

test('odds interpolate by position for 1, 2 and 5 trucks and favour missiles at the back', () => {
  const counts = (position: number, n: number) => {
    const c: Record<string, number> = {};
    let rng = 7;
    for (let i = 0; i < 2000; i++) { const [k, r] = rollItem(position, n, rng); rng = r; c[k] = (c[k] ?? 0) + 1; }
    return c;
  };
  const solo = counts(1, 1), leader = counts(1, 5), last = counts(5, 5), two = counts(2, 2);
  assert.ok(solo.mine > solo.missile);
  assert.ok(leader.mine > leader.missile);
  assert.ok(last.missile > last.mine);
  assert.ok(two.missile > two.mine);
  assert.ok(!('oil' in leader) && !('drone' in last) && !('emp' in last));
});

test('missile locks only within 600 u and the 45 degree cone; otherwise dumb-fires', () => {
  const owner = at(createTruck(0, 0, 0, 0), 500, 500, 0);
  const inCone = at(createTruck(1, 0, 0, 0), 800, 600);
  const offCone = at(createTruck(1, 0, 0, 0), 600, 620);
  const far = at(createTruck(1, 0, 0, 0), 1200, 500);
  const withItem = { ...owner, item: 'missile' as const };
  assert.equal(useItem(withItem, false, [withItem, inCone], [], [], 1, 100).lockedSlot, 1);
  assert.equal(useItem(withItem, false, [withItem, offCone], [], [], 1, 100).lockedSlot, null);
  assert.equal(useItem(withItem, false, [withItem, far], [], [], 1, 100).lockedSlot, null);
  const back = useItem(withItem, true, [withItem, inCone], [], [], 1, 100);
  assert.equal(back.lockedSlot, null);
  assert.ok(Math.abs(Math.abs(back.missiles[0].heading) - Math.PI) < 1e-9);
});

test('missile dies on a wall and cannot hit in its first 10 ticks', () => {
  const wall = { ...track, walls: [{ a: { x: 600, y: 400 }, b: { x: 600, y: 600 } }] };
  const m = { id: 1, owner: 0, x: 590, y: 500, heading: 0, launchedTick: 100, target: null };
  assert.equal(stepMissiles([m], [], wall, 101).missiles.length, 0);
  const victim = at(createTruck(1, 0, 0, 0), 615, 500);
  const young = stepMissiles([{ ...m, x: 590 }], [victim], { ...track, walls: [] }, 105);
  assert.equal(young.hits.length, 0);
  const armed = stepMissiles([{ ...m, x: 590 }], [victim], { ...track, walls: [] }, 111);
  assert.equal(armed.hits.length, 1);
});

test('shield absorbs exactly one hit, invulnerable ignores, zero armor explodes and clears state', () => {
  const t = { ...createTruck(0, 0, 0, 0), shieldUntilTick: 200, item: 'mine' as const };
  const first = applyHit(t, 100);
  assert.ok(first.absorbed);
  assert.equal(first.truck.armor, 4);
  const second = applyHit(first.truck, 100);
  assert.ok(!second.absorbed);
  assert.equal(second.truck.armor, 3);
  assert.equal(second.truck.spinUntilTick, 100 + config.truck.spinOutTicks);
  const inv = applyHit({ ...t, invulnerableUntilTick: 200 }, 100);
  assert.equal(inv.truck.armor, 4);
  const dying = applyHit({ ...t, shieldUntilTick: 0, armor: 1 }, 100);
  assert.ok(dying.killed);
  assert.equal(dying.truck.item, null);
  assert.equal(dying.truck.respawnAtTick, 100 + config.truck.respawnTicks);
});

test('two hits on one tick from two owners kill a two-armor truck and credit the second owner', () => {
  let s = racing(1, 3);
  const victim = at(s.trucks[2], 900, 830, 0, { armor: 2 });
  const a = at(s.trucks[0], 820, 830, 0), b = at(s.trucks[1], 980, 830, 0);
  s = { ...s, trucks: [a, b, victim], mines: [
    { id: 1, owner: 0, x: 900, y: 830, droppedTick: 0 },
    { id: 2, owner: 1, x: 902, y: 830, droppedTick: 0 },
  ], nextId: 3 };
  const r = step(s, [NEUTRAL_INPUT, NEUTRAL_INPUT, { ...NEUTRAL_INPUT, brake: true }], track);
  const kills = r.events.filter((e) => e.type === 'kill');
  assert.equal(kills.length, 1);
  assert.equal((kills[0] as { by: number }).by, 1);
  assert.equal(r.state.trucks[1].kills, 1);
  assert.equal(r.state.trucks[2].respawnAtTick, r.state.tick + config.truck.respawnTicks);
});

test('respawn returns to the last checkpoint with an empty slot and invulnerability that ignores mines', () => {
  let s = racing(1, 2);
  const dead = { ...s.trucks[0], respawnAtTick: 101, checkpoint: 0, item: 'shield' as const };
  s = { ...s, trucks: [dead, s.trucks[1]], mines: [{ id: 1, owner: 1, x: track.checkpoints[track.checkpoints.length - 1].mid.x, y: track.checkpoints[track.checkpoints.length - 1].mid.y, droppedTick: 0 }] };
  const r = step(s, [NEUTRAL_INPUT, NEUTRAL_INPUT], track);
  const t = r.state.trucks[0];
  assert.equal(t.respawnAtTick, 0);
  assert.equal(t.item, null);
  assert.equal(t.armor, t.stats.maxArmor);
  assert.ok(t.invulnerableUntilTick > r.state.tick);
  assert.equal(r.state.mines.length, 1);
  assert.equal(r.events.filter((e) => e.type === 'hit').length, 0);
});

test('a box gives an item on a press edge, never while holding one, and respects its cooldown', () => {
  let s = racing(5, 1);
  const box = track.items[0];
  const t = at(s.trucks[0], box.x, box.y, 0);
  // Neighbouring boxes overlap the pickup radius; park them on cooldown so only box 0 is in play.
  s = { ...s, trucks: [t], boxCooldowns: s.boxCooldowns.map((_, i) => (i === 0 ? 0 : 99999)) };
  let r = step(s, [NEUTRAL_INPUT], track);
  assert.ok(r.state.trucks[0].item);
  assert.ok(r.events.some((e) => e.type === 'pickup'));
  const held = r.state.trucks[0].item;
  r = step({ ...r.state, trucks: [at(r.state.trucks[0], box.x, box.y)] }, [NEUTRAL_INPUT], track);
  assert.equal(r.state.trucks[0].item, held);
  const fired = step({ ...r.state, trucks: [at(r.state.trucks[0], box.x, box.y, 0, { item: 'nitro', nitros: 0 })] }, [{ ...NEUTRAL_INPUT, item: true }], track);
  assert.equal(fired.state.trucks[0].item, null, 'box 0 is on cooldown, so no new item');
  assert.equal(fired.state.trucks[0].nitros, 2);
  assert.ok(fired.events.some((e) => e.type === 'fire'));
  const later = step({ ...fired.state, tick: fired.state.tick + config.items.boxCooldownTicks, trucks: [at(fired.state.trucks[0], box.x, box.y)] }, [NEUTRAL_INPUT], track);
  assert.ok(later.state.trucks[0].item, 'box 0 gives again after its cooldown');
});
