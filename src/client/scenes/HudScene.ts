import Phaser from 'phaser';
import { config } from '../../shared/config.ts';
import type { RaceEvent } from '../../shared/race.ts';
import type { RaceScene } from './RaceScene.ts';
import { FRAMES } from './BootScene.ts';

const FONT = { fontFamily: 'monospace', fontSize: '28px', color: '#ffffff', stroke: '#000000', strokeThickness: 5 };

export class HudScene extends Phaser.Scene {
  race!: RaceScene;
  lap!: Phaser.GameObjects.Text;
  pos!: Phaser.GameObjects.Text;
  clock!: Phaser.GameObjects.Text;
  big!: Phaser.GameObjects.Text;
  status!: Phaser.GameObjects.Text;
  slot!: Phaser.GameObjects.Image;
  kills!: Phaser.GameObjects.Text;

  constructor() { super('Hud'); }

  create(data: { race: RaceScene }) {
    this.race = data.race;
    this.lap = this.add.text(16, 12, '', FONT);
    this.pos = this.add.text(240, 12, '', FONT);
    this.clock = this.add.text(config.world.width - 16, 12, '', FONT).setOrigin(1, 0);
    this.status = this.add.text(96, config.world.height - 44, '', { ...FONT, fontSize: '22px' });
    this.slot = this.add.image(48, config.world.height - 48, 'icons', FRAMES.icons.empty).setScale(0.5);
    this.kills = this.add.text(480, 12, '', FONT);
    this.big = this.add.text(config.world.width / 2, config.world.height / 2, '', { ...FONT, fontSize: '120px', color: '#ffd23f' }).setOrigin(0.5);
    this.game.events.on('race-event', this.onEvent, this);
    this.events.once('shutdown', () => this.game.events.off('race-event', this.onEvent, this));
  }

  private onEvent(e: RaceEvent) {
    if (e.type === 'start') this.flash('GO!');
    if (e.type === 'lap' && e.slot === 0) this.flash(e.lap >= config.laps ? 'FINISH' : `LAP ${e.lap + 1}`);
    if (e.type === 'wrongWay' && e.slot === 0) this.flash('WRONG WAY');
    if (e.type === 'kill' && e.slot === 0) this.flash('WRECKED');
    if (e.type === 'kill' && e.by === 0 && e.slot !== 0) this.flash('KILL!');
  }

  private flash(text: string) {
    this.big.setText(text).setAlpha(1);
    this.tweens.add({ targets: this.big, alpha: 0, delay: 500, duration: 400 });
  }

  update() {
    const s = this.race.runner.state;
    const me = s.trucks[0];
    this.lap.setText(`LAP ${Math.min(me.laps + 1, config.laps)}/${config.laps}`);
    this.pos.setText(`POS ${s.placements.indexOf(0) + 1}/${s.trucks.length}`);
    const secs = Math.max(0, (s.tick - s.countdownEndTick) / 30);
    this.clock.setText(`${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`);
    this.status.setText(`NITRO ${'▲'.repeat(me.nitros)}  ARMOR ${'█'.repeat(me.armor)}${'░'.repeat(me.stats.maxArmor - me.armor)}  ${Math.round(me.speed)} u/s`);
    this.slot.setFrame(me.item ? FRAMES.icons[me.item] : FRAMES.icons.empty);
    this.kills.setText(`KILLS ${me.kills}`);
    if (s.phase === 'countdown') {
      const left = Math.ceil((s.countdownEndTick - s.tick) / 30);
      this.big.setText(String(left)).setAlpha(1);
    } else if (s.phase === 'finished') {
      this.big.setText(`P${s.placements.indexOf(0) + 1}`).setAlpha(1);
    }
  }
}
