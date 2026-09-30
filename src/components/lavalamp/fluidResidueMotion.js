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
  { x: .045, y: .36, radius: 43, seed: .2 },
  { x: .955, y: .62, radius: 57, seed: 2.3 },
  { x: .075, y: .83, radius: 22, seed: 4.8 },
];

// Keep smooth geometry on phones, but spend less work on decoration.
export function fluidDensity(width) {
  if (width < 768) {
    return {
        remnants: width >= 650 ? 3 : 2,
        motes: Math.max(128, Math.round(width * .24)),
        radiusCap: 20 + Math.min(7, Math.max(0, width - 600) * .047),
        opacity: .7,
      };
  }
  const desktopBlend = smoothstep(768, 1600, width);
  const moteRate = .24 + (.12 - .24) * desktopBlend;
  return {
    remnants: 3,
    motes: Math.min(420, Math.round(width * moteRate)),
    radiusCap: Infinity,
    opacity: .7 + .12 * desktopBlend,
  };
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
  const anchorY = remnant.seed > 4 ? remnant.y - .10 * smoothstep(850, 1300, width) : remnant.y;
  if (width < 768) {
    // A phone has only an edge sliver; a narrow desktop window has an actual
    // gutter. Let the same droplets ease inward without reaching the copy.
    const inset = 12 + Math.min(30, Math.max(0, width - 600) * .18);
    return {
      x: (remnant.x < .5 ? inset : width - inset) + Math.sin(time * .19 + remnant.seed) * 2,
      y: anchorY * height + Math.sin(time * .27 + remnant.seed) * Math.min(40, height * .05),
    };
  }
  let anchorX = remnant.x * width;
  if (contentBounds) {
    const left = remnant.x < .5;
    const gutter = left ? contentBounds.left : width - contentBounds.right;
    const offset = Math.min(gutter * .5, remnant.radius + 64 + (remnant.seed > 4 ? 36 : 0));
    anchorX = left ? gutter - offset : width - gutter + offset;
    if (left && remnant.seed < 1) anchorX -= 25 * smoothstep(1100, 1600, width);
    if (width < 900) {
      const mobileInset = 12 + Math.min(30, Math.max(0, width - 600) * .18);
      const mobileX = left ? mobileInset : width - mobileInset;
      anchorX = mobileX + (anchorX - mobileX) * smoothstep(767, 900, width);
    }
  }
  const sway = 2 + (Math.min(16, width * .012) - 2) * smoothstep(767, 900, width);
  const mobileRise = Math.min(40, height * .05);
  const rise = mobileRise + (Math.min(62, height * .075) - mobileRise) * smoothstep(767, 900, width);
  return {
    x: anchorX + Math.sin(time * .19 + remnant.seed) * sway,
    y: anchorY * height + Math.sin(time * .27 + remnant.seed) * rise,
  };
}

// Preserve a complete silhouette while the side gutter contracts. Keep this
// separate from content clearance: shrinking the blob already handles that.
export function keepRemnantOnScreen(x, radius, width, padding = 8) {
  return Math.max(radius + padding, Math.min(width - radius - padding, x));
}
