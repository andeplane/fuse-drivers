# Ground tileset (raw)

All files 1024x1024. Textures: `gpt-image` CLI, opaque, quality medium. Sheets: `scripts/gen-image.py` (real alpha, quality medium), then alpha below 32 zeroed to strip halo. Downscaled to 32 px tiles in code.

## Seamless ground textures (surface layer, ADR 004)

| File | Use |
| --- | --- |
| `dirt.png` | Default racing surface (x1.0). Packed brown dirt with tyre marks. |
| `tarmac.png` | Tarmac (x1.05, turn x0.9). Dark grey asphalt grain. |
| `mud.png` | Mud (x0.6, no drift). Wet dark brown ridges with highlights. |
| `water.png` | Water (x0.75, no drift). Muddy puddle with light ripples. |
| `oil.png` | Oil (heading noise, turn x0.5). Black slick with rainbow sheen. |
| `toxic.png` | Toxic (x0.6, armor damage). Bright green bubbling sludge. |
| `infield.png` | Non-driving areas outside the racing line. Lighter tan dirt with sparse grass tufts. |

Textures were prompted as seamless; verify wrap in-engine, the model does not guarantee pixel-exact edges.

## Sprite sheets (RGBA)

| File | Grid | Cells |
| --- | --- | --- |
| `barriers.png` | 4x4, 256 px cells | Row 1: horizontal straight, vertical straight, rounded outer corner top-left, rounded outer corner top-right. Row 2: rounded outer corner bottom-left, rounded outer corner bottom-right, diagonal segment (NE-SW), diagonal segment (NW-SE). Row 3: diagonal segment, diagonal segment, end cap left, end cap right. Row 4: tyre clusters 2x2, triangle-3, 1x4 row, 2-over-3. |
| `moguls.png` | 1x4 row, 256 px cells, centered vertically | Four dirt mogul bump variants, highlight on top, shadow below, loose pebbles around. |
| `ramp.png` | 1x2 row, 512 px cells | Wooden jump ramp pointing up with red arrow; dirt landing patch with tyre marks and grass. |
| `boost.png` | 1x2 row, 512 px cells | Blue chevron boost pad with hazard-stripe rails, frame 1 dim, frame 2 glowing cyan. Chevrons point up; rotate in Tiled for direction. |
| `startline.png` | 2 cells stacked vertically | Top: horizontal checkered strip with red/yellow end posts (~x 80-940, y 90-245). Bottom: vertical strip (~x 420-605, y 315-935). Not a uniform grid, crop by bounding box. |
| `decor.png` | 4x4, 256 px cells | Row 1: oil drum, tyre stack, pipe straight, pipe elbow. Row 2: small tank, cone, hay bale, ACE sign board. Row 3: floodlight base, puddle splash mark, dirt clump, grass tuft. Row 4: crowd/grandstand strip x3, empty. Cut by `build-assets.py` into `public/assets/decor.png` (15 cells of 128 px in this order); RaceScene tiles the crowd and places props outside the outer barrier. |

## Known defects

- `barriers.png`: the four "inner corner" cells (row 2 cols 3-4, row 3 cols 1-2) came out as 45-degree diagonal chicane segments, not square inner corners. Use them as diagonals; build square inner corners by rotating the outer corners or from straights in code.
- `startline.png`: two strips are not on a uniform cell grid, slice by bounding box.
- All sheets: ~0.4-2.5% of pixels have partial alpha (edge antialiasing after the halo strip). Downscale with nearest-neighbour or threshold alpha at 128 for hard pixel edges.
- `oil.png` is very saturated; may need a darker tint in code so trucks stay readable on top.
