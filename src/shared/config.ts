/** Every balance value lives here (ADR 002). Angles in radians, times in ticks or seconds as named. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const TICK_MS = 1000 / TICK_RATE;
const deg = (d: number) => (d * Math.PI) / 180;

export type SurfaceKind = 'dirt' | 'tarmac' | 'mud' | 'water' | 'oil' | 'boost' | 'toxic' | 'mogul' | 'ramp' | 'wall';

export interface SurfaceRule { speed: number; turnMul: number; drift: boolean }

/** Per-truck stats the shop upgrades (ADR 006). */
export interface TruckStats {
  topSpeed: number;
  accelTime: number;
  turnRateHigh: number;
  landingMul: number;
  maxArmor: number;
  nitros: number;
  mass: number;
}

export const BASE_STATS: TruckStats = {
  topSpeed: 320,
  accelTime: 1.2,
  turnRateHigh: deg(180),
  landingMul: 0.85,
  maxArmor: 4,
  nitros: 3,
  mass: 1,
};

export const config = {
  world: { width: 1600, height: 900 },
  tile: 32,
  laps: 4,
  countdownTicks: 90,
  raceEndGraceTicks: 240,
  truck: {
    radius: 14,
    turnRateLow: deg(270),
    brakeDecel: 600,
    reverseCap: 120,
    wallFirstHit: 0.7,
    wallSlideTick: 0.97,
    driftEnterTicks: 4,
    driftMinSpeedFrac: 0.7,
    driftTurnMul: 1.4,
    driftSpeedMul: 0.92,
    driftOppositeMul: 0.5,
    driftBoostTicks: 8,
    boostTicks: 18,
    boostMul: 1.25,
    nitroTicks: 36,
    nitroMul: 1.5,
    nitroMax: 6,
    rocketStartWindow: 10,
    airborneBase: 12,
    airborneSpeedTicks: 10,
    mogulHopTicks: 4,
    landingSpinRadius: 28,
    spinOutTicks: 24,
    spinOutSpeedMul: 0.3,
    oilTicks: 30,
    oilNoise: deg(20),
    oilTurnMul: 0.5,
    boostPadTicks: 15,
    boostPadMul: 1.5,
    toxicIntervalTicks: 15,
    respawnTicks: 75,
    invulnerableTicks: 60,
    wrongWayTicks: 30,
  },
  surfaces: {
    dirt: { speed: 1, turnMul: 1, drift: true },
    tarmac: { speed: 1.05, turnMul: 0.9, drift: true },
    mud: { speed: 0.6, turnMul: 1, drift: false },
    water: { speed: 0.75, turnMul: 1, drift: false },
    oil: { speed: 1, turnMul: 1, drift: true },
    boost: { speed: 1, turnMul: 1, drift: true },
    toxic: { speed: 0.6, turnMul: 1, drift: true },
    mogul: { speed: 0.85, turnMul: 1, drift: true },
    ramp: { speed: 1, turnMul: 1, drift: true },
    wall: { speed: 1, turnMul: 1, drift: true },
  } satisfies Record<SurfaceKind, SurfaceRule>,
  items: {
    boxCooldownTicks: 90,
    missile: { speed: 600, turnRate: deg(200), lifeTicks: 120, radius: 6, lockRange: 600, lockCone: deg(45), armTicks: 10 },
    mine: { dropBehind: 30, lobAhead: 200, armTicks: 15, lifeTicks: 600, radius: 20 },
    shieldTicks: 180,
    nitroRefill: 2,
    drone: { radius: 60, range: 80, lifeTicks: 240, maxZaps: 3, zapIntervalTicks: 30 },
    emp: { range: 250, stunTicks: 30 },
    oil: { lifeTicks: 450 },
  },
  /** Odds columns: 1st, middle, last (ADR 005). */
  itemOdds: [
    { kind: 'mine', first: 30, mid: 15, last: 5 },
    { kind: 'oil', first: 25, mid: 15, last: 5 },
    { kind: 'nitro', first: 20, mid: 15, last: 10 },
    { kind: 'shield', first: 15, mid: 20, last: 10 },
    { kind: 'missile', first: 5, mid: 20, last: 35 },
    { kind: 'drone', first: 5, mid: 10, last: 20 },
    { kind: 'emp', first: 0, mid: 5, last: 15 },
  ] as const,
  points: [5, 3, 2, 1, 0],
  prize: [1500, 1300, 1100, 900, 700],
  killBonus: 100,
} as const;

export type Config = typeof config;
