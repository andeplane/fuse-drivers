/**
 * Headless race simulator: full races with bots at maximum speed, invariant checks, timing stats.
 * Usage: npm run sim -- [--races 20] [--seed 1] [--trucks 5] [--track refinery]
 */
import { readFileSync } from 'node:fs';
import { BASE_STATS, config, TICK_MS } from '../src/shared/config.ts';
import type { Difficulty } from '../src/shared/bot.ts';
import { closestOnSegment } from '../src/shared/geometry.ts';
import { createRaceRunner } from '../src/shared/runner.ts';
import { parseTrack } from '../src/shared/track.ts';

const arg = (name: string, def: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const races = Number(arg('races', '20')), seed0 = Number(arg('seed', '1')), n = Number(arg('trucks', '5')), name = arg('track', 'refinery');
if (!(Number.isInteger(races) && races > 0 && Number.isInteger(n) && n > 0 && n <= 5)) { console.error('usage: sim [--races N] [--seed N] [--trucks 1..5] [--track name]'); process.exit(2); }
const track = parseTrack(JSON.parse(readFileSync(`tracks/${name}.tmj`, 'utf8')), name);
const maxX = track.cols * track.tile, maxY = track.rows * track.tile;
let maxPenetration = 0;
const levels: Difficulty[] = ['hard', 'normal', 'easy', 'hard', 'normal'];
const MAX_TICKS = 30 * 240;

let failures = 0, totalTicks = 0;
const totals = { pickups: 0, fires: 0, hits: 0, kills: 0, wrongWay: 0 };
const lapTimes: number[] = [];
let dnf = 0;
const t0 = performance.now();
for (let r = 0; r < races; r++) {
  const seed = seed0 + r;
  const bots = Object.fromEntries(Array.from({ length: n }, (_, i) => [i, levels[i % levels.length]]));
  const runner = createRaceRunner(track, seed, Array.from({ length: n }, () => BASE_STATS), bots);
  const lastLap: number[] = Array(n).fill(0);
  const lastProgress: number[] = Array(n).fill(0);
  const stuckSince: number[] = Array(n).fill(0);
  const lastCheckpoint: number[] = Array(n).fill(0);
  const hardWrongWay: number[] = Array(n).fill(0);
  let wrongWay = 0, pickups = 0, fires = 0, hitsN = 0, kills = 0, creditable = 0;
  const fail = (msg: string) => { failures++; console.log(`race ${r} seed ${seed} tick ${runner.state.tick}: ${msg}`); };
  while (runner.state.phase !== 'finished' && runner.state.tick < MAX_TICKS) {
    const { state, events } = runner.advance(TICK_MS, []);
    for (const e of events) {
      if (e.type === 'lap') { lapTimes.push((e.tick - lastLap[e.slot]) / 30); lastLap[e.slot] = e.tick; }
      if (e.type === 'wrongWay') { wrongWay++; hardWrongWay[e.slot] = (hardWrongWay[e.slot] ?? 0) + 1; if (bots[e.slot] === 'hard' && hardWrongWay[e.slot] === 3) fail(`hard bot ${e.slot} drove the wrong way three times`); }
      if (e.type === 'pickup') pickups++;
      if (e.type === 'fire') fires++;
      if (e.type === 'hit') hitsN++;
      if (e.type === 'kill') { kills++; if (e.by !== e.slot) creditable++; }
    }
    for (const t of state.trucks) {
      for (const [k, v] of Object.entries(t)) if (typeof v === 'number' && !Number.isFinite(v)) fail(`truck ${t.slot}.${k} is ${v}`);
      // Walls resolve with last tick's bridge level (race.ts), so the tick a truck changes level is not a penetration.
      if (!t.respawnAtTick && t.respawnedTick !== state.tick && t.onBridge === runner.previous.trucks[t.slot].onBridge) {
        const nearest = Math.min(t.x, t.y, maxX - t.x, maxY - t.y, ...track.walls.filter((w) => !(w.under && t.onBridge) && !(w.deck && !t.onBridge)).map((w) => { const c = closestOnSegment(t, w); return Math.hypot(t.x - c.x, t.y - c.y); }));
        const pen = config.truck.radius - nearest;
        maxPenetration = Math.max(maxPenetration, pen);
        if (pen > 1) {
          const w = track.walls.filter((w) => !(w.under && t.onBridge) && !(w.deck && !t.onBridge)).map((w, k) => ({ k, w, d: (() => { const c = closestOnSegment(t, w); return Math.hypot(t.x - c.x, t.y - c.y); })() })).sort((a, b) => a.d - b.d)[0];
          fail(`truck ${t.slot} penetrates a wall by ${pen.toFixed(1)} u at ${t.x.toFixed(0)},${t.y.toFixed(0)} bridge=${t.onBridge} wall=${w?.w.under ? 'under' : w?.w.deck ? 'deck' : 'plain'} (${w?.w.a.x.toFixed(0)},${w?.w.a.y.toFixed(0)})-(${w?.w.b.x.toFixed(0)},${w?.w.b.y.toFixed(0)})`);
        }
      }
      const lastCp = lastCheckpoint[t.slot];
      if (t.checkpoint !== lastCp && t.checkpoint !== (lastCp + 1) % track.checkpoints.length) fail(`truck ${t.slot} checkpoint jumped ${lastCp} -> ${t.checkpoint}`);
      lastCheckpoint[t.slot] = t.checkpoint;
      if (t.armor < 1 && !t.respawnAtTick) fail(`truck ${t.slot} armor ${t.armor} while alive`);
      if (t.progress > lastProgress[t.slot] + 1e-9) { lastProgress[t.slot] = t.progress; stuckSince[t.slot] = state.tick; }
      else if (!t.finishedTick && state.tick - stuckSince[t.slot] > 300) { fail(`truck ${t.slot} (${bots[t.slot]}) stuck at progress ${t.progress.toFixed(2)} at ${t.x.toFixed(0)},${t.y.toFixed(0)} heading ${Math.round((t.heading * 180) / Math.PI)} speed ${t.speed.toFixed(0)} wallTicks ${t.wallTicks} bridge=${t.onBridge}`); stuckSince[t.slot] = state.tick; }
    }
    if (state.tick > 1 && state.placements.length !== n) fail('placements length');
    if (state.missiles.length > n || state.mines.length > 50) fail(`projectile growth: ${state.missiles.length} missiles ${state.mines.length} mines`);
    for (const t of state.trucks) if (t.kills > 20 || t.deaths > 20) fail(`implausible kills/deaths on ${t.slot}`);
  }
  totalTicks += runner.state.tick;
  const credited = runner.state.trucks.reduce((s, t) => s + t.kills, 0);
  if (credited !== creditable) fail(`kills credited ${credited} but ${creditable} kill events by others`);
  if (runner.state.phase !== 'finished') fail(`did not finish; placements ${runner.state.placements.join(',')} laps ${runner.state.trucks.map((t) => t.laps).join(',')}`);
  dnf += runner.state.trucks.filter((t) => !t.finishedTick).length;
  totals.pickups += pickups; totals.fires += fires; totals.hits += hitsN; totals.kills += kills; totals.wrongWay += wrongWay;
}
const secs = (performance.now() - t0) / 1000;
lapTimes.sort((a, b) => a - b);
const q = (p: number) => lapTimes[Math.floor(p * (lapTimes.length - 1))]?.toFixed(1);
console.log(`${races} races, ${totalTicks} ticks in ${secs.toFixed(2)} s (${Math.round(totalTicks / secs)} ticks/s, ${(totalTicks / 30 / secs).toFixed(0)}x realtime)`);
console.log(`lap time s: min ${q(0)} p50 ${q(0.5)} p90 ${q(0.9)} max ${q(1)}; race length s: ${(totalTicks / races / 30).toFixed(1)} avg`);
console.log(`did not finish: ${((100 * dnf) / (races * n)).toFixed(0)} % of trucks`);
console.log(`max wall penetration ${maxPenetration.toFixed(2)} u`);
console.log(`per race: ${(totals.pickups / races).toFixed(1)} pickups, ${(totals.fires / races).toFixed(1)} fires, ${(totals.hits / races).toFixed(1)} hits, ${(totals.kills / races).toFixed(1)} kills, ${(totals.wrongWay / races).toFixed(1)} wrong-way`);
console.log(failures ? `FAIL: ${failures} invariant failures` : 'OK: no invariant failures');
process.exit(failures ? 1 : 0);
