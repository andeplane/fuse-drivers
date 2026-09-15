import Phaser from 'phaser';
import { parseTrack } from '../../shared/track.ts';
import refineryRaw from '../../../tracks/refinery.tmj?raw';

export const TRUCK_COLORS = ['cyan', 'pink', 'lime', 'orange', 'violet'] as const;
export const TRUCK_CELL = 256;
export const TILE_PX = 128;

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.image('surfaces', 'assets/surfaces.png');
    for (const c of TRUCK_COLORS) this.load.spritesheet(`truck-${c}`, `assets/truck-${c}.png`, { frameWidth: TRUCK_CELL, frameHeight: TRUCK_CELL });
  }

  create() {
    const track = parseTrack(JSON.parse(refineryRaw), 'refinery');
    this.scene.start('Race', { track, seed: Date.now() >>> 0 });
  }
}
