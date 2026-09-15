# Fuse Drivers

Top-down single-screen offroad racing for 1–5 players, inspired by *Ivan "Ironman" Stewart's Super Off Road* with Mario Kart style attack items. Phaser 3, TypeScript, a pure deterministic simulation. Design lives in [PLAN.md](PLAN.md) and the ADRs in [docs/adr](docs/adr).

## Play

Requires Node 22.12 or newer.

```sh
npm ci
npm run dev
```

Open the printed URL. **Space** starts a single race on the selected track (left / right to choose), **Enter** starts a five-race series with the shop between races.

Controls: arrows or **A / D** steer, **S** brake, **Shift** nitro, **Space** use item, hold **Down** with Space to use it the other way (mine lobbed ahead, missile fired backwards). Throttle is always on.

## Develop

```sh
npm run typecheck       # tsc
npm test                # unit tests: kernel, track, race, items, bots, series, bridges
npm run sim             # headless bot races with invariant checks; --races N --track name --seed N
npm run tracks          # regenerate tracks/*.tmj from scripts/make-track.ts, then variants.ts for mirror/reverse
npm run assets          # cut public/assets from assets/raw (needs Pillow and numpy)
npm run build           # production bundle in dist/
```

`src/shared` is the game: it imports nothing from Phaser or the DOM, so the same code runs in the browser, in tests, in the headless simulator and later on a server. `src/client` only renders and reads input. Tracks are Tiled maps; `scripts/make-track.ts` writes them from a centerline definition so they stay editable in Tiled.

## Status

Milestones M0–M2 from [PLAN.md](PLAN.md) are implemented: three tracks with mirror and reverse variants, bots, all seven items, damage and respawn, series with prize money and shop. M3 (phones as controllers on a TV) and M4 (online) come next; M5 is the art and sound pass.
