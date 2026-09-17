import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { menuLayout, menuBlobScale } from './blobSizing.js';
import { measureMenuReference, keepBlobClearOfMenu, projectedMenuBounds } from './menuComposition.js';

test('menu stays anchored while rotating lobes stay clear without resizing', () => {
  const geometry = new THREE.SphereGeometry(.6, 24, 16);
  geometry.scale(1.2, .9, .8);
  geometry.translate(.1, -.1, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  for (const [width, height] of [[320, 568], [850, 1350], [1920, 1080], [3840, 2160]]) {
    const camera = new THREE.PerspectiveCamera(40, width / height, .1, 100);
    camera.position.set(5, 0, 25);
    camera.updateMatrixWorld();
    const layout = menuLayout(width, height);
    const viewHeight = 2 * Math.tan(40 * Math.PI / 360) * 25;
    const referenceDiameter = measureMenuReference(geometry);
    const stableScale = menuBlobScale(width, height, 40, 25, referenceDiameter);
    const anchoredLayout = { ...layout };
    for (let turn = 0; turn < 6.3; turn += .25) {
      mesh.position.set(5 + viewHeight * width / height * (layout.blobX / width - .5), viewHeight * (.5 - layout.blobY / height), 0);
      mesh.rotation.set(turn * .7, turn, turn * .3);
      mesh.scale.setScalar(stableScale);
      mesh.updateMatrixWorld();
      keepBlobClearOfMenu(mesh, camera, layout, width, height);
      assert.equal(mesh.scale.x, stableScale, 'alignment must never resize the blob');
      const bounds = projectedMenuBounds(mesh, camera, width, height);
      if (layout.stacked) assert.ok(bounds.bottom <= layout.menuTop - layout.gap + .02);
      else assert.ok(bounds.right <= layout.menuLeft - layout.gap + .02);
      assert.deepEqual(layout, anchoredLayout, 'the menu layout must not track animated geometry');
      assert.ok(bounds.left >= 0);
      assert.ok(bounds.top >= 0);
      assert.ok(layout.menuLeft + layout.menuWidth <= width);
    }
  }
  geometry.dispose();
  mesh.material.dispose();
});

test('unused marching-cubes buffer space does not affect the calibrated size', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, 99, 99, 99], 3));
  geometry.setDrawRange(0, 2);
  assert.equal(measureMenuReference(geometry), 1);
  geometry.dispose();
});
