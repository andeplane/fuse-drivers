import Phaser from 'phaser';
import { config } from '../../shared/config.ts';

/** The stadium crowd behind a framed dark panel: the backdrop every menu-style screen shares. */
export function backdrop(scene: Phaser.Scene) {
  const { width, height } = config.screen;
  if (scene.textures.exists('grandstand')) scene.add.tileSprite(0, 0, width, height, 'grandstand').setOrigin(0).setTileScale(0.8).setAlpha(0.45);
  scene.add.rectangle(width / 2, height / 2, width * 0.92, height * 0.9, 0x0c0804, 0.84).setStrokeStyle(6, 0xffd23f);
}
