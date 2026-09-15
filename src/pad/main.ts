/** Phone controller (ADR 008): join a room, send TruckInput on change and every 100 ms, buy in the shop. */
import { createTouchControls, type TouchControls } from '../client/input/touch.ts';
import type { TruckInput } from '../shared/input.ts';
import { cost, UPGRADES, type Driver, type UpgradeKind } from '../shared/series.ts';

/** Same order as TRUCK_COLORS / COLOR_HEX in the display client. */
const COLORS = ['#2ee6ff', '#ff4fa3', '#9cff2e', '#ff9a2e', '#b45cff'];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const screens = ['join', 'wait', 'shop'] as const;
const show = (id: (typeof screens)[number] | null) => { for (const s of screens) $(s).hidden = s !== id; };
const status = (text: string) => { $('status').textContent = text; };

let code = (new URLSearchParams(location.search).get('room') ?? '').toUpperCase();
let ws: WebSocket | undefined;
let seq = 0;
let controls: TouchControls | undefined;
let phase = '';

const storageKey = () => `fd-token-${code}`;
const load = (k: string) => { try { return localStorage.getItem(k) ?? undefined; } catch { return undefined; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: no reconnect */ } };
const send = (msg: unknown) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
const sendInput = (input: TruckInput) => send({ t: 'input', seq: seq++, input });

function setControls(on: boolean) {
  if (on && !controls) controls = createTouchControls({ onChange: sendInput });
  if (!on && controls) { controls.destroy(); controls = undefined; }
}
setInterval(() => { if (controls) sendInput(controls.read()); }, 100);

function renderShop(driver: Driver, until: number, ready: boolean) {
  const shop = $('shop');
  shop.replaceChildren();
  const title = document.createElement('h1');
  title.textContent = `SHOP  $${driver.money}`;
  const clock = document.createElement('p');
  clock.textContent = `${Math.max(0, Math.ceil((until - Date.now()) / 1000))} s left`;
  shop.append(title, clock);
  for (const kind of Object.keys(UPGRADES) as UpgradeKind[]) {
    const row = document.createElement('div');
    row.className = 'row';
    const c = cost(driver, kind), lvl = driver.levels[kind];
    const label = document.createElement('span');
    label.textContent = `${UPGRADES[kind].label} ${'█'.repeat(lvl)}${'░'.repeat(UPGRADES[kind].levels - lvl)}`;
    const b = document.createElement('button');
    b.textContent = c === null ? 'MAX' : `$${c}`;
    b.disabled = ready || c === null || c > driver.money;
    b.onclick = () => send({ t: 'buy', kind });
    row.append(label, b);
    shop.append(row);
  }
  const done = document.createElement('button');
  done.className = 'big';
  done.textContent = ready ? 'WAITING FOR OTHERS' : 'READY';
  done.disabled = ready;
  done.onclick = () => send({ t: 'ready' });
  shop.append(done);
}

function onMessage(m: any) {
  switch (m.t) {
    case 'seat': {
      save(storageKey(), m.token);
      const badge = $('badge');
      badge.hidden = false;
      // The server names an unnamed seat after its slot; do not print "P1 P1".
      badge.textContent = m.name === `P${m.slot + 1}` ? m.name : `P${m.slot + 1} ${m.name}`;
      badge.style.background = COLORS[m.slot];
      history.replaceState(null, '', `?room=${m.code}`);
      return;
    }
    case 'phase':
      phase = m.phase;
      setControls(m.phase === 'race');
      if (m.phase === 'race') { show(null); status(''); return; }
      if (m.phase === 'shop' && m.driver) { show('shop'); renderShop(m.driver, m.shopUntil, m.ready); return; }
      show('wait');
      $('waitTitle').textContent = m.phase === 'results' ? 'RESULTS' : "YOU'RE IN";
      $('waitText').textContent = m.phase === 'results' ? 'Results are on the TV.' : 'Waiting for the host to start. Watch the TV.';
      return;
    case 'error':
      status(m.reason);
      if (m.reason === 'no such room' || m.reason === 'room full') { ws?.close(); ws = undefined; code = ''; show('join'); }
      return;
  }
}

function connect() {
  if (!code) { show('join'); return; }
  status('connecting…');
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws = socket;
  socket.onopen = () => { status(''); send({ t: 'join', code, token: load(storageKey()) }); };
  socket.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore malformed */ } };
  socket.onclose = (e) => {
    if (ws !== socket) return;
    setControls(false);
    if (e.code === 4000) { status('opened on another device'); show('wait'); return; }
    status('reconnecting…');
    setTimeout(connect, 1000);
  };
}

$('go').onclick = () => {
  code = $<HTMLInputElement>('code').value.trim().toUpperCase();
  if (/^[A-Z]{4}$/.test(code)) connect(); else status('four letters');
};
// Keep the screen awake and go fullscreen on the first touch, where the browser allows it.
document.addEventListener('pointerdown', () => {
  (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen').catch(() => {});
  if (phase === 'race') document.documentElement.requestFullscreen?.().catch(() => {});
}, { once: false });
connect();
