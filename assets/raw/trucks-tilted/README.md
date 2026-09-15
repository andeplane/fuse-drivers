# Trucks from the elevated arcade camera (raw)

Generated with `scripts/gen-image.py` (gpt-image-2) for the tilted view in `docs/concepts/style-06-arcade-1989-tilted.png`. Cut into `public/assets/truck-<colour>.png` (4×4 grid of 256 px cells, frame 0 = driving up the screen, clockwise in 22.5° steps) by `scripts/build-assets.py`; the other four colours are palette swaps via `assets/raw/trucks/recolor.py`.

| File | Use | Notes |
|---|---|---|
| `cyan-8dir-try1.png` | Headings 0°, 45°, 90°, 135°, 180° (cells 1–5, row-major, 4×2 grid) | Real alpha with a soft cyan glow (alpha < 160 is cut). All 8 headings came out right; cells 6–8 are unused because the left half is mirrored. |
| `cyan-8dir-between.png` | Headings 22.5°, 67.5°, 112.5°, 157.5° (cells 1, 2, 3 mirrored, 4) | Made with `--ref cyan-8dir-try1.png` on flat magenta, keyed out. Cell 3 faces down-left instead of down-right, so it is mirrored; cells 5–8 are unused (7 and 8 are near duplicates). |
| `wreck-tilted.png` | Burnt truck on its roof with flames, shown where a destroyed truck died until it respawns | gpt-image-2, real alpha with a soft glow cut below alpha 150; cut to `public/assets/wreck.png` (256 px). |

Known defects: the between sheet's trucks are drawn slightly smaller than the main sheet's; the cutter scales every frame by one factor, so in-between frames read a little smaller. Roof lights and roll cage vanish below ~60 px on screen.
