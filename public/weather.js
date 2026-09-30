// Loon Lake weather: rain streaks that stay put in the world as you move, ripples on the water,
// lightning flashes and a smooth ramp between clear skies and a storm.
import * as THREE from 'three';

const LEVEL = { clear: 0, cloudy: 0.35, rain: 0.8, storm: 1 };

export function createWeather(scene, camera) {
  const N = 1700;
  const BOX = 46;
  const TOP = 26;
  const pos = new Float32Array(N * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const drops = Array.from({ length: N }, () => ({ x: (Math.random() - 0.5) * BOX, y: Math.random() * TOP, z: (Math.random() - 0.5) * BOX, v: 19 + Math.random() * 9 }));
  const mat = new THREE.LineBasicMaterial({ color: 0xC9D7E4, transparent: true, opacity: 0, depthWrite: false });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.renderOrder = 4;
  lines.visible = false;
  scene.add(lines);

  let level = 0;
  let flash = 0;
  let flash2 = -1;
  let nextBolt = 8;
  let rippleAcc = 0;
  const last = new THREE.Vector3().copy(camera.position);
  const WIND = 1.6;

  // hooks: { inWater(x, z), ripple(x, z), thunder(delaySeconds) }
  function update(dt, kind, hooks) {
    level += ((LEVEL[kind] ?? 0) - level) * Math.min(1, dt * 0.4);
    const rain = Math.min(1, Math.max(0, (level - 0.3) / 0.7));
    const cam = camera.position;
    const dx = cam.x - last.x;
    const dz = cam.z - last.z;
    last.copy(cam);
    if (rain > 0.02) {
      lines.visible = true;
      mat.opacity = 0.16 + 0.34 * rain;
      const n = Math.max(1, Math.floor(N * rain));
      geo.setDrawRange(0, n * 2);
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        d.x -= dx;
        d.z -= dz;
        if (d.x < -BOX / 2) d.x += BOX; else if (d.x > BOX / 2) d.x -= BOX;
        if (d.z < -BOX / 2) d.z += BOX; else if (d.z > BOX / 2) d.z -= BOX;
        d.y -= d.v * dt;
        if (d.y < -6) d.y += TOP;
        const x = cam.x + d.x;
        const y = cam.y + d.y - 4;
        const z = cam.z + d.z;
        pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
        pos[i * 6 + 3] = x + WIND * 0.045; pos[i * 6 + 4] = y + 0.85; pos[i * 6 + 5] = z;
      }
      geo.attributes.position.needsUpdate = true;
      // rain dimples the water around you
      rippleAcc += dt * 55 * rain;
      while (rippleAcc >= 1) {
        rippleAcc -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 24;
        const x = cam.x + Math.sin(a) * r;
        const z = cam.z + Math.cos(a) * r;
        if (hooks.inWater(x, z)) hooks.ripple(x, z);
      }
    } else lines.visible = false;

    // lightning, only in storms: a double flash, then thunder that lags by the distance
    if (kind === 'storm' && level > 0.7) {
      nextBolt -= dt;
      if (nextBolt <= 0) {
        nextBolt = 7 + Math.random() * 15;
        flash = 1;
        flash2 = 0.16;
        hooks.thunder(0.4 + Math.random() * 2.6);
      }
    }
    if (flash2 >= 0) { flash2 -= dt; if (flash2 < 0) { flash = Math.max(flash, 0.75); flash2 = -1; } }
    flash = Math.max(0, flash - dt * 3.2);
    return { level, rain, flash };
  }

  return { update, get level() { return level; } };
}
