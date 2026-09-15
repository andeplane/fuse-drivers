import Phaser from 'phaser';
import type { TruckInput } from '../../shared/input.ts';

/** Arrows or A/D steer, S or Down brakes, Shift nitro, Space item, Space+Down uses the alternate direction. */
export function createKeyboard(scene: Phaser.Scene): () => TruckInput {
  const k = scene.input.keyboard!;
  const keys = k.addKeys({ left: 'LEFT', right: 'RIGHT', a: 'A', d: 'D', s: 'S', down: 'DOWN', shift: 'SHIFT', space: 'SPACE' }) as Record<string, Phaser.Input.Keyboard.Key>;
  return () => ({
    left: keys.left.isDown || keys.a.isDown,
    right: keys.right.isDown || keys.d.isDown,
    brake: keys.s.isDown || (keys.down.isDown && !keys.space.isDown),
    nitro: keys.shift.isDown,
    item: keys.space.isDown,
    itemAlt: keys.down.isDown,
  });
}
