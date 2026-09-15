import { TICK_MS } from '../../shared/config.ts';
import type { RaceEvent, RaceState } from '../../shared/race.ts';
import type { RaceRunner } from '../../shared/runner.ts';

export interface RemoteRunner extends RaceRunner {
  push(state: RaceState, events: RaceEvent[]): void;
}

/** Server snapshots arrive every second tick (ADR 008); render one interval behind by lerping the last two. */
const INTERVAL_MS = 2 * TICK_MS;

export function createRemoteRunner(first: RaceState): RemoteRunner {
  let previous = first, state = first, since = 0;
  let queue: RaceEvent[] = [];
  return {
    get state() { return state; },
    get previous() { return previous; },
    get alpha() { return Math.min(1, since / INTERVAL_MS); },
    push(next, events) {
      previous = state;
      state = next;
      since = 0;
      queue.push(...events);
    },
    advance(elapsedMs) {
      since += Math.max(0, elapsedMs);
      const events = queue;
      queue = [];
      return { state, events };
    },
  };
}
