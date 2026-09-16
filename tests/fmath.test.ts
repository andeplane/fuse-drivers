import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atan2, cos, hypot, sin } from '../src/shared/fmath.ts';
import { wrapAngle } from '../src/shared/truck.ts';

test('deterministic trig stays within 1e-12 of Math across angles and quadrants', () => {
  for (let a = -40; a <= 40; a += 0.0137) {
    assert.ok(Math.abs(sin(a) - Math.sin(a)) < 1e-12, `sin ${a}`);
    assert.ok(Math.abs(cos(a) - Math.cos(a)) < 1e-12, `cos ${a}`);
    const w = wrapAngle(a);
    assert.ok(w >= -Math.PI && w < Math.PI && Math.abs(Math.sin(w) - Math.sin(a)) < 1e-12 && Math.abs(Math.cos(w) - Math.cos(a)) < 1e-12, `wrap ${a}`);
  }
  for (let y = -3; y <= 3; y += 0.25) for (let x = -3; x <= 3; x += 0.25) {
    assert.ok(Math.abs(atan2(y, x) - Math.atan2(y, x)) < 1e-12 || (x === 0 && y === 0), `atan2 ${y},${x}`);
    assert.ok(Math.abs(hypot(x, y) - Math.hypot(x, y)) < 1e-12);
  }
  assert.equal(atan2(0, -1), Math.PI);
  assert.equal(atan2(1e-300, 1e300), 1e-600);
});
