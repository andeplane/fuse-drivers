import { config, type SurfaceKind } from './config.ts';

export interface Point { x: number; y: number }
export interface Segment { a: Point; b: Point }
export interface Checkpoint { a: Point; b: Point; mid: Point }
export interface Spawn extends Point { heading: number }

/** Parsed track: absolute world coordinates, gameplay layers only (ADR 003). */
export interface Track {
  name: string;
  cols: number;
  rows: number;
  tile: number;
  /** Row-major surface grid; null means off-track infield (treated as dirt). */
  surface: (SurfaceKind | null)[];
  walls: Segment[];
  checkpoints: Checkpoint[];
  spawns: Spawn[];
  waypoints: Point[];
  items: Point[];
}

const SURFACE_KINDS: SurfaceKind[] = ['dirt', 'tarmac', 'mud', 'water', 'oil', 'boost', 'toxic', 'mogul', 'ramp'];

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null;
const num = (v: unknown, what: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`track: ${what} must be a finite number`);
  return v;
};

function layer(json: Json, name: string, type: 'tilelayer' | 'objectgroup', required: boolean): Json | undefined {
  const layers = Array.isArray(json.layers) ? (json.layers as unknown[]) : [];
  const found = layers.find((l): l is Json => isObj(l) && l.name === name && l.type === type);
  if (!found && required) throw new Error(`track: missing required ${type} layer "${name}"`);
  return found;
}

function points(obj: Json, key: 'polyline' | 'polygon'): Point[] | undefined {
  const raw = obj[key];
  if (!Array.isArray(raw)) return undefined;
  const ox = num(obj.x, 'object x');
  const oy = num(obj.y, 'object y');
  return raw.map((p, i) => {
    if (!isObj(p)) throw new Error(`track: bad ${key} point ${i}`);
    return { x: ox + num(p.x, 'point x'), y: oy + num(p.y, 'point y') };
  });
}

function objects(json: Json, name: string, required: boolean): Json[] {
  const l = layer(json, name, 'objectgroup', required);
  if (!l) return [];
  return (Array.isArray(l.objects) ? (l.objects as unknown[]) : []).filter(isObj);
}

/** Pure parser: hand it parsed Tiled JSON with embedded tilesets. Throws naming the offending layer. */
export function parseTrack(input: unknown, name = 'track'): Track {
  if (!isObj(input)) throw new Error('track: not an object');
  const cols = num(input.width, 'width');
  const rows = num(input.height, 'height');
  const tile = num(input.tilewidth, 'tilewidth');
  if (tile !== config.tile) throw new Error(`track: tilewidth must be ${config.tile}`);

  const gidToSurface = new Map<number, SurfaceKind>();
  for (const ts of Array.isArray(input.tilesets) ? (input.tilesets as unknown[]) : []) {
    if (!isObj(ts) || !Array.isArray(ts.tiles)) throw new Error('track: tilesets must be embedded');
    const first = num(ts.firstgid, 'firstgid');
    for (const t of ts.tiles as unknown[]) {
      if (!isObj(t)) continue;
      const props = Array.isArray(t.properties) ? (t.properties as unknown[]) : [];
      const sp = props.find((p): p is Json => isObj(p) && p.name === 'surface');
      if (!sp) continue;
      if (!SURFACE_KINDS.includes(sp.value as SurfaceKind)) throw new Error(`track: unknown surface "${String(sp.value)}"`);
      gidToSurface.set(first + num(t.id, 'tile id'), sp.value as SurfaceKind);
    }
  }

  const surfaceLayer = layer(input, 'surface', 'tilelayer', true)!;
  const data = surfaceLayer.data;
  if (!Array.isArray(data) || data.length !== cols * rows) throw new Error('track: surface layer data size mismatch');
  const surface = (data as unknown[]).map((gid, i) => {
    const g = num(gid, `surface gid ${i}`);
    if (g === 0) return null;
    const s = gidToSurface.get(g);
    if (!s) throw new Error(`track: surface gid ${g} has no surface property`);
    return s;
  });

  const walls: Segment[] = [];
  for (const o of objects(input, 'walls', true)) {
    const pts = points(o, 'polyline') ?? points(o, 'polygon');
    if (!pts || pts.length < 2) throw new Error('track: wall objects must be polylines or polygons');
    for (let i = 1; i < pts.length; i++) walls.push({ a: pts[i - 1], b: pts[i] });
    if (o.polygon) walls.push({ a: pts[pts.length - 1], b: pts[0] });
  }

  const checkpoints = objects(input, 'checkpoints', true).map((o, i) => {
    const pts = points(o, 'polyline');
    if (!pts || pts.length !== 2) throw new Error(`track: checkpoint ${i} must be a two-point polyline`);
    return { a: pts[0], b: pts[1], mid: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } };
  });
  if (checkpoints.length < 2) throw new Error('track: need at least two checkpoints');

  const spawns = objects(input, 'spawns', true).map((o) => ({
    x: num(o.x, 'spawn x'),
    y: num(o.y, 'spawn y'),
    heading: ((typeof o.rotation === 'number' ? o.rotation : 0) * Math.PI) / 180,
  }));
  if (spawns.length < 5) throw new Error('track: need five spawns');

  const wp = objects(input, 'waypoints', true)[0];
  const waypoints = wp ? points(wp, 'polygon') ?? points(wp, 'polyline') : undefined;
  if (!waypoints || waypoints.length < 3) throw new Error('track: waypoints must be one polygon');

  const items = objects(input, 'items', false).map((o) => ({ x: num(o.x, 'item x'), y: num(o.y, 'item y') }));

  return { name, cols, rows, tile, surface, walls, checkpoints, spawns, waypoints, items };
}

export function surfaceAt(track: Track, x: number, y: number): SurfaceKind {
  const c = Math.floor(x / track.tile);
  const r = Math.floor(y / track.tile);
  if (c < 0 || r < 0 || c >= track.cols || r >= track.rows) return 'dirt';
  return track.surface[r * track.cols + c] ?? 'dirt';
}
