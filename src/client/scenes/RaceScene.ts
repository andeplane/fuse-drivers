import Phaser from 'phaser';
import { BASE_STATS, config, SURFACE_KINDS } from '../../shared/config.ts';
import type { RaceEvent } from '../../shared/race.ts';
import { createRaceRunner, type RaceRunner } from '../../shared/runner.ts';
import type { Track } from '../../shared/track.ts';
import { createKeyboard } from '../input/keyboard.ts';
import { headingFrame, renderSnapshot } from '../render/interpolate.ts';
import { FRAMES, SPRITE_CELL, TILE_PX, TRUCK_CELL, TRUCK_COLORS } from './BootScene.ts';
import { config as cfg } from '../../shared/config.ts';

/** World units per sprite cell: a truck is about 44 u long and the source fills ~95 % of its cell. */
const TRUCK_SCALE = 46 / (TRUCK_CELL * 0.95);
const BOT_LEVELS = ['hard', 'normal', 'easy', 'hard'] as const;
/** World units per sprite pixel for the 128 px item cells: a mine or box is about 36 u across. */
const SPRITE_SCALE = 36 / SPRITE_CELL;

/** Keep a map of images in step with an array of ids: create, update, destroy. */
function syncSet<T extends { id: number }>(map: Map<number, Phaser.GameObjects.Image>, items: T[], make: (t: T) => Phaser.GameObjects.Image, update: (img: Phaser.GameObjects.Image, t: T) => void) {
  const seen = new Set<number>();
  for (const it of items) {
    seen.add(it.id);
    let img = map.get(it.id);
    if (!img) { img = make(it); map.set(it.id, img); }
    update(img, it);
  }
  for (const [id, img] of map) if (!seen.has(id)) { img.destroy(); map.delete(id); }
}

export interface RaceSceneData { track: Track; seed: number }

export class RaceScene extends Phaser.Scene {
  runner!: RaceRunner;
  track!: Track;
  sprites: Phaser.GameObjects.Sprite[] = [];
  shields: Phaser.GameObjects.Image[] = [];
  boxes: Phaser.GameObjects.Sprite[] = [];
  missiles = new Map<number, Phaser.GameObjects.Image>();
  mines = new Map<number, Phaser.GameObjects.Image>();
  marks!: Phaser.GameObjects.Graphics;
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
    this.shields = this.sprites.map(() => this.add.image(0, 0, 'projectiles', FRAMES.projectiles.shield).setScale(SPRITE_SCALE * 1.6).setDepth(11).setVisible(false));
    this.anims.create({ key: 'box-pulse', frames: this.anims.generateFrameNumbers('itembox', { frames: [0, 1, 2, 3] }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'explode', frames: this.anims.generateFrameNumbers('explosion', { frames: [...FRAMES.explosionFrames] }), frameRate: 12 });
    this.boxes = this.track.items.map((p) => this.add.sprite(p.x, p.y, 'itembox', 0).setScale(SPRITE_SCALE).setDepth(4).play('box-pulse'));
    this.marks = this.add.graphics().setDepth(12);
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
    const { state, events } = this.runner.advance(delta, [this.readInput()]);
    for (const e of events) {
      this.game.events.emit('race-event', e satisfies RaceEvent);
      if (e.type === 'kill') {
        const t = state.trucks[e.slot];
        const boom = this.add.sprite(t.x, t.y, 'explosion', 0).setScale(SPRITE_SCALE * 2.2).setDepth(20).play('explode');
        boom.once('animationcomplete', () => boom.destroy());
      }
      if (e.type === 'hit' && !e.absorbed) this.tweens.add({ targets: this.sprites[e.slot], angle: 360, duration: cfg.truck.spinOutTicks * (1000 / 30), onComplete: () => this.sprites[e.slot].setAngle(0) });
    }
    const poses = renderSnapshot(this.runner.previous, state, this.runner.alpha);
    this.marks.clear();
    poses.forEach((p, i) => {
      const t = state.trucks[i];
      const air = state.tick < t.airborneUntilTick;
      this.sprites[i].setPosition(p.x, p.y).setFrame(headingFrame(p.heading)).setScale(TRUCK_SCALE * (air ? 1.25 : 1)).setVisible(!t.respawnAtTick);
      this.shields[i].setPosition(p.x, p.y).setVisible(!t.respawnAtTick && state.tick < t.shieldUntilTick);
      if (state.tick < t.invulnerableUntilTick) this.sprites[i].setAlpha(state.tick % 6 < 3 ? 0.35 : 1); else this.sprites[i].setAlpha(1);
      if (t.lockedUntilTick > state.tick && !t.respawnAtTick) this.drawLock(p.x, p.y);
    });
    syncSet(this.missiles, state.missiles, (m) => this.add.image(m.x, m.y, 'projectiles', FRAMES.projectiles.missile).setScale(SPRITE_SCALE * 0.6).setDepth(9), (img, m) => img.setPosition(m.x, m.y).setRotation(m.heading + Math.PI / 2));
    syncSet(this.mines, state.mines, (m) => this.add.image(m.x, m.y, 'projectiles', FRAMES.projectiles.mineUnarmed).setScale(SPRITE_SCALE * 0.7).setDepth(3), (img, m) => img.setFrame(state.tick - m.droppedTick >= cfg.items.mine.armTicks && state.tick % 10 < 5 ? FRAMES.projectiles.mineArmed : FRAMES.projectiles.mineUnarmed));
    this.boxes.forEach((b, i) => b.setAlpha(state.tick < state.boxCooldowns[i * state.trucks.length] ? 0.4 : 1));
  }

  private drawLock(x: number, y: number) {
    const r = 30, l = 10;
    this.marks.lineStyle(4, 0xff3030);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      this.marks.beginPath().moveTo(x + sx * r, y + sy * (r - l)).lineTo(x + sx * r, y + sy * r).lineTo(x + sx * (r - l), y + sy * r).strokePath();
    }
  }
}
