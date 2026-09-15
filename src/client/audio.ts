import type Phaser from 'phaser';
import { TICK_RATE } from '../shared/config.ts';
import type { RaceEvent } from '../shared/race.ts';
import type { RaceScene } from './scenes/RaceScene.ts';

/** Arcade-style sound synthesized with Web Audio; no asset files. Slot 0 is the local player. */
export function startAudio(game: Phaser.Game) {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.connect(ctx.destination);
  const MUTE_KEY = 'fuse-drivers-muted';
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* storage blocked: start unmuted */ }
  master.gain.value = muted ? 0 : 0.5;
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.key.toLowerCase() !== 'm') return;
    muted = !muted;
    master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.02);
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* not persisted */ }
  });

  const unlock = () => { if (ctx.state === 'suspended' && !document.hidden) void ctx.resume(); };
  window.addEventListener('keydown', unlock);
  window.addEventListener('pointerdown', unlock);
  document.addEventListener('visibilitychange', () => { if (document.hidden) void ctx.suspend(); else unlock(); });

  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  /** One pitched blip with an optional pitch slide; `at` is seconds from now. */
  function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, at = 0) {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur);
  }

  /** Filtered noise burst with the filter sweeping from f0 to f1. */
  function hiss(filter: BiquadFilterType, f0: number, f1: number, dur: number, vol: number) {
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noise;
    f.type = filter;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t);
    s.stop(t + dur);
  }

  const sounds = {
    beep: (v: number) => tone('square', 440, 440, 0.15, 0.25 * v),
    go: (v: number) => tone('square', 880, 880, 0.4, 0.25 * v),
    blip: (v: number) => tone('square', 660, 990, 0.06, 0.15 * v),
    pickup: (v: number) => { tone('square', 700, 1400, 0.08, 0.2 * v); tone('square', 1050, 2100, 0.08, 0.15 * v, 0.07); },
    nitro: (v: number) => hiss('bandpass', 300, 3000, 0.5, 0.5 * v),
    wall: (v: number) => { tone('sine', 120, 40, 0.15, 0.5 * v); hiss('lowpass', 800, 100, 0.1, 0.3 * v); },
    land: (v: number) => tone('sine', 90, 35, 0.2, 0.6 * v),
    missile: (v: number) => { tone('sawtooth', 200, 900, 0.3, 0.15 * v); hiss('highpass', 1000, 4000, 0.35, 0.25 * v); },
    drop: (v: number) => tone('triangle', 500, 150, 0.15, 0.3 * v),
    emp: (v: number) => { tone('sawtooth', 1500, 60, 0.4, 0.2 * v); tone('square', 60, 1500, 0.4, 0.08 * v); },
    shieldUp: (v: number) => tone('sine', 400, 1200, 0.3, 0.25 * v),
    explosion: (v: number) => { hiss('lowpass', 3000, 60, 0.8, 0.9 * v); tone('sine', 80, 30, 0.5, 0.6 * v); },
    ping: (v: number) => tone('triangle', 1800, 1700, 0.35, 0.3 * v),
    hurt: (v: number) => tone('square', 300, 80, 0.2, 0.2 * v),
    lap: (v: number) => [660, 880, 1320].forEach((f, i) => tone('square', f, f, 0.12, 0.18 * v, i * 0.1)),
    fanfare: (v: number) => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone('square', f, f, i === 5 ? 0.6 : 0.14, 0.2 * v, i * 0.13)),
    wrongWay: (v: number) => tone('sawtooth', 110, 100, 0.35, 0.2 * v),
  };

  game.events.on('race-event', (e: RaceEvent) => {
    const v = 'slot' in e && e.slot !== 0 ? 0.3 : 1;
    switch (e.type) {
      case 'start': return sounds.go(1);
      case 'lap': return sounds.lap(v);
      case 'finish': return e.slot === 0 ? sounds.fanfare(1) : undefined;
      case 'wrongWay': return e.slot === 0 ? sounds.wrongWay(1) : undefined;
      case 'wall': return sounds.wall(v);
      case 'land': return sounds.land(v);
      case 'pickup': return sounds.pickup(v);
      case 'kill': return sounds.explosion(e.slot === 0 || e.by === 0 ? 1 : 0.5);
      case 'hit': return e.absorbed ? sounds.ping(v) : sounds.hurt(v);
      case 'fire':
        switch (e.item) {
          case 'missile': return sounds.missile(v);
          case 'mine': case 'oil': return sounds.drop(v);
          case 'emp': return sounds.emp(v);
          case 'shield': case 'drone': return sounds.shieldUp(v);
          case 'nitro': return e.slot !== 0 ? sounds.nitro(v) : undefined; // slot 0 nitro is picked up from state below
        }
    }
  });

  // Menus, shop and results: blip on the keys they use.
  window.addEventListener('keydown', (e) => {
    if (!e.repeat && !game.scene.isActive('Race') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Enter'].includes(e.key)) sounds.blip(1);
  });

  // Continuous player sounds: engine drone and drift screech, gains driven every frame.
  const engine = ctx.createOscillator(), engineFilter = ctx.createBiquadFilter(), engineGain = ctx.createGain();
  engine.type = 'sawtooth';
  engineFilter.type = 'lowpass';
  engineFilter.frequency.value = 400;
  engineGain.gain.value = 0;
  engine.connect(engineFilter).connect(engineGain).connect(master);
  engine.start();
  const screech = ctx.createBufferSource(), screechFilter = ctx.createBiquadFilter(), screechGain = ctx.createGain();
  screech.buffer = noise;
  screech.loop = true;
  screechFilter.type = 'bandpass';
  screechFilter.frequency.value = 2200;
  screechFilter.Q.value = 8;
  screechGain.gain.value = 0;
  screech.connect(screechFilter).connect(screechGain).connect(master);
  screech.start();

  let lastCount = 0, lastNitro = false;
  game.events.on('poststep', () => {
    const race = game.scene.getScene('Race') as RaceScene | null;
    const state = game.scene.isActive('Race') ? race?.runner?.state : undefined;
    const t = state?.trucks[0];
    const now = ctx.currentTime;
    if (state?.phase === 'countdown') {
      const count = Math.ceil((state.countdownEndTick - state.tick) / TICK_RATE);
      if (count !== lastCount && count > 0) sounds.beep(1);
      lastCount = count;
    } else lastCount = 0;
    const running = state?.phase === 'racing' && t && !t.respawnAtTick && !t.finishedTick;
    const frac = t ? Math.min(1.3, Math.abs(t.speed) / t.stats.topSpeed) : 0;
    engine.frequency.setTargetAtTime(45 + 75 * frac, now, 0.05);
    engineFilter.frequency.setTargetAtTime(250 + 500 * frac, now, 0.05);
    engineGain.gain.setTargetAtTime(running ? 0.05 : 0, now, 0.08);
    const drifting = running && t.driftDir !== 0 && state.tick >= t.airborneUntilTick;
    screechGain.gain.setTargetAtTime(drifting ? 0.08 : 0, now, 0.04);
    const nitro = !!(running && state.tick < t.nitroUntilTick);
    if (nitro && !lastNitro) sounds.nitro(1);
    lastNitro = nitro;
  });
}
