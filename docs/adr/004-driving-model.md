# ADR 004: Driving model

Date: 2026-09-15. Status: accepted.

## Context

Super Off Road used eight-way absolute steering on a joystick. A phone thumb, and even a keyboard, wants two turn buttons. The feel we want: snappy trucks, bouncy jumps, sticky mud, satisfying slides, a nitro that feels like a cheat.

## Decision

- Kernel `stepTruck(truck, input, surface, tick, rngState) → [truck, rngState]` is turn-then-move at 30 Hz, reading balance values from the module-level `config`: apply turn rate to heading, then advance by `speed × displacementMultiplier` along heading.
- **Throttle is always on.** `brake` decelerates and, from a stop, reverses slowly. `left`/`right` turn. `nitro`, `item`, `itemAlt` are actions.
- Base values (in `config`, per-truck stats added by the shop in ADR 006):

| Parameter | Base |
| --- | --- |
| Top speed | 320 u/s |
| Time to top speed | 1.2 s |
| Turn rate | 270°/s at rest, blending linearly to 240°/s at top speed |
| Brake | 600 u/s², reverse cap 120 u/s |
| Hitbox | circle r = 14 |

- **Multiplier rules.** Surface, nitro, boost pad, drift and drift-boost multiply the tick's displacement, never the speed scalar, so mud bites instantly and ends instantly. Wall, landing and spin-out scale the speed scalar, so the truck accelerates back. Of nitro (1.5), boost pad (1.5) and drift boost (1.25) only the largest applies. Drift (0.92) and surface multiply on top, except nitro ignores surface.
- **Walls**: the truck is pushed back to the side of each wall it started the tick on, so no speed can tunnel through. First contact (after at least one free tick): speed × 0.7. Each further contact tick: speed × 0.97. No bounce.
- **Trucks**: push apart along the center line, headings unchanged, weighted by mass = 1 + 0.15 × armor upgrade level.
- **Drift**: holding one turn for more than 4 ticks above 70 % of top speed enters drift: turn rate × 1.4, displacement × 0.92. While drifting, the opposite button halves turn rate instead of ending the drift; drift ends when both turn buttons are released. Release after at least 8 drift ticks grants 0.6 s at × 1.25.
- **Nitro**: 3 per race base, max 6. 1.2 s at × 1.5 ignoring surface. Blocked while airborne or spun out. **Rocket start**: a `nitro` press (rising edge) within the last 10 ticks of the countdown grants a free 0.6 s at × 1.25 and consumes no nitro.
- **Jumps**: ramp tiles set airborne for `12 + 10 × speedFraction` ticks: no steering, no surface effects, no item use. Landing scales speed × 0.85 (shocks upgrades raise this toward × 1.0). Landing within 28 u of another truck spins that truck out (M2).
- **Surfaces** (tile-based, ADR 003):

| Surface | Displacement | Extra |
| --- | --- | --- |
| Dirt | 1.0 | default |
| Tarmac | 1.05 | turn rate × 0.9 |
| Mud | 0.6 | no drift |
| Water | 0.75 | no drift |
| Oil | 1.0 | for 1 s after contact, each tick's movement direction is offset by a seeded ±20°; heading itself is untouched; turn rate × 0.5 |
| Boost pad | 1.5 for 0.5 s | directional; wrong way gives nothing |
| Toxic | 0.6 | −1 armor on entry, then every 15 ticks inside; never below 1; timer resets on exit |
| Moguls | 0.85 | each bump tile is a 4-tick hop: no steering while airborne, no landing penalty |
| Ramp | — | airborne trigger |

- **Spin-out** (from damage): 0.8 s, no steering or brake, speed × 0.3 then normal acceleration resumes, heading unchanged in the sim; the sprite tweens a full turn.
- **Drift exit**: leaving a drift-capable surface or dropping below 70 % of top speed ends the drift without a boost.

## Consequences

Two-button steering plus drift gives a skill ceiling without a joystick. Always-on throttle removes a button from the phone controller. Wall-riding is penalized every tick so the racing line beats the outer wall. Every number is a config value tuned against the replay test.

## Alternatives

- Eight-way absolute steering with a virtual stick: faithful, unplayable on a phone in landscape with one thumb per side.
- Velocity-vector physics with friction: prettier slides, much harder to keep deterministic and to tune. The original was heading-plus-speed too.

## Acceptance

Kernel tests: a truck reaches top speed in 36 ticks, turns 270° in 30 ticks at rest, enters drift on tick 5 of a held turn at speed, receives the boost on release after 8 drift ticks and not after 7, cannot nitro while airborne, loses no armor below 1 in toxic, nitro on a boost pad yields × 1.5 not × 2.25, and ten ticks of wall contact end slower than one.
