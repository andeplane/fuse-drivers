# Truck sprites (raw, 1024x1024 RGBA)

Generated with `scripts/gen-image.py` (gpt-image-2, `background=transparent`). All files have real alpha; `recolor.py` zeroes any alpha below 32 to strip the API's edge halo. Downscale to 32x24 in code.

| File | Use | Notes |
|---|---|---|
| `truck-cyan-single.png` | Player truck, cyan #2EE6FF | One truck, nose pointing straight up, strict top-down. Source for the other colours. |
| `truck-pink-single.png` | Player truck, pink #FF4FA3 | Palette swap of cyan (see below). |
| `truck-lime-single.png` | Player truck, lime #9CFF2E | Palette swap of cyan. |
| `truck-orange-single.png` | Player truck, orange #FF9A2E | Palette swap of cyan. |
| `truck-violet-single.png` | Player truck, violet #B45CFF | Palette swap of cyan. |
| `truck-shadow.png` | Shadow blob under airborne trucks | Two flat dark-grey ellipses side by side, both within y 400-623: large on the left (about x 48-655), small on the right (about x 740-976). Crop each in code. Opaque; renderer sets alpha. |
| `truck-wreck.png` | Burnt-out overturned truck for the 2.5 s after a kill | Dark grey/rust undercarriage, wheels up, strict top-down. Long axis is **horizontal** (sideways relative to the truck sprite); rotate 90 deg in code or accept it as "flipped sideways". |
| `recolor.py` | Halo strip + palette swap | `python3 assets/raw/trucks/recolor.py`; asserts each output's dominant colour lands on target. |

## Rotation frames: produced programmatically

ADR 001 wants 16 pre-rendered directions. Two attempts at a 4x4 rotation sheet (nose up in the top-left cell, +22.5 deg clockwise per cell, left-to-right then top-to-bottom) failed: attempt 1 only covered about +-65 deg of heading (no cell pointed right, down or left); attempt 2 got the four cardinal cells right but duplicated cell 1 in cell 2 and spaced the rest unevenly. Both were discarded.

So there is one upright frame per colour and the 16 frames must be generated in the asset pipeline: rotate the 1024 px single by `i * 22.5` deg clockwise (frame 0 = nose up, frame 4 = nose right, frame 8 = nose down, frame 12 = nose left), then downscale to 32x24 with nearest-neighbour. Rotating at raw resolution before downscaling gives cleaner pixels than rotating the small sprite, and guarantees identical geometry across all colours and frames.

## Recolor method

`recolor.py` converts the cyan truck to HSV and, for pixels within +-30 deg of the body hue with saturation > 0.3, shifts hue by the cyan-to-target delta and scales saturation/value relative to the paint colour the model actually used (measured as the most common saturated opaque pixel, which is more saturated than nominal #2EE6FF). Black outlines, greys, tyres, the white number, yellow roof lights and red details are outside the mask and untouched. Dominant colours after the swap are within 5/255 per channel of the targets.

## Known defects

- No 16-direction sheet; see above.
- Sprite bodies have alpha 224-253 rather than 255 (API output); invisible in practice.
- Truck detail (roll-cage tubing, spare tyre straps, roof lights) is finer than 32x24 can hold; it will blur to texture.
- Wreck is oriented sideways and has some rust-brown and red accents rather than pure dark grey.

## 16-direction preview

`preview-16dir.png`: the cyan source rotated 22.5° per frame at full resolution, then Lanczos-downscaled to 256 px cells on a 4×4 sheet, with one lime frame shown at 256, 64 and 44 px (44 px is roughly a truck on a 1080p screen). This is the build-time pipeline M0 implements. Never downscale sprites with nearest-neighbour; the first preview did and was unusable.
