import * as THREE from 'three';

export function transferRelease(point, low, high) {
  const q = ['x', 'y', 'z'].map(axis => THREE.MathUtils.clamp((point[axis] - low[axis]) / Math.max(high[axis] - low[axis], .001), 0, 1));
  return .09 + .32 * (1 - q[1]) + .045 * Math.sin(q[0] * 9 + q[2] * 4) * Math.sin(q[1] * 7 - q[2] * 3);
}

// Shared by the solid surface and its particles: both cross the same boundary
// in local mesh coordinates, including during the reverse animation.
export const TRANSFER_FIELD_GLSL = `
  float transferRelease(vec3 p, vec3 low, vec3 high) {
    vec3 q = clamp((p - low) / max(high - low, vec3(.001)), 0., 1.);
    float ripple = sin(q.x * 9. + q.z * 4.) * sin(q.y * 7. - q.z * 3.);
    return .09 + .32 * (1. - q.y) + .045 * ripple;
  }
`;

// Sample actual visible triangles in proportion to their projected area.
// MarchingCubes preallocates its buffers; only drawRange contains live faces.
export function sampleTransferSurface(geometry, matrixWorld, camera, count) {
  const positions = geometry.getAttribute('position');
  const index = geometry.index;
  const start = geometry.drawRange.start;
  const end = Math.min(index?.count ?? positions.count, start + geometry.drawRange.count);
  const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(matrixWorld);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), pc = new THREE.Vector3();
  const bounds = new THREE.Box3();
  const triangles = [];
  let area = 0;
  const vertex = i => index ? index.getX(i) : i;
  for (let i = start; i + 2 < end; i += 3) {
    a.fromBufferAttribute(positions, vertex(i));
    b.fromBufferAttribute(positions, vertex(i + 1));
    c.fromBufferAttribute(positions, vertex(i + 2));
    bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
    pa.copy(a).applyMatrix4(projection);
    pb.copy(b).applyMatrix4(projection);
    pc.copy(c).applyMatrix4(projection);
    const projectedArea = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    if (projectedArea <= 1e-12) continue;
    area += projectedArea;
    triangles.push({ i, area });
  }
  if (!triangles.length || !count) return { points: new Float32Array(), bounds };
  const points = [];
  let triangleIndex = 0;
  for (let i = 0; i < count; i++) {
    const targetArea = (i + .5) / count * area;
    while (triangleIndex < triangles.length - 1 && triangles[triangleIndex].area < targetArea) triangleIndex++;
    const triangle = triangles[triangleIndex].i;
    a.fromBufferAttribute(positions, vertex(triangle));
    b.fromBufferAttribute(positions, vertex(triangle + 1));
    c.fromBufferAttribute(positions, vertex(triangle + 2));
    const u = Math.sqrt((i * .754877666 + .31) % 1);
    const v = (i * .569840296 + .57) % 1;
    const point = a.clone().multiplyScalar(1 - u).addScaledVector(b, u * (1 - v)).addScaledVector(c, u * v);
    points.push({ point, y: point.clone().applyMatrix4(projection).y });
  }
  // Neighbouring rows arrive from neighbouring parts of the blob, reducing
  // crisscrossing paths while retaining the real shape of each lobe.
  points.sort((a, b) => b.y - a.y);
  return { points: new Float32Array(points.flatMap(({ point }) => point.toArray())), bounds };
}
