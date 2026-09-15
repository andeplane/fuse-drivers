import Phaser from 'phaser';
import { config } from '../../shared/config.ts';
import { createSeries } from '../../shared/series.ts';
import type { Track } from '../../shared/track.ts';
import { partyLink } from '../net/party.ts';
import { FONT } from './BootScene.ts';

export class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create(data: { tracks: Record<string, Track> }) {
    const { width, height } = config.screen;
    this.add.image(width / 2, height * 0.24, 'logo', 0).setScale(0.9);
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
    // Ignore auto-repeat so a key still held from the previous scene does not skip this one.
    this.input.keyboard!.on('keydown-SPACE', (e: KeyboardEvent) => { if (!e.repeat) single(); });
    this.input.keyboard!.on('keydown-ENTER', (e: KeyboardEvent) => { if (!e.repeat) series(); });
    this.add.text(width / 2, height * 0.7, 'P: PARTY ON THIS SCREEN  ·  PHONES ARE THE CONTROLLERS', { ...FONT, fontSize: '30px', color: '#ffd23f' }).setOrigin(0.5);
    const party = () => this.scene.start('Lobby', { link: partyLink(this.game, data.tracks) });
    this.input.keyboard!.on('keydown-P', (e: KeyboardEvent) => { if (!e.repeat) party(); });
    // A reloaded party display carries its host key in the hash and rejoins its room.
    if (location.hash.includes('host=')) party();
  }
}
