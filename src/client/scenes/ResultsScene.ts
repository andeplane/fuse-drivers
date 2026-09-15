import Phaser from 'phaser';
import { config, TICK_RATE } from '../../shared/config.ts';
import type { RaceState } from '../../shared/race.ts';
import { standings } from '../../shared/series.ts';
import { currentParty, type PartyData } from '../net/party.ts';
import { FONT, TRUCK_COLORS } from './BootScene.ts';
import type { SeriesData } from './RaceScene.ts';
import { COLOR_HEX } from './ShopScene.ts';

export class ResultsScene extends Phaser.Scene {
  constructor() { super('Results'); }

  create(data: SeriesData & { state: RaceState; party?: PartyData }) {
    const { width, height } = config.screen;
    const nameOf = (slot: number) => (data.party ? data.party.names[slot] ?? `BOT ${slot}` : slot === 0 ? 'YOU' : `BOT ${slot}`);
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);
    const last = data.series.raceIndex >= data.series.tracks.length;
    this.add.text(width / 2, 90, last && data.series.tracks.length > 1 ? 'SERIES OVER' : 'RESULTS', { ...FONT, fontSize: '80px', color: '#ffd23f' }).setOrigin(0.5);
    data.state.placements.forEach((slot, i) => {
      const t = data.state.trucks[slot];
      const time = t.finishedTick ? `${((t.finishedTick - data.state.countdownEndTick) / TICK_RATE).toFixed(1)}s` : 'DNF';
      const line = `${i + 1}.  ${nameOf(slot).padEnd(12)}  ${time.padStart(7)}   ${config.points[i]} pts   $${config.prize[i] + t.kills * config.killBonus}   kills ${t.kills}`;
      this.add.text(width / 2 - 200, 200 + i * 60, line, { ...FONT, fontSize: '32px', color: COLOR_HEX[TRUCK_COLORS[slot]] }).setOrigin(0.5);
    });
    if (data.series.tracks.length > 1) {
      const table = standings(data.series).map((d, i) => `${i + 1}. ${nameOf(d.slot).padEnd(12)} ${String(d.points).padStart(3)} pts`).join('\n');
      this.add.text(width - 60, 200, `SERIES\n${table}`, { ...FONT, fontSize: '28px' }).setOrigin(1, 0);
    }
    this.add.text(width / 2, height - 80, last ? 'SPACE OR CLICK FOR THE MENU' : 'SPACE OR CLICK FOR THE SHOP', { ...FONT, fontSize: '30px' }).setOrigin(0.5);
    let done = false;
    const back = () => {
      if (done) return;
      done = true;
      // In a party the server decides what comes next (shop or lobby) and switches the scene.
      if (data.party) { currentParty()?.send({ t: 'next' }); return; }
      if (last) this.scene.start('Menu', { tracks: data.tracks }); else this.scene.start('Shop', { series: data.series, tracks: data.tracks });
    };
    this.input.keyboard!.on('keydown-SPACE', (e: KeyboardEvent) => { if (!e.repeat) back(); });
    this.input.once('pointerdown', back);
  }
}
