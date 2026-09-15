import Phaser from 'phaser';
import { BOT_LEVELS, config, SURFACE_KINDS, TICK_MS } from '../../shared/config.ts';
import { applyRace, statsFor, type Series } from '../../shared/series.ts';
import type { RaceEvent, RaceState } from '../../shared/race.ts';
import { dronePosition } from '../../shared/items.ts';
import { createRaceRunner, type RaceRunner } from '../../shared/runner.ts';
import { lerp } from '../../shared/truck.ts';
import type { Segment, Track } from '../../shared/track.ts';
import { createKeyboard } from '../input/keyboard.ts';
import { headingFrame, renderSnapshot } from '../render/interpolate.ts';
import { FRAMES, SPRITE_CELL, TILE_PX, TRUCK_CELL, TRUCK_COLORS } from './BootScene.ts';

/** World units per sprite cell: a truck is about 44 u long and the source fills ~95 % of its cell. */
const TRUCK_SCALE = 46 / (TRUCK_CELL * 0.95);
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

/**
 * Stroke wall polylines as round-jointed pieces, colouring by distance along the polyline so stripes
 * continue across the short Tiled segments. Consecutive segments that share an endpoint carry the distance.
 */
function strokeWalls(g: Phaser.GameObjects.Graphics, walls: Segment[], width: number, color: (dist: number) => number) {
  const step = 2;
  let run = 0;
  let prev: Segment | undefined;
  for (const w of walls) {
    if (!prev || prev.b.x !== w.a.x || prev.b.y !== w.a.y) run = 0;
    prev = w;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    for (let d = 0; d < len; d += step) {
      const t0 = d / len, t1 = Math.min(len, d + step) / len;
      g.lineStyle(width, color(run + d));
      g.lineBetween(lerp(w.a.x, w.b.x, t0), lerp(w.a.y, w.b.y, t0), lerp(w.a.x, w.b.x, t1), lerp(w.a.y, w.b.y, t1));
    }
    g.fillStyle(color(run + len)).fillCircle(w.b.x, w.b.y, width / 2);
    run += len;
  }
}

/** Passed between Race, Results and Shop. */
export interface SeriesData { series: Series; tracks: Record<string, Track> }

export class RaceScene extends Phaser.Scene {
  runner!: RaceRunner;
  track!: Track;
  sprites: Phaser.GameObjects.Sprite[] = [];
  shields: Phaser.GameObjects.Image[] = [];
  boxes: Phaser.GameObjects.Sprite[] = [];
  missiles = new Map<number, Phaser.GameObjects.Image>();
  mines = new Map<number, Phaser.GameObjects.Image>();
  oils = new Map<number, Phaser.GameObjects.Image>();
  drones = new Map<number, Phaser.GameObjects.Image>();
  marks!: Phaser.GameObjects.Graphics;
  readInput!: ReturnType<typeof createKeyboard>;
  /** State at the tick the race was first seen finished; Results and the HUD placement both use it. */
  final?: RaceState;
  series!: Series;
  tracks!: Record<string, Track>;

  constructor() { super('Race'); }

  create(data: SeriesData) {
    this.series = data.series;
    this.tracks = data.tracks;
    this.track = data.tracks[data.series.tracks[data.series.raceIndex]];
    this.final = undefined;
    this.missiles.clear();
    this.mines.clear();
    this.oils.clear();
    this.drones.clear();
    const bots = Object.fromEntries(BOT_LEVELS.map((d, i) => [i + 1, d]));
    this.runner = createRaceRunner(this.track, (Date.now() + data.series.raceIndex) >>> 0, data.series.drivers.map((d) => statsFor(d.levels)), bots);
    this.readInput = createKeyboard(this);
    this.drawTrack();
    this.sprites = TRUCK_COLORS.map((c, i) => {
      const t = this.runner.state.trucks[i];
      return this.add.sprite(t.x, t.y, `truck-${c}`, 0).setScale(TRUCK_SCALE).setDepth(10);
    });
    this.shields = this.sprites.map(() => this.add.image(0, 0, 'projectiles', FRAMES.projectiles.shield).setScale(SPRITE_SCALE * 1.6).setDepth(11).setVisible(false));
    this.boxes = this.track.items.map((p) => this.add.sprite(p.x, p.y, 'itembox', 0).setScale(SPRITE_SCALE).setDepth(4).play('box-pulse'));
    this.marks = this.add.graphics().setDepth(12);
    this.scene.launch('Hud', { race: this });
  }

