# ADR 003: Tracks as Tiled data

Date: 2026-09-15. Status: accepted.

## Context

Super Off Road's appeal is a handful of dense single-screen tracks with distinct surfaces and one or two crossings. We need to author several quickly, iterate on them visually and get variants for free.

## Decision

- Tracks are authored in **Tiled** and committed as `tracks/*.tmj` with **embedded tilesets** (an external `.tsx` breaks the Node parser).
- `src/shared/track.ts` exports `parseTrack(json: unknown) → Track`, pure, no IO. It is the only code that reads gameplay layers. Callers hand it parsed JSON: Phaser's cache in the browser, `fs.readFileSync` in Node and tests. Phaser loads the same file for the visual layers only. Object polyline points are converted to absolute world coordinates on parse; Tiled rotation (degrees clockwise) is converted to radians.
- Surface type comes from a `surface` string property on each tile of the `surface` layer. Surface lookup is by the tile under the truck center.
- Required layers: tile `surface`; objects `walls` (polylines/polygons), `checkpoints` (ordered polylines, the last is start/finish), `spawns` (five points with rotation), `waypoints` (one closed polyline for bots). Optional: tile `ground`, `decor` (drawn above trucks), objects `items`, `bridges`. The parser rejects a map missing a required layer with a message naming it.
- Trucks are circles of radius 14 against wall polylines; no tile-based collision.
- **Checkpoints**: `index` counts checkpoints crossed this lap (0..N−1); crossing the finish with `index = N−1` adds a lap and resets to 0. A crossing counts only if it is the next expected checkpoint, in either direction. `d = clamp(dist(truck, next.mid) / dist(last.mid, next.mid), 0, 1)`. Progress `= laps × N + index + (1 − d)`. Respawn at `last.mid`, heading toward `next.mid`. A `wrongWay` event fires when the heading opposes the direction of the nearest `waypoints` segment for 30 consecutive ticks (heading toward `next.mid` is wrong at hairpins).
- Checkpoint spacing: one checkpoint per corner, and every physical opening between adjacent lanes lies between two checkpoints of the same section, so no gap lets a truck skip a checkpoint. A track test walks the wall polylines' gaps and asserts this.
- Map is 32×16 tiles = 1024×512 units; the remaining 4 units of the world height are outside every map and treated as wall. *Amended 2026-09-15:* was 50×28 tiles (1600×896). At that size a 90 u lane and a 46 u truck read as thin ribbons with tiny cars, far from the chosen concept; the smaller world keeps every simulation number and is zoomed to fill the screen (ADR 001). Lane centres sit 115 u apart where lanes run side by side, so four passes stack between the stands like the concept.
- **Bridges (M2)**: entering a bridge rectangle from its `entry` side sets `onBridge`; while set, walls tagged `under` are ignored and the truck is drawn above `decor`. Walls tagged `deck` (the bridge railings) are ignored by trucks that are not on the bridge. Projectiles and mines copy the owner's flag at launch and hit only trucks with the same flag.
- **Variants (M2)**: `scripts/variants.ts` writes `<track>.mirror.tmj` and `<track>.reverse.tmj` at build time (mirror flips x for every layer and object; reverse reverses checkpoints, waypoints and spawn headings and flips directional tiles), so both Phaser and `parseTrack` read plain files.

## Consequences

Track iteration is a Tiled edit and a reload. Track logic bugs are data bugs first. There is no in-game editor. Bots depend on the hand-drawn waypoint line, so an undrivable line is a track bug.

## Alternatives

- Hand-written JSON: tolerable for one track, painful for six with decor.
- Procedural tracks: not what the original was about.

## Acceptance

Parser rejects a map missing any required layer with a message naming it and accepts every committed track. Checkpoint tests: a lap counts only after every checkpoint in order, a backwards crossing of the next checkpoint counts, a crossing of a later checkpoint does not, and progress never decreases while driving toward `next.mid`.
