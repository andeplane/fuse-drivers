#!/usr/bin/env python3
"""Strip alpha halos from the generated truck PNGs and palette-swap the cyan truck into the other four colors.

Run from anywhere: python3 assets/raw/trucks/recolor.py
Only cyan-dominant pixels (hue within +-30 deg of #2EE6FF, saturation > 0.3) are shifted;
black outlines, greys, tyres, white number, yellow lights and red details are untouched.
"""
import colorsys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent
CYAN = "#2EE6FF"
TARGETS = {"pink": "#FF4FA3", "lime": "#9CFF2E", "orange": "#FF9A2E", "violet": "#B45CFF"}
HALO_ALPHA = 32  # anything fainter than this is API edge fuzz, not sprite


def hsv(hexcolor):
    r, g, b = (int(hexcolor[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return colorsys.rgb_to_hsv(r, g, b)


def strip_halo(path):
    a = np.array(Image.open(path).convert("RGBA"))
    a[a[..., 3] < HALO_ALPHA] = 0
    Image.fromarray(a).save(path)


def dominant(rgba):
    """Most common opaque, saturated colour: the body paint."""
    px = rgba[(rgba[..., 3] > 200) & (rgba[..., :3].max(-1) - rgba[..., :3].min(-1) > 80)][:, :3]
    vals, counts = np.unique(px, axis=0, return_counts=True)
    return vals[counts.argmax()]


def recolor(src, dst, target):
    rgba = np.array(Image.open(src).convert("RGBA"))
    h, s, v = np.moveaxis(np.array(Image.fromarray(rgba[..., :3]).convert("HSV")), -1, 0)
    # scale relative to the paint the model actually used, not the nominal cyan, so the swap lands on target
    ch, cs, cv = colorsys.rgb_to_hsv(*(dominant(rgba) / 255))
    th, ts, tv = hsv(target)
    dh = ((h.astype(int) - ch * 255 + 128) % 256) - 128  # hue distance in Pillow's 0..255 hue units
    mask = (np.abs(dh) <= 30 / 360 * 255) & (s > 0.3 * 255)
    h = np.where(mask, (h + (th - ch) * 255) % 256, h).astype(np.uint8)
    s = np.where(mask, np.clip(s * ts / cs, 0, 255), s).astype(np.uint8)
    v = np.where(mask, np.clip(v * tv / cv, 0, 255), v).astype(np.uint8)
    out = np.array(Image.fromarray(np.stack([h, s, v], -1), "HSV").convert("RGB"))
    rgba[..., :3] = out
    Image.fromarray(rgba).save(dst)
    return mask.sum()


if __name__ == "__main__":
    for p in HERE.glob("*.png"):
        strip_halo(p)
    src = HERE / "truck-cyan-single.png"
    for name, hexcolor in TARGETS.items():
        dst = HERE / f"truck-{name}-single.png"
        n = recolor(src, dst, hexcolor)
        # self-check: the most common saturated opaque colour must land near the target
        top = dominant(np.array(Image.open(dst)))
        want = np.array([int(hexcolor[i:i + 2], 16) for i in (1, 3, 5)])
        assert np.abs(top.astype(int) - want).max() < 24, (name, top, want)
        print(f"{dst.name}: {n} px swapped, dominant {tuple(top)} vs target {tuple(want)}")
