import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, advanceTimeline, bodyDissolve } from './blobTimeline.js';
import { createQualityController, updateQuality } from './qualityController.js';
import { advanceSpring } from './liquidMotion.js';
import { inkRevealFront } from './inkTargets.js';

test('composition and crisp content complete together at 30, 60 and 120 Hz', () => {
  for (const fps of [30, 60, 120]) {
    const timeline = createTimeline();
    for (let i = 0; i < Math.ceil(2.11 * fps); i++) advanceTimeline(timeline, 'toRect', 1 / fps, false, true);
    assert.equal(timeline.morph, 1);
    assert.equal(timeline.opacity, 1);
    assert.equal(inkRevealFront(timeline.ink), 125);
  }
});

test('pausing preserves both animations; cancellation reveals content without replay', () => {
  const timeline = createTimeline();
  advanceTimeline(timeline, 'toRect', .03, false, true);
  const before = { ...timeline };
  advanceTimeline(timeline, 'toRect', 30, false, true, true);
  assert.deepEqual(timeline, before);
  advanceTimeline(timeline, 'rect', .03, false, false);
  assert.equal(timeline.ink, Infinity);
  advanceTimeline(timeline, 'rect', .03, false, false);
  assert.equal(timeline.ink, Infinity);
  advanceTimeline(timeline, 'toLava', .05, false, false);
  advanceTimeline(timeline, 'toRect', .01, false, true);
  assert.ok(timeline.ink < 0, 'a new menu entry starts a fresh transfer');
});

test('reduced motion skips ink while completing the transition', () => {
  const timeline = createTimeline();
  advanceTimeline(timeline, 'toRect', .05, true, true);
  assert.equal(timeline.morph, 1);
  assert.equal(timeline.ink, Infinity);
});

test('return reverses ink monotonically and absorbs it before the menu settles', () => {
  for (const fps of [30, 60, 120]) {
    const timeline = createTimeline();
    timeline.phase = 'rect';
    timeline.morph = 1;
    let previous = 1;
    for (let i = 0; i < Math.ceil(2.11 * fps); i++) {
      advanceTimeline(timeline, 'toLava', 1 / fps, false, true);
      assert.ok(timeline.ink <= previous);
      if (timeline.ink > .2) assert.equal(timeline.opacity, 1);
      previous = timeline.ink;
    }
    assert.equal(timeline.ink, 0);
    assert.equal(inkRevealFront(timeline.ink), 0);
    assert.equal(timeline.morph, 0);
    assert.equal(timeline.opacity, 0);
    advanceTimeline(timeline, 'toRect', 1 / fps, false, true);
    assert.ok(timeline.ink < 0, 'return must not consume the next entry animation');
  }
});

test('the whole body dissolves into content and reforms on return', () => {
  assert.equal(bodyDissolve(0, 'lava'), 0);
  assert.equal(bodyDissolve(0, 'toRect'), 0);
  assert.ok(bodyDissolve(.5, 'toRect') > 0 && bodyDissolve(.5, 'toRect') < 1);
  assert.equal(bodyDissolve(1, 'rect'), 1);
  assert.ok(bodyDissolve(.3, 'toLava') < bodyDissolve(.8, 'toLava'));
  assert.equal(bodyDissolve(0, 'toLava'), 0);
  assert.equal(bodyDissolve(Infinity, 'rect', true), 1);
});

test('quality degrades under sustained load, stays fixed in transitions, and recovers', () => {
  const quality = createQualityController(false);
  for (let i = 0; i < 100; i++) updateQuality(quality, .035, true);
  assert.equal(quality.tier, 1);
  for (let i = 0; i < 500; i++) assert.equal(updateQuality(quality, .04, false), null);
  assert.equal(quality.tier, 1);
  for (let i = 0; i < 400; i++) updateQuality(quality, .01, true);
  assert.equal(quality.tier, 0);
});

test('spring converges consistently across refresh rates without runaway velocity', () => {
  for (const fps of [30, 60, 120]) {
    const spring = { x: 0, y: 0, vx: 0, vy: 0 };
    for (let i = 0; i < fps; i++) advanceSpring(spring, 100, -50, 1 / fps);
    assert.ok(Math.abs(spring.x - 100) < .01);
    assert.ok(Math.abs(spring.y + 50) < .01);
    assert.ok(Math.abs(spring.vx) < .01);
  }
});
