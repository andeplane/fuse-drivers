import Phaser from 'phaser';
import { config } from '../../shared/config.ts';
import { botShop, buy, cost, standings, UPGRADES, type UpgradeKind } from '../../shared/series.ts';
import { FONT, TRUCK_COLORS } from './BootScene.ts';
import type { SeriesData } from './RaceScene.ts';
import { backdrop } from './backdrop.ts';

const KINDS: UpgradeKind[] = ['topSpeed', 'accel', 'tires', 'shocks', 'armor', 'nitro'];
export const COLOR_HEX: Record<(typeof TRUCK_COLORS)[number], string> = { cyan: '#2ee6ff', pink: '#ff4fa3', lime: '#9cff2e', orange: '#ff9a2e', violet: '#b45cff' };

/** Between races: the human buys with arrows and space, bots buy automatically (ADR 006). */
export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }

  create(data: SeriesData) {
    const { width, height } = config.screen;
    backdrop(this);
    let series = { ...data.series, drivers: data.series.drivers.map((d) => (d.slot === 0 ? d : botShop(d))) };
    let cursor = 0;
    this.add.text(width / 2, 60, `SHOP  ·  RACE ${series.raceIndex + 1} / ${series.tracks.length} NEXT: ${series.tracks[series.raceIndex].toUpperCase()}`, { ...FONT, fontSize: '44px', color: '#ffd23f' }).setOrigin(0.5);
    const money = this.add.text(width / 2, 130, '', { ...FONT, fontSize: '36px' }).setOrigin(0.5);
    const rows = KINDS.map((k, i) => this.add.text(width / 2 - 360, 210 + i * 64, '', { ...FONT, fontSize: '34px' }));
    const table = this.add.text(width - 60, 210, '', { ...FONT, fontSize: '24px' }).setOrigin(1, 0);
    this.add.text(width / 2, height - 70, 'UP / DOWN choose  ·  SPACE buy  ·  ENTER race', { ...FONT, fontSize: '28px' }).setOrigin(0.5);

    const redraw = () => {
      const me = series.drivers[0];
      money.setText(`$${me.money}`);
      rows.forEach((row, i) => {
        const k = KINDS[i], c = cost(me, k), lvl = me.levels[k];
        const bar = '█'.repeat(lvl) + '░'.repeat(UPGRADES[k].levels - lvl);
        row.setText(`${cursor === i ? '▶ ' : '  '}${UPGRADES[k].label.padEnd(13)} ${bar}  ${c === null ? 'MAX' : `$${c}`}`);
        row.setColor(cursor === i ? '#ffd23f' : c !== null && c <= me.money ? '#ffffff' : '#888888');
      });
      table.setText(['STANDINGS', ...standings(series).map((d, i) => `${i + 1}. ${d.slot === 0 ? 'YOU  ' : `BOT ${d.slot}`} ${String(d.points).padStart(3)} pts  $${d.money}`)].join('\n'));
      table.setColor(COLOR_HEX[TRUCK_COLORS[0]]);
    };
    redraw();
    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => { cursor = (cursor + KINDS.length - 1) % KINDS.length; redraw(); });
    kb.on('keydown-DOWN', () => { cursor = (cursor + 1) % KINDS.length; redraw(); });
    kb.on('keydown-SPACE', (e: KeyboardEvent) => { if (e.repeat) return; const d = buy(series.drivers[0], KINDS[cursor]); if (d) { series = { ...series, drivers: series.drivers.map((x) => (x.slot === 0 ? d : x)) }; redraw(); } });
    const go = () => this.scene.start('Race', { series, tracks: data.tracks });
    kb.on('keydown-ENTER', (e: KeyboardEvent) => { if (!e.repeat) go(); });
    this.input.once('pointerdown', go);
  }
}
