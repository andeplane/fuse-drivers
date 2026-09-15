# Handover — 2026-09-15

State of Fuse Drivers at the end of the first build session. Read this, then `AGENTS.md`, `PLAN.md`, `docs/adr/`.

## What exists and works

- **Design**: `PLAN.md` (pitch, milestones), ADRs 001–008 in `docs/adr/` (every rule and number), `AGENTS.md` (repo rules). Style chosen: arcade 1989 (`docs/concepts/style-02-arcade-1989.png`).
- **Assets**: raw generated sheets in `assets/raw/` (README per folder lists layouts and defects); game-ready cuts in `public/assets/` built by `npm run assets` (`scripts/build-assets.py`, needs Pillow + numpy). Sprites are generated with `scripts/gen-image.py` (real alpha; the `gpt-image` CLI cannot do transparency). `assets/raw/STYLE.md` is the brief.
- **Simulation** (`src/shared`, pure, no Phaser/DOM): `truck.ts` kernel, `race.ts` tick step, `items.ts` (all seven items), `bot.ts`, `runner.ts` (30 Hz accumulator, bots), `series.ts` (points, money, shop), `track.ts` (Tiled parser incl. bridges), `geometry.ts`, `config.ts` (all numbers), `rng.ts`.
- **Tracks**: `scripts/make-track.ts` generates `tracks/{refinery,sump,sidewinder}.tmj` from centerline definitions (Sidewinder has a bridge crossing with `under`/`deck` wall tags); `scripts/variants.ts` writes `.mirror`/`.reverse` variants. `npm run tracks` then `npx tsx scripts/variants.ts`.
- **Client** (`src/client`): Boot, Menu (left/right picks track, Space single race, Enter 5-race series), Race, Hud, Results, Shop scenes. Renders tiles, walls (graphics), 16-direction trucks, items, drones, shields, lock-on, explosions, bridge deck.
- **Headless sim**: `npm run sim -- --races N --track <name>` with invariants (finite numbers, wall penetration, checkpoint order, stuck trucks, kill credit, hard-bot wrong way). ~100–300x realtime.
- **Tests**: 46 passing (`npm test`): kernel, track, race incl. replay hash, items, bots, series, bridges.

## Verification status

`npm run typecheck`, `npm test`, `npm run build` all green at HEAD. Sim: refinery, refinery.mirror, sump, sump.mirror pass with zero failures. **Still failing (bot quality, not physics)**: sidewinder (~19 "stuck" per 8 races), sidewinder.mirror (~6), sidewinder.reverse (~19), sump.reverse (~31), refinery.reverse (~9). Root cause: bots wedge in tight corners or arrive at the bridge crossing from the non-entry side and get blocked. A background agent was working on `src/shared/bot.ts` only, with instructions to commit when all nine layouts pass; check `git log` for a commit touching only `bot.ts` and `tests/bot.test.ts`. If absent, that work is the first thing to pick up.

## Open review findings not yet applied

The client review landed: see `docs/reviews/client-review-2026-09-15.md` (12 ranked findings, none applied yet). Known client issues from my own inspection: HUD is placeholder text (the generated HUD sheets in `assets/raw/hud` are not yet used), no sound, no touch controls, the bridge deck is a plain grey rectangle, spin-out tween and frame snapping could fight.

## Gotchas

- Replay hash in `tests/race.test.ts` changes whenever rules or snapshot shape change; update it on purpose and say so in the commit.
- Browser-tool key presses do not reach Phaser (no keyCode); drive menus with synthetic `KeyboardEvent`s via `javascript_tool` (see memory note).
- Reverse-variant spawns are placed by walking the waypoint polyline; mirror flips x and only point objects' rotation.
- Sim penetration invariant is bridge-aware; junction segments between tagged and plain walls can show ≤2 u residual.

## Next steps in order

1. Get all nine sim layouts green (bot.ts).
2. Apply the client review; wire the generated HUD sheets (`public/assets` has icons; `assets/raw/hud` needs cutting into `build-assets.py`).
3. M3: create room, QR code, phones as controllers, runner in a Node server (ADR 008).
4. M5 polish: sound, touch, attract screen.

## Uncommitted working tree at handover

`src/shared/bot.ts` has uncommitted edits from the in-flight bot-robustness agent (session ended before it finished). Run `git diff src/shared/bot.ts`, then `npm test` and `npm run sim -- --races 8 --track sidewinder` (and the other layouts). Keep the diff if it reduces failures without breaking refinery; otherwise `git checkout src/shared/bot.ts` and start from the diagnosis notes above.
