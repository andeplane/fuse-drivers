import { botInput, createBotMemory, type BotMemory, type Difficulty } from './bot.ts';
import { BASE_STATS, TICK_MS, type TruckStats } from './config.ts';
import { NEUTRAL_INPUT, type TruckInput } from './input.ts';
import { createRace, step, type RaceEvent, type RaceState } from './race.ts';
import type { Track } from './track.ts';

const MAX_STEPS_PER_ADVANCE = 5;

export interface RaceRunner {
  readonly state: RaceState;
  readonly previous: RaceState;
  /** Fraction of a tick elapsed since `state`, for render interpolation. */
  readonly alpha: number;
  advance(elapsedMs: number, inputsBySlot: readonly (TruckInput | undefined)[]): { state: RaceState; events: RaceEvent[] };
}

/**
 * Owns the fixed-step accumulator (ADR 001). At most five steps per call; excess backlog is discarded
 * so a backgrounded tab never fast-forwards a race. The same object runs on the M3 server.
 */
export function createRaceRunner(track: Track, seed: number, stats: TruckStats[] = [BASE_STATS], bots: Record<number, Difficulty> = {}): RaceRunner {
  let state = createRace(track, seed, stats);
  let previous = state;
  let acc = 0;
  const memory: Record<number, BotMemory> = {};
  for (const slot of Object.keys(bots)) memory[Number(slot)] = createBotMemory(seed, Number(slot));
  return {
    get state() { return state; },
    get previous() { return previous; },
    get alpha() { return acc / TICK_MS; },
    advance(elapsedMs, inputsBySlot) {
      acc += elapsedMs > 0 ? elapsedMs : 0;
      const events: RaceEvent[] = [];
      let steps = 0;
      while (acc >= TICK_MS && steps < MAX_STEPS_PER_ADVANCE) {
        const inputs = state.trucks.map((_, i) => {
          const d = bots[i];
          if (!d) return inputsBySlot[i] ?? NEUTRAL_INPUT;
          const [input, next] = botInput(state, i, memory[i], track, d);
          memory[i] = next;
          return input;
        });
        const r = step(state, inputs, track);
        previous = state;
        state = r.state;
        events.push(...r.events);
        acc -= TICK_MS;
        steps += 1;
      }
      if (acc >= TICK_MS) acc = acc % TICK_MS;
      return { state, events };
    },
  };
}
