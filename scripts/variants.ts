/**
 * Writes <track>.mirror.tmj and <track>.reverse.tmj beside each base track (ADR 003).
 * Mirror flips x for every layer and object; reverse reverses checkpoints, waypoints and spawn headings.
 * Usage: npx tsx scripts/variants.ts
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

type Json = Record<string, unknown>;
type P = { x: number; y: number };

const WIDTH = 1600;
const MIRROR_ENTRY: Record<string, string> = { left: 'right', right: 'left', top: 'top', bottom: 'bottom' };

function mirrorObject(o: Json): Json {
  const out: Json = { ...o };
  const w = typeof o.width === 'number' ? o.width : 0;
  out.x = WIDTH - (o.x as number) - w;
  // Only point objects carry a heading; shapes keep rotation 0 and are mirrored through their points.
  if (o.point === true && typeof o.rotation === 'number') out.rotation = (180 - o.rotation + 360) % 360;
  for (const key of ['polyline', 'polygon'] as const) {
    if (Array.isArray(o[key])) out[key] = (o[key] as P[]).map((p) => ({ x: -p.x, y: p.y }));
  }
  if (Array.isArray(o.properties)) {
    out.properties = (o.properties as Json[]).map((p) => (p.name === 'entry' ? { ...p, value: MIRROR_ENTRY[String(p.value)] } : p));
  }
  return out;
}

function mirror(map: Json): Json {
  const cols = map.width as number;
  return {
    ...map,
    layers: (map.layers as Json[]).map((l) => {
      if (l.type === 'tilelayer') {
        const data = l.data as number[];
        const out = data.slice();
        for (let r = 0; r < (map.height as number); r++) for (let c = 0; c < cols; c++) out[r * cols + c] = data[r * cols + (cols - 1 - c)];
        return { ...l, data: out };
      }
      return { ...l, objects: (l.objects as Json[]).map(mirrorObject) };
    }),
  };
}

/** Reverse driving direction: checkpoints run backwards with the finish kept last, waypoints reverse, spawns turn around and move to the other side of the line. */
function reverse(map: Json): Json {
  return {
    ...map,
    layers: (map.layers as Json[]).map((l) => {
      if (l.type !== 'objectgroup') return l;
      const objects = l.objects as Json[];
      if (l.name === 'checkpoints') {
        const finish = objects[objects.length - 1];
        return { ...l, objects: [...objects.slice(0, -1).reverse(), finish] };
      }
      if (l.name === 'waypoints') return { ...l, objects: objects.map((o) => ({ ...o, polygon: (o.polygon as P[]).slice().reverse() })) };
      if (l.name === 'spawns') {
        // Reverse spawns sit 50..210 u along the ORIGINAL driving direction from the finish (behind the line in reverse),
        // walking the waypoint polyline so they always land on the lane, staggered ±20 u and facing backwards.
        const wp = ((map.layers as Json[]).find((x) => x.name === 'waypoints')!.objects as Json[])[0].polygon as P[];
        const finish = ((map.layers as Json[]).find((x) => x.name === 'checkpoints')!.objects as Json[]).slice(-1)[0];
        const mid = { x: (finish.polyline as P[]).reduce((s, p) => s + p.x, 0) / 2, y: (finish.polyline as P[]).reduce((s, p) => s + p.y, 0) / 2 };
        let start = 0, best = Infinity;
        wp.forEach((p, i) => { const d = Math.hypot(p.x - mid.x, p.y - mid.y); if (d < best) { best = d; start = i; } });
        const walk = (distance: number) => {
          let remaining = distance;
          for (let k = 0; k < wp.length; k++) {
            const a = wp[(start + k) % wp.length], b = wp[(start + k + 1) % wp.length];
            const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            if (remaining <= len) { const t = remaining / len; return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: Math.atan2(b.y - a.y, b.x - a.x) }; }
            remaining -= len;
          }
          return { x: wp[start].x, y: wp[start].y, heading: 0 };
        };
        return { ...l, objects: objects.map((o, i) => {
          const p = walk(50 + i * 40);
          const side = i % 2 === 0 ? -20 : 20;
          return { ...o, x: Math.round(p.x - Math.sin(p.heading) * side), y: Math.round(p.y + Math.cos(p.heading) * side), rotation: (((p.heading + Math.PI) * 180) / Math.PI) % 360 };
        }) };
      }
      if (l.name === 'bridges') {
        const flip: Record<string, string> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
        return { ...l, objects: objects.map((o) => ({ ...o, properties: (o.properties as Json[]).map((p) => (p.name === 'entry' ? { ...p, value: flip[String(p.value)] } : p)) })) };
      }
      return l;
    }),
  };
}

for (const f of readdirSync('tracks').filter((n) => n.endsWith('.tmj') && !n.includes('.mirror.') && !n.includes('.reverse.'))) {
  const base = JSON.parse(readFileSync(`tracks/${f}`, 'utf8')) as Json;
  const name = f.replace('.tmj', '');
  writeFileSync(`tracks/${name}.mirror.tmj`, JSON.stringify(mirror(base)));
  writeFileSync(`tracks/${name}.reverse.tmj`, JSON.stringify(reverse(base)));
  console.log(`wrote ${name}.mirror.tmj and ${name}.reverse.tmj`);
}
