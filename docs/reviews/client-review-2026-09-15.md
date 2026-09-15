# Client review (2026-09-15)

Findings from the last review of `src/client`, ranked. All findings applied on 2026-09-15.

1. (applied) **Perf**: `RaceScene.drawTrack` keeps a live Graphics object with ~1000 stroke calls redrawn every frame. Fix: `g.generateTexture('track-overlay', w, h)`, add an image, destroy the graphics. Same for bridge decks.
2. (applied) Spin-out: a second hit during a spin stacks a second `angle: 360` tween; `killTweensOf(sprite)` and reset angle first.
3. (applied) Drone orbit uses the 30 Hz truck position; orbit around the interpolated pose (`poses[d.owner]`). Consider lerping missiles by id too.
4. (applied) `HudScene.flash` stacks alpha tweens; `killTweensOf(this.big)` first.
5. (applied) `keydown-SPACE` once-handlers in Menu/Results/Shop fire on key auto-repeat; gate with `!e.repeat` or use `keyup`.
6. (applied) `anims.create` runs every Race.create (global keys); move to BootScene.
7. (applied) Results/applyRace use a state 75 ticks after the HUD's final placement; capture the state when `finished` is first seen and pass it on.
8. (applied) Tick rate hard-coded as 30 in RaceScene/HudScene/ResultsScene; use `TICK_RATE`/`TICK_MS` from config.
9. (applied) `BOT_LEVELS` belongs in `config.ts` (the M3 server needs it).
10. (applied) HUD speed readout re-renders text every frame; drop it or round to tens.
11. (applied) Cleanup: duplicate config import, unused `deck` field, `finishedAt` as boolean, duplicate `RaceSceneData`/`SeriesData`, `FONT` declared four times, unused `markers` and `dust` assets.
12. (applied) Polish toward the concept: thicker outlined red/white barriers baked into the overlay texture; HUD from `assets/raw/hud` sheets (panels 9-slice, portraits, bars, logo, countdown cells) after slicing them in `build-assets.py`; dust particles behind fast trucks, drop shadow under airborne trucks, dotted missile trail.

Verified clean: finished-transition guard, syncSet reset, Hud game-event listener removal, series data flow, interpolation per ADR 001.
