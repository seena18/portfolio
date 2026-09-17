// Integrate a damped spring in bounded steps so different display refresh
// rates produce the same soft acceleration and recovery.
export function advanceSpring(state, targetX, targetY, delta) {
  let remaining = Math.min(delta, .05);
  while (remaining > 0) {
    const dt = Math.min(remaining, 1 / 120);
    state.vx += ((targetX - state.x) * 900 - state.vx * 48) * dt;
    state.vy += ((targetY - state.y) * 900 - state.vy * 48) * dt;
    state.x += state.vx * dt;
    state.y += state.vy * dt;
    remaining -= dt;
  }
}
