import Phaser from 'phaser';
import { BASE_STATS, config, SURFACE_KINDS } from '../../shared/config.ts';
import type { RaceEvent } from '../../shared/race.ts';
import { createRaceRunner, type RaceRunner } from '../../shared/runner.ts';
import type { Track } from '../../shared/track.ts';
import { createKeyboard } from '../input/keyboard.ts';
import { headingFrame, renderSnapshot } from '../render/interpolate.ts';
import { TILE_PX, TRUCK_CELL, TRUCK_COLORS } from './BootScene.ts';

/** World units per sprite cell: a truck is about 44 u long and the source fills ~95 % of its cell. */
const TRUCK_SCALE = 46 / (TRUCK_CELL * 0.95);
const BOT_LEVELS = ['hard', 'normal', 'easy', 'hard'] as const;

export interface RaceSceneData { track: Track; seed: number }

export class RaceScene extends Phaser.Scene {
  runner!: RaceRunner;
  track!: Track;
  sprites: Phaser.GameObjects.Sprite[] = [];
  readInput!: ReturnType<typeof createKeyboard>;

  constructor() { super('Race'); }

  create(data: RaceSceneData) {
    this.track = data.track;
    const bots = Object.fromEntries(BOT_LEVELS.map((d, i) => [i + 1, d]));
    this.runner = createRaceRunner(this.track, data.seed, Array(5).fill(BASE_STATS), bots);
    this.readInput = createKeyboard(this);
    this.drawTrack();
    this.sprites = TRUCK_COLORS.map((c, i) => {
      const t = this.runner.state.trucks[i];
      return this.add.sprite(t.x, t.y, `truck-${c}`, 0).setScale(TRUCK_SCALE).setDepth(10);
    });
    this.scene.launch('Hud', { race: this });
  }

  private drawTrack() {
    const { world, tile } = config;
    const rows: number[][] = [];
    for (let r = 0; r < this.track.rows; r++) {
      rows.push(this.track.surface.slice(r * this.track.cols, (r + 1) * this.track.cols).map((s) => (s ? SURFACE_KINDS.indexOf(s) : -1)));
    }
    const map = this.make.tilemap({ data: rows, tileWidth: TILE_PX, tileHeight: TILE_PX });
    const tiles = map.addTilesetImage('surfaces', 'surfaces', TILE_PX, TILE_PX)!;
    map.createLayer(0, tiles, 0, 0)!.setScale(tile / TILE_PX);

    const g = this.add.graphics().setDepth(5);
    for (const w of this.track.walls) {
      g.lineStyle(8, 0xd62828).beginPath().moveTo(w.a.x, w.a.y).lineTo(w.b.x, w.b.y).strokePath();
      const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
      const ux = (w.b.x - w.a.x) / len, uy = (w.b.y - w.a.y) / len;
      g.lineStyle(8, 0xf5f5f5);
      for (let d = 12; d < len; d += 24) {
        const e = Math.min(len, d + 12);
        g.beginPath().moveTo(w.a.x + ux * d, w.a.y + uy * d).lineTo(w.a.x + ux * e, w.a.y + uy * e).strokePath();
      }
    }
    const finish = this.track.checkpoints[this.track.checkpoints.length - 1];
    g.lineStyle(10, 0xffffff).beginPath().moveTo(finish.a.x, finish.a.y).lineTo(finish.b.x, finish.b.y).strokePath();
  }

  update(_time: number, delta: number) {
    const { events } = this.runner.advance(delta, [this.readInput()]);
    for (const e of events) this.game.events.emit('race-event', e satisfies RaceEvent);
    const poses = renderSnapshot(this.runner.previous, this.runner.state, this.runner.alpha);
    poses.forEach((p, i) => {
      const t = this.runner.state.trucks[i];
      const air = this.runner.state.tick < t.airborneUntilTick;
      this.sprites[i].setPosition(p.x, p.y).setFrame(headingFrame(p.heading)).setScale(TRUCK_SCALE * (air ? 1.25 : 1)).setVisible(!t.respawnAtTick);
    });
  }
}
