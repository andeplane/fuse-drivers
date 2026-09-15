import type { Point, Segment } from './track.ts';

export function closestOnSegment(p: Point, s: Segment): Point {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) * dy) / len2));
  return { x: s.a.x + t * dx, y: s.a.y + t * dy };
}

/** Does the directed segment p0→p1 cross segment s (either direction)? */
export function crosses(p0: Point, p1: Point, s: Segment): boolean {
  const d1 = (s.b.x - s.a.x) * (p0.y - s.a.y) - (s.b.y - s.a.y) * (p0.x - s.a.x);
  const d2 = (s.b.x - s.a.x) * (p1.y - s.a.y) - (s.b.y - s.a.y) * (p1.x - s.a.x);
  const d3 = (p1.x - p0.x) * (s.a.y - p0.y) - (p1.y - p0.y) * (s.a.x - p0.x);
  const d4 = (p1.x - p0.x) * (s.b.y - p0.y) - (p1.y - p0.y) * (s.b.x - p0.x);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
