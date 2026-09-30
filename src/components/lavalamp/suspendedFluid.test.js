import test from 'node:test';
import assert from 'node:assert/strict';
import { FLUID_REMNANTS, fluidDensity, fluidPresence, keepRemnantOnScreen, motePosition, remnantPosition } from './fluidResidueMotion.js';

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

test('mobile keeps remnants visible but outside the reading inset', () => {
  for (const width of [320, 375, 390, 430, 650, 750, 767]) {
    const density = fluidDensity(width);
    assert.equal(density.remnants, width >= 650 ? 3 : 2);
    assert.equal(density.motes, Math.max(128, Math.round(width * .24)));
    assert.ok(density.opacity <= .7);
    for (const remnant of FLUID_REMNANTS.slice(0, density.remnants)) {
      for (let time = 0; time < 60; time += .5) {
        const { x } = remnantPosition(remnant, time, width, 812);
        const innerEdge = remnant.x < .5 ? x + density.radiusCap : width - x + density.radiusCap;
        const textInset = 35 + Math.max(0, width - 600) * .23;
        assert.ok(innerEdge < textInset, 'settled droplets stay outside text inset');
      }
    }
  }
  assert.equal(fluidDensity(768).remnants, 3);
  assert.ok(Math.abs(fluidDensity(768).motes - fluidDensity(767).motes) <= 1);
  assert.ok(Math.abs(fluidDensity(768).opacity - fluidDensity(767).opacity) < .01);
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

test('desktop accent positions frame the profile without changing the right remnant', () => {
  const width = 1920;
  const height = 1080;
  const bounds = { left: 280, right: 1640 };
  const [left, right, lower] = FLUID_REMNANTS;
  const leftX = remnantPosition(left, 0, width, height, bounds).x;
  const rightX = remnantPosition(right, 0, width, height, bounds).x;
  const lowerY = remnantPosition(lower, 0, width, height, bounds).y;
  assert.ok(leftX < bounds.left - left.radius - 80);
  assert.ok(rightX > bounds.right + right.radius + 40);
  assert.ok(lowerY < .78 * height);
});

test('desktop remnants remain in their gutters as the viewport narrows', () => {
  for (const width of [768, 800, 900, 1100, 1280, 1440, 1599, 1600]) {
    const inset = Math.max(40, (width - 880) / 2);
    const bounds = { left: inset, right: width - inset };
    for (const remnant of FLUID_REMNANTS) {
      const { x } = remnantPosition(remnant, 0, width, 900, bounds);
      assert.ok(remnant.x < .5 ? x > 0 && x < bounds.left + 10 : x < width && x > bounds.right - 10);
      assert.ok(inset * .42 > 0, 'gutter can support a scaled visible remnant');
    }
  }
});

test('phone-to-desktop handoff does not move remnants or thin dust abruptly', () => {
  const bounds = { left: 40, right: 728 };
  for (const remnant of FLUID_REMNANTS) {
    const before = remnantPosition(remnant, 0, 767, 900, bounds);
    const after = remnantPosition(remnant, 0, 768, 900, bounds);
    assert.ok(Math.abs(before.x - after.x) < 2);
  }
  assert.ok(Math.abs(fluidDensity(767).motes - fluidDensity(768).motes) <= 1);
});

test('narrow desktop floaters retain their full silhouette during sway', () => {
  for (const width of [650, 767, 768, 800, 900, 1024, 1280]) {
    const inset = Math.max(40, (width - 880) / 2);
    const bounds = { left: inset, right: width - inset };
    for (const remnant of FLUID_REMNANTS) {
      for (let time = 0; time < 60; time += .5) {
        const radius = Math.min(remnant.radius, width * .043, Math.max(20, inset * .42));
        const raw = remnantPosition(remnant, time, width, 900, bounds).x;
        const x = keepRemnantOnScreen(raw, radius, width);
        assert.ok(x - radius >= 8 - 1e-8);
        assert.ok(x + radius <= width - 8 + 1e-8);
      }
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
