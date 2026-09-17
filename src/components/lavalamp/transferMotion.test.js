import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { deformTransferPoint } from './transferMotion.js';
import { transferRelease } from './transferSurface.js';

test('transfer motion starts on the captured surface and settles back without an offset', () => {
  const point = new THREE.Vector3(.32, -.41, .26);
  const output = new THREE.Vector3();
  assert.deepEqual(deformTransferPoint(point, 0, 1, output), point);
  assert.deepEqual(deformTransferPoint(point, 4.2, 0, output), point);
  const almostSettled = deformTransferPoint(point, 4.2, .00001, output);
  assert.ok(almostSettled.distanceTo(point) < .00001);
});

test('surface keeps moving smoothly throughout outgoing and returning transfer windows', () => {
  const point = new THREE.Vector3(.32, -.41, .26);
  const previous = new THREE.Vector3();
  const next = new THREE.Vector3();
  for (let frame = 0; frame < 252; frame++) {
    const time = frame / 60;
    deformTransferPoint(point, time, 1, previous);
    deformTransferPoint(point, time + 1 / 60, 1, next);
    assert.ok(next.distanceTo(previous) > .00001, 'no held frames');
    assert.ok(next.distanceTo(previous) < .005, 'no deformation jumps');
    assert.ok(next.distanceTo(point) < .12, 'deformation remains gentle');
  }
});

test('launch capture can deform in place and project to the same moving surface', () => {
  const point = new THREE.Vector3(.32, -.41, .26);
  const projected = deformTransferPoint(point, 1.3, .8, new THREE.Vector3());
  const inPlace = point.clone();
  deformTransferPoint(inPlace, 1.3, .8, inPlace);
  assert.deepEqual(inPlace, projected);
  const projection = new THREE.Matrix4().makeRotationY(.3);
  assert.deepEqual(inPlace.applyMatrix4(projection), projected.applyMatrix4(projection));
});

test('particle release uses the material-space boundary regardless of surface motion', () => {
  const low = new THREE.Vector3(-1, -1, -1);
  const high = new THREE.Vector3(1, 1, 1);
  const point = new THREE.Vector3(.32, -.41, .26);
  const q = point.clone().sub(low).divide(high.clone().sub(low));
  const expected = .09 + .32 * (1 - q.y)
    + .045 * Math.sin(q.x * 9 + q.z * 4) * Math.sin(q.y * 7 - q.z * 3);
  assert.ok(Math.abs(transferRelease(point, low, high) - expected) < 1e-12);
});
