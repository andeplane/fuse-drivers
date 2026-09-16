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

Tuning feel: solo races read `?top=` (base top speed, u/s, default 200), `?accel=` (seconds to top speed, default 1.2) and `?truck=` (drawn truck length, u, default 44) from the page URL, e.g. `http://localhost:5173/?top=280&accel=0.8&truck=56`. Party races ignore them.

Sound is synthesized in the browser (no audio files) and starts on the first key press; **M** toggles mute and is remembered.

### Party on a TV (phones as controllers)

```sh
npm start               # builds, then serves game and party server on http://<your LAN address>:8790
```

Open the printed address on the TV or laptop and press **P**. Phones on the same network scan the QR code (or open `/pad.html` and type the four-letter code) and become controllers; empty seats are bots. On the TV: left / right picks a track, **Space** a single race, **Enter** a five-race series. Between series races everyone shops on their phone. A phone that locks brakes its truck and gets its seat back when it reconnects; a reloaded TV rejoins its room. While developing, run `npm run server` next to `npm run dev`; the dev server forwards `/ws` to it. The server uses port 8790 and moves to the next free port if that one is busy (it prints the address it got); set `PORT` to force a specific port.

### Hosting online (M4)

The party server is one Node process (ADR 008), so hosting is one container:

```sh
docker build -t fuse-drivers .
docker run -p 8790:8790 fuse-drivers
```

Put it behind an HTTPS reverse proxy (Caddy, nginx, Fly.io, Render); pages served over HTTPS use `wss://` automatically. Sockets are only accepted from pages on the same host, messages are size- and rate-limited, and `/healthz` returns `{"ok":true,"rooms":N}` for the platform's health check. Room codes, host keys in the display link and seat tokens on phones already make reconnects and online play work; only the deployment itself is left.

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

## Play online

The game is published to GitHub Pages on every push to `main`: **https://andeplane.github.io/fuse-drivers/**

Solo play and the five-race series are entirely client-side, so the published pages need no server.

Party mode (phones as controllers on a TV) needs the Node server, because one authoritative process runs
the simulation for every phone. It is the same shape Fuse Riders uses: static pages on GitHub Pages, a
WebSocket backend in a container.

```bash
PROJECT=your-gcp-project scripts/deploy-server.sh
```

Then point the published game at it once, and rebuild the pages:

```bash
gh variable set VITE_PARTY_ORIGIN --body https://your-service.run.app
gh workflow run pages.yml
```

Rooms live in the server's memory, so the service deliberately runs as a single instance; a second one
would host its own rooms and phones would reach the wrong server. `ALLOWED_ORIGINS` lists the origins
allowed to open a party socket, and `/api/health` reports liveness and the room count.

## Status

Playable: three tracks with mirror and reverse variants, bots that lap all nine layouts cleanly, all seven items, damage and respawn, a five-race series with prize money and shop, party mode with phones as controllers (M3), synthesized sound, touch controls and an attract demo (M5).

The look follows [docs/concepts/style-06-arcade-1989-tilted.png](docs/concepts/style-06-arcade-1989-tilted.png): *Super Off Road*'s elevated three-quarter camera with one top-down truck sprite rotated to any heading and squashed and stacked so its sides show, raised barriers, a grandstand with sponsor boards and pools ringed by barriers. The simulation stays a flat 2D world; the tilt is presentation only. Online hosting (M4) is the remaining milestone.
