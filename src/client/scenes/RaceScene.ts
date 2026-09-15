import Phaser from 'phaser';
import { BOT_LEVELS, config, TICK_MS } from '../../shared/config.ts';
import { applyRace, statsFor, type Series } from '../../shared/series.ts';
import { trackDirectionAt, type RaceEvent, type RaceState } from '../../shared/race.ts';
import { dronePosition } from '../../shared/items.ts';
import { createRaceRunner, type RaceRunner } from '../../shared/runner.ts';
import { lerp } from '../../shared/truck.ts';
import type { Point, Segment, Track } from '../../shared/track.ts';
import { createKeyboard } from '../input/keyboard.ts';
import { createTouchControls } from '../input/touch.ts';
import type { PartyData } from '../net/party.ts';
import { headingFrame, renderSnapshot } from '../render/interpolate.ts';
import { FRAMES, SPRITE_CELL, TRUCK_CELL, TRUCK_COLORS } from './BootScene.ts';

/** World units per sprite cell: tilted trucks draw well beyond their 28 u collision circle, chunky like the concept. */
const TRUCK_SCALE = 66 / (TRUCK_CELL * 0.95);
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

/** Screen pixels around the race view for the grandstand (top, below the HUD strip) and the side crowds. */
export const STANDS = { top: 158, side: 56 } as const;

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
  shadows: Phaser.GameObjects.Sprite[] = [];
  dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** Recent sim positions per missile, for the dotted trail. */
  trails = new Map<number, { x: number; y: number }[]>();
  lastTick = -1;
  readInput!: ReturnType<typeof createKeyboard>;
  /** State at the tick the race was first seen finished; Results and the HUD placement both use it. */
  final?: RaceState;
  series!: Series;
  tracks!: Record<string, Track>;

  /** Set when the race runs on the party server: the runner replays its snapshots and inputs come from phones. */
  party?: PartyData;
  /** The attract demo: every truck is a bot and any input returns to the menu. */
  attract = false;

  constructor() { super('Race'); }

  create(data: SeriesData & { party?: PartyData; attract?: boolean }) {
    this.series = data.series;
    this.tracks = data.tracks;
    this.party = data.party;
    this.attract = !!data.attract;
    this.track = data.tracks[data.series.tracks[data.series.raceIndex]];
    this.final = undefined;
    this.missiles.clear();
    this.mines.clear();
    this.oils.clear();
    this.drones.clear();
    // The attract demo gives slot 0 to a bot as well.
    const levels = this.attract ? (['normal', ...BOT_LEVELS] as const) : BOT_LEVELS;
    const bots = Object.fromEntries(levels.map((d, i) => [this.attract ? i : i + 1, d]));
    this.runner = data.party?.runner ?? createRaceRunner(this.track, (Date.now() + data.series.raceIndex) >>> 0, data.series.drivers.map((d) => statsFor(d.levels)), bots);
    const keyboard = createKeyboard(this);
    this.readInput = keyboard;
    if (this.attract) {
      const leave = () => { this.scene.stop('Hud'); this.scene.start('Menu', { tracks: this.tracks }); };
      this.input.keyboard!.once('keydown', leave);
      this.input.once('pointerdown', leave);
    } else if (!this.party && window.matchMedia('(pointer: coarse)').matches) {
      // Solo play on a phone or tablet: on-screen buttons over the bottom of the track, merged with any keyboard.
      const touch = createTouchControls({ overlay: true });
      this.events.once('shutdown', () => touch.destroy());
      this.readInput = () => {
        const k = keyboard(), t = touch.read();
        return { left: k.left || t.left, right: k.right || t.right, brake: k.brake || t.brake, nitro: k.nitro || t.nitro, item: k.item || t.item, itemAlt: k.itemAlt || t.itemAlt };
      };
    }
    this.drawTrack();
    // Zoom the world to fill the screen below the HUD, leaving a grandstand band on top and crowd strips at the sides
    // (drawn by the HUD in screen space), like the tilted concept art.
    const worldW = this.track.cols * config.tile, worldH = this.track.rows * config.tile;
    const zoom = Math.min((config.screen.width - 2 * STANDS.side) / worldW, (config.screen.height - STANDS.top) / worldH);
    this.cameras.main.setViewport((config.screen.width - worldW * zoom) / 2, config.screen.height - worldH * zoom, worldW * zoom, worldH * zoom).setZoom(zoom).centerOn(worldW / 2, worldH / 2);
    this.trails.clear();
    this.lastTick = -1;
    this.shadows = TRUCK_COLORS.map((c) => this.add.sprite(0, 0, `truck-${c}`, 0).setScale(TRUCK_SCALE).setTintFill(0x000000).setAlpha(0.4).setDepth(9).setVisible(false));
    this.dust = this.add.particles(0, 0, 'dust', {
      frame: [...FRAMES.dust], lifespan: 450, speed: { min: 5, max: 30 }, scale: { start: SPRITE_SCALE * 0.5, end: SPRITE_SCALE * 0.9 }, alpha: { start: 0.7, end: 0 }, emitting: false,
    }).setDepth(8);
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
    // No tile layer: the floor and every hazard are painted as shapes into the ground canvas, so nothing reads as squares.
    this.drawGround();

    const g = this.make.graphics({}, false);
    const barriers = this.track.walls.filter((w) => !w.deck);
    // Chunky blocks: black outline, a shaded side, a bright top face, black seams between blocks.
    // 22 u wide: adjacent lanes are 115 u apart, so neighbouring barriers meet like the concept's double rows.
    const block = 18, seam = (d: number) => d % block < 2;
    // Raised blocks seen from the arcade's elevated camera: a dark front face extruded below the top, then the lit top.
    const RISE = 7;
    const lift = (dy: number) => barriers.map((w) => ({ ...w, a: { x: w.a.x, y: w.a.y + dy }, b: { x: w.b.x, y: w.b.y + dy } }));
    strokeWalls(g, lift(RISE), 22, () => 0x000000);
    for (let dy = RISE; dy > 0; dy -= 2) strokeWalls(g, lift(dy), 17, (d) => (seam(d) ? 0x1a0a0a : Math.floor(d / block) % 2 ? 0x6e6e78 : 0x6a1010));
    strokeWalls(g, barriers, 22, () => 0x000000);
    strokeWalls(g, barriers, 17, (d) => (seam(d) ? 0x000000 : Math.floor(d / block) % 2 ? 0xb4b4be : 0xb41c1c));
    strokeWalls(g, barriers, 10, (d) => (seam(d) ? 0x000000 : Math.floor(d / block) % 2 ? 0xffffff : 0xf03a3a));
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

  /**
   * Hazards painted as shapes over their tiles, never as squares: pools with a dark rim and a shine, an oil slick with a
   * sheen, mogul humps, steel ramps with hazard stripes, glowing boost chevrons pointing along the track, tarmac.
   */
  private paintHazards(ctx: CanvasRenderingContext2D, rand: () => number) {
    const { tile } = config;
    const { cols, surface } = this.track;
    const cells = (kind: string) => surface.flatMap((s, i) => (s === kind ? [{ x: (i % cols) * tile + tile / 2, y: Math.floor(i / cols) * tile + tile / 2 }] : []));
    const blob = (pts: Point[], r: number, fill: string) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (const p of pts) { ctx.moveTo(p.x + r, p.y); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); }
      ctx.fill();
    };
    /** Connected groups of tiles of one kind, each as one smooth ellipse around them. */
    const ellipses = (kind: string) => {
      const pts = cells(kind), seen = new Set<number>(), out: { x: number; y: number; rx: number; ry: number }[] = [];
      pts.forEach((_, start) => {
        if (seen.has(start)) return;
        const group = [start];
        seen.add(start);
        for (let g = 0; g < group.length; g++) {
          pts.forEach((q, j) => { if (!seen.has(j) && Math.hypot(q.x - pts[group[g]].x, q.y - pts[group[g]].y) <= tile * 1.5) { seen.add(j); group.push(j); } });
        }
        const xs = group.map((j) => pts[j].x), ys = group.map((j) => pts[j].y);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        out.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, rx: (x1 - x0) / 2 + tile * 0.6, ry: (y1 - y0) / 2 + tile * 0.6 });
      });
      return out;
    };
    const oval = (e: { x: number; y: number; rx: number; ry: number }, grow: number, fill: string, dx = 0, dy = 0) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(e.x + dx, e.y + dy, Math.max(1, e.rx + grow), Math.max(1, e.ry + grow), 0, 0, Math.PI * 2);
      ctx.fill();
    };
    const pool = (kind: string, rim: string, body: string, deep: string, shine: string) => {
      const list = ellipses(kind);
      for (const e of list) {
        oval(e, 5, 'rgba(0,0,0,0.45)', 3, 4);
        oval(e, 3, '#1a1008');
        oval(e, 0, rim);
        oval(e, -5, body);
        ctx.fillStyle = deep;
        ctx.beginPath();
        ctx.ellipse(e.x + e.rx * 0.12, e.y + e.ry * 0.15, e.rx * 0.55, e.ry * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shine;
        ctx.beginPath();
        ctx.ellipse(e.x - e.rx * 0.4, e.y - e.ry * 0.45, e.rx * 0.28, e.ry * 0.12, -0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      return list;
    };
    /** A raised red/white barrier ring around a pool, front half showing its face like the tilted concept. */
    const ring = (e: { x: number; y: number; rx: number; ry: number }) => {
      const rx = e.rx + 6, ry = e.ry + 6, steps = Math.ceil((Math.PI * (rx + ry)) / 3);
      const at = (i: number, dy = 0) => { const a = (i / steps) * Math.PI * 2; return [e.x + Math.cos(a) * rx, e.y + Math.sin(a) * ry + dy] as const; };
      const stroke = (width: number, color: (i: number) => string, dy = 0, only?: (i: number) => boolean) => {
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        for (let i = 0; i < steps; i++) {
          if (only && !only(i)) continue;
          ctx.strokeStyle = color(i);
          ctx.beginPath();
          ctx.moveTo(...at(i, dy));
          ctx.lineTo(...at(i + 1, dy));
          ctx.stroke();
        }
      };
      const stripe = (i: number) => Math.floor((i * 3) / 14) % 2 === 0;
      const front = (i: number) => Math.sin(((i + 0.5) / steps) * Math.PI * 2) > -0.2;
      stroke(11, () => '#000', 5, front);
      stroke(8, (i) => (stripe(i) ? '#6a1010' : '#6e6e78'), 4, front);
      stroke(11, () => '#000');
      stroke(8, (i) => (stripe(i) ? '#f03a3a' : '#ffffff'));
    };
    for (const e of pool('toxic', '#3c5a18', '#6ee030', '#3fa51e', 'rgba(235,255,180,0.8)')) {
      ring(e);
      ctx.strokeStyle = 'rgba(210,255,140,0.85)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.arc(e.x + (rand() - 0.5) * e.rx, e.y + (rand() - 0.5) * e.ry, 1.5 + rand() * 3, 0, Math.PI * 2); ctx.stroke(); }
    }
    pool('water', '#5a4020', '#3f94e6', '#2464b4', 'rgba(225,245,255,0.85)');
    pool('mud', '#4a2e14', '#6a4422', '#4e3016', 'rgba(170,125,80,0.5)');

    const oil = cells('oil');
    if (oil.length) {
      blob(oil, 24, 'rgba(0,0,0,0.35)');
      blob(oil, 20, '#141418');
      ctx.lineWidth = 2;
      for (const p of oil) for (const [c, r] of [['rgba(255,80,200,0.35)', 9], ['rgba(80,200,255,0.35)', 13], ['rgba(255,230,80,0.3)', 16]] as const) {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.arc(p.x + 3, p.y - 2, r, 3.6, 5.4);
        ctx.stroke();
      }
    }

    const tarmac = cells('tarmac');
    for (const p of tarmac) {
      ctx.fillStyle = '#4c4c54';
      ctx.fillRect(p.x - tile / 2, p.y - tile / 2, tile, tile);
      for (let k = 0; k < 14; k++) { ctx.fillStyle = rand() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.12)'; ctx.fillRect(p.x - tile / 2 + rand() * tile, p.y - tile / 2 + rand() * tile, 2, 2); }
    }

    // Moguls: a row of raised dirt humps with a hard shadow and a sunlit top, like the concept's hay-bale mounds.
    for (const e of ellipses('mogul')) {
      for (let y = e.y - e.ry + 10; y <= e.y + e.ry - 10; y += 16) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.ellipse(e.x + 4, y + 5, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a2410';
        ctx.beginPath(); ctx.ellipse(e.x, y, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b07636';
        ctx.beginPath(); ctx.ellipse(e.x, y - 1, 13, 7.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e0aa66';
        ctx.beginPath(); ctx.ellipse(e.x - 3, y - 3, 7, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      }
    }

    for (const p of cells('ramp')) {
      const dir = trackDirectionAt(this.track, p), a = Math.atan2(dir.y, dir.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a);
      // A wooden jump wedge rising toward its lip, planks across the direction of travel, dark shadow beyond the lip.
      const h = tile / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(h, -h, 12, tile);
      ctx.fillStyle = '#000';
      ctx.fillRect(-h - 2, -h - 2, tile + 4, tile + 4);
      for (let s = -h, k = 0; s < h; s += 6, k++) {
        const lit = 0.55 + 0.45 * ((s + h) / tile);
        ctx.fillStyle = `rgb(${Math.round(150 * lit)},${Math.round(98 * lit)},${Math.round(50 * lit)})`;
        ctx.fillRect(s, -h, 5, tile);
        if (k % 2) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(s, -h + 4, 5, 2); }
      }
      ctx.fillStyle = '#5a3818';
      ctx.fillRect(h - 5, -h, 5, tile);
      ctx.fillStyle = '#d9d9e0';
      for (const y of [-h + 3, h - 6]) ctx.fillRect(-h, y, tile, 3);
      ctx.restore();
    }

    for (const p of cells('boost')) {
      const dir = trackDirectionAt(this.track, p), a = Math.atan2(dir.y, dir.x);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a);
      ctx.fillStyle = '#000';
      ctx.fillRect(-tile / 2, -tile / 2, tile, tile);
      ctx.fillStyle = '#0c2a6a';
      ctx.fillRect(-tile / 2 + 2, -tile / 2 + 2, tile - 4, tile - 4);
      ctx.strokeStyle = '#4fe3ff';
      ctx.shadowColor = '#4fe3ff';
      ctx.shadowBlur = 6;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'miter';
      for (const off of [-7, 5]) { ctx.beginPath(); ctx.moveTo(off - 5, -9); ctx.lineTo(off + 5, 0); ctx.lineTo(off - 5, 9); ctx.stroke(); }
      ctx.restore();
    }
  }

  /**
   * Bake the floor detail and the stadium into one canvas under everything else: tyre grooves and grit on
   * plain dirt, then crowd, fence, banners and industrial props in the area outside the outer barrier.
   */
  private drawGround() {
    const { tile } = config;
    const { cols, rows, surface, walls, waypoints, name } = this.track;
    const w = cols * tile, h = rows * tile;
    if (this.textures.exists('track-ground')) this.textures.remove('track-ground');
    const tex = this.textures.createCanvas('track-ground', w, h)!;
    const ctx = tex.getContext();
    const rand = rng([...name].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7));

    // Stadium dirt under everything; the tile layer is gone.
    ctx.fillStyle = '#8f5d2f';
    ctx.fillRect(0, 0, w, h);

    // Floor detail, clipped to dirt tiles so hazards keep their own look.
    ctx.save();
    ctx.beginPath();
    surface.forEach((s, i) => { if (!s || s === 'dirt') ctx.rect((i % cols) * tile, Math.floor(i / cols) * tile, tile, tile); });
    ctx.clip();
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(60,30,10,0.12)' : 'rgba(240,190,120,0.08)';
      ctx.beginPath();
      ctx.ellipse(rand() * w, rand() * h, 20 + rand() * 50, 12 + rand() * 30, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < (w * h) / 60; i++) {
      ctx.fillStyle = rand() < 0.6 ? 'rgba(50,25,8,0.35)' : 'rgba(235,185,120,0.3)';
      ctx.fillRect(Math.floor(rand() * w / 2) * 2, Math.floor(rand() * h / 2) * 2, 2, 2);
    }
    // Tyre grooves: parallel strokes along the racing line.
    const closed = Math.hypot(waypoints[0].x - waypoints[waypoints.length - 1].x, waypoints[0].y - waypoints[waypoints.length - 1].y) < 200;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    for (let k = -3; k <= 3; k++) {
      ctx.strokeStyle = k % 2 ? 'rgba(45,22,6,0.22)' : 'rgba(230,180,110,0.12)';
      ctx.beginPath();
      waypoints.forEach((p, i) => {
        const a = waypoints[closed ? (i - 1 + waypoints.length) % waypoints.length : Math.max(0, i - 1)];
        const b = waypoints[closed ? (i + 1) % waypoints.length : Math.min(waypoints.length - 1, i + 1)];
        const l = Math.hypot(b.x - a.x, b.y - a.y) || 1, off = k * 9 + Math.sin(i * 1.7 + k) * 2;
        const x = p.x - ((b.y - a.y) / l) * off, y = p.y + ((b.x - a.x) / l) * off;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      if (closed) ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
    this.paintHazards(ctx, rand);

    // Outside = cells reachable from the world border without coming within 30 u of any wall.
    const G = 4, gw = Math.ceil(w / G), gh = Math.ceil(h / G), R = Math.ceil(30 / G);
    const blocked = new Uint8Array(gw * gh), out = new Uint8Array(gw * gh);
    for (const s of walls) {
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
      for (let d = 0; d <= len; d += G) {
        const cx = Math.floor(lerp(s.a.x, s.b.x, d / (len || 1)) / G), cy = Math.floor(lerp(s.a.y, s.b.y, d / (len || 1)) / G);
        for (let y = Math.max(0, cy - R); y <= Math.min(gh - 1, cy + R); y++) {
          for (let x = Math.max(0, cx - R); x <= Math.min(gw - 1, cx + R); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= R * R) blocked[y * gw + x] = 1;
        }
      }
    }
    const stack: number[] = [];
    const push = (i: number) => { if (!blocked[i] && !out[i]) { out[i] = 1; stack.push(i); } };
    for (let x = 0; x < gw; x++) { push(x); push((gh - 1) * gw + x); }
    for (let y = 0; y < gh; y++) { push(y * gw); push(y * gw + gw - 1); }
    let count = 0;
    while (stack.length) {
      const i = stack.pop()!, x = i % gw;
      count++;
      if (x > 0) push(i - 1);
      if (x < gw - 1) push(i + 1);
      if (i >= gw) push(i - gw);
      if (i < gw * (gh - 1)) push(i + gw);
    }
    // A gap in the outer barrier would flood the lanes; draw no stadium rather than cover the track.
    if (count > out.length / 2) { tex.refresh(); this.add.image(0, 0, 'track-ground').setOrigin(0).setDepth(1); return; }

    // Stands only along the world edges; open infield between lane loops stays dirt.
    const band = out.map((v, i) => (v && Math.min(i % gw, gw - 1 - (i % gw), Math.floor(i / gw), gh - 1 - Math.floor(i / gw)) * G < 80 ? 1 : 0));
    const mask = (rgb: string) => {
      const c = document.createElement('canvas');
      c.width = gw; c.height = gh;
      const m = c.getContext('2d')!;
      m.fillStyle = rgb;
      band.forEach((v, i) => { if (v) m.fillRect(i % gw, Math.floor(i / gw), 1, 1); });
      return c;
    };
    const decor = this.textures.get('decor');
    const sprite = (c: CanvasRenderingContext2D, i: number, x: number, y: number, size: number, angle = 0) => {
      const f = decor.get(i);
      c.save();
      c.translate(x, y);
      c.rotate(angle);
      c.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, -size / 2, -size / 2, size, size);
      c.restore();
    };

    // Grandstand: crowd tiles with steel pipes down both side edges, cut to the outside area.
    const stands = document.createElement('canvas');
    stands.width = w; stands.height = h;
    const sc = stands.getContext('2d')!;
    sc.fillStyle = '#2e2e34';
    sc.fillRect(0, 0, w, h);
    if (this.textures.exists('grandstand')) {
      // Rows of spectators from the generated grandstand strip, tiled 240 u wide.
      const crowd = this.textures.get('grandstand').getSourceImage() as CanvasImageSource & { width: number; height: number };
      const tw = 240, th = (tw * crowd.height) / crowd.width;
      sc.imageSmoothingEnabled = true;
      for (let y = 0; y < h; y += th) for (let x = (Math.round(y / th) % 2) * -tw / 2; x < w; x += tw) sc.drawImage(crowd, x, y, tw, th);
    } else {
      for (let y = 0, r = 0; y < h + 36; y += 34, r++) {
        for (let x = r % 2 ? 0 : 18; x < w + 36; x += 36) sprite(sc, DECOR.crowd[Math.floor(rand() * 3)], x, y, 46);
      }
    }
    for (let y = 0; y < h + 40; y += 40) { sprite(sc, DECOR.pipe, 14, y, 64, Math.PI / 2); sprite(sc, DECOR.pipe, w - 14, y, 64, Math.PI / 2); }
    sc.globalCompositeOperation = 'destination-in';
    sc.imageSmoothingEnabled = false;
    sc.drawImage(mask('#000'), 0, 0, w, h);

    // Fence: black outline then a steel rail around the stands, both from the upscaled mask.
    ctx.imageSmoothingEnabled = false;
    for (const [img, o] of [[mask('#000'), 7], [mask('#a4a6ae'), 4]] as const) {
      for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]]) ctx.drawImage(img, dx, dy, w, h);
    }
    ctx.drawImage(stands, 0, 0);

    // Props where they fit entirely inside the given cells, never overlapping each other.
    const used = new Uint8Array(out.length);
    const place = (pw: number, ph: number, minY: number, cells: Uint8Array) => {
      for (let tries = 0; tries < 300; tries++) {
        const x = Math.floor(rand() * (w - pw)), y = minY + Math.floor(rand() * (h - ph - minY));
        let ok = true;
        for (let gy = Math.floor(y / G); ok && gy <= Math.floor((y + ph) / G); gy++) {
          for (let gx = Math.floor(x / G); gx <= Math.floor((x + pw) / G); gx++) if (!cells[gy * gw + gx] || used[gy * gw + gx]) { ok = false; break; }
        }
        if (!ok) continue;
        for (let gy = Math.floor(y / G); gy <= Math.floor((y + ph) / G); gy++) used.fill(1, gy * gw + Math.floor(x / G), gy * gw + Math.floor((x + pw) / G) + 1);
        return { x, y };
      }
      return undefined;
    };
    // Banners first; the HUD strip sits above the world now.
    for (const [text, bg, fg] of SPONSORS) {
      const bw = 84, bh = 22, at = place(bw, bh, 0, band);
      if (!at) continue;
      ctx.fillStyle = '#000';
      ctx.fillRect(at.x, at.y, bw, bh);
      ctx.fillStyle = bg;
      ctx.fillRect(at.x + 3, at.y + 3, bw - 6, bh - 6);
      ctx.fillStyle = fg;
      ctx.font = 'italic bold 13px Impact, "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, at.x + bw / 2, at.y + bh / 2 + 1, bw - 12);
    }
    // Tanks and lights in the stands; tyre stacks and drums also on off-lane dirt, clear of the barriers.
    for (const [frame, size, n, cells] of [[DECOR.tank, 70, 4, band], [DECOR.light, 40, 4, band], [DECOR.sign, 64, 2, band], [DECOR.tyres, 40, 10, out], [DECOR.drum, 32, 8, out]] as const) {
      for (let i = 0; i < n; i++) { const at = place(size, size, 0, cells); if (at) sprite(ctx, frame, at.x + size / 2, at.y + size / 2, size); }
    }
    tex.refresh();
    this.add.image(0, 0, 'track-ground').setOrigin(0).setDepth(1);
  }

  update(_time: number, delta: number) {
    const { state, events } = this.runner.advance(delta, [this.readInput()]);
    if (state.phase === 'finished' && !this.final) {
      const final = (this.final = state);
      // A party race moves on when the server sends the results.
      if (this.attract) this.time.delayedCall(2500, () => { this.scene.stop('Hud'); this.scene.start('Menu', { tracks: this.tracks }); });
      else if (!this.party) this.time.delayedCall(2500, () => { this.scene.stop('Hud'); this.scene.start('Results', { state: final, series: applyRace(this.series, final), tracks: this.tracks }); });
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
        // Spin-outs show by cycling direction frames in the pose loop; a rotated tilted sprite would look wrong.
        this.cameras.main.shake(120, 0.002);
      }
    }
    const poses = renderSnapshot(this.runner.previous, state, this.runner.alpha);
    this.marks.clear();
    // Cosmetic effects sample once per sim tick so their density does not depend on the display frame rate.
    const newTick = state.tick !== this.lastTick;
    this.lastTick = state.tick;
    poses.forEach((p, i) => {
      const t = state.trucks[i];
      const air = state.tick < t.airborneUntilTick;
      this.shadows[i].setPosition(p.x + 10, p.y + 14).setFrame(headingFrame(p.heading)).setVisible(air && !t.respawnAtTick).setDepth(t.onBridge ? 14 : 9);
      if (newTick && !air && !t.respawnAtTick && t.speed > t.stats.topSpeed * 0.6) this.dust.emitParticleAt(p.x - Math.cos(p.heading) * 20, p.y - Math.sin(p.heading) * 20);
      this.sprites[i].setPosition(p.x, p.y - (air ? 12 : 0)).setFrame(state.tick < t.spinUntilTick ? (headingFrame(p.heading) + Math.floor(state.tick / 2)) % 16 : headingFrame(p.heading)).setScale(TRUCK_SCALE).setVisible(!t.respawnAtTick).setDepth(t.onBridge ? 15 : 10);
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
    if (newTick) {
      for (const id of this.trails.keys()) if (!this.missiles.has(id)) this.trails.delete(id);
      for (const m of state.missiles) {
        const trail = this.trails.get(m.id) ?? [];
        trail.push({ x: m.x, y: m.y });
        if (trail.length > 9) trail.shift();
        this.trails.set(m.id, trail);
      }
    }
    for (const trail of this.trails.values()) {
      // The newest point sits under the missile itself, so skip it.
      trail.slice(0, -1).forEach((pt, k) => this.marks.fillStyle(0xff3030, (k + 1) / trail.length).fillCircle(pt.x, pt.y, 3.5));
    }
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

/** Frames in the decor strip cut by scripts/build-assets.py. */
const DECOR = { drum: 0, tyres: 1, pipe: 2, elbow: 3, tank: 4, sign: 7, light: 8, crowd: [12, 13, 14] } as const;
/** Made-up sponsors: text, panel colour, text colour. */
export const SPONSORS = [['MR.GRIP', '#d62828', '#ffffff'], ['FUSE OIL', '#ffe600', '#111111'], ['TURBO', '#1f5fd6', '#ffffff'], ['NITRO-X', '#ffffff', '#d62828'], ['DIRT KING', '#111111', '#ffe600']] as const;

/** Tiny seeded LCG so a track's decor lays out the same way every race. Presentation only. */
function rng(seed: number) {
  return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}
