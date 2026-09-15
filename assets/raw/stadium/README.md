# Stadium (raw)

| File | Use | Notes |
|---|---|---|
| `grandstand-strip.png` | Crowd rows (y 0–580) tile the stands around the track as `public/assets/grandstand.png`; the fence with six blank banner boards (y 580–790) becomes `public/assets/fence.png` | 1536×1024 opaque, gpt-image-2 via `scripts/gen-image.py`. Tiles left to right well enough; three floodlight poles repeat with the tile. The dirt band below y 790 is unused. Banner boards are blank on purpose so sponsor names can be drawn in code. |
