import test from 'node:test';
import assert from 'node:assert/strict';
import { menuInkState, menuInkParticle, visibleContentTargets } from './menuInk.js';

test('menu dissolves outward and reforms near the end of the return', () => {
  assert.equal(menuInkState('toRect', 0, true, 0).exposure, 1);
  assert.ok(menuInkState('toRect', .1, true, 0).exposure < 1);
  assert.ok(menuInkState('toRect', .2, true, 0).exposure > 0);
  assert.ok(menuInkState('toRect', .2, true, 0).active);
  assert.equal(menuInkState('toRect', .4, true, 0).exposure, 0);
  assert.equal(menuInkState('toRect', .82, true, 0).active, false);
  assert.equal(menuInkState('toLava', .4, false, 0).exposure, 0);
  assert.ok(menuInkState('toLava', .15, false, 0).exposure > 0);
  assert.equal(menuInkState('toLava', 0, false, 0).exposure, 1);
  assert.equal(menuInkState('lava', 0, false, 0).exposure, 1);
});

test('menu ink targets visible content rather than the blob', () => {
  const positions = new Float32Array(27);
  positions.set([10, 10, 0], 0);
  positions.set([400, 10, 0], 24);
  assert.deepEqual(visibleContentTargets({ positions }, { x: 100, y: 50 }, 300, 200), [{ x: 110, y: 60 }]);
});

test('glyph particles take over at their own row release and retire at content arrival', () => {
  const before = menuInkParticle(.04, 0, .5);
  assert.equal(before.opacity, 0);
  const released = menuInkParticle(.3, 0, .5);
  assert.equal(released.ease, 0);
  assert.equal(released.opacity, 1);
  assert.ok(menuInkParticle(.3, 1, .5).ease > 0);
  assert.equal(menuInkParticle(.74, 0, .5).opacity, 0);
  assert.deepEqual(menuInkState('toRect', .2, true, 0).front,
    menuInkState('toLava', .2, false, 0).front);
});
