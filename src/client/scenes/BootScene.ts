import Phaser from 'phaser';
import { parseTrack } from '../../shared/track.ts';
import refineryRaw from '../../../tracks/refinery.tmj?raw';

export const TRUCK_COLORS = ['cyan', 'pink', 'lime', 'orange', 'violet'] as const;
export const TRUCK_CELL = 256;
export const TILE_PX = 128;
export const SPRITE_CELL = 128;
/** Frame indices in the split strips (see scripts/build-assets.py output). */
export const FRAMES = {
  projectiles: { missile: 0, mineArmed: 2, mineUnarmed: 3, drone: 4, shield: 5, oil: 6, emp: 7 },
  icons: { missile: 0, mine: 1, oil: 2, nitro: 3, shield: 4, drone: 5, emp: 6, empty: 7 },
  explosionFrames: [0, 1, 2, 3, 4],
} as const;

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.image('surfaces', 'assets/surfaces.png');
    for (const c of TRUCK_COLORS) this.load.spritesheet(`truck-${c}`, `assets/truck-${c}.png`, { frameWidth: TRUCK_CELL, frameHeight: TRUCK_CELL });
    for (const n of ['itembox', 'projectiles', 'explosion', 'icons', 'markers']) this.load.spritesheet(n, `assets/${n}.png`, { frameWidth: SPRITE_CELL, frameHeight: SPRITE_CELL });
  }

  create() {
    const track = parseTrack(JSON.parse(refineryRaw), 'refinery');
    this.scene.start('Menu', { track });
  }
}
