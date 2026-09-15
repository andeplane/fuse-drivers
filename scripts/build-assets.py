#!/usr/bin/env python3
"""Cut game-ready sheets from assets/raw into public/assets. Lanczos only; never nearest-neighbour (ADR 001).
Usage: python3 scripts/build-assets.py
"""
from pathlib import Path
from PIL import Image

RAW = Path('assets/raw'); OUT = Path('public/assets'); OUT.mkdir(parents=True, exist_ok=True)
TILE = 128            # on-disk tile size; 32 world units
TRUCK_CELL = 256      # 16-direction sheet cell size
SURFACES = ['dirt', 'tarmac', 'mud', 'water', 'oil', 'boost', 'toxic', 'mogul', 'ramp']  # gid = index + 1, must match make-track.ts

def fit(im, size):
    """Downscale keeping aspect, centred on a transparent square."""
    im = im.crop(im.getbbox()) if im.mode == 'RGBA' and im.getbbox() else im
    scale = size / max(im.size)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    sq = Image.new('RGBA', (size, size), (0, 0, 0, 0)); sq.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return sq

def texture(name):
    return Image.open(RAW / 'tiles' / f'{name}.png').convert('RGBA').resize((TILE, TILE), Image.LANCZOS)

def cell(sheet, cols, rows, i):
    im = Image.open(RAW / 'tiles' / f'{sheet}.png').convert('RGBA')
    w, h = im.width // cols, im.height // rows
    return im.crop(((i % cols) * w, (i // cols) * h, (i % cols + 1) * w, (i // cols + 1) * h))

def over(base, sprite):
    out = base.copy(); out.alpha_composite(fit(sprite, TILE)); return out

# Surface tileset strip. Boost, mogul and ramp are a dirt tile with the sprite on top.
dirt = texture('dirt')
tiles = {
    'dirt': dirt, 'tarmac': texture('tarmac'), 'mud': texture('mud'), 'water': texture('water'), 'oil': texture('oil'),
    'boost': over(dirt, cell('boost', 2, 1, 1)), 'toxic': texture('toxic'),
    'mogul': over(dirt, cell('moguls', 4, 1, 0)), 'ramp': over(dirt, cell('ramp', 2, 1, 0)),
}
strip = Image.new('RGBA', (TILE * len(SURFACES), TILE))
for i, s in enumerate(SURFACES): strip.paste(tiles[s], (i * TILE, 0))
strip.save(OUT / 'surfaces.png')
texture('infield').save(OUT / 'infield.png')

# Trucks: rotate the full-resolution source, then Lanczos to 256 px cells. Frame 0 = up, clockwise.
for color in ['cyan', 'pink', 'lime', 'orange', 'violet']:
    src = Image.open(RAW / 'trucks' / f'truck-{color}-single.png').convert('RGBA')
    src = src.crop(src.getbbox())
    side = int(max(src.size) * 1.05)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0)); sq.alpha_composite(src, ((side - src.width) // 2, (side - src.height) // 2))
    sheet = Image.new('RGBA', (4 * TRUCK_CELL, 4 * TRUCK_CELL), (0, 0, 0, 0))
    for i in range(16):
        frame = sq.rotate(-22.5 * i, resample=Image.BICUBIC, expand=False).resize((TRUCK_CELL, TRUCK_CELL), Image.LANCZOS)
        sheet.alpha_composite(frame, ((i % 4) * TRUCK_CELL, (i // 4) * TRUCK_CELL))
    sheet.save(OUT / f'truck-{color}.png')

print('built', sorted(p.name for p in OUT.iterdir()))
