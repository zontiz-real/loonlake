// Half-Life style on-foot movement: ground friction and acceleration, and capped air acceleration
// (which is what makes strafe-jumping build speed). Numbers are Half-Life's, scaled to metres:
// 320 units of top speed = 6 m/s, so 1 unit = 0.01875 m.
export const HL = { accel: 10, airAccel: 10, friction: 4, stop: 1.875, airCap: 0.5625, bhopCap: 1.7 };

// Slow `vel` by ground friction (skipped in the air).
export function applyFriction(vel, dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed <= 0) return;
  const drop = Math.max(speed, HL.stop) * HL.friction * dt;
  const k = Math.max(0, speed - drop) / speed;
  vel.x *= k;
  vel.z *= k;
}

// Push `vel` toward the wish direction. In the air the target speed is capped, but the push is not,
// so turning while strafing keeps adding speed.
export function accelerate(vel, dirx, dirz, wishSpeed, airborne, dt) {
  const target = airborne ? Math.min(wishSpeed, HL.airCap) : wishSpeed;
  const add = target - (vel.x * dirx + vel.z * dirz);
  if (add <= 0) return;
  const a = Math.min(add, (airborne ? HL.airAccel : HL.accel) * wishSpeed * dt);
  vel.x += dirx * a;
  vel.z += dirz * a;
}

// Taking off caps horizontal speed at 1.7x top speed, so hopping cannot run away forever.
export function capBhop(vel, maxSpeed) {
  const cap = maxSpeed * HL.bhopCap;
  const sp = Math.hypot(vel.x, vel.z);
  if (sp > cap) {
    vel.x *= cap / sp;
    vel.z *= cap / sp;
  }
}
