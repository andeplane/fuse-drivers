/**
 * Writes tracks/<name>.tmj from a centerline definition so the map stays editable in Tiled.
 * Usage: npx tsx scripts/make-track.ts
 */
import { writeFileSync } from 'node:fs';

const TILE = 32, COLS = 50, ROWS = 28, HALF_WIDTH = 45;
const SURFACES = ['dirt', 'tarmac', 'mud', 'water', 'oil', 'boost', 'toxic', 'mogul', 'ramp', 'wall'] as const;
type Surface = (typeof SURFACES)[number];
type P = { x: number; y: number };

interface Zone { surface: Surface; test: (p: P) => boolean }
interface TrackDef {
  name: string;
  control: P[];
  /** Indices into `control` that get a checkpoint; the finish is added at the start automatically. */
  corners: number[];
  zones: Zone[];
  items: P[];
}

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const inCircle = (c: P, r: number) => (p: P) => dist(p, c) <= r;
const inRect = (x0: number, y0: number, x1: number, y1: number) => (p: P) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;

/** Refinery: ten corners in a folded S, two hairpins around toxic, moguls on the top straight, one ramp (PLAN.md). */
const refinery: TrackDef = {
  name: 'refinery',
  control: [
    { x: 800, y: 830 }, { x: 1250, y: 830 }, { x: 1480, y: 720 }, { x: 1480, y: 560 }, { x: 1330, y: 470 },
    { x: 1180, y: 560 }, { x: 1100, y: 700 }, { x: 900, y: 700 }, { x: 700, y: 700 }, { x: 560, y: 620 },
    { x: 600, y: 480 }, { x: 800, y: 430 }, { x: 1000, y: 400 }, { x: 1150, y: 300 }, { x: 1000, y: 180 },
    { x: 600, y: 180 }, { x: 300, y: 240 }, { x: 160, y: 400 }, { x: 200, y: 600 }, { x: 350, y: 700 },
    { x: 450, y: 790 }, { x: 600, y: 830 },
  ],
  corners: [2, 4, 6, 9, 11, 13, 16, 18, 20],
  zones: [
    { surface: 'boost', test: inRect(830, 780, 890, 880) },
    { surface: 'ramp', test: inRect(1420, 620, 1540, 660) },
    { surface: 'mogul', test: (p) => p.y > 130 && p.y < 230 && [700, 780, 860, 940].some((x) => Math.abs(p.x - x) < 16) },
    { surface: 'toxic', test: inCircle({ x: 1330, y: 540 }, 60) },
    { surface: 'toxic', test: inCircle({ x: 270, y: 560 }, 60) },
  ],
  items: [{ x: 450, y: 150 }, { x: 450, y: 180 }, { x: 450, y: 210 }],
};

function catmullRom(pts: P[], perSegment: number): P[] {
  const out: P[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

function distToPolyline(p: P, line: P[], closed: boolean): number {
  let best = Infinity;
  const n = line.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = line[i], b = line[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, dist(p, { x: a.x + t * dx, y: a.y + t * dy }));
  }
  return best;
}

/** Offset a closed centerline by `d` (sign picks the side), dropping points that fold back on tight corners. */
function offset(center: P[], d: number): P[] {
  const n = center.length;
  const raw = center.map((p, i) => {
    const a = center[(i - 1 + n) % n], b = center[(i + 1) % n];
    const tx = b.x - a.x, ty = b.y - a.y, len = Math.hypot(tx, ty) || 1;
    return { x: p.x - (ty / len) * d, y: p.y + (tx / len) * d };
  });
  return raw.filter((p) => distToPolyline(p, center, true) >= Math.abs(d) - 1);
}

function build(def: TrackDef) {
  const center = catmullRom(def.control, 12);
  const surfaceOf = (p: P): Surface | null => {
    if (distToPolyline(p, center, true) > HALF_WIDTH + 6) return null;
    for (const z of def.zones) if (z.test(p)) return z.surface;
    return 'dirt';
  };
  const data: number[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const s = surfaceOf({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
      data.push(s ? SURFACES.indexOf(s) + 1 : 0);
    }

  let id = 1;
  const poly = (name: string, pts: P[], key: 'polyline' | 'polygon') => ({ id: id++, name, x: 0, y: 0, [key]: pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), visible: true, rotation: 0 });
  const walls = [poly('outer', offset(center, HALF_WIDTH), 'polygon'), poly('inner', offset(center, -HALF_WIDTH), 'polygon')];

  const perp = (i: number, half: number): P[] => {
    const p = center[i], a = center[(i - 1 + center.length) % center.length], b = center[(i + 1) % center.length];
    const tx = b.x - a.x, ty = b.y - a.y, len = Math.hypot(tx, ty) || 1;
    return [{ x: p.x - (ty / len) * half, y: p.y + (tx / len) * half }, { x: p.x + (ty / len) * half, y: p.y - (tx / len) * half }];
  };
  const checkpoints = [...def.corners.map((ci, k) => poly(`cp${k + 1}`, perp(ci * 12, HALF_WIDTH + 10), 'polyline')), poly('finish', perp(0, HALF_WIDTH + 10), 'polyline')];

  const start = def.control[0];
  const heading = Math.atan2(center[1].y - start.y, center[1].x - start.x);
  const spawns = [0, 1, 2, 3, 4].map((i) => {
    const back = 50 + i * 40, side = i % 2 === 0 ? -20 : 20;
    return { id: id++, name: `spawn${i + 1}`, point: true, x: Math.round(start.x - Math.cos(heading) * back - Math.sin(heading) * side), y: Math.round(start.y - Math.sin(heading) * back + Math.cos(heading) * side), rotation: (heading * 180) / Math.PI, visible: true };
  });
  const items = def.items.map((p, i) => ({ id: id++, name: `item${i + 1}`, point: true, x: p.x, y: p.y, rotation: 0, visible: true }));
  const waypoints = [poly('line', center.filter((_, i) => i % 2 === 0), 'polygon')];

  const group = (name: string, objects: unknown[]) => ({ name, type: 'objectgroup', objects, visible: true, opacity: 1, x: 0, y: 0, id: id++ });
  return {
    type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'orthogonal', renderorder: 'right-down',
    width: COLS, height: ROWS, tilewidth: TILE, tileheight: TILE, infinite: false, nextlayerid: 99, nextobjectid: id + 1,
    tilesets: [{ firstgid: 1, name: 'surfaces', tilewidth: TILE, tileheight: TILE, tilecount: SURFACES.length, columns: SURFACES.length, image: 'surfaces.png', imagewidth: TILE * SURFACES.length, imageheight: TILE,
      tiles: SURFACES.map((s, i) => ({ id: i, properties: [{ name: 'surface', type: 'string', value: s }] })) }],
    layers: [
      { id: id++, name: 'surface', type: 'tilelayer', width: COLS, height: ROWS, data, visible: true, opacity: 1, x: 0, y: 0 },
      group('walls', walls), group('checkpoints', checkpoints), group('spawns', spawns), group('waypoints', waypoints), group('items', items),
    ],
  };
}

for (const def of [refinery]) {
  writeFileSync(`tracks/${def.name}.tmj`, JSON.stringify(build(def)));
  console.log(`wrote tracks/${def.name}.tmj`);
}
