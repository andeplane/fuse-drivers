# Handover — 2026-09-15 (second session)

Read this, then `AGENTS.md`, `PLAN.md`, `docs/adr/`.

## Where the user is

The user judged the game "terrible" against the chosen concept: tiny trucks on thin lanes, flat squares for hazards, and a straight overhead camera when *Super Off Road* is a tilted three-quarter view. Everything since has been about the look. A tilted concept was generated for approval: `docs/concepts/style-06-arcade-1989-tilted.png` (not yet approved). Until it is, do not start more multiplayer or feature work; show screenshots next to the concept after each visual step.

`OPENAI_API_KEY` is available by sourcing `~/.zshrc` (the user said so; never print it). Generate with `source ~/.zshrc && /Users/anderhaf/.local/share/uv/tools/gpt-image-cli/bin/python scripts/gen-image.py OUT "PROMPT" ...` (see `assets/raw/STYLE.md`).

## Done this session (all committed)

- **Bots**: all nine layouts pass `npm run sim` (12 races each). Fixes: drift release (a drift only ends when both turn buttons are up), flank sight lines, checkpoint stretch by nearest waypoint, half-open checkpoint crossing (`geometry.reaches`), corner braking for hairpins.
- **Scale (ADR 001/003 amended)**: world is 1024×512 u (32×16 tiles), camera zoom ×1.5625 below the HUD strip, `config.screen` for UI. Tracks rebuilt in `scripts/make-track.ts` as lanes 115 u apart. Wall generator: bridge tracks drop offset points only against the local centerline stretch. `resolveWalls` snaps only on a real segment crossing (sharp hairpin tips threw trucks through).
- **Art**: HUD from generated sheets, stadium crowd/banners/props (`drawGround`), hazards painted as shapes (`paintHazards`, no tile layer), raised barriers with a front face, plank bridge deck, dust, shadows, missile trail.
- **Sound**: synthesized Web Audio (`src/client/audio.ts`), M mutes.
- **M3 party**: `src/shared/room.ts` (pure seat/input reducer, validation, tests), `src/server/main.ts` (Node authority, 15 Hz snapshots, rate limits, shop phase), `pad.html` + `src/pad/main.ts` phone controller, `src/client/net/party.ts` display link, Lobby with QR, PartyShop. `npm start` or `npm run server` + `npm run dev`. Smoke-tested with fake sockets; not yet played on a real phone.
- **M5 bits**: attract demo after 20 s idle, touch buttons for solo play on touch devices (`src/client/input/touch.ts`).

## Tilted look (done since the first handover)

The user set the goal "do not stop until it is great quality" and described the original as tilted, so style-06 is the working direction. In place: 16-direction trucks from the elevated camera (`assets/raw/trucks-tilted/README.md`, left half mirrored), grandstand band and side crowds drawn by `HudScene.drawStands` in screen space (`STANDS` in `RaceScene` sets the margins), fence with sponsor boards, cube item boxes, raised barriers, barrier-ringed toxic pools, wooden ramps, mogul mounds, ground shadows, frame-cycling spin-outs. Results and Shop are proper tables; every menu screen uses `backdrop()`. `window.game` exists in dev builds for browser checks (screenshots fail while the Browser pane is hidden; read scene state instead).

## Open

1. Still short of the concept: mud and water puddles are flat ovals, oil blobs read like tyres, the in-world edge decor (pipes, tanks) is soft, no truck wreck sprite after a kill.
2. Phone pad page is unstyled DOM; party HUD is only verified with fake sockets.
3. M4 online hosting (same server on a host) and a real-phone party test.

## Gotchas

- Replay hash in `tests/race.test.ts` changes with rules or track geometry; update on purpose and say so.
- Browser-tool key presses do not reach Phaser; dispatch synthetic `KeyboardEvent`s with ~80 ms between down and up.
- After `npm run tracks` always run `npx tsx scripts/variants.ts`, then tests and all nine sims.
