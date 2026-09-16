# ADR 007: Bots as ordinary drivers

Date: 2026-09-15. Status: accepted.

## Context

Single-player needs opponents, and multiplayer will need to fill empty seats. Fuse Riders' rule that bots emit ordinary inputs and get no privileged physics kept its AI honest and cheap to maintain.

## Decision

- A bot is a pure function `botInput(state, slot, memory, track, difficulty) → [TruckInput, memory]` called by the race runner (ADR 001) each tick. It sees the same snapshot a player's screen sees.
- **Steering**: target is the point on the track's `waypoints` polyline `max(80, 0.35 × speed)` u ahead of the bot's closest point, offset laterally by a per-race seeded ±24 u so bots do not form a conga line. Press `left`/`right` when the heading error exceeds 6°.
- **Throttle**: always on, never brake. If a track needs braking, the waypoint line is wrong.
- **Drift**: emerges from held turns; no special logic.
- **Nitro**: when the line ahead stays within 15° for at least 375 u and the bot is not airborne or spun out. Rocket start on the countdown.
- **Items**: missile when a truck is ahead within 500 u inside the ±45° cone; mine when a truck is behind within 300 u; shield when `lockedUntilTick` is set on the bot; nitro refill immediately; (M2) oil like mine, EMP when two or more trucks are within 250 u; otherwise hold.
- **Difficulty**: easy / normal / hard = the whole input record delayed by 6 / 3 / 0 ticks, and easy / normal bots tap `brake` for 3 / 1 ticks out of every 30 on straights. Everything goes through `TruckInput`; nothing else differs.
- **Shop (M2)**: buy the cheapest affordable upgrade in round-robin order (ADR 006).

## Consequences

Bots are deterministic, testable and cannot cheat. Their quality is bounded by the waypoint line, which is a track-authoring task. They will not use items cleverly; that is a feature at party difficulty.

## Alternatives

- Rubber-band speed: rejected in ADR 006.
- Pathfinding over the surface grid: more work than drawing a polyline in Tiled and worse at knowing where the good line is.

## Acceptance

Tests: a hard bot completes a lap on every committed track within a per-track tick budget stored beside the track, with fewer than 30 consecutive wall-contact ticks; an easy bot is slower than a hard bot on the same seed; item rules fire on constructed scenarios.
