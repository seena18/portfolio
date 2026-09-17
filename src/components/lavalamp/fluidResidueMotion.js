const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

// Share the existing dissolve clock, including its reverse and cancelled-entry states.
export function fluidPresence(phase, progress, reducedMotion = false) {
  if (phase === 'lava' || phase === 'lavaHold') return 0;
  if (phase === 'rect') return 1;
  if (reducedMotion || !Number.isFinite(progress)) return 0;
  return smoothstep(.14, .72, progress);
}

export const FLUID_REMNANTS = [
  { x: .045, y: .31, radius: 43, seed: .2 },
  { x: .955, y: .62, radius: 57, seed: 2.3 },
  { x: .075, y: .83, radius: 22, seed: 4.8 },
];

// Keep smooth geometry on phones, but spend less work on decoration.
export function fluidDensity(width) {
  return width < 768
    ? { remnants: 2, motes: 64, radiusCap: 8, opacity: .38 }
    : { remnants: 3, motes: Math.min(420, Math.max(156, Math.round(width * .12))), radiusCap: Infinity, opacity: .82 };
}

// Independent low-discrepancy steps fill the viewport without the diagonal
// banding caused by complementary x/y steps.
export function motePosition(index) {
  return {
    x: (.5 + index * .75487766624669) % 1,
    y: (.5 + index * .56984029099805) % 1,
    depth: (.5 + index * .41421356237309) % 1,
  };
}

// Slow buoyancy with a little lateral circulation; the reading column stays clear.
export function remnantPosition(remnant, time, width, height, contentBounds = null) {
  if (width < 768) {
    return {
      x: (remnant.x < .5 ? 7 : width - 7) + Math.sin(time * .19 + remnant.seed) * 2,
      y: remnant.y * height + Math.sin(time * .27 + remnant.seed) * Math.min(40, height * .05),
    };
  }
  let anchorX = remnant.x * width;
  if (contentBounds && width >= 1600) {
    const left = remnant.x < .5;
    const offset = remnant.radius + 64 + (remnant.seed > 4 ? 36 : 0);
    const nearContent = left ? contentBounds.left - offset : contentBounds.right + offset;
    anchorX = Math.max(remnant.radius + 20, Math.min(width - remnant.radius - 20, nearContent));
  }
  return {
    x: anchorX + Math.sin(time * .19 + remnant.seed) * Math.min(16, width * .012),
    y: remnant.y * height + Math.sin(time * .27 + remnant.seed) * Math.min(62, height * .075),
  };
}
