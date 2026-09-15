import Phaser from 'phaser';
import { config, TICK_RATE } from '../../shared/config.ts';
import type { RaceEvent } from '../../shared/race.ts';
import type { RaceScene } from './RaceScene.ts';
import { FONT as BASE_FONT, FRAMES, HUD_CELL, TRUCK_COLORS } from './BootScene.ts';

const FONT = { ...BASE_FONT, fontSize: '30px', fontStyle: 'bold', strokeThickness: 5 };
const LABEL = { ...FONT, fontSize: '18px', color: '#c8c8d0', strokeThickness: 0 };
/** Big centre messages styled like the countdown cells: yellow, red outline, black drop shadow. */
const BIG = { ...FONT, fontSize: '96px', color: '#ffe600', stroke: '#e01010', strokeThickness: 12, shadow: { offsetX: 8, offsetY: 8, color: '#000000', fill: true, stroke: true } };
/** Corner insets of the 9-slice panels at their half-size cut. */
const INSET = 24;
const TOP = 6, TOP_H = 64;

export class HudScene extends Phaser.Scene {
  race!: RaceScene;
  lap!: Phaser.GameObjects.Text;
  pos!: Phaser.GameObjects.Text;
  kills!: Phaser.GameObjects.Text;
  clock!: Phaser.GameObjects.Text;
  speed!: Phaser.GameObjects.Text;
  slot!: Phaser.GameObjects.Image;
  bigImage!: Phaser.GameObjects.Image;
  bigText!: Phaser.GameObjects.Text;
  badge!: Phaser.GameObjects.Image;
  /** Armor pips per truck in the driver chips. */
  chipArmor: Phaser.GameObjects.Image[][] = [];
  armor: Phaser.GameObjects.Image[] = [];
  nitros: Phaser.GameObjects.Image[] = [];

  constructor() { super('Hud'); }

  private panel(color: string, x: number, y: number, w: number, h: number) {
    return this.add.nineslice(x, y, `panel-${color}`, undefined, w, h, INSET, INSET, INSET, INSET).setOrigin(0).setAlpha(0.9);
  }

  private pips(x: number, y: number, count: number, size: number, gap: number, frame: number) {
    return Array.from({ length: count }, (_, i) => this.add.image(x + i * (size + gap) + size / 2, y, 'bars', frame).setScale(size / HUD_CELL.bars));
  }

  create(data: { race: RaceScene }) {
    this.race = data.race;
    const { width, height } = config.world;
    const s = this.race.runner.state;

    // Top strip: logo, one chip per driver, lap / position / kills / time panel.
    this.add.image(12, TOP + TOP_H / 2, 'logo', 0).setOrigin(0, 0.5).setScale(TOP_H / 380);
    const chipW = 172;
    this.chipArmor = s.trucks.map((t, i) => {
      const x = 170 + i * (chipW + 6);
      this.panel(TRUCK_COLORS[i], x, TOP, chipW, TOP_H);
      this.add.image(x + 32, TOP + TOP_H / 2, 'portraits', i).setScale(46 / HUD_CELL.portraits);
      this.add.text(x + 60, TOP + 12, i === 0 ? 'YOU' : `CPU${i}`, { ...LABEL, color: '#ffffff' });
      return this.pips(x + 60, TOP + 44, t.stats.maxArmor, 14, 1, 2 * i);
    });
    const px = 170 + s.trucks.length * (chipW + 6);
    this.panel('grey', px, TOP, width - 8 - px, TOP_H);
    const col = (width - 8 - px) / 4;
    [this.lap, this.pos, this.kills, this.clock] = ['LAP', 'POS', 'KILLS', 'TIME'].map((label, i) => {
      const cx = px + col * (i + 0.5);
      this.add.text(cx, TOP + 16, label, LABEL).setOrigin(0.5);
      return this.add.text(cx, TOP + 42, '', { ...FONT, color: i === 1 ? '#ffe600' : '#ffffff' }).setOrigin(0.5);
    });

    // Bottom-left: framed item slot, nitro bottles, the player's armor bar and speed.
    const by = height - 8 - 100;
    this.panel('grey', 8, by, 330, 100);
    this.panel('gold', 18, by + 10, 80, 80);
    this.slot = this.add.image(58, by + 50, 'icons', FRAMES.icons.empty).setScale(54 / 128);
    this.nitros = this.pips(108, by + 32, config.truck.nitroMax, 30, 4, FRAMES.bars.nitro);
    this.armor = this.pips(108, by + 72, s.trucks[0].stats.maxArmor, 22, 2, 0);
    this.speed = this.add.text(326, by + 72, '', { ...LABEL, color: '#ffffff' }).setOrigin(1, 0.5);

    const series = this.race.series;
    this.add.text(width - 12, height - 10, series.tracks.length > 1 ? `RACE ${series.raceIndex + 1}/${series.tracks.length}  ${series.tracks[series.raceIndex].toUpperCase()}` : series.tracks[series.raceIndex].toUpperCase(), { ...FONT, fontSize: '20px' }).setOrigin(1, 1);

    this.bigImage = this.add.image(width / 2, height * 0.42, 'countdown', 0).setVisible(false);
    this.bigText = this.add.text(width / 2, height * 0.42, '', BIG).setOrigin(0.5).setVisible(false);
    this.badge = this.add.image(width / 2, height * 0.64, 'placements', 0).setScale(1.1).setVisible(false);
    this.game.events.on('race-event', this.onEvent, this);
    this.events.once('shutdown', () => this.game.events.off('race-event', this.onEvent, this));
  }

