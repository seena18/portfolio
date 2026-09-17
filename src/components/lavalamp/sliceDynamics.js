const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Closed-form underdamped impulse response. Sampling this at any refresh rate
// gives the same motion, with no integrator blow-ups after a delayed frame.
export function viscousImpulse(seconds, frequency, damping) {
  if (seconds <= 0 || !Number.isFinite(seconds)) return 0;
  return Math.exp(-damping * seconds) * Math.sin(frequency * seconds);
}

export function sliceDynamics(age, releaseAge = Infinity, reducedMotion = false) {
  if (reducedMotion) return { recoil: 0, stretch: 0, curl: 0, shear: 0 };
  const t = Math.max(0, age) / 1000;
  const released = releaseAge / 1000;
  const settle = 1 - smooth(2100, 2800, age);
  const body = viscousImpulse(t, 6.4, 3.0) * settle;
  const rim = viscousImpulse(t - .095, 7.6, 3.5) * settle;
  // A long hold must still have a release response after the initial impulse
  // has settled. Its own envelope ends before the cut can be retired.
  const returnPulse = viscousImpulse(released, 7.2, 4.2)
    * (1 - smooth(2000, 2500, releaseAge));
  return {
    recoil: .047 * body - .009 * returnPulse,
    stretch: .32 * body - .10 * returnPulse,
    // The difference between two damped modes makes the perimeter lag the
    // bell, then whip past it on recovery. No perpetual procedural wobble.
    curl: .052 * (rim - body) - .009 * returnPulse,
    shear: .010 * viscousImpulse(t, 5.8, 3.4) * settle,
  };
}

// Coarse occupancy moments are enough for a stable pivot and relative mass.
// Run only on a hit, not every animation frame. Tiny chips have bounded recoil.
export function measureSliceHalves(effect, cut) {
  const halves = [
    { count: 0, n: 0, t: 0, b: 0 },
    { count: 0, n: 0, t: 0, b: 0 },
  ];
  const { origin: o, normal: n, tangent: t, depth: b } = cut;
  const size = effect.size;
  for (let z = 2; z < size - 2; z += 3) for (let y = 2; y < size - 2; y += 3) for (let x = 2; x < size - 2; x += 3) {
    if (effect.field[x + y * size + z * size * size] <= effect.isolation) continue;
    const dx = x / size - o.x, dy = y / size - o.y, dz = z / size - o.z;
    const d = dx * n.x + dy * n.y + dz * n.z;
    const half = halves[d < 0 ? 0 : 1];
    half.count++;
    half.n += d;
    half.t += dx * t.x + dy * t.y + dz * t.z;
    half.b += dx * b.x + dy * b.y + dz * b.z;
  }
  const total = Math.max(1, halves[0].count + halves[1].count);
  return halves.map((half, index) => {
    const count = Math.max(1, half.count);
    return {
      n: half.count ? half.n / count : (index ? .07 : -.07),
      t: half.count ? half.t / count : (cut.min + cut.max) / 2,
      b: half.b / count,
      recoil: Math.max(.65, Math.min(1.4, (1 - half.count / total) * 2)),
    };
  });
}
