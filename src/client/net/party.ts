import type Phaser from 'phaser';
import QRCode from 'qrcode';
import type { RaceState } from '../../shared/race.ts';
import type { Series } from '../../shared/series.ts';
import type { Track } from '../../shared/track.ts';
import { createRemoteRunner, type RemoteRunner } from './remote.ts';
import { padUrl, partySocketUrl } from '../../party-origin.ts';

export interface SeatView { slot: number; name: string; connected: boolean; ready: boolean }
/** Passed to Race and Results when the race runs on the party server. */
export interface PartyData { runner?: RemoteRunner; names: Record<number, string> }

/**
 * The display's link to the party server (ADR 008). Server messages drive scene changes, so every screen of a
 * party (lobby, race, results, shop) follows the server even after a reload: the host key lives in the URL hash.
 */
export class PartyLink {
  code = '';
  key = '';
  joinUrl = '';
  qr = '';
  trackNames: string[] = [];
  seats: SeatView[] = [];
  error = '';
  private ws?: WebSocket;
  private closed = false;
  private runner?: RemoteRunner;

  constructor(private game: Phaser.Game, public tracks: Record<string, Track>) {
    const m = /host=([A-Z]{4})\.([a-z0-9]+)/.exec(location.hash);
    if (m) { this.code = m[1]; this.key = m[2]; }
    this.connect();
  }

  send(msg: unknown) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg)); }

  close() {
    this.closed = true;
    this.ws?.close();
    history.replaceState(null, '', location.pathname);
  }

  private connect() {
    const ws = new WebSocket(partySocketUrl());
    this.ws = ws;
    ws.onopen = () => { this.error = ''; this.send(this.code ? { t: 'host', code: this.code, key: this.key } : { t: 'host' }); };
    ws.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => {
      if (this.closed || this.ws !== ws) return;
      this.error = 'reconnecting to the party server…';
      this.emit('party-changed');
      setTimeout(() => this.connect(), 1000);
    };
  }

  private emit(name: string) { this.game.events.emit(name, this); }

  /** Stop every running scene except `key`, then (re)start `key`. */
  private go(key: string, data: object) {
    for (const s of this.game.scene.getScenes(true)) if (s.scene.key !== key) this.game.scene.stop(s.scene.key);
    this.game.scene.start(key, data);
  }

  private onMessage(m: any) {
    switch (m.t) {
      case 'room': {
        if (this.code && this.code !== m.code) this.seats = [];
        this.code = m.code;
        this.key = m.key;
        this.trackNames = m.tracks;
        history.replaceState(null, '', `#host=${m.code}.${m.key}`);
        // Phones must reach this page: use the server's LAN address when the TV page itself was opened on localhost.
        const local = ['localhost', '127.0.0.1'].includes(location.hostname);
        this.joinUrl = padUrl(m.code, local ? `${m.lan}${location.port ? `:${location.port}` : ''}` : location.host);
        QRCode.toDataURL(this.joinUrl, { margin: 1, scale: 8 }).then((url) => { this.qr = url; this.emit('party-changed'); });
        this.emit('party-changed');
        return;
      }
      case 'seats': this.seats = m.seats; this.emit('party-changed'); return;
      case 'error': this.error = m.reason; this.emit('party-changed'); return;
      case 'lobby': if (!this.game.scene.isActive('Lobby')) this.go('Lobby', { link: this }); return;
      case 'race': {
        this.runner = createRemoteRunner(m.state as RaceState);
        const party: PartyData = { runner: this.runner, names: m.names };
        this.go('Race', { series: m.series as Series, tracks: this.tracks, party });
        return;
      }
      case 'snap': this.runner?.push(m.state, m.events); return;
      case 'results': this.runner = undefined; this.go('Results', { state: m.state, series: m.series, tracks: this.tracks, party: { names: m.names } }); return;
      case 'shop':
        if (this.game.scene.isActive('PartyShop')) this.game.events.emit('party-shop', m);
        else this.go('PartyShop', { link: this, shop: m });
        return;
    }
  }
}

let link: PartyLink | undefined;
export const partyLink = (game: Phaser.Game, tracks: Record<string, Track>) => (link ??= new PartyLink(game, tracks));
export const currentParty = () => link;
export function leaveParty() { link?.close(); link = undefined; }
