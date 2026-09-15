# ADR 005: Items, damage and kills

Date: 2026-09-15. Status: accepted. M1 ships mine, missile, shield and nitro refill; oil slick, drone and EMP are M2.

## Context

Mario Kart's items are what turn a racing game into a party game: the leader is never safe and last place always has hope. The Fuse Drivers mockup supplies the vocabulary: missile with lock-on, drone, mine, shield, EMP, armor, kills.

## Decision

- Item boxes are track objects placed in rows of three across the track. Boxes are never consumed; each truck has a 3 s per-box cooldown. Pickup grants one item to a single slot; holding an item makes boxes inert for that truck.
- Item choice is a weighted roll from the seeded RNG. With `t = (pos − 1) / (n − 1)` (`t = 0` when `n = 1`), weights interpolate linearly from the 1st column to Middle over `t ∈ [0, 0.5]` and Middle to Last over `[0.5, 1]`:

| Item | 1st | Middle | Last |
| --- | --- | --- | --- |
| Mine | 30 | 15 | 5 |
| Oil slick (M2) | 25 | 15 | 5 |
| Nitro refill (+2) | 20 | 15 | 10 |
| Shield | 15 | 20 | 10 |
| Missile | 5 | 20 | 35 |
| Drone (M2) | 5 | 10 | 20 |
| EMP (M2) | 0 | 5 | 15 |

- `item` uses the item in its default direction: mine and oil backward, missile forward. `item` with `itemAlt` held uses the opposite direction. Shield, nitro refill, drone and EMP ignore `itemAlt`.
- **Missile**: target is the nearest truck within 600 u whose bearing is within ±45° of the owner's heading at launch; no retargeting; no target means dumb-fire. Speed 600 u/s, turn 200°/s, 4 s lifetime, r = 6, destroyed on wall contact, hits the first non-owner non-invulnerable truck it touches, cannot hit for its first 10 ticks. The target's `lockedUntilTick` is set at launch for the missile's lifetime. Backward: dumb-fire. Hit: 1 damage and spin-out.
- **Mine**: dropped 30 u behind, or lobbed 200 u forward (M2). Armed after 0.5 s, lasts 20 s, visible. Trigger r = 20. Hit: 1 damage and spin-out. Owner is not immune.
- **Oil slick (M2)**: 3×3 tiles of oil for 15 s, overriding the surface.
- **Drone (M2)**: orbits the owner at r = 60 for 8 s or 3 zaps, whichever first. Any other truck within 80 u takes 1 damage, at most once per second per truck. No spin-out.
- **Shield**: 6 s. Any blocked effect (missile, mine, drone zap, EMP) consumes the shield and destroys the effect. Does not block toxic damage or landing spin-out.
- **EMP (M2)**: every other truck within 250 u loses steering for 1 s and loses its held item. No damage. Shield blocks it.
- **Damage**: armor 4 base, max 7. A missile or mine hit costs 1 armor and a spin-out (ADR 004); a drone zap costs 1 armor only. At zero the truck explodes: the item slot, shield, drone and all timers are cleared, progress is kept, the truck is removed for 2.5 s, then respawns at the last checkpoint with full armor and 2 s of invulnerability. While invulnerable a truck takes no damage or spin-out, does not trigger mines, is not a missile target and is ignored by drones. Toxic chips armor but never below 1; only weapons kill.
- **Kills** go to the owner of the projectile, mine, drone or EMP that caused the final hit. They show on the HUD and in stats and award $100 (ADR 006). No placement points.
- Hits resolve in projectile launch order within a tick. A truck hit twice on one tick takes both hits; a shield absorbs the first.

## Consequences

Race position is the only path to points. Lock-on state and the shield give the leader real counterplay. Every effect is a timer or a value on the truck record, which keeps the snapshot flat. A drone alone can never kill a full-armor truck.

## Alternatives

- Fuse Riders-style charged bombs: a different game; a racer wants tap-to-fire.
- Lightning and blue shell: freezing the field or auto-hitting the leader is unfun on 15-second laps.
- Consumed boxes with a respawn delay: starves the pack behind the leader on a single-screen track.

## Acceptance

Tests: odds interpolate as specified for n = 1, 2 and 5; a missile launched at a target 46° off-heading dumb-fires; a missile dies on a wall; a shield absorbs exactly one hit and is consumed by EMP; two hits on one tick from two owners kill a two-armor truck and attribute the kill to the second owner; toxic cannot kill; respawn places the truck at the last checkpoint facing the next with an empty item slot; an invulnerable truck drives over a mine without triggering it.
