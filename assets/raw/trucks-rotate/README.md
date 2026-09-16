# Top-down truck for continuous rotation (raw)

| File | Use | Notes |
|---|---|---|
| `cyan-topdown.png` | The one truck image: strict top-down, nose up. `scripts/build-assets.py` cuts the glow (alpha < 160), crops, fits a 256 px cell as `public/assets/truck-cyan.png` and palette-swaps the other four colours. `RaceScene` rotates it, squashes it by `TILT` and stacks darker copies for the sides. | gpt-image-2, quality high, real alpha with a soft cyan glow. |

| `wreck-topdown.png` | Burnt truck with the same silhouette, made with `--ref cyan-topdown.png`; cut the same way to `public/assets/wreck.png`. `RaceScene` swaps it onto the dead truck's stack until it respawns. | gpt-image-2, quality high; the faint smoke is cut with the glow. |

Replaces the 16-direction tilted sheets that lived in `../trucks-tilted/` (removed; see git history).
