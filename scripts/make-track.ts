/**
 * Writes tracks/<name>.tmj from a centerline definition so the map stays editable in Tiled.
 * Usage: npx tsx scripts/make-track.ts
 *
 * The world is 1024 x 512 u and the race camera zooms it to fill the screen under the HUD (ADR 003 amendment),
 * so a 90 u lane reads like the concept art. Lanes run in rows and columns 115 u apart: a 90 u lane plus the
 * barrier between neighbours. Keep lane centres at least 80 u from the side edges and 90 u from the top so
 * the stadium fits around them.
 */
import { writeFileSync } from 'node:fs';

const TILE = 32, COLS = 32, ROWS = 16, HALF_WIDTH = 45;
import { SURFACE_KINDS as SURFACES, type SurfaceKind as Surface } from '../src/shared/config.ts';
type P = { x: number; y: number };

interface Zone { surface: Surface; test: (p: P) => boolean }
interface BridgeDef {
  /** Centre of the crossing and half-size of the deck rectangle. */
  center: P;
  half: number;
  /** Control-point index range [from, to] (inclusive) of the lane that runs over the deck. */
  deck: [number, number];
  entry: 'left' | 'right' | 'top' | 'bottom';
}
interface TrackDef {
  name: string;
  control: P[];
  /** Indices into `control` that get a checkpoint; the finish is added at the start automatically. */
  corners: number[];
  zones: Zone[];
  items: P[];
  bridge?: BridgeDef;
}

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const inCircle = (c: P, r: number) => (p: P) => dist(p, c) <= r;
const inRect = (x0: number, y0: number, x1: number, y1: number) => (p: P) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
const pts = (...xy: number[]) => Array.from({ length: xy.length / 2 }, (_, i) => ({ x: xy[2 * i], y: xy[2 * i + 1] }));

