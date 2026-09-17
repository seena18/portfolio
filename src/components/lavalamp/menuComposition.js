import * as THREE from 'three';

const point = new THREE.Vector3();
const projection = new THREE.Matrix4();

export function measureMenuReference(geometry) {
  const positions = geometry.getAttribute('position');
  const end = Math.min(positions.count, geometry.drawRange.start + geometry.drawRange.count);
  let radiusSquared = 0;
  for (let i = geometry.drawRange.start; i < end; i++) {
    radiusSquared = Math.max(radiusSquared, point.fromBufferAttribute(positions, i).lengthSq());
  }
  return Math.max(.1, 2 * Math.sqrt(radiusSquared));
}

export function projectedMenuBounds(mesh, camera, width, height) {
  mesh.updateMatrixWorld();
  camera.updateMatrixWorld();
  projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
  const positions = mesh.geometry.getAttribute('position');
  const end = Math.min(positions.count, mesh.geometry.drawRange.start + mesh.geometry.drawRange.count);
  const bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (let i = mesh.geometry.drawRange.start; i < end; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(projection);
    const x = (point.x * .5 + .5) * width;
    const y = (.5 - point.y * .5) * height;
    bounds.left = Math.min(bounds.left, x);
    bounds.right = Math.max(bounds.right, x);
    bounds.top = Math.min(bounds.top, y);
    bounds.bottom = Math.max(bounds.bottom, y);
  }
  return bounds;
}

// The menu is anchored by the viewport layout. Only correct the blob if a
// moving lobe enters the reserved gap; never follow it with the navigation.
export function keepBlobClearOfMenu(mesh, camera, layout, width, height) {
  const unitsPerPixel = 2 * Math.tan(camera.fov * Math.PI / 360) * camera.position.z / height;
  let bounds;
  for (let pass = 0; pass < 4; pass++) {
    bounds = projectedMenuBounds(mesh, camera, width, height);
    if (!Number.isFinite(bounds.left)) return null;
    const overlap = layout.stacked
      ? bounds.bottom - (layout.menuTop - layout.gap)
      : bounds.right - (layout.menuLeft - layout.gap);
    if (overlap <= .01) break;
    if (layout.stacked) mesh.position.y += overlap * unitsPerPixel;
    else mesh.position.x -= overlap * unitsPerPixel;
  }
  bounds = projectedMenuBounds(mesh, camera, width, height);
  return bounds;
}
