// On-foot movement, Roblox-style: snappy and forgiving, with full control in the air.
// Chaining hops (jumping again right as you land, which holding Space does for you) builds a speed boost with no ceiling.

export const FEEL = {
  groundAccel: 52, // m/s^2 toward the speed you are asking for: full speed in about a tenth of a second, not instantly
  groundStop: 44, // m/s^2 when you let go: a short glide to a stop
  airAccel: 42, // m/s^2 of steering while airborne
  hopStep: 0.07, // speed added by each chained hop
  hopWindow: 0.14, // seconds after landing in which the next jump still counts as chained
};

function approach(vel, tx, tz, rate) {
  const dx = tx - vel.x;
  const dz = tz - vel.z;
  const d = Math.hypot(dx, dz);
  if (d <= rate) { vel.x = tx; vel.z = tz; return; }
  vel.x += (dx / d) * rate;
  vel.z += (dz / d) * rate;
}

// On the ground velocity chases the wish velocity quickly, so starting and stopping feel instant.
export function groundMove(vel, dirx, dirz, wishSpeed, dt) {
  approach(vel, dirx * wishSpeed, dirz * wishSpeed, (wishSpeed > 0 ? FEEL.groundAccel : FEEL.groundStop) * dt);
}

// In the air you steer freely toward what you are asking for, and with no input you keep drifting (no drag).
export function airMove(vel, dirx, dirz, wishSpeed, dt) {
  if (wishSpeed <= 0) return;
  approach(vel, dirx * wishSpeed, dirz * wishSpeed, FEEL.airAccel * dt);
}

// The boost after a jump: chained if you took off within the window of touching down.
export function nextHopBoost(boost, secondsSinceLanding) {
  return secondsSinceLanding <= FEEL.hopWindow ? boost + FEEL.hopStep : 1;
}
