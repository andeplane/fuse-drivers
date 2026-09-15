import Phaser from 'phaser';
import { config } from '../../shared/config.ts';
import { MAX_SEATS } from '../../shared/room.ts';
import { leaveParty, type PartyLink } from '../net/party.ts';
import { FONT, TRUCK_COLORS } from './BootScene.ts';
import { COLOR_HEX } from './ShopScene.ts';
import { backdrop } from './backdrop.ts';

/** Party on a TV (M3): room code, QR code, seats filling as phones join; the host keyboard starts races. */
export class LobbyScene extends Phaser.Scene {
  constructor() { super('Lobby'); }

  create(data: { link: PartyLink }) {
    const link = data.link;
    const { width, height } = config.screen;
    backdrop(this);
    this.add.text(width / 2, 60, 'PARTY', { ...FONT, fontSize: '72px', color: '#ffd23f' }).setOrigin(0.5);
    const code = this.add.text(420, 190, '', { ...FONT, fontSize: '110px', color: '#9cff2e' }).setOrigin(0.5);
    const url = this.add.text(420, 280, '', { ...FONT, fontSize: '22px' }).setOrigin(0.5);
    this.add.text(420, 330, 'Scan the code or open the address\non your phone to join.', { ...FONT, fontSize: '26px', align: 'center' }).setOrigin(0.5, 0);
    const qr = this.add.image(420, 640, '__DEFAULT').setVisible(false);
    const seats = Array.from({ length: MAX_SEATS }, (_, i) => this.add.text(900, 180 + i * 80, '', { ...FONT, fontSize: '40px', color: COLOR_HEX[TRUCK_COLORS[i]] }));
    const status = this.add.text(width / 2, height - 130, '', { ...FONT, fontSize: '26px', color: '#ff8080' }).setOrigin(0.5);
    let pick = 0;
    const trackLabel = this.add.text(1150, 620, '', { ...FONT, fontSize: '30px', color: '#ffd23f' }).setOrigin(0.5);
    this.add.text(width / 2, height - 70, 'LEFT / RIGHT track  ·  SPACE single race  ·  ENTER 5-race series  ·  ESC leave', { ...FONT, fontSize: '26px' }).setOrigin(0.5);

    const redraw = () => {
      code.setText(link.code || '····');
      url.setText(link.joinUrl);
      status.setText(link.error);
      if (link.trackNames.length) trackLabel.setText(`◀ ${link.trackNames[pick % link.trackNames.length].toUpperCase()} ▶`);
      seats.forEach((t, i) => {
        const s = link.seats.find((x) => x.slot === i);
        t.setText(`P${i + 1}  ${s ? `${s.name === `P${i + 1}` ? 'READY TO RACE' : s.name}${s.connected ? '' : '  (away)'}` : '·· bot ··'}`).setAlpha(s ? 1 : 0.45);
      });
      if (link.qr && !this.textures.exists(`qr-${link.code}`)) this.textures.addBase64(`qr-${link.code}`, link.qr);
      if (this.textures.exists(`qr-${link.code}`)) qr.setTexture(`qr-${link.code}`).setDisplaySize(380, 380).setVisible(true);
    };
    this.textures.on('addtexture', redraw);
    this.game.events.on('party-changed', redraw);
    this.events.once('shutdown', () => { this.game.events.off('party-changed', redraw); this.textures.off('addtexture', redraw); });
    redraw();

    const kb = this.input.keyboard!;
    kb.on('keydown-LEFT', () => { pick = (pick + link.trackNames.length - 1) % Math.max(1, link.trackNames.length); redraw(); });
    kb.on('keydown-RIGHT', () => { pick = (pick + 1) % Math.max(1, link.trackNames.length); redraw(); });
    kb.on('keydown-SPACE', (e: KeyboardEvent) => { if (!e.repeat && link.trackNames.length) link.send({ t: 'start', races: 1, track: link.trackNames[pick] }); });
    kb.on('keydown-ENTER', (e: KeyboardEvent) => { if (!e.repeat) link.send({ t: 'start', races: 5 }); });
    kb.on('keydown-ESC', () => { leaveParty(); this.scene.start('Menu', { tracks: link.tracks }); });
  }
}
