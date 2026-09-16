#!/usr/bin/env python3
"""Cut game-ready sheets from assets/raw into public/assets. Lanczos only; never nearest-neighbour (ADR 001).
Usage: python3 scripts/build-assets.py
"""
from pathlib import Path
from PIL import Image

RAW = Path('assets/raw'); OUT = Path('public/assets'); OUT.mkdir(parents=True, exist_ok=True)
TILE = 128            # on-disk tile size; 32 world units
TRUCK_CELL = 256      # top-down truck sprite size
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
    'boost': over(dirt, cell('boost', 2, 1, 1).rotate(-90, expand=True)), 'toxic': texture('toxic'),
    'mogul': over(dirt, cell('moguls', 4, 1, 0)), 'ramp': over(dirt, cell('ramp', 2, 1, 0)),
}
strip = Image.new('RGBA', (TILE * len(SURFACES), TILE))
for i, s in enumerate(SURFACES): strip.paste(tiles[s], (i * TILE, 0))
strip.save(OUT / 'surfaces.png')
strip.resize((32 * len(SURFACES), 32), Image.LANCZOS).save(Path('tracks') / 'surfaces.png')  # lets Tiled show the surface layer

def bands(mask, axis):
    """Runs of non-empty rows (axis=1) or columns (axis=0) in a boolean alpha mask; returns [(start, end)]."""
    proj = mask.any(axis=axis)
    out, start = [], None
    for i, v in enumerate(proj):
        if v and start is None: start = i
        if not v and start is not None: out.append((start, i)); start = None
    if start is not None: out.append((start, len(proj)))
    return out

