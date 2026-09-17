import test from 'node:test';
import assert from 'node:assert/strict';
import { FLUID_REMNANTS, fluidDensity, fluidPresence, motePosition, remnantPosition } from './fluidResidueMotion.js';

test('motes cover the viewport instead of falling into diagonal bands', () => {
  for (const count of [64, 156, 420]) {
    const cells = new Set();
    for (let index = 0; index < count; index++) {
      const { x, y, depth } = motePosition(index);
      assert.ok(x >= 0 && x < 1 && y >= 0 && y < 1 && depth >= 0 && depth < 1);
      cells.add(`${Math.floor(x * 4)},${Math.floor(y * 4)}`);
    }
    assert.equal(cells.size, 16, `${count} motes should reach every screen region`);
  }
});

test('mobile uses fewer, smaller remnants without reducing surface quality', () => {
  for (const width of [320, 375, 390, 430, 767]) {
    const density = fluidDensity(width);
    assert.equal(density.remnants, 2);
    assert.equal(density.motes, 64);
    assert.ok(density.opacity < .5);
    for (const remnant of FLUID_REMNANTS.slice(0, density.remnants)) {
      for (let time = 0; time < 60; time += .5) {
        const { x } = remnantPosition(remnant, time, width, 812);
        const innerEdge = remnant.x < .5 ? x + density.radiusCap : width - x + density.radiusCap;
        assert.ok(innerEdge < 24, 'settled droplets stay outside text inset');
      }
    }
  }
  assert.equal(fluidDensity(768).remnants, 3);
  assert.equal(fluidDensity(1920).motes, 230);
  assert.equal(fluidDensity(5120).motes, 420);
});

test('ultrawide floaters stay near the content rather than distant screen edges', () => {
  const contentBounds = { left: (5120 - 1760) / 2, right: (5120 + 1760) / 2 };
  for (const remnant of FLUID_REMNANTS) {
    for (let time = 0; time < 60; time += .5) {
      const { x } = remnantPosition(remnant, time, 5120, 1440, contentBounds);
      const distance = remnant.x < .5 ? contentBounds.left - x : x - contentBounds.right;
      assert.ok(distance > remnant.radius + 40);
      assert.ok(distance < 180);
    }
  }
});

test('fluid residue emerges during dissolution and withdraws on the same reverse clock', () => {
  assert.equal(fluidPresence('toRect', 0), 0);
  assert.equal(fluidPresence('toRect', 1), 1);
  assert.equal(fluidPresence('toLava', 0), 0);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const progress = i / 100;
    const presence = fluidPresence('toRect', progress);
    assert.ok(presence >= previous);
    assert.equal(presence, fluidPresence('toLava', progress));
    previous = presence;
  }
});

test('residue persists between chapters, stays out of the menu, and respects reduced motion', () => {
  assert.equal(fluidPresence('rect', Infinity), 1);
  assert.equal(fluidPresence('lava', 1), 0);
  assert.equal(fluidPresence('lavaHold', 1), 0);
  assert.equal(fluidPresence('toRect', .5, true), 0);
  assert.equal(fluidPresence('rect', Infinity, true), 1);
});

test('buoyant remnants stay in the margins across mobile and desktop sizes', () => {
  for (const [width, height] of [[375, 812], [768, 1024], [1440, 900], [2560, 1440]]) {
    for (const remnant of FLUID_REMNANTS) {
      let previous = remnantPosition(remnant, 0, width, height);
      for (let frame = 1; frame < 3600; frame++) {
        const next = remnantPosition(remnant, frame / 60, width, height);
        assert.ok(next.x / width < .1 || next.x / width > .9);
        assert.ok(next.y > height * .1 && next.y < height * .95);
        assert.ok(Math.hypot(next.x - previous.x, next.y - previous.y) < .4, 'slow continuous current');
        previous = next;
      }
    }
  }
});
