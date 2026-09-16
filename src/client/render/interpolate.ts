import type { RaceState } from '../../shared/race.ts';
import type { Truck } from '../../shared/truck.ts';
import { lerp, wrapAngle } from '../../shared/truck.ts';

export interface TruckPose { x: number; y: number; heading: number }
const SNAP_DISTANCE = 200;

/** ADR 001: positions lerp, headings lerp by shortest arc, respawns and teleports snap. */
export function renderTruck(prev: Truck | undefined, next: Truck, nextTick: number, alpha: number): TruckPose {
  if (!prev || next.respawnedTick === nextTick || Math.hypot(next.x - prev.x, next.y - prev.y) > SNAP_DISTANCE) {
    return { x: next.x, y: next.y, heading: next.heading };
  }
  return { x: lerp(prev.x, next.x, alpha), y: lerp(prev.y, next.y, alpha), heading: wrapAngle(prev.heading + wrapAngle(next.heading - prev.heading) * alpha) };
}

export function renderSnapshot(prev: RaceState, next: RaceState, alpha: number): TruckPose[] {
  return next.trucks.map((t, i) => renderTruck(prev.trucks[i], t, next.tick, alpha));
}
