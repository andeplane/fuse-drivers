# ADR 001: Phaser 3 presentation over a pure shared simulation

Date: 2026-09-15. Status: accepted.

## Context

Fuse Drivers is a top-down racing game for 1–5 players that starts single-player in a browser and later runs on a TV with phones as controllers, then online. Fuse Riders showed that a deterministic simulation kept separate from its renderer ports between browser, Node server and tests without change, while letting the renderer own rules made every network change a rules change.

## Decision

- **Phaser 3** is the engine for presentation and input: scenes, tilemaps, sprites, particles, tweens, camera scaling and audio. Phaser Arcade/Matter physics are not used for gameplay.
- `src/shared/` owns rules and simulation: track parsing, truck kernel, items, race state, the tick step, bots and the race runner. It imports nothing from Phaser, the DOM or Node. A test imports every shared module under plain Node.
- `src/client/` owns scenes, rendering, effects, keyboard and touch input. It holds no gameplay state beyond the last two snapshots used for interpolation.
- **Race runner.** `src/shared/runner.ts` exports `createRaceRunner(track, seed, config, slots)` with `advance(elapsedMs, inputsBySlot) → { state, events }`. It owns the fixed **30 Hz** accumulator (at most five steps per call, backlog beyond that discarded so a backgrounded tab does not fast-forward a race), calls `botInput` for bot slots and holds bot memory, and concatenates the events of every step it performed. `RaceScene.update` calls `runner.advance(delta, inputs)` and nothing else from the sim. The M3 server calls the same function from a timer.
- **Render interpolation.** `src/client/render/interpolate.ts` exports `renderSnapshot(prev, next, alpha)`. Positions lerp; headings (radians in state; config values in degrees are converted once at config load) lerp by shortest arc; a truck whose `respawnedTick === next.tick` or that moved more than 200 u in one tick snaps to `next`. `alpha` comes from the render clock: single-player uses the accumulator remainder, M3 uses a render time held one snapshot interval behind the newest received tick. Spin-out is a sprite tween; the sim keeps heading fixed during spin-out.
- Scenes: `Boot`, `Menu`, `Race`, `Hud` (parallel, unscaled), `Shop` (M2), `Results`. The HUD reads snapshots; it never mutates them.
- World is 1600×900 units with `Scale.FIT` letterboxing and a fixed camera. Tiles are 32 units.
- Stack: TypeScript, Vite, Phaser 3.90, `tsx --test` for unit tests. Same stack as Fuse Riders so code can be ported file by file.

## Consequences

Moving the simulation into a Node server for multiplayer (ADR 008) is a relocation of the runner, not a rewrite. Phaser's physics and timer conveniences are off limits for rules. Visual polish can never change outcomes; a cosmetic change that alters simulation geometry or timing is a bug.

## Alternatives

- Phaser Arcade physics for trucks: fast to prototype, nondeterministic across frame rates, cannot run headless on a server. Rejected.
- Plain Canvas like the first Fuse Riders client: no tilemap loader, no particle system, no scale manager. Phaser earns its weight here.

## Acceptance

The replay test (ADR 002) passes under Node without Phaser. A unit test on `runner.advance` feeds `1000/60` ms × 60 and `1000/30` ms × 30 and gets the same state. Manual check, not a test: the race scene renders the track and the truck moves while the right arrow is held.
