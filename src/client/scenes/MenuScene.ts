import Phaser from 'phaser';
import { config } from '../../shared/config.ts';
import { createSeries } from '../../shared/series.ts';
import type { Track } from '../../shared/track.ts';

const FONT = { fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 6 };

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(data: { tracks: Record<string, Track> }) {
    const { width, height } = config.world;
    this.add.text(width / 2, height * 0.3, 'FUSE DRIVERS', { ...FONT, fontSize: '120px', color: '#ffd23f' }).setOrigin(0.5);
    this.add.text(width / 2, height * 0.46, 'SPACE: SINGLE RACE     ENTER: 5-RACE SERIES WITH SHOP', { ...FONT, fontSize: '36px' }).setOrigin(0.5);
    const names = Object.keys(data.tracks).sort();
    let pick = 0;
    const label = this.add.text(width / 2, height * 0.56, '', { ...FONT, fontSize: '30px', color: '#9cff2e' }).setOrigin(0.5);
    const show = () => label.setText(`◀ TRACK: ${names[pick].toUpperCase()} ▶   (left / right)`);
    show();
    this.input.keyboard!.on('keydown-LEFT', () => { pick = (pick + names.length - 1) % names.length; show(); });
    this.input.keyboard!.on('keydown-RIGHT', () => { pick = (pick + 1) % names.length; show(); });
    this.add.text(width / 2, height * 0.62, 'ARROWS / A D steer  ·  S brake  ·  SHIFT nitro  ·  SPACE item  ·  hold DOWN + SPACE to fire backwards', { ...FONT, fontSize: '22px' }).setOrigin(0.5);
    const single = () => this.scene.start('Race', { series: createSeries([names[pick]], 5, Date.now() >>> 0, 1), tracks: data.tracks });
    const series = () => this.scene.start('Race', { series: createSeries(names, 5, Date.now() >>> 0, 5), tracks: data.tracks });
    this.input.keyboard!.once('keydown-SPACE', single);
    this.input.keyboard!.once('keydown-ENTER', series);
    this.input.once('pointerdown', single);
  }
}