# Trucks: one strict top-down sprite, nose up (assets/raw/trucks-rotate/README.md). The game rotates it to any
# heading, so turning is continuous instead of snapping between drawn directions.
top = Image.open(RAW / 'trucks-rotate' / 'cyan-topdown.png').convert('RGBA')
top.putalpha(top.getchannel('A').point(lambda v: 255 if v >= 160 else 0))  # cut the soft glow
top = top.crop(top.getbbox())
scale = TRUCK_CELL * 0.92 / max(top.size)
top = top.resize((round(top.width * scale), round(top.height * scale)), Image.LANCZOS)
cyan = Image.new('RGBA', (TRUCK_CELL, TRUCK_CELL), (0, 0, 0, 0))
cyan.alpha_composite(top, ((TRUCK_CELL - top.width) // 2, (TRUCK_CELL - top.height) // 2))
cyan.save(OUT / 'truck-cyan.png')
import importlib.util
spec = importlib.util.spec_from_file_location('recolor', RAW / 'trucks' / 'recolor.py'); recolor = importlib.util.module_from_spec(spec); spec.loader.exec_module(recolor)
for name, hexcolor in recolor.TARGETS.items(): recolor.recolor(OUT / 'truck-cyan.png', OUT / f'truck-{name}.png', hexcolor)

# Stadium (assets/raw/stadium/README.md): crowd rows to tile the stands, and the fence with blank banner boards.
strip = Image.open(RAW / 'stadium' / 'grandstand-strip.png').convert('RGBA')
strip.crop((0, 0, strip.width, 580)).resize((strip.width // 2, 290), Image.LANCZOS).save(OUT / 'grandstand.png')
strip.crop((0, 580, strip.width, 790)).resize((strip.width // 2, 105), Image.LANCZOS).save(OUT / 'fence.png')


def crops(name, group, min_size=12):
    """Sprites of a raw sheet found by transparent gaps, row by row, at source resolution."""
    import numpy as np
    im = Image.open(RAW / group / f'{name}.png').convert('RGBA')
    a = np.array(im)[:, :, 3] > 32
    out = []
    for (y0, y1) in bands(a, 1):
        if y1 - y0 < min_size: continue
        for (x0, x1) in bands(a[y0:y1], 0):
            if x1 - x0 < min_size: continue
            out.append(im.crop((x0, y0, x1, y1)))
    return out

def split_sheet(name, group, cell):
    """Lay a raw sheet's sprites out on a uniform-cell strip."""
    sprites = [fit(c, cell) for c in crops(name, group)]
    strip = Image.new('RGBA', (cell * len(sprites), cell), (0, 0, 0, 0))
    for i, sp in enumerate(sprites): strip.paste(sp, (i * cell, 0))
    strip.save(OUT / f'{name}.png')
    return len(sprites)

counts = {name: split_sheet(name, 'items', 128) for name in ['itembox', 'icons', 'projectiles', 'explosion', 'markers', 'dust']}
print('item sheets (sprites per strip):', counts)
# Item box: the tilted glowing cube (assets/raw/items/itembox-tilted.png) replaces the flat box; the glow is cut away.
import numpy as np
raw = np.array(Image.open(RAW / 'items' / 'itembox-tilted.png').convert('RGBA'))
raw[raw[..., 3] < 170] = 0
cube = Image.fromarray(raw)
mask = raw[..., 3] > 0
rows = [r for r in bands(mask, 1) if r[1] - r[0] > 60]
y0, y1 = rows[0][0], rows[-1][1]
cubes = [cube.crop((x0, y0, x1, y1)) for (x0, x1) in bands(mask[y0:y1], 0) if x1 - x0 > 60]
assert len(cubes) == 4, f'expected 4 item box frames, found {len(cubes)}'
box = Image.new('RGBA', (128 * 4, 128), (0, 0, 0, 0))
for i, c in enumerate(cubes): box.paste(fit(c, 128), (i * 128, 0))
box.save(OUT / 'itembox.png')

# Projectiles and effects from the elevated camera (assets/raw/items/projectiles-tilted.png), mapped into the existing
# 8-frame strip order so FRAMES.projectiles stays valid: missile, exhaust, mine armed, mine unarmed, drone, shield, oil, emp.
tilted = RAW / 'items' / 'projectiles-tilted.png'
if tilted.exists():
    raw = np.array(Image.open(tilted).convert('RGBA'))
    raw[raw[..., 3] < 150] = 0
    sheet = Image.fromarray(raw)
    mask = raw[..., 3] > 0
    cells = []
    for (y0, y1) in [r for r in bands(mask, 1) if r[1] - r[0] > 30]:
        cells += [sheet.crop((x0, y0, x1, y1)) for (x0, x1) in bands(mask[y0:y1], 0) if x1 - x0 > 30]
    assert len(cells) == 8, f'expected 8 projectile sprites, found {len(cells)}'
    missile, mine_on, mine_off, drone, shield, emp, smoke, _spark = cells
    old_strip = Image.open(OUT / 'projectiles.png').convert('RGBA')
    oil = old_strip.crop((6 * 128, 0, 7 * 128, 128))  # the drawn slick replaced this in game; keep the frame for order
    strip = Image.new('RGBA', (128 * 8, 128), (0, 0, 0, 0))
    for i, c in enumerate([missile, smoke, mine_on, mine_off, drone, shield, None, emp]):
        strip.paste(oil if c is None else fit(c, 128), (i * 128, 0))
    strip.save(OUT / 'projectiles.png')
# Wreck: a burnt truck on its roof from the elevated camera, shown while a destroyed truck waits to respawn.
wreck = RAW / 'trucks-tilted' / 'wreck-tilted.png'
if wreck.exists():
    raw = np.array(Image.open(wreck).convert('RGBA'))
    raw[raw[..., 3] < 150] = 0
    fit(Image.fromarray(raw), TRUCK_CELL).save(OUT / 'wreck.png')
# Stadium decor (assets/raw/tiles/README.md): drum, tyres, pipe, elbow, tank, cone, hay, sign, floodlight, puddle, clump, grass, crowd x3.
print('decor sprites:', split_sheet('decor', 'tiles', 128))

# HUD (assets/raw/hud/README.md). Strips: portraits 6, bars 16 (lit/unlit pairs), countdown 6, placements 5, logo 2.
counts = {name: split_sheet(name, 'hud', cell) for name, cell in [('portraits', 128), ('bars', 64), ('countdown', 640), ('placements', 256), ('logo', 768)]}
print('hud sheets (sprites per strip):', counts)
# Panels keep their own proportions for 9-slice: half source size, one file each.
for color, im in zip(['grey', 'cyan', 'pink', 'lime', 'orange', 'violet', 'gold', 'bar'], crops('panels', 'hud')):
    im = im.crop(im.getbbox()); im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(OUT / f'panel-{color}.png')
print('built', sorted(p.name for p in OUT.iterdir()))