  private onEvent(e: RaceEvent) {
    if (e.type === 'start') this.flash(FRAMES.countdown.go);
    if (e.type === 'lap' && e.slot === 0) this.flash(e.lap >= config.laps ? FRAMES.countdown.finish : `LAP ${e.lap + 1}`);
    if (e.type === 'wrongWay' && e.slot === 0) this.flash('WRONG WAY');
    if (e.type === 'kill' && e.slot === 0) this.flash('WRECKED');
    if (e.type === 'kill' && e.by === 0 && e.slot !== 0) this.flash('KILL!');
  }

  /** Show a countdown cell (frame index) or a text message, then fade it. */
  private flash(what: number | string) {
    const target = this.show(what);
    this.tweens.add({ targets: target, alpha: 0, delay: 500, duration: 400 });
  }

  private show(what: number | string) {
    this.tweens.killTweensOf([this.bigImage, this.bigText]);
    this.bigImage.setVisible(typeof what === 'number');
    this.bigText.setVisible(typeof what === 'string');
    if (typeof what === 'string') return this.bigText.setText(what).setAlpha(1);
    // Digits are tall cells, GO! and FINISH are wide; scale each to a couch-readable size.
    const scale = what < FRAMES.countdown.go ? 0.4 : what === FRAMES.countdown.go ? 0.6 : 1;
    return this.bigImage.setFrame(what).setScale(scale).setAlpha(1);
  }

  update() {
    const s = this.race.runner.state;
    const me = s.trucks[0];
    this.lap.setText(`${Math.min(me.laps + 1, config.laps)}/${config.laps}`);
    this.pos.setText(`${s.placements.indexOf(0) + 1}/${s.trucks.length}`);
    this.kills.setText(String(me.kills));
    const secs = Math.max(0, (s.tick - s.countdownEndTick) / TICK_RATE);
    this.clock.setText(`${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`);
    s.trucks.forEach((t, i) => this.chipArmor[i].forEach((p, j) => p.setFrame(2 * i + (j < t.armor ? 0 : 1))));
    this.armor.forEach((p, j) => p.setFrame(j < me.armor ? 0 : 1));
    this.nitros.forEach((p, j) => p.setFrame(j < me.nitros ? FRAMES.bars.nitro : FRAMES.bars.nitroEmpty));
    this.speed.setText(`${Math.round(me.speed / 10) * 10} u/s`);
    this.slot.setFrame(me.item ? FRAMES.icons[me.item] : FRAMES.icons.empty);
    if (s.phase === 'countdown') {
      const left = Math.ceil((s.countdownEndTick - s.tick) / TICK_RATE);
      this.show(Math.max(0, Math.min(2, 3 - left)));
    }
    if (me.laps >= config.laps) this.badge.setFrame((this.race.final ?? s).placements.indexOf(0)).setVisible(true);
  }
}
