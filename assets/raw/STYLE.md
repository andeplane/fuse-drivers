# Fuse Drivers asset style brief

Chosen direction: `docs/concepts/style-02-arcade-1989.png`. Use it as the visual reference for every asset.

## Style paragraph (paste into every prompt)

> Authentic late-1980s arcade pixel art in the style of Super Off Road: chunky limited 16-color palette, thick black outlines, bright saturated colors, crisp clean pixels, no anti-aliasing, no blur, no gradients, no photorealism. Strict top-down view. Sprite sheet layout with cells on a uniform grid, generous padding, plain solid transparent background, nothing else in the image.

## Rules

- Generate with `gpt-image` (source `~/.zshrc` first for the API key). Quality `medium` for tiles and effects, `high` for trucks, logo and anything with text.
- Transparent background: no `-i`; put "transparent background" in the prompt. For seamless ground textures use `--background opaque`.
- Every output goes in `assets/raw/<group>/` as `<name>.png` at the model's native size. Downscaling to 32 px tiles and 32×24 px trucks happens later in code, so keep shapes bold and simple; fine detail will vanish.
- Look at every image after generating it (Read tool). Regenerate once if the layout, view angle or count is wrong. Do not loop more than twice per asset.
- Write `assets/raw/<group>/README.md`: one line per file with the intended use, grid layout if a sheet, and any known defect.
- Truck colors: cyan #2EE6FF, pink #FF4FA3, lime #9CFF2E, orange #FF9A2E, violet #B45CFF.
