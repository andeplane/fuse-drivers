# Fuse Drivers — plan

Top-down single-screen offroad racing for 1–5 players, inspired by *Ivan "Ironman" Stewart's Super Off Road* (1989), with Mario Kart style attack items and the neon industrial look of the Fuse Drivers mockup. Phaser 3 is the engine. Starts single-player against bots; multiplayer (create room, QR code, phones on a TV, later online) comes eventually and is designed for from day one by keeping the simulation pure.

All rules and numbers live in the ADRs, and once `src/shared/config.ts` exists, there. This file is the pitch, the milestones and the open questions.

| ADR | Decides |
| --- | --- |
| [001](docs/adr/001-engine-and-module-boundaries.md) | Phaser for presentation, pure `src/shared` sim, 30 Hz runner, render interpolation, scenes, stack |
| [002](docs/adr/002-deterministic-race-simulation.md) | Pure `step`, seeded RNG, `TruckInput`, fixed tick order, events vs state, JSON snapshots |
| [003](docs/adr/003-track-data-model.md) | Tiled tracks, layers, checkpoints and progress, bridges and variants (M2) |
| [004](docs/adr/004-driving-model.md) | Kernel numbers, multiplier rules, walls, drift, nitro, rocket start, jumps, surfaces |
| [005](docs/adr/005-items-and-damage.md) | Item boxes, position-weighted odds, seven items, armor, death, respawn, kills |
| [006](docs/adr/006-series-money-and-shop.md) | Series, prize money, shop (M2) |
| [007](docs/adr/007-bots.md) | Waypoint bots, difficulty, item rules |
| [008](docs/adr/008-multiplayer-direction.md) | Server-authoritative relocation of the runner (M3) |

## Inspirations

| Source | Take | Leave |
| --- | --- | --- |
| Super Off Road | Whole track on one screen, fixed camera. 4 short laps. Trucks bounce over moguls, slow in mud and water, slip on oil. Limited nitros. Prize money and a shop between races. A series of tracks with mirrored and reversed variants. | Eight-way absolute steering. Password saves. CPU trucks that cheat. |
| Mario Kart | Item boxes. One item slot. Odds weighted by position. Alt-direction throw. Drift mini-turbo. Rocket start. Shield as counterplay. | Chase camera. Items that freeze the leader for seconds on a 15-second lap. |
| Fuse Drivers mockup | Missile with a lock-on warning, mine, drone, shield, EMP. Boost pads. Toxic pools. Armor bar. Kills counter next to laps. | Five item slots at once, overloaded HUD. |
| Fuse Riders | Stack, deterministic sim in `src/shared`, bots as plain input emitters, placement scoring, display/controller split, protocol validation, concept-art-first pipeline. | Browser-host authority, WebRTC, signalling backend, leases, epochs, keyframe receipts. |

## The race

1–5 trucks, 4 laps of roughly 12–15 s on a 1600×900 world that is always fully visible. Standing start in reverse championship order, 3-2-1 countdown with a rocket-start window. Race ends when the leader finishes plus 8 s; stragglers rank by progress. Placement points 5/3/2/1/0.

## Tracks

1. **Refinery Oval** (M0, the mockup): oval with a chicane, one ramp on the back straight, toxic pools inside two corners, boost pad at the start. Dirt, toxic, boost, ramp, walls only.
2. **Sidewinder** (M2): figure-eight with a bridge crossing, mud in the lower loop, oil at the crossing exit.
3. **Sump** (M2): tight technical layout, water crossing, two ramps in sequence, a narrow tarmac section where drift matters.

Mirror and reverse variants triple the count at build time.

## Art

Neon-pixel hybrid from the mockup: dark industrial ground, green toxic pools, red warning lights, cyan/pink/lime/violet/orange trucks with matching nitro glow, chunky pixel HUD. Strict overhead camera; sprites must read from a couch. Pipeline: concept screenshot per track with the image tool first, then a 32 px tileset, five palette-swapped truck sprites, item icons, particle sheets, Press Start 2P for the HUD. Free sprite rotation first; 16 snapped directions only if it looks bad.

## Milestones

Each is playable before the next starts.

1. **M0 Kernel + track.** Truck kernel and surfaces, `parseTrack`, Refinery Oval in Tiled rendered by Phaser, checkpoints and laps, wrong-way label, keyboard, runner with interpolation, replay test.
2. **M1 Single-player race.** Bots, countdown with rocket start, 4 laps, HUD, results. Items: mine, missile, shield, nitro refill. Armor, spin-out, death, respawn, kills. The first version worth showing anyone.
3. **M2 Series + shop + items.** Money, upgrades, series winner. Oil slick, drone, EMP, forward mine lob, landing spin-out. Sidewinder and Sump, bridges, mirror and reverse variants.
4. **M3 Party on a TV.** Room, QR code, phones as controllers, the runner moves into a Node server. Bots fill empty seats.
5. **M4 Online.** Same server hosted, room codes, reconnect tokens, individual-device play.
6. **M5 Polish.** Art pass, sound, touch controls for solo phone play, tuning, attract screen.

## Decided defaults

- Name: Fuse Drivers.
- Phaser 3, TypeScript, Vite, `tsx --test`. Same stack as Fuse Riders so code ports directly.
- 30 Hz sim, render interpolated. World 1600×900, 32 u tiles.
- Tiled for tracks, no in-game editor.
- Throttle always on, two turn buttons, drift from held turns.
- Only weapons kill; hazards chip. Kills are bragging rights and $100.
- Repo starts empty; port files from Fuse Riders one at a time as needed.

## Open questions

- Ranking during the race by live progress (current ADR 003) or Super Off Road style by laps only with position shown at the line?
- Truck rotation: free or 16 snapped directions? Decide after seeing the first sprite in motion.