  private drawTrack() {
    const { tile } = config;
    const rows: number[][] = [];
    for (let r = 0; r < this.track.rows; r++) {
      rows.push(this.track.surface.slice(r * this.track.cols, (r + 1) * this.track.cols).map((s) => (s ? SURFACE_KINDS.indexOf(s) : -1)));
    }
    const map = this.make.tilemap({ data: rows, tileWidth: TILE_PX, tileHeight: TILE_PX });
    const tiles = map.addTilesetImage('surfaces', 'surfaces', TILE_PX, TILE_PX)!;
    map.createLayer(0, tiles, 0, 0)!.setScale(tile / TILE_PX);

    const g = this.make.graphics({}, false);
    const barriers = this.track.walls.filter((w) => !w.deck);
    // Black outline pass first so neighbouring barriers never paint over each other's stripes.
    strokeWalls(g, barriers, 18, () => 0x000000);
    strokeWalls(g, barriers, 11, (d) => (Math.floor(d / 14) % 2 ? 0xf2f2f2 : 0xd62828));
    const finish = this.track.checkpoints[this.track.checkpoints.length - 1];
    const fl = Math.hypot(finish.b.x - finish.a.x, finish.b.y - finish.a.y), fx = (finish.b.x - finish.a.x) / fl, fy = (finish.b.y - finish.a.y) / fl;
    for (let d = 0, i = 0; d < fl; d += 8, i++) {
      for (const side of [-1, 1]) {
        g.fillStyle((i + (side > 0 ? 1 : 0)) % 2 ? 0x111111 : 0xffffff);
        g.fillRect(finish.a.x + fx * d - fy * (side > 0 ? 0 : 8), finish.a.y + fy * d + fx * (side > 0 ? 0 : 8), 8, 8);
      }
    }
    const decks = this.make.graphics({}, false);
    for (const b of this.track.bridges) {
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      const vertical = b.entry === 'top' || b.entry === 'bottom';
      decks.fillStyle(0x000000, 0.35).fillRect(b.x0 + 10, b.y0 + 12, w, h);
      decks.fillStyle(0x000000).fillRect(b.x0 - 3, b.y0 - 3, w + 6, h + 6);
      // Planks run across the direction of travel, with a dark gap between each.
      const plank = 10;
      for (let o = 0, i = 0; o < (vertical ? h : w); o += plank, i++) {
        decks.fillStyle(i % 2 ? 0x8a5a2b : 0x7a4e24);
        if (vertical) decks.fillRect(b.x0, b.y0 + o, w, plank - 2); else decks.fillRect(b.x0 + o, b.y0, plank - 2, h);
      }
      // Steel edge beams with rivets along the two sides parallel to travel.
      decks.fillStyle(0x6e7078);
      const beam = 12;
      if (vertical) { decks.fillRect(b.x0, b.y0, beam, h).fillRect(b.x1 - beam, b.y0, beam, h); } else { decks.fillRect(b.x0, b.y0, w, beam).fillRect(b.x0, b.y1 - beam, w, beam); }
      decks.fillStyle(0xc8cad2);
      for (let o = 8; o < (vertical ? h : w); o += 20) {
        if (vertical) { decks.fillRect(b.x0 + 4, b.y0 + o, 4, 4).fillRect(b.x1 - 8, b.y0 + o, 4, 4); } else { decks.fillRect(b.x0 + o, b.y0 + 4, 4, 4).fillRect(b.x0 + o, b.y1 - 8, 4, 4); }
      }
    }
    // Deck railings: steel rails with dark posts, drawn on the deck so they stay above the trucks underneath.
    const rails = this.track.walls.filter((w) => w.deck);
    strokeWalls(decks, rails, 12, () => 0x000000);
    strokeWalls(decks, rails, 6, (d) => (d % 16 < 4 ? 0x2a2a30 : 0xd8dae2));
    // Bake both into static textures once instead of re-running ~1000 strokes every frame.
    const w = this.track.cols * tile, h = this.track.rows * tile;
    for (const [key, gfx, depth] of [['track-overlay', g, 5], ['bridge-decks', decks, 12]] as const) {
      if (this.textures.exists(key)) this.textures.remove(key);
      gfx.generateTexture(key, w, h).destroy();
      this.add.image(0, 0, key).setOrigin(0).setDepth(depth);
    }
  }