/** Refinery: a folded S of four lanes, two hairpins around toxic pools, moguls on the top straight, a ramp on the right (PLAN.md). */
const refinery: TrackDef = {
  name: 'refinery',
  control: pts(520, 437, 860, 437, 944, 380, 944, 150, 880, 92, 520, 92, 140, 92, 82, 149, 140, 207, 500, 207, 770, 207, 827, 264, 770, 322, 500, 322, 140, 322, 82, 379, 140, 437),
  corners: [3, 5, 8, 10, 12, 14, 16],
  zones: [
    { surface: 'boost', test: inRect(560, 392, 600, 482) },
    { surface: 'ramp', test: inRect(890, 250, 1000, 272) },
    { surface: 'mogul', test: (p) => p.y > 47 && p.y < 137 && [620, 680, 740].some((x) => Math.abs(p.x - x) < 14) },
    { surface: 'toxic', test: inCircle({ x: 770, y: 264 }, 50) },
    { surface: 'toxic', test: inCircle({ x: 140, y: 379 }, 50) },
  ],
  items: pts(300, 72, 300, 92, 300, 112),
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

type Tagged = P & { src: number };
/**
 * Offset a closed centerline by `d` (sign picks the side), dropping points that fold back on tight corners. Keeps the source
 * sample index. Only the nearby stretch of centerline counts, so a lane crossing this one (a bridge) does not delete its walls.
 */
function offset(center: P[], d: number, window = Math.floor(center.length / 2)): Tagged[] {
  const n = center.length;
  const raw = center.map((p, i) => {
    const a = center[(i - 1 + n) % n], b = center[(i + 1) % n];
    const tx = b.x - a.x, ty = b.y - a.y, len = Math.hypot(tx, ty) || 1;
    return { x: p.x - (ty / len) * d, y: p.y + (tx / len) * d, src: i };
  });
  return raw.filter((p) => {
    const local = Array.from({ length: 2 * window + 1 }, (_, k) => center[(p.src - window + k + n) % n]);
    return distToPolyline(p, local, false) >= Math.abs(d) - 1;
  });
}

/** Split a wall ring into plain, `under` and `deck` polylines around a bridge crossing. */
function splitRing(ring: Tagged[], def: TrackDef, perSegment: number, center: P[]): { pts: P[]; tag?: 'under' | 'deck' }[] {
  const b = def.bridge;
  if (!b) return [{ pts: ring }];
  const inRegion = (p: P) => Math.abs(p.x - b.center.x) <= b.half && Math.abs(p.y - b.center.y) <= b.half;
  const onDeck = (p: Tagged) => p.src >= b.deck[0] * perSegment && p.src <= (b.deck[1] + 1) * perSegment;
  // A railing is only exempt for ground trucks where it actually crosses the under lane, and an under wall only where it
  // crosses the deck lane; elsewhere inside the region the walls stay solid so nobody slips out through the corners.
  const deckLane = center.filter((_, i) => i >= b.deck[0] * perSegment && i <= (b.deck[1] + 1) * perSegment);
  const underLane = center.filter((p, i) => inRegion(p) && !(i >= b.deck[0] * perSegment && i <= (b.deck[1] + 1) * perSegment));
  const nearLane = (p: P, lane: P[]) => lane.some((q) => Math.hypot(q.x - p.x, q.y - p.y) <= HALF_WIDTH + 12);
  const tagOf = (p: Tagged): 'under' | 'deck' | undefined => {
    if (!inRegion(p)) return undefined;
    if (onDeck(p)) return nearLane(p, underLane) ? 'deck' : undefined;
    return nearLane(p, deckLane) ? 'under' : undefined;
  };
  const out: { pts: P[]; tag?: 'under' | 'deck' }[] = [];
  const n = ring.length;
  // Start at a point outside the region so runs do not wrap awkwardly.
  let start = ring.findIndex((p) => !inRegion(p));
  if (start < 0) start = 0;
  let run: P[] = [], tag = tagOf(ring[start]);
  for (let k = 0; k <= n; k++) {
    const p = ring[(start + k) % n];
    const t = tagOf(p);
    if (t !== tag && run.length) { run.push(p); out.push({ pts: run, tag }); run = []; tag = t; }
    run.push(p);
  }
  if (run.length > 1) out.push({ pts: run, tag });
  return out;
}

function build(def: TrackDef) {
  const center = catmullRom(def.control, 12);
  // The whole stadium floor is dirt, like the original; walls define the lanes. Zones only apply on the lane.
  const surfaceOf = (p: P): Surface => {
    if (distToPolyline(p, center, true) <= HALF_WIDTH + 6) for (const z of def.zones) if (z.test(p)) return z.surface;
    return 'dirt';
  };
  const data: number[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const s = surfaceOf({ x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 });
      data.push(SURFACES.indexOf(s) + 1);
    }

  let id = 1;
  const poly = (name: string, pts: P[], key: 'polyline' | 'polygon') => ({ id: id++, name, x: 0, y: 0, [key]: pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })), visible: true, rotation: 0 });

  // A crossing lane would delete this lane's walls where they pass over it, so bridge tracks only look at the local stretch.
  const window = def.bridge ? 24 : undefined;
  const outer = offset(center, HALF_WIDTH, window), inner = offset(center, -HALF_WIDTH, window);
  /** Distance along the ray p + s*dir to the nearest wall hit, so checkpoints span exactly the lane (plus a hair). */
  const rayToWalls = (p: P, dir: P): number => {
    let best = Infinity;
    for (const ring of [outer, inner]) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const ex = b.x - a.x, ey = b.y - a.y;
        const den = dir.x * ey - dir.y * ex;
        if (Math.abs(den) < 1e-9) continue;
        const s = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
        const u = ((a.x - p.x) * dir.y - (a.y - p.y) * dir.x) / den;
        if (s > 0 && u >= 0 && u <= 1) best = Math.min(best, s);
      }
    }
    return Number.isFinite(best) ? best + 3 : HALF_WIDTH + 10;
  };
  const perp = (i: number): P[] => {
    const p = center[i], a = center[(i - 1 + center.length) % center.length], b = center[(i + 1) % center.length];
    const tx = b.x - a.x, ty = b.y - a.y, len = Math.hypot(tx, ty) || 1;
    const n = { x: -ty / len, y: tx / len };
    const s1 = rayToWalls(p, n), s2 = rayToWalls(p, { x: -n.x, y: -n.y });
    return [{ x: p.x + n.x * s1, y: p.y + n.y * s1 }, { x: p.x - n.x * s2, y: p.y - n.y * s2 }];
  };
  const walls = [...splitRing(outer, def, 12, center), ...splitRing(inner, def, 12, center)].map((w, k) => {
    const o = poly(`wall${k}`, w.pts, def.bridge ? 'polyline' : 'polygon') as Record<string, unknown>;
    if (w.tag) o.properties = [{ name: w.tag, type: 'bool', value: true }];
    return o;
  });
  const bridges = def.bridge ? [{ id: id++, name: 'deck', x: def.bridge.center.x - def.bridge.half, y: def.bridge.center.y - def.bridge.half, width: def.bridge.half * 2, height: def.bridge.half * 2, rotation: 0, visible: true, properties: [{ name: 'entry', type: 'string', value: def.bridge.entry }] }] : [];
  const checkpoints = [...def.corners.map((ci, k) => poly(`cp${k + 1}`, perp(ci * 12), 'polyline')), poly('finish', perp(0), 'polyline')];

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
      group('walls', walls), group('checkpoints', checkpoints), group('spawns', spawns), group('waypoints', waypoints), group('items', items), group('bridges', bridges),
    ],
  };
}

