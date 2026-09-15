import Phaser from 'phaser';
import { config } from '../shared/config.ts';
import { startAudio } from './audio.ts';
import { BootScene } from './scenes/BootScene.ts';
import { HudScene } from './scenes/HudScene.ts';
import { LobbyScene } from './scenes/LobbyScene.ts';
import { MenuScene } from './scenes/MenuScene.ts';
import { PartyShopScene } from './scenes/PartyShopScene.ts';
import { RaceScene } from './scenes/RaceScene.ts';
import { ResultsScene } from './scenes/ResultsScene.ts';
import { ShopScene } from './scenes/ShopScene.ts';

startAudio(new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: config.screen.width,
  height: config.screen.height,
  backgroundColor: '#1a1208',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  scene: [BootScene, MenuScene, RaceScene, HudScene, ResultsScene, ShopScene, LobbyScene, PartyShopScene],
}));
