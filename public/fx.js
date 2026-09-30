// Loon Lake effects: particles, ripple rings, floating numbers, and tracers.
import * as THREE from 'three';
import { WATER_Y, wave } from './world.js';

function makeParticles(scene, max, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: innerHeight / 2 } },
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `
      attribute float size; attribute float alpha; attribute vec3 color;
      uniform float uScale; varying float vA; varying vec3 vC;
      void main(){
        vA = alpha; vC = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uScale / max(0.1, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA; varying vec3 vC;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.12, d));
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 3;
  scene.add(points);
  const P = Array.from({ length: max }, () => ({ life: 0 }));
  let cursor = 0;
  const c = new THREE.Color();

  function spawn(o) {
    const i = cursor;
    cursor = (cursor + 1) % max;
    const p = P[i];
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.g = o.g || 0;
    p.drag = o.drag || 0;
    p.life = p.max = o.life || 1;
    p.s0 = o.size || 0.2;
    p.s1 = o.size1 ?? p.s0;
    p.a0 = o.alpha ?? 1;
    p.inout = !!o.inout;
    p.floor = o.floor ?? -99;
    c.set(o.color || 0xffffff);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }

  function update(dt) {
    for (let i = 0; i < max; i++) {
      const p = P[i];
      if (p.life <= 0) {
        if (alpha[i] !== 0) { alpha[i] = 0; size[i] = 0; }
        continue;
      }
      p.life -= dt;
      p.vy += p.g * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.life = 0; }
      const f = 1 - Math.max(0, p.life) / p.max;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      size[i] = p.s0 + (p.s1 - p.s0) * f;
      alpha[i] = p.life <= 0 ? 0 : p.a0 * (p.inout ? Math.sin(f * Math.PI) : 1 - f * f);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  }

  return { spawn, update, mat };
}

export function createFx(scene, camera) {
  const soft = makeParticles(scene, 900, false);
  const glow = makeParticles(scene, 700, true);
  const rand = (a, b) => a + Math.random() * (b - a);
  let time = 0;

  // ---------- ripple rings on the water
  const rippleGeo = new THREE.RingGeometry(0.86, 1, 40);
  rippleGeo.rotateX(-Math.PI / 2);
  const ripples = Array.from({ length: 32 }, () => {
    const mesh = new THREE.Mesh(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0, depthWrite: false }));
    mesh.visible = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return { mesh, t: 1, dur: 1, size: 1, strength: 0.5, x: 0, z: 0 };
  });
  let rippleCursor = 0;

  function ripple(x, z, size = 1, dur = 1.3, strength = 0.55) {
    const r = ripples[rippleCursor];
    rippleCursor = (rippleCursor + 1) % ripples.length;
    Object.assign(r, { t: 0, dur, size, strength, x, z });
    r.mesh.visible = true;
  }

  // ---------- blood pools: soft irregular blobs that spread out, then fade
  const blobTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < 9; i++) {
      const x = 64 + (Math.random() - 0.5) * 50;
      const y = 64 + (Math.random() - 0.5) * 50;
      const r = 18 + Math.random() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.7, 'rgba(255,255,255,.85)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    return t;
  })();
  const poolGeo = new THREE.PlaneGeometry(1, 1);
  poolGeo.rotateX(-Math.PI / 2);
  const pools = Array.from({ length: 36 }, () => {
    const mesh = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
      map: blobTex, color: 0x5E0707, transparent: true, opacity: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    mesh.visible = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return { mesh, t: 0, size: 1, life: 45 };
  });
  let poolCursor = 0;
  function bloodPool(x, y, z, size = 1) {
    const pl = pools[poolCursor];
    poolCursor = (poolCursor + 1) % pools.length;
    Object.assign(pl, { t: 0, size, life: 45 });
    pl.mesh.position.set(x, y + 0.03, z);
    pl.mesh.rotation.y = Math.random() * Math.PI * 2;
    pl.mesh.visible = true;
  }

  // ---------- floating text over the world
  const layer = document.getElementById('floaters');
  const floaters = [];
  const proj = new THREE.Vector3();

  function floater(x, y, z, text, cls = 'info', life = 1.4) {
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = text;
    layer.append(el);
    floaters.push({ el, x, y, z, t: 0, life });
  }

  // ---------- tracers
  const tracers = [];
  function tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y ?? 1.3, from.z),
      new THREE.Vector3(to.x, to.y ?? 1, to.z),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xFFD27A, transparent: true, opacity: 0.95 }));
    scene.add(line);
    tracers.push({ line, life: 0.12 });
    muzzle(from.x, from.y ?? 1.3, from.z, to);
  }

  // ---------- emitters
  function splash(x, z, n = 14, power = 1) {
    const y = WATER_Y + wave(x, z, time) + 0.05;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.6, 1.8) * power;
      soft.spawn({
        x, y, z, vx: Math.sin(a) * s, vy: rand(2.2, 4.4) * power, vz: Math.cos(a) * s,
        g: -11, life: rand(0.45, 0.85), size: rand(0.1, 0.2) * Math.sqrt(power), size1: 0.04,
        color: Math.random() < 0.5 ? 0xFFFFFF : 0xCFE8EC, alpha: 0.95, floor: WATER_Y - 0.1,
      });
    }
    ripple(x, z, 0.8 * power, 1.1, 0.6);
    ripple(x, z, 1.5 * power, 1.7, 0.35);
  }

  const BLOOD = [0x7A0A0A, 0x9E1212, 0x5E0707, 0xB31818];
  function blood(x, y, z, dx = 0, dz = 0, n = 18, power = 1) {
    for (let i = 0; i < n; i++) {
      soft.spawn({
        x: x + rand(-0.1, 0.1), y: y + rand(-0.15, 0.15), z: z + rand(-0.1, 0.1),
        vx: dx * rand(1, 4.5) * power + rand(-1.3, 1.3) * power, vy: rand(0.4, 3.2) * power, vz: dz * rand(1, 4.5) * power + rand(-1.3, 1.3) * power,
        g: -13, life: rand(0.35, 0.8), size: rand(0.06, 0.15), size1: 0.04,
        color: BLOOD[Math.floor(Math.random() * BLOOD.length)], alpha: 0.95, floor: 0.02,
      });
    }
  }
  function waterBlood(x, z, n = 4) {
    const y = WATER_Y + wave(x, z, time) + 0.03;
    for (let i = 0; i < n; i++) {
      soft.spawn({
        x: x + rand(-0.3, 0.3), y, z: z + rand(-0.3, 0.3),
        vx: rand(-0.25, 0.25), vz: rand(-0.25, 0.25), life: rand(2, 3.5), size: rand(0.3, 0.6), size1: rand(1.4, 2.4),
        color: 0x6A0A0A, alpha: 0.5,
      });
    }
  }
  // a wake behind a moving boat
  function wake(x, z, dx, dz, speed) {
    const y = WATER_Y + wave(x, z, time) + 0.05;
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1;
      soft.spawn({
        x: x + dz * 0.6 * side, y, z: z - dx * 0.6 * side,
        vx: dz * side * 1.2 - dx * 0.5, vy: rand(0.5, 1.2) * Math.min(1, speed / 6), vz: -dx * side * 1.2 - dz * 0.5,
        g: -8, life: rand(0.4, 0.7), size: rand(0.1, 0.2), size1: 0.05, color: 0xEAF6F4, alpha: 0.9, floor: WATER_Y - 0.1,
      });
    }
    if (Math.random() < 0.25) ripple(x, z, 0.8 + speed * 0.08, 1.6, 0.35);
  }

  function bubbles(x, z, n = 1) {
    for (let i = 0; i < n; i++) {
      soft.spawn({
        x: x + rand(-0.2, 0.2), y: WATER_Y + wave(x, z, time) + 0.02, z: z + rand(-0.2, 0.2),
        vy: rand(0.25, 0.6), life: rand(0.5, 0.9), size: rand(0.06, 0.12), size1: 0.14, color: 0xEAF6F4, alpha: 0.85,
      });
    }
  }

  function muzzle(x, y, z, to) {
    const dx = to.x - x;
    const dz = to.z - z;
    const len = Math.hypot(dx, dz) || 1;
    const ox = x + (dx / len) * 0.9;
    const oz = z + (dz / len) * 0.9;
    for (let i = 0; i < 10; i++) {
      glow.spawn({
        x: ox, y, z: oz, vx: (dx / len) * rand(3, 8) + rand(-1, 1), vy: rand(-0.5, 1.2), vz: (dz / len) * rand(3, 8) + rand(-1, 1),
        drag: 4, life: rand(0.06, 0.16), size: rand(0.18, 0.34), size1: 0.02, color: i % 2 ? 0xFFD27A : 0xFF8A3D,
      });
    }
    soft.spawn({ x: ox, y, z: oz, vy: 0.6, life: 0.6, size: 0.3, size1: 0.9, color: 0xB8B8B0, alpha: 0.35 });
  }

  function puff(x, y, z, color = 0xD8D2C4, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      soft.spawn({
        x, y, z, vx: Math.sin(a) * rand(0.5, 1.6), vy: rand(0.4, 1.6), vz: Math.cos(a) * rand(0.5, 1.6),
        drag: 3, life: rand(0.35, 0.7), size: rand(0.15, 0.3), size1: 0.5, color, alpha: 0.7,
      });
    }
  }

  function sparkle(x, y, z, color = 0xF2B134, n = 26, spread = 2.4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = rand(-0.4, 1);
      const s = rand(0.6, 1) * spread;
      glow.spawn({
        x, y, z, vx: Math.sin(a) * s * Math.cos(e), vy: Math.sin(e) * s + 1.2, vz: Math.cos(a) * s * Math.cos(e),
        g: -2.5, drag: 1.5, life: rand(0.6, 1.2), size: rand(0.12, 0.24), size1: 0.02, color,
      });
    }
  }

  let fireAcc = 0;
  function fire(pos, dt, strength) {
    fireAcc += dt * 32 * strength;
    while (fireAcc > 1) {
      fireAcc -= 1;
      glow.spawn({
        x: pos.x + rand(-0.25, 0.25), y: pos.y, z: pos.z + rand(-0.25, 0.25),
        vx: rand(-0.15, 0.15), vy: rand(1, 2), vz: rand(-0.15, 0.15),
        life: rand(0.4, 0.8), size: rand(0.35, 0.6), size1: 0.05, color: Math.random() < 0.6 ? 0xFF8A2E : 0xFFC04A, alpha: 0.9,
      });
      if (Math.random() < 0.18) {
        soft.spawn({
          x: pos.x + rand(-0.2, 0.2), y: pos.y + 0.8, z: pos.z + rand(-0.2, 0.2),
          vx: rand(-0.2, 0.2) + 0.15, vy: rand(0.6, 1), vz: rand(-0.2, 0.2),
          life: rand(1.6, 2.6), size: 0.35, size1: 1.4, color: 0x6E6A66, alpha: 0.22,
        });
      }
      if (Math.random() < 0.06) {
        glow.spawn({ x: pos.x, y: pos.y + 0.3, z: pos.z, vx: rand(-0.6, 0.6), vy: rand(1.5, 3), vz: rand(-0.6, 0.6), g: -0.4, life: rand(0.8, 1.6), size: 0.06, color: 0xFFB050 });
      }
    }
  }

  function firefly(x, y, z) {
    glow.spawn({
      x, y, z, vx: rand(-0.3, 0.3), vy: rand(-0.1, 0.2), vz: rand(-0.3, 0.3),
      life: rand(2.5, 5), size: rand(0.08, 0.14), color: 0xD8F070, alpha: 0.95, inout: true,
    });
  }

  // ---- shell casings: little rigid bodies that tumble, bounce off the ground, and sink in the water
  const MAX_CASINGS = 64;
  const casingGeo = new THREE.BoxGeometry(0.018, 0.018, 0.055);
  const casingMesh = new THREE.InstancedMesh(casingGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.8 }), MAX_CASINGS);
  casingMesh.frustumCulled = false;
  casingMesh.castShadow = true;
  scene.add(casingMesh);
  const casings = Array.from({ length: MAX_CASINGS }, () => ({ life: 0 }));
  let casingCursor = 0;
  let floorAt = () => 0;
  let isWater = () => false;
  const cDummy = new THREE.Object3D();
  const BRASS = new THREE.Color(0xC9A227);
  const SHELL = new THREE.Color(0xC0392B);
  // eject a casing from (x, y, z); dirx/dirz is the way the gun points
  function casing(x, y, z, dirx, dirz, shell = false) {
    const c = casings[casingCursor];
    const i = casingCursor;
    casingCursor = (casingCursor + 1) % MAX_CASINGS;
    const rx = dirz; const rz = -dirx; // to the gun's right
    c.x = x; c.y = y; c.z = z;
    c.vx = rx * rand(1.2, 2.4) + dirx * rand(-0.3, 0.5);
    c.vz = rz * rand(1.2, 2.4) + dirz * rand(-0.3, 0.5);
    c.vy = rand(1.6, 2.8);
    c.rx = Math.random() * 6; c.ry = Math.random() * 6; c.rz = Math.random() * 6;
    c.wx = rand(-18, 18); c.wy = rand(-18, 18); c.wz = rand(-18, 18);
    c.life = 6;
    c.rest = false;
    c.shell = shell;
    casingMesh.setColorAt(i, shell ? SHELL : BRASS);
    if (casingMesh.instanceColor) casingMesh.instanceColor.needsUpdate = true;
  }

  function updateCasings(dt) {
    let dirty = false;
    for (let i = 0; i < MAX_CASINGS; i++) {
      const c = casings[i];
      if (c.life <= 0) {
        if (c.shown) { cDummy.scale.setScalar(0); cDummy.updateMatrix(); casingMesh.setMatrixAt(i, cDummy.matrix); c.shown = false; dirty = true; }
        continue;
      }
      c.life -= dt;
      if (!c.rest) {
        c.vy -= 9.8 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
        const floor = floorAt(c.x, c.z) + 0.012;
        if (c.y < floor) {
          if (isWater(c.x, c.z)) { splash(c.x, c.z, 3, 0.25); c.life = 0; } else if (c.vy < -0.9) {
            // bounce, losing energy
            c.y = floor; c.vy = -c.vy * 0.38; c.vx *= 0.55; c.vz *= 0.55; c.wx *= 0.5; c.wy *= 0.5; c.wz *= 0.5;
          } else {
            c.y = floor; c.rest = true; c.rx = 0; c.rz = 0;
          }
        }
      }
      cDummy.position.set(c.x, c.y, c.z);
      cDummy.rotation.set(c.rx, c.ry, c.rz);
      cDummy.scale.setScalar(c.shell ? 1.7 : 1);
      cDummy.updateMatrix();
      casingMesh.setMatrixAt(i, cDummy.matrix);
      c.shown = true;
      dirty = true;
    }
    if (dirty) casingMesh.instanceMatrix.needsUpdate = true;
  }

  function update(dt) {
    time += dt;
    updateCasings(dt);
    soft.update(dt);
    glow.update(dt);
    soft.mat.uniforms.uScale.value = glow.mat.uniforms.uScale.value = innerHeight / 2 / Math.tan((camera.fov * Math.PI) / 360);

    for (const r of ripples) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const f = r.t / r.dur;
      if (f >= 1) { r.mesh.visible = false; continue; }
      const s = r.size * (0.25 + f * 1.1);
      r.mesh.scale.set(s, 1, s);
      r.mesh.position.set(r.x, WATER_Y + wave(r.x, r.z, time) + 0.035, r.z);
      r.mesh.material.opacity = r.strength * Math.pow(1 - f, 1.4);
    }

    for (const pl of pools) {
      if (!pl.mesh.visible) continue;
      pl.t += dt;
      const grow = Math.min(1, pl.t / 1.8);
      const s = pl.size * (0.3 + 0.7 * (1 - (1 - grow) * (1 - grow)));
      pl.mesh.scale.set(s, 1, s);
      pl.mesh.material.opacity = 0.85 * Math.min(1, (pl.life - pl.t) / 8);
      if (pl.t > pl.life) pl.mesh.visible = false;
    }

    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.t += dt;
      const k = f.t / f.life;
      if (k >= 1) { f.el.remove(); floaters.splice(i, 1); continue; }
      proj.set(f.x, f.y + k * 1.4, f.z).project(camera);
      if (proj.z > 1) { f.el.style.opacity = '0'; continue; }
      const sx = (proj.x * 0.5 + 0.5) * innerWidth;
      const sy = (-proj.y * 0.5 + 0.5) * innerHeight;
      const pop = k < 0.12 ? 0.7 + k * 2.5 : 1;
      f.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(${pop})`;
      f.el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }

    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.12);
      if (t.life > 0) continue;
      scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tracers.splice(i, 1);
    }
  }

  return { casing, setFloor: (fn, water) => { floorAt = fn; if (water) isWater = water; }, ripple, floater, tracer, splash, bubbles, puff, sparkle, fire, firefly, blood, bloodPool, waterBlood, wake, update };
}
