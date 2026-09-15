import Phaser from 'phaser';
import { parseTrack } from '../../shared/track.ts';
const rawTracks = import.meta.glob('../../../tracks/*.tmj', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const TRUCK_COLORS = ['cyan', 'pink', 'lime', 'orange', 'violet'] as const;
export const TRUCK_CELL = 256;
export const TILE_PX = 128;
export const SPRITE_CELL = 128;
export const FONT = { fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 6 };
/** Frame indices in the split strips (see scripts/build-assets.py output). */
export const FRAMES = {
  projectiles: { missile: 0, mineArmed: 2, mineUnarmed: 3, drone: 4, shield: 5, oil: 6, emp: 7 },
  icons: { missile: 0, mine: 1, oil: 2, nitro: 3, shield: 4, drone: 5, emp: 6, empty: 7 },
  explosionFrames: [0, 1, 2, 3, 4],
  /** Brown dirt puffs in the dust strip. */
  dust: [1, 2, 3, 4],
  /** bars strip: lit/unlit pairs; armor pair per truck colour at 2 * slot. */
  bars: { nitro: 10, nitroEmpty: 11 },
  countdown: { go: 3, finish: 4 },
} as const;
/** Cell sizes of the HUD strips cut by scripts/build-assets.py. */
export const HUD_CELL = { portraits: 128, bars: 64, countdown: 640, placements: 256, logo: 768 } as const;
export const PANELS = ['grey', 'cyan', 'pink', 'lime', 'orange', 'violet', 'gold', 'bar'] as const;

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    this.load.image('surfaces', 'assets/surfaces.png');
    this.load.image('grandstand', 'assets/grandstand.png');
    this.load.image('fence', 'assets/fence.png');
    for (const c of TRUCK_COLORS) this.load.spritesheet(`truck-${c}`, `assets/truck-${c}.png`, { frameWidth: TRUCK_CELL, frameHeight: TRUCK_CELL });
    for (const n of ['itembox', 'projectiles', 'explosion', 'icons', 'dust', 'decor']) this.load.spritesheet(n, `assets/${n}.png`, { frameWidth: SPRITE_CELL, frameHeight: SPRITE_CELL });
    for (const [n, size] of Object.entries(HUD_CELL)) this.load.spritesheet(n, `assets/${n}.png`, { frameWidth: size, frameHeight: size });
    for (const p of PANELS) this.load.image(`panel-${p}`, `assets/panel-${p}.png`);
  }

  create() {
    this.anims.create({ key: 'box-pulse', frames: this.anims.generateFrameNumbers('itembox', { frames: [0, 1, 2, 3] }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'explode', frames: this.anims.generateFrameNumbers('explosion', { frames: [...FRAMES.explosionFrames] }), frameRate: 12 });
    const tracks = Object.fromEntries(Object.entries(rawTracks).map(([path, raw]) => { const n = path.split('/').pop()!.replace('.tmj', ''); return [n, parseTrack(JSON.parse(raw), n)]; }));
    this.scene.start('Menu', { tracks });
  }
}
