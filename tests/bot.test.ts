import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE_STATS, TICK_MS } from '../src/shared/config.ts';
import { createRaceRunner } from '../src/shared/runner.ts';
import { parseTrack } from '../src/shared/track.ts';
import type { Difficulty } from '../src/shared/bot.ts';

const track = parseTrack(JSON.parse(readFileSync('tracks/refinery.tmj', 'utf8')), 'refinery');
/** Per-track tick budget for one hard-bot lap (ADR 007); tighten as tracks and bots improve. */
const LAP_BUDGET_TICKS = 30 * 20;

function firstLapTicks(difficulty: Difficulty, seed = 3): number {
  // Easy bots are sloppy on purpose (ADR 007) and may slide along a tight hairpin; only hard bots must not ride walls.
  const r = createRaceRunner(track, seed, [BASE_STATS], { 0: difficulty });
  let start = 0, maxWall = 0, wall = 0;
  for (let i = 0; i < 30 * 60; i++) {
    const { state, events } = r.advance(TICK_MS, []);
    if (events.some((e) => e.type === 'start')) start = state.tick;
    wall = state.trucks[0].wallTicks;
    maxWall = Math.max(maxWall, wall);
    const lap = events.find((e) => e.type === 'lap');
    if (lap) { assert.ok(difficulty !== 'hard' || maxWall < 30, `bot rode a wall for ${maxWall} ticks`); return lap.tick - start; }
  }
  assert.fail(`${difficulty} bot never completed a lap`);
}

test('a hard bot laps the refinery within budget without wall riding', () => {
  assert.ok(firstLapTicks('hard') <= LAP_BUDGET_TICKS);
});

test('an easy bot is slower than a hard bot on the same seed', () => {
  assert.ok(firstLapTicks('easy') > firstLapTicks('hard'));
});
