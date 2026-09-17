import { INK_ARRIVAL, INK_ROW_DELAY, INK_HANDOFF } from './inkTargets.js';

const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
export const MENU_ROW_DELAY = .22;
export const MENU_RELEASE = .3;

export function menuInkParticle(progress, menuBand, contentBand) {
  const release = MENU_RELEASE - clamp(menuBand) * MENU_ROW_DELAY;
  const arrival = INK_ARRIVAL + clamp(contentBand) * INK_ROW_DELAY;
  const t = clamp((progress - release) / (arrival - release));
  return {
    ease: t * t * t * (t * (t * 6 - 15) + 10),
    arc: Math.sin(Math.PI * t) ** 2,
    opacity: smooth((progress - release + INK_HANDOFF) / INK_HANDOFF)
      * (1 - smooth((progress - arrival + INK_HANDOFF) / INK_HANDOFF)),
  };
}

export function menuInkState(phase, progress, clicked, fade, reducedMotion = false) {
  if (reducedMotion) return { exposure: phase === 'lava' && !clicked ? 1 : 0, travel: 0, active: false, returning: false };
  if (phase === 'toRect' || phase === 'toLava') {
    const front = (MENU_RELEASE - progress) / MENU_ROW_DELAY * 100;
    return { exposure: clamp(front / 116), front, active: progress >= 0 && progress < .82, returning: phase === 'toLava' };
  }
  if (phase === 'lava') {
    const exposure = clicked ? 1 - smooth(fade) : 1;
    return { exposure, travel: 0, active: false, returning: false };
  }
  return { exposure: 0, travel: 0, active: false, returning: false };
}

export function visibleContentTargets(ink, offset, width, height) {
  if (!ink?.positions || !offset) return [];
  const targets = [];
  // Keep screen-visible destinations, sampled across actual glyphs and rules.
  for (let i = 0; i < ink.positions.length; i += 24) {
    const x = offset.x + ink.positions[i];
    const y = offset.y + ink.positions[i + 1];
    if (x > 0 && x < width && y > 0 && y < height) targets.push({ x, y });
  }
  return targets;
}