  update(_time: number, delta: number) {
    const { state, events } = this.runner.advance(delta, [this.readInput()]);
    if (state.phase === 'finished' && !this.final) {
      const final = (this.final = state);
      this.time.delayedCall(2500, () => { this.scene.stop('Hud'); this.scene.start('Results', { state: final, series: applyRace(this.series, final), tracks: this.tracks }); });
    }
    for (const e of events) {
      this.game.events.emit('race-event', e satisfies RaceEvent);
      if (e.type === 'kill') {
        const t = state.trucks[e.slot];
        const boom = this.add.sprite(t.x, t.y, 'explosion', 0).setScale(SPRITE_SCALE * 2.2).setDepth(20).play('explode');
        boom.once('animationcomplete', () => boom.destroy());
      }
      if (e.type === 'fire' && e.item === 'emp') {
        const t = state.trucks[e.slot];
        const ring = this.add.image(t.x, t.y, 'projectiles', FRAMES.projectiles.emp).setScale(0.2).setDepth(19);
        this.tweens.add({ targets: ring, scale: (config.items.emp.range * 2) / SPRITE_CELL, alpha: 0, duration: 400, onComplete: () => ring.destroy() });
      }
      if (e.type === 'hit' && !e.absorbed && e.item !== 'drone' && e.item !== 'emp') {
        const sprite = this.sprites[e.slot];
        this.tweens.killTweensOf(sprite);
        sprite.setAngle(0);
        this.tweens.add({ targets: sprite, angle: 360, duration: config.truck.spinOutTicks * TICK_MS, onComplete: () => sprite.setAngle(0) });
      }
    }
    const poses = renderSnapshot(this.runner.previous, state, this.runner.alpha);
    this.marks.clear();
    poses.forEach((p, i) => {
      const t = state.trucks[i];
      const air = state.tick < t.airborneUntilTick;
      this.sprites[i].setPosition(p.x, p.y).setFrame(headingFrame(p.heading)).setScale(TRUCK_SCALE * (air ? 1.25 : 1)).setVisible(!t.respawnAtTick).setDepth(t.onBridge ? 15 : 10);
      this.shields[i].setPosition(p.x, p.y).setVisible(!t.respawnAtTick && state.tick < t.shieldUntilTick);
      if (state.tick < t.invulnerableUntilTick) this.sprites[i].setAlpha(state.tick % 6 < 3 ? 0.35 : 1); else this.sprites[i].setAlpha(1);
      this.sprites[i].setTint(state.tick < t.stunUntilTick ? 0x8080ff : 0xffffff);
      if (t.lockedUntilTick > state.tick && !t.respawnAtTick) this.drawLock(p.x, p.y);
    });
    const prevMissiles = new Map(this.runner.previous.missiles.map((m) => [m.id, m]));
    const alpha = this.runner.alpha;
    syncSet(this.missiles, state.missiles, (m) => this.add.image(m.x, m.y, 'projectiles', FRAMES.projectiles.missile).setScale(SPRITE_SCALE * 0.6).setDepth(9), (img, m) => {
      const p = prevMissiles.get(m.id) ?? m;
      img.setPosition(lerp(p.x, m.x, alpha), lerp(p.y, m.y, alpha)).setRotation(m.heading + Math.PI / 2);
    });
    syncSet(this.mines, state.mines, (m) => this.add.image(m.x, m.y, 'projectiles', FRAMES.projectiles.mineUnarmed).setScale(SPRITE_SCALE * 0.7).setDepth(3), (img, m) => img.setFrame(state.tick - m.droppedTick >= config.items.mine.armTicks && state.tick % 10 < 5 ? FRAMES.projectiles.mineArmed : FRAMES.projectiles.mineUnarmed));
    syncSet(this.oils, state.oils, (o) => this.add.image(o.x, o.y, 'projectiles', FRAMES.projectiles.oil).setScale((config.items.oil.radius * 2) / SPRITE_CELL).setDepth(2), (img, o) => img.setAlpha(Math.min(1, (config.items.oil.lifeTicks - (state.tick - o.droppedTick)) / 60)));
    syncSet(this.drones, state.drones, () => this.add.image(0, 0, 'projectiles', FRAMES.projectiles.drone).setScale(SPRITE_SCALE * 0.8).setDepth(13), (img, d) => { const p = dronePosition(d, { ...state.trucks[d.owner], ...poses[d.owner] }, state.tick + alpha); img.setPosition(p.x, p.y).setRotation(state.tick * 0.5); });
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
