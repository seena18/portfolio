import { COMPOSE_DURATION, INK_DURATION, INK_START_DELAY } from './inkTargets.js';

export const createTimeline = () => ({ phase: 'lava', elapsed: 0, from: 0, entryElapsed: 0, morph: 0, ink: Infinity, opacity: 0 });

const smoothstep = (min, max, value) => {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
};

export function bodyDissolve(progress, phase, reducedMotion = false) {
  if (phase === 'lava' || phase === 'lavaHold') return 0;
  if (reducedMotion) return phase === 'toLava' ? 0 : 1;
  if (!Number.isFinite(progress)) return phase === 'rect' ? 1 : 0;
  return smoothstep(.04, .82, progress);
}

export function advanceTimeline(state, phase, delta, reducedMotion, entryActive, paused = false) {
  if (paused) return;
  if (phase !== state.phase) {
    state.phase = phase;
    state.elapsed = 0;
    state.from = state.morph;
    if (phase === 'toRect') state.entryElapsed = 0;
  }
  const dt = Math.min(delta, .05) * 1000;
  state.elapsed += dt;
  if (phase === 'toRect') state.morph = Math.min(1, state.from + state.elapsed / (reducedMotion ? 50 : COMPOSE_DURATION));
  else if (phase === 'toLava') state.morph = Math.max(0, state.from - state.elapsed / (reducedMotion ? 50 : entryActive ? COMPOSE_DURATION : 1500));
  if (phase === 'toRect' || phase === 'rect') state.entryElapsed += dt;
  state.ink = reducedMotion || !entryActive ? Infinity
    : phase === 'toLava' ? Math.max(0, 1 - state.elapsed / COMPOSE_DURATION)
    : (state.entryElapsed - INK_START_DELAY) / INK_DURATION;
  state.opacity = phase === 'rect' ? 1
    : phase === 'toLava' && entryActive ? Math.max(0, Math.min(1, state.ink / .2))
    : phase === 'toRect' ? Math.min(1, state.elapsed / 250)
    : Math.max(0, Math.min(1, (state.morph - .4) / .35));
}
