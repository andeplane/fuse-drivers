import Phaser from 'phaser';
import { config } from '../../shared/config.ts';
import { standings, type Series } from '../../shared/series.ts';
import type { PartyLink, SeatView } from '../net/party.ts';
import { FONT, TRUCK_COLORS } from './BootScene.ts';
import { COLOR_HEX } from './ShopScene.ts';

interface ShopMessage { series: Series; until: number; names: Record<number, string>; seats: SeatView[] }

/** Party shop on the TV: players buy on their phones; the race starts when everyone is ready or time is up. */
export class PartyShopScene extends Phaser.Scene {
  constructor() { super('PartyShop'); }

  create(data: { link: PartyLink; shop: ShopMessage }) {
    const { width, height } = config.world;
    let shop = data.shop;
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6);
    this.add.text(width / 2, 70, 'SHOP  ·  BUY ON YOUR PHONE', { ...FONT, fontSize: '56px', color: '#ffd23f' }).setOrigin(0.5);
    const next = this.add.text(width / 2, 150, '', { ...FONT, fontSize: '32px' }).setOrigin(0.5);
    const rows = Array.from({ length: shop.series.drivers.length }, (_, i) => this.add.text(width / 2, 240 + i * 80, '', { ...FONT, fontSize: '40px' }).setOrigin(0.5));
    const clock = this.add.text(width / 2, height - 150, '', { ...FONT, fontSize: '36px' }).setOrigin(0.5);
    this.add.text(width / 2, height - 70, 'SPACE start now', { ...FONT, fontSize: '26px' }).setOrigin(0.5);

    const redraw = () => {
      const s = shop.series;
      next.setText(`RACE ${s.raceIndex + 1} / ${s.tracks.length}  NEXT: ${s.tracks[s.raceIndex].toUpperCase()}`);
      standings(s).forEach((d, i) => {
        const seat = shop.seats.find((x) => x.slot === d.slot);
        const who = seat ? seat.name : `BOT ${d.slot}`;
        const flag = seat ? (seat.ready ? '  READY' : '  shopping…') : '';
        rows[i].setText(`${i + 1}. ${who.padEnd(12)} ${String(d.points).padStart(3)} pts  $${String(d.money).padStart(5)}${flag}`).setColor(COLOR_HEX[TRUCK_COLORS[d.slot]]);
      });
    };
    const onShop = (m: ShopMessage) => { shop = m; redraw(); };
    this.game.events.on('party-shop', onShop);
    this.events.once('shutdown', () => this.game.events.off('party-shop', onShop));
    this.events.on('update', () => clock.setText(`${Math.max(0, Math.ceil((shop.until - Date.now()) / 1000))} s`));
    redraw();
    this.input.keyboard!.on('keydown-SPACE', (e: KeyboardEvent) => { if (!e.repeat) data.link.send({ t: 'next' }); });
  }
}
