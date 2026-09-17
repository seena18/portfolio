import { sliceDynamics } from './sliceDynamics.js';

export const SLICE_LIFETIME = 2800;
export const MAX_SLICES = 3;

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function sliceOpening(age, reducedMotion = false) {
  if (age < 0 || age >= SLICE_LIFETIME) return 0;
  // A quick separation, a moment of suspension, then surface tension wins.
  return (reducedMotion ? .012 : .030) * smooth(0, 90, age)
    * (1 - smooth(380, 1800, age));
}

export function sampleField(field, size, x, y, z) {
  x *= size; y *= size; z *= size;
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  if (ix < 0 || iy < 0 || iz < 0 || ix >= size - 1 || iy >= size - 1 || iz >= size - 1) return 0;
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const row = size, plane = size * size, i = ix + iy * row + iz * plane;
  const a = field[i] * (1 - fx) + field[i + 1] * fx;
  const b = field[i + row] * (1 - fx) + field[i + row + 1] * fx;
  const c = field[i + plane] * (1 - fx) + field[i + plane + 1] * fx;
  const d = field[i + plane + row] * (1 - fx) + field[i + plane + row + 1] * fx;
  return (a * (1 - fy) + b * fy) * (1 - fz) + (c * (1 - fy) + d * fy) * fz;
}

// Inverse-map the two halves of the density volume, then cap the exposed
// surfaces. Marching cubes builds actual closed pieces, including cut faces.
// A reusable buffer and bounded cut count keep work off React's render path.
export function applySliceField(effect, cuts, now, scratch, reducedMotion = false) {
  const { field, size, isolation } = effect;
  if (!cuts.length) return scratch;
  if (scratch?.length !== field.length) scratch = new Float32Array(field.length);
  for (const cut of cuts) {
    const opening = sliceOpening(now - cut.startedAt, reducedMotion) * cut.power;
    const motion = sliceDynamics(now - (cut.bornAt ?? cut.startedAt),
      cut.releasedAt == null ? Infinity : now - cut.releasedAt, reducedMotion);
    if (opening < .00005 && Math.abs(motion.stretch) + Math.abs(motion.curl) < .00005) continue;
    scratch.set(field);
    const { origin: o, normal: n, tangent: t } = cut;
    const b = cut.depth ?? {
      x: n.y * t.z - n.z * t.y,
      y: n.z * t.x - n.x * t.z,
      z: n.x * t.y - n.y * t.x,
    };
    const halves = cut.halves ?? [
      { n: -.075, t: (cut.min + cut.max) / 2, b: 0, recoil: 1 },
      { n: .075, t: (cut.min + cut.max) / 2, b: 0, recoil: 1 },
    ];
    const stretch = 1 + motion.stretch * cut.power;
    // Axial stretch is balanced by radial contraction (unit determinant).
    const radialInverse = Math.sqrt(stretch);
    const inverseStretch = 1 / stretch;
    const feather = 2 / size;
    const bevel = 1.2 / size;
    for (let z = 1; z < size - 1; z++) {
      const dz = z / size - o.z;
      for (let y = 1; y < size - 1; y++) {
        const dy = y / size - o.y;
        let index = z * size * size + y * size + 1;
        for (let x = 1; x < size - 1; x++, index++) {
          const dx = x / size - o.x;
          const along = dx * t.x + dy * t.y + dz * t.z;
          const coverage = smooth(cut.min - feather, cut.min, along)
            * (1 - smooth(cut.max, cut.max + feather, along));
          if (coverage === 0) continue;
          const distance = dx * n.x + dy * n.y + dz * n.z;
          const side = distance < 0 ? -1 : 1;
          const half = halves[distance < 0 ? 0 : 1];
          const depth = dx * b.x + dy * b.y + dz * b.z;
          const u = along - half.t, v = depth - half.b;
          const r2 = (u * u + v * v) / .018;
          const rim = r2 / (1 + r2);
          const gap = Math.max(0, opening + motion.recoil * cut.power * half.recoil);
          // Warp the material coordinates of each half about its own mass
          // center. The cut face follows the same warp as the outer surface.
          const sourceN = half.n + (distance - side * gap - half.n) * inverseStretch
            - side * motion.curl * rim * cut.power;
          const sourceT = half.t + u * radialInverse - side * motion.shear * rim * cut.power;
          const sourceB = half.b + v * radialInverse;
          const dn = (sourceN - distance) * coverage;
          const dt = (sourceT - along) * coverage;
          const db = (sourceB - depth) * coverage;
          const density = sampleField(scratch, size,
            x / size + n.x * dn + t.x * dt + b.x * db,
            y / size + n.y * dn + t.y * dt + b.y * db,
            z / size + n.z * dn + t.z * dt + b.z * db);
          const cap = isolation + side * (distance + dn) / bevel * isolation;
          // Smooth intersection rounds the severed rim instead of making a
          // rigid planar wedge. Once the seam closes, the cap fades away while
          // the final small material oscillation settles into the original field.
          const k = isolation * .65;
          const h = Math.max(k - Math.abs(density - cap), 0) / k;
          const clipped = Math.max(0, Math.min(density, cap) - h * h * k * .25);
          const blend = Math.min(1, opening * coverage / .003);
          field[index] = density + (clipped - density) * blend;
        }
      }
    }
  }
  return scratch;
}
