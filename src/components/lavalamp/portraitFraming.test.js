import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPortraitRings } from './portraitFraming.js';

test('rotating silhouette stays inside a fixed eight-percent frame', () => {
  const rings = [[.8, -.6], [.45, .1], [.3, .8], [.1, 1]];
  for (const aspect of [.7, 1, 1.5]) {
    const elevation = .2;
    const { distance, targetY } = fitPortraitRings(rings, aspect, 37, elevation);
    for (const [r, y0] of rings) for (let step = 0; step < 360; step++) {
      const a = step * Math.PI / 180, y = y0 - targetY;
      const x = r * Math.sin(a), z = r * Math.cos(a);
      const depth = distance - z * Math.cos(elevation) - y * Math.sin(elevation);
      const vertical = y * Math.cos(elevation) - z * Math.sin(elevation);
      const tan = Math.tan(37 * Math.PI / 360);
      assert.ok(Math.abs(x / (depth * tan * aspect)) <= .840001);
      assert.ok(Math.abs(vertical / (depth * tan)) <= .840001);
    }
  }
});
