import Phaser from 'phaser';
import { config } from '../shared/config.ts';
import { BootScene } from './scenes/BootScene.ts';
import { HudScene } from './scenes/HudScene.ts';
import { RaceScene } from './scenes/RaceScene.ts';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: config.world.width,
  height: config.world.height,
  backgroundColor: '#6b4a24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  scene: [BootScene, RaceScene, HudScene],
});
