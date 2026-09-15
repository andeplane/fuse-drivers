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

1–5 trucks, 4 laps of roughly 12–15 s on a 1024×512 world that is always fully visible, zoomed to fill the screen below the HUD. Standing start in reverse championship order, 3-2-1 countdown with a rocket-start window. Race ends when the leader finishes plus 30 s (was 12 s, which left about half the field DNF at the new scale); stragglers rank by progress. Placement points 5/3/2/1/0.

## Tracks

Super Off Road's tracks fill the screen: a serpentine that folds back on itself with barriers between adjacent lanes, 8–12 corners including two or three hairpins, mogul rows, a jump, a puddle. Track width about 90 u (three trucks). A lap is 12–15 s because the trucks are always turning, not because the track is short. Every Fuse Drivers track follows that rule; an oval is not a track.

1. **Refinery** (M0): ten corners in a folded S, two hairpins around toxic pools, a mogul row on the back stretch, one ramp, boost pad at the start. Dirt, toxic, moguls, boost, ramp, walls only.
2. **Sidewinder** (M2): figure-eight with a bridge crossing, three hairpins, mud in the lower loop, oil at the crossing exit.
3. **Sump** (M2): tight technical layout, water crossing, two ramps in sequence, a narrow tarmac section where drift matters.

Mirror and reverse variants triple the count at build time.

## Art

Chosen style: **arcade 1989**, `docs/concepts/style-02-arcade-1989.png`. Authentic late-80s arcade pixel art, chunky 16-color palette, thick black outlines, brown stadium dirt, red-and-white lane barriers, a crowd and sponsor banners around the edge, bold bitmap HUD. Strict overhead camera; sprites must read from a couch. `assets/raw/STYLE.md` is the brief every generated asset follows; raw generations live in `assets/raw/`, game-ready cuts in `public/assets/`. 32 px tileset, five palette-swapped truck sheets in 16 directions, item icons, effect sheets, Press Start 2P for HUD text.

## Milestones

Each is playable before the next starts.

1. **M0 Kernel + track.** Done 2026-09-15. Truck kernel and surfaces, `parseTrack`, Refinery in Tiled rendered by Phaser, checkpoints and laps, wrong-way label, keyboard, runner with interpolation, replay test, headless simulator.
2. **M1 Single-player race.** Done 2026-09-15. Bots, countdown with rocket start, 4 laps, HUD, results. Items: mine, missile, shield, nitro refill. Armor, spin-out, death, respawn, kills.
3. **M2 Series + shop + items.** Done 2026-09-15 except landing-on-truck spin-out. Money, upgrades, series standings. Oil slick, drone, EMP, forward lob. Sidewinder with a bridge, Sump, mirror and reverse variants of every track.
4. **M3 Party on a TV.** Room, QR code, phones as controllers, the runner moves into a Node server. Bots fill empty seats.
5. **M4 Online.** Same server hosted, room codes, reconnect tokens, individual-device play.
6. **M5 Polish.** Art pass, sound, touch controls for solo phone play, tuning, attract screen.

## Decided defaults

- Name: Fuse Drivers.
- Phaser 3, TypeScript, Vite, `tsx --test`. Same stack as Fuse Riders so code ports directly.
- 30 Hz sim, render interpolated. World 1024×512 u zoomed ×1.5625 on a 1600×900 canvas, 32 u tiles.
- Tiled for tracks, no in-game editor.
- Throttle always on, two turn buttons, drift from held turns.
- Only weapons kill; hazards chip. Kills are bragging rights and $100.
- Live progress ranking during the race (ADR 003).
- Truck sprites pre-rendered in 16 directions (ADR 001).
- Repo starts empty; port files from Fuse Riders one at a time as needed.
