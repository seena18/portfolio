import test from 'node:test';
import assert from 'node:assert/strict';
import { applySliceField, sampleField, sliceOpening, SLICE_LIFETIME } from './sliceField.js';
import { measureSliceHalves, sliceDynamics } from './sliceDynamics.js';

function sphere(size = 48) {
  const field = new Float32Array(size ** 3);
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r2 = (x / size - .5) ** 2 + (y / size - .5) ** 2 + (z / size - .5) ** 2;
    field[x + y * size + z * size * size] = Math.max(0, 15 / (r2 + .001) - 80);
  }
  return { field, size, isolation: 300 };
}

const cut = (normal = { x: 0, y: 1, z: 0 }, tangent = { x: 1, y: 0, z: 0 }) => ({
  origin: { x: .5, y: .5, z: .5 }, normal, tangent,
  min: -.3, max: .3, startedAt: 0, power: 1,
});

test('a cut opens a through-volume gap with material retained on both sides', () => {
  const effect = sphere();
  applySliceField(effect, [cut()], 250);
  for (const z of [.4, .5, .6]) assert.ok(sampleField(effect.field, effect.size, .5, .5, z) < effect.isolation);
  for (const y of [.4, .6]) assert.ok(sampleField(effect.field, effect.size, .5, y, .5) > effect.isolation);
  assert.ok(effect.field.every(Number.isFinite));
});

test('diagonal cuts operate in 3D, independent of the mesh/camera orientation', () => {
  const effect = sphere();
  const v = Math.SQRT1_2;
  applySliceField(effect, [cut({ x: v, y: 0, z: v }, { x: v, y: 0, z: -v })], 250);
  assert.ok(sampleField(effect.field, effect.size, .5, .5, .5) < effect.isolation);
  assert.ok(sampleField(effect.field, effect.size, .57, .5, .57) > effect.isolation);
  assert.ok(sampleField(effect.field, effect.size, .43, .5, .43) > effect.isolation);
});

test('short strokes do not sever material beyond their endpoints', () => {
  const effect = sphere();
  const original = effect.field.slice();
  const short = { ...cut(), min: -.015, max: .015 };
  applySliceField(effect, [short], 250);
  assert.equal(sampleField(effect.field, effect.size, .65, .5, .5), sampleField(original, effect.size, .65, .5, .5));
});

test('healing restores the exact original field; idle needs no scratch allocation', () => {
  const effect = sphere();
  const original = effect.field.slice();
  assert.equal(applySliceField(effect, [], 250), undefined);
  applySliceField(effect, [cut()], SLICE_LIFETIME);
  assert.deepEqual(effect.field, original);
  assert.equal(sliceOpening(-1), 0);
  assert.equal(sliceOpening(SLICE_LIFETIME), 0);
  assert.ok(sliceOpening(250, true) < sliceOpening(250));
});

test('repeated cuts reuse scratch memory and remain finite across quality tiers', () => {
  for (const size of [48, 56, 64, 72]) {
    const effect = sphere(size);
    const scratch = new Float32Array(effect.field.length);
    const result = applySliceField(effect, [cut(), cut({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })], 350, scratch);
    assert.equal(result, scratch);
    assert.ok(effect.field.every(Number.isFinite));
  }
});

test('viscous response repels, overshoots, and settles without residual motion', () => {
  assert.ok(sliceDynamics(200).recoil > 0);
  assert.ok(sliceDynamics(650).stretch < 0, 'the recovery should overshoot softly');
  assert.ok(sliceDynamics(80).curl < 0, 'the rim initially trails the bulk');
  assert.ok(sliceDynamics(400).curl > 0, 'the rim catches up and whips past the bulk');
  for (const value of Object.values(sliceDynamics(2800))) assert.equal(Math.abs(value), 0);
  for (const value of Object.values(sliceDynamics(200, 100, true))) assert.equal(value, 0);
  assert.ok(sliceDynamics(10000, 180).stretch < 0, 'a long hold still recoils on release');
});

test('motion stays bounded and frame-rate independent at 30, 60 and 120 Hz', () => {
  for (const fps of [30, 60, 120]) {
    for (let frame = 0; frame <= fps * 3; frame++) {
      const age = frame / fps * 1000;
      const motion = sliceDynamics(age, age > 300 ? age - 300 : Infinity);
      assert.ok(Math.abs(motion.stretch) < .35);
      assert.ok(Math.abs(motion.curl) < .06);
      assert.ok(Object.values(motion).every(Number.isFinite));
      if (frame === fps) assert.deepEqual(motion, sliceDynamics(1000, 700));
    }
  }
});

test('an off-center cut gives the smaller piece more bounded recoil', () => {
  const effect = sphere();
  const offCenter = { ...cut(), origin: { x: .5, y: .59, z: .5 }, depth: { x: 0, y: 0, z: 1 } };
  const [large, small] = measureSliceHalves(effect, offCenter);
  assert.ok(large.n < 0 && small.n > 0);
  assert.ok(small.recoil > large.recoil);
  assert.ok(small.recoil <= 1.4 && large.recoil >= .65);
});

test('stretch and rim curl retain most liquid volume throughout recovery', () => {
  const effect = sphere();
  const original = effect.field.slice();
  const originalVolume = original.reduce((sum, density) => sum + (density > effect.isolation), 0);
  const stroke = { ...cut(), bornAt: 0, releasedAt: 300, depth: { x: 0, y: 0, z: 1 } };
  stroke.halves = measureSliceHalves(effect, stroke);
  let scratch;
  for (const age of [80, 200, 400, 650, 1100, 1900, 2800]) {
    effect.field.set(original);
    scratch = applySliceField(effect, [stroke], age, scratch);
    const volume = effect.field.reduce((sum, density) => sum + (density > effect.isolation), 0);
    assert.ok(volume > originalVolume * .8 && volume < originalVolume * 1.15, `volume at ${age}ms: ${volume / originalVolume}`);
    assert.ok(effect.field.every(Number.isFinite));
  }
  assert.deepEqual(effect.field, original);
});