/** Sump: tight technical zig-zag of four rows, a water crossing, two ramps in sequence, a tarmac straight (PLAN.md). */
const sump: TrackDef = {
  name: 'sump',
  control: pts(380, 92, 700, 92, 886, 92, 944, 149, 886, 207, 560, 207, 255, 207, 197, 264, 255, 322, 560, 322, 886, 322, 944, 380, 886, 437, 500, 437, 140, 437, 82, 380, 82, 150, 140, 92),
  corners: [2, 4, 6, 8, 10, 12, 14, 16],
  zones: [
    { surface: 'boost', test: inRect(410, 47, 450, 137) },
    { surface: 'water', test: inCircle({ x: 560, y: 322 }, 60) },
    { surface: 'ramp', test: inRect(30, 300, 135, 318) },
    { surface: 'ramp', test: inRect(30, 228, 135, 246) },
    { surface: 'tarmac', test: inRect(250, 390, 750, 485) },
    { surface: 'toxic', test: inCircle({ x: 886, y: 149 }, 50) },
    { surface: 'mud', test: inCircle({ x: 720, y: 207 }, 50) },
  ],
  items: pts(400, 187, 400, 207, 400, 227),
};

/** Sidewinder: figure-eight with an orthogonal bridge crossing at (512,322), mud in the left loop, oil at the deck exit (PLAN.md). */
const sidewinder: TrackDef = {
  name: 'sidewinder',
  control: pts(240, 437, 140, 437, 82, 380, 82, 150, 140, 92, 330, 92, 387, 149, 330, 207, 255, 207, 197, 264, 255, 322, 512, 322, 680, 322, 737, 380, 794, 437, 886, 437, 944, 380, 944, 150, 886, 92, 570, 92, 512, 150, 512, 322, 512, 382, 455, 437),
  corners: [3, 5, 8, 12, 15, 17, 19],
  zones: [
    { surface: 'boost', test: inRect(160, 392, 200, 482) },
    { surface: 'mud', test: inCircle({ x: 82, y: 265 }, 55) },
    { surface: 'oil', test: inCircle({ x: 500, y: 412 }, 30) },
    { surface: 'toxic', test: inCircle({ x: 330, y: 149 }, 50) },
  ],
  items: pts(730, 72, 730, 92, 730, 112),
  bridge: { center: { x: 512, y: 322 }, half: 60, deck: [20, 21], entry: 'top' },
};

for (const def of [refinery, sump, sidewinder]) {
  writeFileSync(`tracks/${def.name}.tmj`, JSON.stringify(build(def)));
  console.log(`wrote tracks/${def.name}.tmj`);
}
