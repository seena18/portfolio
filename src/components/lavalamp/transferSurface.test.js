import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { sampleTransferSurface } from './transferSurface.js';

test('particles originate on the live marching-cubes surface, including separated lobes', () => {
  const body = new MarchingCubes(32, new THREE.MeshBasicMaterial(), false, false, 10000);
  body.isolation = 80;
  body.addBall(.29, .5, .5, .6, 12);
  body.addBall(.71, .5, .5, .6, 12);
  body.update();
  body.updateMatrixWorld();
  const camera = new THREE.PerspectiveCamera(40, 1.6, .1, 100);
  camera.position.set(0, 0, 5);
  camera.updateMatrixWorld();
  const { points, bounds } = sampleTransferSurface(body.geometry, body.matrixWorld, camera, 1000);
  assert.equal(points.length, 3000);
  const ray = new THREE.Raycaster();
  const point = new THREE.Vector3();
  let left = 0, right = 0;
  for (let i = 0; i < points.length; i += 3) {
    point.fromArray(points, i);
    assert.ok(bounds.containsPoint(point));
    if (point.x < 0) left++; else right++;
    if (i % 90) continue;
    ray.set(point.clone().add(new THREE.Vector3(0, 0, .0001)), new THREE.Vector3(0, 0, -1));
    const hits = ray.intersectObject(body);
    assert.ok(hits.length && hits[0].distance < .001, 'sample must touch an actual triangle');
  }
  assert.ok(left > 350 && right > 350, 'both lobes must supply material');
  assert.deepEqual(sampleTransferSurface(body.geometry, body.matrixWorld, camera, 1000).points, points, 'return uses identical origins');
  body.geometry.dispose();
  body.material.dispose();
});

test('unused preallocated vertices never produce particles or inflate the bounds', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -.5, -.5, 0, .5, -.5, 0, 0, .5, 0,
    -99, -99, 0, 99, -99, 0, 0, 99, 0,
  ], 3));
  geometry.setDrawRange(0, 3);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
  camera.position.z = 5;
  camera.updateMatrixWorld();
  const { points, bounds } = sampleTransferSurface(geometry, new THREE.Matrix4(), camera, 100);
  assert.equal(points.length, 300);
  assert.equal(bounds.max.x, .5);
  assert.equal(bounds.min.y, -.5);
  geometry.setDrawRange(0, 0);
  assert.equal(sampleTransferSurface(geometry, new THREE.Matrix4(), camera, 100).points.length, 0);
  geometry.dispose();
});
