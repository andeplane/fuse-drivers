# ADR 006: Series, prize money and the shop

Date: 2026-09-15. Status: accepted, implemented in M2.

## Context

The between-race shop is what people remember from Super Off Road. It is also the rubber band: a losing driver buys speed, a winning driver buys nothing they need.

## Decision

- A **series** is 5 races over the available track variants, chosen by a seeded shuffle without repeats. Placement points 5/3/2/1/0 per race, tie-break on total money earned. Series winner screen shows per-driver points, money, kills, deaths, laps led and nitros used.
- **Prize money** per race: $1500 / $1300 / $1100 / $900 / $700 by placement, plus $100 per kill. The flat curve is deliberate: the shop must let last place catch up.
- **Shop** between races. Cost per level $600 / $900 / $1300 / $1800 / $2400 for five-level rows; armor has three levels at $900 / $1500 / $2400; nitro is $500 per unit, max 6 per race.

| Upgrade | Levels | Per level |
| --- | --- | --- |
| Top speed | 5 | +16 u/s |
| Acceleration | 5 | −0.08 s to top speed |
| Tires | 5 | +6°/s turn rate at top speed, five levels reaching the at-rest rate |
| Shocks | 5 | landing speed multiplier +0.03 |
| Armor | 3 | +1 max armor (cap 7) and +0.15 mass |
| Nitro | 3 | +1 nitro per race (cap 6) |

- Upgrades persist for the series and reset at the next one. The kernel reads per-truck stats, never globals.
- Bots shop with the same money, buying the cheapest affordable upgrade (ties in table order) until nothing is affordable.
- Single race mode skips the shop and uses base stats.

## Consequences

Rubber-banding comes from item odds (ADR 005) and money, never from bot physics. M1 needs only the per-truck stats struct with base values; the shop scene and money arrive in M2.

## Alternatives

- Experience or unlock trees: out of scope, and not the original's spirit.
- Rubber-band bot speed: feels like cheating because it is.

## Acceptance

Tests: money and points after a scripted five-race series; shop rejects unaffordable and over-level purchases; a truck with max upgrades hits the documented top speed, turn rate and armor; bots end a series with nothing affordable left.
