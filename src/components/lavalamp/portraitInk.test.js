import test from 'node:test';
import assert from 'node:assert/strict';
import { updatePortraitInk } from './inkTargets.js';

test('live portrait targets move without replacing the transfer particle field', () => {
  const ink = {
    positions: new Float32Array([5, 6, 0, 10, 20, 0, 30, 40, 0]),
    portraitRange: { start: 1, count: 2 }, portraitVersion: 0,
  };
  const positions = ink.positions;
  assert.equal(updatePortraitInk(ink, [12, 22, 0, 32, 42, 0]), true);
  assert.equal(ink.positions, positions);
  assert.deepEqual([...ink.positions], [5, 6, 0, 12, 22, 0, 32, 42, 0]);
  assert.equal(ink.portraitVersion, 1);
});
