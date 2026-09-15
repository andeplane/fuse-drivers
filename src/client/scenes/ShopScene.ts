import Phaser from 'phaser';
import { config } from '../../shared/config.ts';
import { botShop, buy, cost, standings, UPGRADES, type Series, type UpgradeKind } from '../../shared/series.ts';
import { FONT, HUD_CELL, TRUCK_COLORS } from './BootScene.ts';
import type { SeriesData } from './RaceScene.ts';
import { backdrop } from './backdrop.ts';

const KINDS: UpgradeKind[] = ['topSpeed', 'accel', 'tires', 'shocks', 'armor', 'nitro'];
export const COLOR_HEX: Record<(typeof TRUCK_COLORS)[number], string> = { cyan: '#2ee6ff', pink: '#ff4fa3', lime: '#9cff2e', orange: '#ff9a2e', violet: '#b45cff' };

/** Between races: the human buys with arrows and space or by tapping a row, bots buy automatically (ADR 006). */
export class ShopScene extends Phaser.Scene {
  constructor() { super('Shop'); }

  create(data: SeriesData) {
    const { width, height } = config.screen;
    backdrop(this);
    let series: Series = { ...data.series, drivers: data.series.drivers.map((d) => (d.slot === 0 ? d : botShop(d))) };
    let cursor = 0;
    this.add.text(width / 2, 100, 'SHOP', { ...FONT, fontSize: '84px', color: '#ffe600', stroke: '#e01010', strokeThickness: 10 }).setOrigin(0.5);
    this.add.text(width / 2, 165, `NEXT: RACE ${series.raceIndex + 1} / ${series.tracks.length}  ·  ${series.tracks[series.raceIndex].toUpperCase()}`, { ...FONT, fontSize: '28px' }).setOrigin(0.5);
    const money = this.add.text(560, 215, '', { ...FONT, fontSize: '40px', color: '#9cff2e' }).setOrigin(0.5);

    // Upgrade rows on the left: label, level pips, price. The selected row gets a gold frame.
    const rowY = (i: number) => 280 + i * 78;
    const frame = this.add.rectangle(560, rowY(0), 860, 66).setStrokeStyle(5, 0xffd23f).setFillStyle(0xffd23f, 0.12);
    const rows = KINDS.map((k, i) => {
      const y = rowY(i);
      const bg = this.add.rectangle(560, y, 860, 66, 0xffffff, i % 2 ? 0.03 : 0.07).setInteractive({ useHandCursor: true });
      const label = this.add.text(160, y, UPGRADES[k].label, { ...FONT, fontSize: '32px' }).setOrigin(0, 0.5);
      const pips = Array.from({ length: UPGRADES[k].levels }, (_, j) => this.add.image(470 + j * 40, y, 'bars', 0).setScale(34 / HUD_CELL.bars));
      const price = this.add.text(950, y, '', { ...FONT, fontSize: '32px' }).setOrigin(1, 0.5);
      bg.on('pointerdown', () => { cursor = i; purchase(); });
      return { label, pips, price };
    });

    // Standings on the right with portraits.
    this.add.text(1250, 215, 'STANDINGS', { ...FONT, fontSize: '28px', color: '#c8c8d0' }).setOrigin(0.5);
    const standing = Array.from({ length: series.drivers.length }, (_, i) => ({
      portrait: this.add.image(1070, 280 + i * 78, 'portraits', 0).setScale(52 / HUD_CELL.portraits),
      text: this.add.text(1110, 280 + i * 78, '', { ...FONT, fontSize: '26px' }).setOrigin(0, 0.5),
    }));

    const race = this.add.text(width / 2, height - 150, '▶  RACE', { ...FONT, fontSize: '44px', color: '#000000', backgroundColor: '#ffd23f', padding: { x: 36, y: 8 }, strokeThickness: 0 }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.add.text(width / 2, height - 96, 'UP / DOWN choose  ·  SPACE buy  ·  ENTER race', { ...FONT, fontSize: '22px', color: '#c8c8d0' }).setOrigin(0.5);

    const redraw = () => {
      const me = series.drivers[0];
      money.setText(`$${me.money}`);
      frame.setY(rowY(cursor));
      rows.forEach((row, i) => {
        const k = KINDS[i], c = cost(me, k), lvl = me.levels[k];
        const affordable = c !== null && c <= me.money;
        row.pips.forEach((p, j) => p.setFrame(j < lvl ? 0 : 1));
        row.price.setText(c === null ? 'MAX' : `$${c}`).setColor(c === null ? '#ffd23f' : affordable ? '#9cff2e' : '#886666');
        row.label.setColor(cursor === i ? '#ffe600' : '#ffffff');
      });
      standings(series).forEach((d, i) => {
        standing[i].portrait.setFrame(d.slot);
        standing[i].text.setText(`${d.slot === 0 ? 'YOU' : `CPU ${d.slot}`}  ${d.points} pts  $${d.money}`).setColor(COLOR_HEX[TRUCK_COLORS[d.slot]]);
      });
    };
    const purchase = () => {
      const d = buy(series.drivers[0], KINDS[cursor]);
      if (!d) { this.cameras.main.shake(100, 0.003); redraw(); return; }
      series = { ...series, drivers: series.drivers.map((x) => (x.slot === 0 ? d : x)) };
      redraw();
    };
    redraw();
    const kb = this.input.keyboard!;
    kb.on('keydown-UP', () => { cursor = (cursor + KINDS.length - 1) % KINDS.length; redraw(); });
    kb.on('keydown-DOWN', () => { cursor = (cursor + 1) % KINDS.length; redraw(); });
    kb.on('keydown-SPACE', (e: KeyboardEvent) => { if (!e.repeat) purchase(); });
    let started = false;
    const go = () => { if (started) return; started = true; this.scene.start('Race', { series, tracks: data.tracks }); };
    kb.on('keydown-ENTER', (e: KeyboardEvent) => { if (!e.repeat) go(); });
    race.on('pointerdown', go);
  }
}
