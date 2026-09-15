import Phaser from 'phaser';
import { config, TICK_RATE } from '../../shared/config.ts';
import type { RaceState } from '../../shared/race.ts';
import { standings } from '../../shared/series.ts';
import { currentParty, type PartyData } from '../net/party.ts';
import { FONT, HUD_CELL, TRUCK_COLORS } from './BootScene.ts';
import type { SeriesData } from './RaceScene.ts';
import { COLOR_HEX } from './ShopScene.ts';
import { backdrop } from './backdrop.ts';

/** Column x positions of the results table, in screen pixels. */
const COL = { medal: 200, portrait: 290, name: 350, time: 720, points: 880, prize: 1010, kills: 1160 };

export class ResultsScene extends Phaser.Scene {
  constructor() { super('Results'); }

  create(data: SeriesData & { state: RaceState; party?: PartyData }) {
    const { width, height } = config.screen;
    const nameOf = (slot: number) => (data.party ? data.party.names[slot] ?? `CPU ${slot}` : slot === 0 ? 'YOU' : `CPU ${slot}`);
    backdrop(this);
    const last = data.series.raceIndex >= data.series.tracks.length;
    const series = data.series.tracks.length > 1;
    this.add.text(width / 2, 110, last && series ? 'SERIES OVER' : 'RESULTS', { ...FONT, fontSize: '84px', color: '#ffe600', stroke: '#e01010', strokeThickness: 10 }).setOrigin(0.5);
    const header = { ...FONT, fontSize: '22px', color: '#c8c8d0', strokeThickness: 0 };
    const top = series ? 220 : 250;
    for (const [label, x] of [['TIME', COL.time], ['PTS', COL.points], ['PRIZE', COL.prize], ['KILLS', COL.kills]] as const) this.add.text(x, top - 44, label, header).setOrigin(0.5);

    data.state.placements.forEach((slot, i) => {
      const t = data.state.trucks[slot];
      const y = top + i * 76;
      const row = { ...FONT, fontSize: '36px', color: COLOR_HEX[TRUCK_COLORS[slot]] };
      // Stripe spans the table from the medal to the kills column.
      this.add.rectangle((COL.medal - 50 + COL.kills + 70) / 2, y, COL.kills + 70 - (COL.medal - 50), 64, 0xffffff, i % 2 ? 0.03 : 0.08);
      // Placement medal, then the driver's helmet portrait in their colour.
      this.add.image(COL.medal, y, 'placements', i).setScale(70 / HUD_CELL.placements);
      this.add.image(COL.portrait, y, 'portraits', slot).setScale(56 / HUD_CELL.portraits);
      this.add.text(COL.name, y, nameOf(slot).toUpperCase(), row).setOrigin(0, 0.5);
      const time = t.finishedTick ? `${((t.finishedTick - data.state.countdownEndTick) / TICK_RATE).toFixed(1)}s` : 'DNF';
      this.add.text(COL.time, y, time, row).setOrigin(0.5);
      this.add.text(COL.points, y, String(config.points[i]), row).setOrigin(0.5);
      this.add.text(COL.prize, y, `$${config.prize[i] + t.kills * config.killBonus}`, { ...row, color: '#9cff2e' }).setOrigin(0.5);
      this.add.text(COL.kills, y, String(t.kills), row).setOrigin(0.5);
    });

    if (series) {
      const table = standings(data.series).map((d, i) => `${i + 1}. ${nameOf(d.slot).toUpperCase()} ${d.points}`).join('    ');
      this.add.text(width / 2, top + 5 * 76 - 10, `SERIES AFTER RACE ${Math.min(data.series.raceIndex, data.series.tracks.length)} / ${data.series.tracks.length}\n${table}`, { ...FONT, fontSize: '24px', align: 'center' }).setOrigin(0.5, 0);
    }
    this.add.text(width / 2, height - 90, last ? 'SPACE OR CLICK FOR THE MENU' : 'SPACE OR CLICK FOR THE SHOP', { ...FONT, fontSize: '30px', color: '#ffd23f' }).setOrigin(0.5);
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
