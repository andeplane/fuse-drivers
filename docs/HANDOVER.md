# Handover — 2026-09-16 (deployment and scale)

**Scale fixed.** Turn rate at top speed went from 180 to 240 deg/s: the full-speed radius was 102 u, wider
than the 90 u lane, so no truck could hold a line through a hairpin. It is now 76 u (44 u at 60 % speed).
Tyres add 6 deg/s per level so five levels reach the at-rest rate. Barriers are drawn 14 u wide instead of
22 u, so the dirt reads as the track. All nine layouts pass the simulator; replay hash updated. The user has
not yet played these changes: ask them to, and change feel one step at a time (see memory note).


The game is published at **https://andeplane.github.io/fuse-drivers/** from the public repo
`andeplane/fuse-drivers`. `.github/workflows/pages.yml` typechecks, tests and publishes on every push
to `main`, building with the repository name as the base path. Solo play and the series need no server.

Party mode needs the Node server. `src/party-origin.ts` gives the TV page and the phone pad their socket
origin: same origin when self-hosted, `VITE_PARTY_ORIGIN` when the pages are static. The server accepts
sockets from origins in `ALLOWED_ORIGINS` and answers `/api/health` (Cloud Run intercepts some paths
ending in `z`). `scripts/deploy-server.sh` deploys it to Cloud Run in one command; it pins the service to
**one instance** because rooms live in memory. The backend is not deployed yet: it costs money and the
local `gcloud` points at a work project, so the user must choose the project and run the script.

Verification note: after a cross-origin navigate the Browser pane can screenshot a stale, corner-cropped
canvas. Read `canvas.getBoundingClientRect()` and, in dev builds, `window.game.scale` before believing a
screenshot; the same scale numbers render correctly on localhost.

---

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

## Review fixes and rules (after the tilted look)

A background review of the whole session found seven issues, all fixed with commits: party server crash on an oversized frame, no Origin check, lobby seats never freed, a reloaded phone's inputs dropped (sequence not reset), the party shop clock listener leaking and freezing the second shop, touch slides between buttons dropping the press, and the party HUD armor bar following truck 0. Race end grace is now 30 s after the leader (12 s left about half the field DNF at the new scale). Results, Shop, phone page and touch buttons were restyled; mud, water, oil and tarmac got proper art; wrecks stay as charred hulks.

## Open

1. Art is at the concept: missiles, mines, drone, shield and EMP use elevated-camera sprites (`assets/raw/items/projectiles-tilted.png`), dropped oil is a code-drawn glossy slick (`oil-slick`), destroyed trucks show a burnt wreck (`wreck.png`), the shield bubble encloses the truck, and the soft tank/floodlight/sign props were dropped from the track edges. Any further art is taste, not gaps.
2. Party flow is verified in two browser tabs (lobby, phone join, race from server snapshots, phone controls) but not yet on a real phone over Wi-Fi.
3. M4 online hosting (same server on a host).

Verification tips: with the Browser pane hidden Phaser draws no frames; pump `window.game.step(t, 16.7)` from `javascript_tool` and read scene state or DOM instead of screenshots. `resize_window` preset `mobile` emulates touch for the solo touch overlay.

## Gotchas

- Replay hash in `tests/race.test.ts` changes with rules or track geometry; update on purpose and say so.
- Browser-tool key presses do not reach Phaser; dispatch synthetic `KeyboardEvent`s with ~80 ms between down and up.
- After `npm run tracks` always run `npx tsx scripts/variants.ts`, then tests and all nine sims.
