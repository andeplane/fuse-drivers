import Phaser from 'phaser';
import { config } from '../../shared/config.ts';
import type { Track } from '../../shared/track.ts';

const FONT = { fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 6 };

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(data: { track: Track }) {
    const { width, height } = config.world;
    this.add.text(width / 2, height * 0.3, 'FUSE DRIVERS', { ...FONT, fontSize: '120px', color: '#ffd23f' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.5, 'PRESS SPACE OR CLICK TO RACE', { ...FONT, fontSize: '40px' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.62, 'ARROWS / A D steer  ·  S brake  ·  SHIFT nitro  ·  SPACE item  ·  hold DOWN + SPACE to fire backwards', { ...FONT, fontSize: '22px' }).setOrigin(0.5);
    const start = () => this.scene.start('Race', { track: data.track, seed: Date.now() >>> 0 });
    this.input.keyboard!.once('keydown-SPACE', start);
    this.input.once('pointerdown', start);
  }
}
