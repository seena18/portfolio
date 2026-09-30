// Each vertex sweeps a horizontal ring during rotation. Fit those rings rather
// than a box whose widest shoulders are incorrectly extended up to the head.
export function fitPortraitRings(rings, aspect, fov, elevation, margin = .08) {
  const s = Math.sin(elevation), c = Math.cos(elevation);
  let low = Infinity, high = -Infinity;
  for (const [radius, y] of rings) {
    low = Math.min(low, y * c - radius * s);
    high = Math.max(high, y * c + radius * s);
  }
  const targetY = (low + high) / (2 * c);
  const ty = Math.tan(fov * Math.PI / 360) * (1 - margin * 2);
  const tx = ty * aspect;
  let distance = 0;
  for (const [r, originalY] of rings) {
    const y = originalY - targetY;
    distance = Math.max(distance,
      y * s + r * Math.hypot(1 / tx, c),
      y * (s + c / ty) + r * Math.abs(c - s / ty),
      y * (s - c / ty) + r * Math.abs(c + s / ty));
  }
  return { distance, targetY };
}
