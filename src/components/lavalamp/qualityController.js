// Change resolution only while resting in the menu. Hysteresis prevents
// alternating quality levels, and every rendered frame still updates the mesh.
export function createQualityController(mobile) {
  return { levels: mobile ? [64, 56, 48] : [72, 64, 56], tier: 0, average: 16.7, elapsed: 0 };
}
export function updateQuality(controller, delta, resting) {
  if (!resting || delta > .1) { controller.elapsed = 0; return null; }
  controller.average += (delta * 1000 - controller.average) * (1 - Math.exp(-delta * 2));
  controller.elapsed += delta;
  if (controller.elapsed < 3) return null;
  controller.elapsed = 0;
  const previous = controller.tier;
  if (controller.average > 25) controller.tier = Math.min(2, previous + 1);
  else if (controller.average < 15) controller.tier = Math.max(0, previous - 1);
  return controller.tier === previous ? null : controller.levels[controller.tier];
}
