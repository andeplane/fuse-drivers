# ADR 008: Multiplayer is a server-authoritative relocation of the runner

Date: 2026-09-15. Status: accepted direction, implementation deferred to milestone M3.

## Context

Fuse Riders' online design made a browser tab the authority, sent gameplay over WebRTC and coordinated through a signalling backend to avoid a simulation server. The cost was leases, authority epochs, fencing, checkpoints, keyframe receipts and a long tail of review findings. The party format itself, create a room and scan a QR code and play on a TV with phones, was the good part and is what we want again.

## Decision

- When multiplayer is built, **one Node process is the authority** and drives the unchanged race runner (ADR 001) from a timer. The same process serves LAN (`npm start` on a laptop, QR code) and online (the same process on one small always-on host). No browser authority, no peer-to-peer gameplay, no signalling service.
- Phones are controllers: they send `TruckInput` on change and every 100 ms over a WebSocket. The server keeps the latest input per seat with its arrival tick; a seat whose input is older than 15 ticks is fed the neutral record with `brake: true`, so a locked phone stops instead of racing on. Messages carry room, match and race ids and a per-seat sequence; older sequences are dropped.
- Displays receive a snapshot every tick (30 Hz) plus the events since the previous snapshot, and interpolate with the same `renderSnapshot` as single-player, one snapshot interval behind. *Amended 2026-09-15:* was every second tick (15 Hz). Measured with simulated Wi-Fi delay, a phone press took a median 76 ms to reach the display on good Wi-Fi plus 67 ms of interpolation; every tick removes up to one tick of waiting and halves the interpolation delay, for about 120 KB/s per display. Individual-device online play is the display page on a small screen with the controller overlaid.
- Rooms: create room, four-character code, QR code, seat tokens for reconnect, host capability in the display link. Port protocol validation, seat handling, controller pointers and viewport lock from Fuse Riders.
- Strict validation at the socket boundary, bounded queues and rate limits. TypeScript types are not runtime validation.
- Own-truck prediction is added only if measured phone-to-TV latency makes steering feel late. It is one kernel call on the last acknowledged input, and it is not part of M3.

## Consequences

Until M3 nothing network-related exists in the repo. What makes M3 cheap is discipline now: `src/shared` free of Phaser and DOM, snapshots as plain JSON, inputs as one flat record, rendering by interpolation between snapshots. Hosting costs a few dollars a month; that is the price of not re-living Fuse Riders' online ADRs.

## Alternatives

- Browser host plus WebRTC: rejected on evidence.
- Deterministic lockstep between peers: needs bit-exact determinism across devices and input delay; worse for phones on Wi-Fi than a snapshot stream.

## Acceptance

Before M3 starts: the replay test (ADR 002) and the `runner.advance` frame-rate test (ADR 001) pass, and a snapshot compared as `JSON.stringify` before and after a round-trip is identical. During M3: room and seat state is a pure reducer `applyRoomMessage(room, msg, tick) → room` tested without sockets for dropped, duplicated and reordered inputs, a silent seat braking within 15 ticks, and a reconnect resuming its seat.
