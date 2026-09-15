import Phaser from 'phaser';
import { config } from '../../shared/config.ts';
import type { RaceState } from '../../shared/race.ts';
import type { Track } from '../../shared/track.ts';
import { TRUCK_COLORS } from './BootScene.ts';

const FONT = { fontFamily: 'monospace', color: '#ffffff', stroke: '#000000', strokeThickness: 6 };
const COLOR_HEX: Record<(typeof TRUCK_COLORS)[number], string> = { cyan: '#2ee6ff', pink: '#ff4fa3', lime: '#9cff2e', orange: '#ff9a2e', violet: '#b45cff' };

export class ResultsScene extends Phaser.Scene {
  constructor() { super('Results'); }

  create(data: { state: RaceState; track: Track }) {
    const { width, height } = config.world;
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);
    this.add.text(width / 2, 90, 'RESULTS', { ...FONT, fontSize: '80px', color: '#ffd23f' }).setOrigin(0.5);
    data.state.placements.forEach((slot, i) => {
      const t = data.state.trucks[slot];
      const name = slot === 0 ? 'YOU' : `BOT ${slot}`;
      const time = t.finishedTick ? `${((t.finishedTick - data.state.countdownEndTick) / 30).toFixed(1)}s` : 'DNF';
      const line = `${i + 1}.  ${name.padEnd(6)}  ${time.padStart(7)}   ${config.points[i]} pts   kills ${t.kills}`;
      this.add.text(width / 2, 200 + i * 70, line, { ...FONT, fontSize: '36px', color: COLOR_HEX[TRUCK_COLORS[slot]] }).setOrigin(0.5);
    });
    this.add.text(width / 2, height - 80, 'SPACE OR CLICK FOR THE MENU', { ...FONT, fontSize: '30px' }).setOrigin(0.5);
    const back = () => this.scene.start('Menu', { track: data.track });
    this.input.keyboard!.once('keydown-SPACE', back);
    this.input.once('pointerdown', back);
  }
}
