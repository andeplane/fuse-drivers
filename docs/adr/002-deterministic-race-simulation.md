# ADR 002: Deterministic race simulation and tick transaction

Date: 2026-09-15. Status: accepted.

## Context

Bots, replay tests, results that every viewer agrees on and a future authoritative server all need one thing: the same track, seed and inputs must produce the same race, tick for tick.

## Decision

- `race.step(state, inputs, config) → { state, events }` is a pure function. It never mutates its input; tests deep-freeze the state so a mutation throws.
- RNG state is `state.rngState: number` (uint32, mulberry32). `nextRandom(state) → [value, rngState]`. There is no RNG object and `Math.random` is banned in `src/shared`.
- Inputs are a `TruckInput` record per truck per tick: `left`, `right`, `brake`, `nitro`, `item`, `itemAlt` booleans. Keyboard, touch, bots and later network controllers all produce this record and nothing else.
- Fixed order inside one tick:
  1. Advance tick, expire timed effects (spin-out, shield, drone, oil, boost, invulnerability, airborne, lock-on).
  2. Compute each truck's intended movement from input, surface and status (ADR 004).
  3. Resolve truck/wall contact, then truck/truck contact, in slot order.
  4. Move projectiles and drones; resolve hits in launch order; apply damage, spin-outs, kills and respawn timers (ADR 005).
  5. Apply surface effects at the committed position: oil, boost, toxic, ramp.
  6. Item box pickups, rolled in slot order.
  7. Checkpoints, laps, finish, race end timer.
  8. Placements by progress descending, then lower slot.
- **Events** (`hit`, `kill`, `pickup`, `lap`, `finish`, `wrongWay`) carry their `tick` and are returned from `step`, not stored on the snapshot. The runner concatenates events from every step it performs; the M3 server sends events since the last delivered snapshot. Anything with a duration (lock-on, shield, spin-out, invulnerability, drone) is an `untilTick` field on the truck, never an event.
- Snapshots are plain JSON: no classes, Maps or functions, all numbers finite and never `-0`. The replay hash uses canonical JSON (sorted keys).
- All balance values live in `src/shared/config.ts`; docs link to it and do not copy tables once it exists.

## Consequences

Simultaneous outcomes are stable by construction. Floating-point determinism across browsers is adequate because there is never more than one authority; cross-engine bit-exactness is not required.

## Alternatives

- Fixed-point integer math: unnecessary while a single authority produces snapshots.
- Event sourcing with rollback: the online design that sank Fuse Riders' time. Not needed for server-authoritative snapshots.

## Acceptance

A recorded-race replay test hashes the final snapshot. A scenario test places two trucks and a missile so a hit, a wall contact and a checkpoint occur on the same tick and asserts that two runs produce byte-identical state, that the mirrored scenario produces the mirrored outcome, and that two trucks picking up on the same tick roll in slot order. A deep-frozen state passes through `step` without throwing.
