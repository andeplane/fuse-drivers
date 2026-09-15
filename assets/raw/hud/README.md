# HUD and menu assets (raw)

All generated with `scripts/gen-image.py` (gpt-image-2, `background=transparent`, quality high), then alpha < 32 zeroed to strip halo. Every file is RGBA at the model's native size; cells are not pixel-exact, so slice by eye or with a bounding-box pass. Reference: `docs/concepts/style-02-arcade-1989.png`.

| File | Size | Use | Layout / cells | Defects |
| --- | --- | --- | --- | --- |
| `logo.png` | 1024×1024 | Menu title, results header | Two logos stacked: top = big two-line FUSE / DRIVERS with lightning bolt after DRIVERS; bottom = small single-line FUSE DRIVERS with bolt. | Letters have a yellow-to-orange dither gradient (brief says no gradients); acceptable for the logo. |
| `panels.png` | 1536×1024 | 9-slice frames for every panel | 4×2 grid. Row 1: grey border, cyan, pink, lime. Row 2: orange, violet, gold "selected" (thicker, riveted), wide short dark-grey bar for the top HUD strip. All centres flat black. | Gold frame is a bit larger than the other cells; the wide bar sits low in its cell. Corner radius small enough for 9-slice. |
| `portraits.png` | 1536×1024 | Driver chip helmet portraits | 1×6 row, left to right: cyan, pink, lime, orange, violet, grey empty seat (closed visor, no face). Includes shoulders below the helmet. | None. |
| `bars.png` | 1536×1024 | Armor segments, nitro bottles, boost pips, damage flash | 8×2 grid, left column lit, right column unlit dark grey. Rows 1–5: single armor segment in cyan, pink, lime, orange, violet. Row 6: nitro bottle (tilted). Row 7: round blue boost pip. Row 8: red damage flash segment, plus a spare grey segment. | Segments are rounded blobs rather than crisp rectangles; nitro bottle is drawn tilted ~30°. Sheet uses only the centre third of the width. |
| `countdown.png` | 1536×1024 | Race start countdown, finish and lap banners | Row 1: 3, 2, 1, GO!. Row 2: FINISH, LAP. Yellow with red outline and black drop shadow, no grid lines. | Items are not equal-width cells; slice by bounding box. |
| `shop.png` | 1536×1024 | Shop row icons (ADR 006) + money + trophy | 4×2 grid. Row 1: tyre+speedometer (top speed), engine block (acceleration), knobby tyre with green arrows (tires), coil-over shock (shocks). Row 2: riveted shield (armor), blue nitro bottle (nitro), dollar money bag (money), gold trophy (series winner). | Icons are more detailed than 32 px will hold; downscale will lose the small bits (arrows, rivets). |
| `placements.png` | 1536×1024 | Results / series screen placement badges | 1×5 row: 1ST gold, 2ND silver, 3RD bronze, 4TH grey, 5TH grey, each a medal with ribbon. | 4TH and 5TH ribbons are violet and orange rather than grey; medals themselves are grey as required. |

## Generation notes

- First pass used the `gpt-image` CLI, which writes RGB with a painted checkerboard; those files were discarded and regenerated with `scripts/gen-image.py`.
- `bars.png` and `countdown.png` needed a second prompt on the first pass (multi-segment bars; drawn grid lines). The sharper prompts were kept for the alpha regeneration.
- Each prompt described the grid and cell contents explicitly and ended with the style paragraph from `assets/raw/STYLE.md`.
