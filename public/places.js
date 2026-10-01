// Everything around the lake that is not the camp: Route 61, the gas station, the trail and towers on land, and
// the oil rig, island, pier, buoys, ships and gulls out on the big water.
import * as THREE from 'three';
import { HIGHWAY, CAMP_ROAD, GAS, TRAIL, WATER_TOWER, RADIO_TOWER } from './layout.js';

const TEAL = 0x1F7A78;
const ORANGE = 0xF2A03D;

export function buildPlaces(ctx) {
  const { scene, w, groundHeight, makeLabel, canvasTex, colliders, solids, emissives, lights, high, wave, WATER_Y } = ctx;
  const animated = []; // { fn(t, dt, night) }
  const rnd = (() => { let a = 4242; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })();

  // ---------- helpers
  const matCache = new Map();
  const std = (color, rough = 0.85, extra = {}) => {
    const key = `${color}|${rough}|${JSON.stringify(extra)}`;
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra }));
    return matCache.get(key);
  };
  const glow = (color, emissive, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.2, roughness: 0.5, ...extra });
    emissives.push(m);
    return m;
  };
  function add(mesh, x, y, z, opts = {}) {
    mesh.position.set(x, y, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    if (opts.rx) mesh.rotation.x = opts.rx;
    if (opts.rz) mesh.rotation.z = opts.rz;
    mesh.castShadow = opts.shadow !== false;
    mesh.receiveShadow = true;
    (opts.parent || scene).add(mesh);
    return mesh;
  }
  const bx = (sx, sy, sz, color, x, y, z, opts = {}) => add(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), opts.mat || std(color, opts.rough)), x, y, z, opts);
  const cyl = (rt, rb, h, color, x, y, z, opts = {}) => add(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, opts.seg || 12), opts.mat || std(color, opts.rough)), x, y, z, opts);
  // a beam between two points (for braces, wires, rails)
  const beamMat = new Map();
  function beam(a, b, r, color, parent = scene) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 5), beamMat.get(color) || beamMat.set(color, std(color, 0.7)).get(color));
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  const solid = (x, z, r, h) => { colliders.push({ x, z, r }); if (h) solids.push({ x, z, r, h }); };
  // a wall of circle colliders along a line
  const wall = (x0, z0, x1, z1, r, h) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (r * 1.3)));
    for (let i = 0; i <= n; i++) solid(x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, r, h);
  };
  // a flat lit sign with text; glows at night
  function signPlane(text, width, height, bg, fg, opts = {}) {
    const px = 128;
    const tex = canvasTex(Math.round(width * px), Math.round(height * px), (g, cw, ch) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, cw, ch);
      if (opts.border) { g.strokeStyle = opts.border; g.lineWidth = ch * 0.07; g.strokeRect(ch * 0.05, ch * 0.05, cw - ch * 0.1, ch * 0.9); }
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const lines = Array.isArray(text) ? text : [text];
      lines.forEach((ln, i) => {
        const size = (typeof ln === 'string' ? ch / (lines.length + 0.6) : ln.size * ch) * 0.82;
        g.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
        g.fillStyle = (ln && ln.color) || fg;
        g.fillText(typeof ln === 'string' ? ln : ln.t, cw / 2, ch * ((i + 0.5 + (opts.pad || 0.15)) / (lines.length + 2 * (opts.pad || 0.15))));
      });
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0xFFFFFF, emissiveMap: tex, emissiveIntensity: 0.2, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
    if (opts.lit !== false) emissives.push(m);
    else m.emissive.set(0x000000);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), m);
    mesh.castShadow = false;
    return mesh;
  }

  // ---------- road surfaces that follow the ground
  const lift = (h) => (h > 0.02 ? 0.07 + h * 0.06 : 0.035);
  function ribbon(pts, width, material, tile = 8) {
    const dense = [];
    let dist = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx2, bz2] = pts[i + 1];
      const len = Math.hypot(bx2 - ax, bz2 - az);
      const n = Math.max(1, Math.ceil(len / 2));
      for (let k = 0; k < n; k++) dense.push({ x: ax + ((bx2 - ax) * k) / n, z: az + ((bz2 - az) * k) / n, d: dist + (len * k) / n });
      dist += len;
    }
    const last = pts[pts.length - 1];
    dense.push({ x: last[0], z: last[1], d: dist });
    const pos = [];
    const uv = [];
    const idx = [];
    dense.forEach((p, i) => {
      const a = dense[Math.max(0, i - 1)];
      const b = dense[Math.min(dense.length - 1, i + 1)];
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const tl = Math.hypot(tx, tz) || 1;
      tx /= tl; tz /= tl;
      for (const s of [-1, 1]) {
        const x = p.x - tz * s * (width / 2);
        const z = p.z + tx * s * (width / 2);
        const h = groundHeight(x, z);
        pos.push(x, h + lift(h), z);
        uv.push(s < 0 ? 0 : 1, p.d / tile);
      }
      if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    });
    // wind the triangles so the surface faces up whichever way the road runs
    const vy = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const [a0, b0, c0] = [vy(idx[0]), vy(idx[1]), vy(idx[2])];
    const ny = (b0[2] - a0[2]) * (c0[0] - a0[0]) - (b0[0] - a0[0]) * (c0[2] - a0[2]);
    if (ny < 0) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    mesh.renderOrder = 0;
    scene.add(mesh);
    return mesh;
  }
  const offset = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

  const asphalt = canvasTex(128, 256, (g, cw, ch) => {
    g.fillStyle = '#3B3F43';
    g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(20, 22, 24, .35)' : 'rgba(120, 124, 128, .22)';
      g.fillRect(rnd() * cw, rnd() * ch, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    g.fillStyle = '#E9E6DA';
    g.fillRect(9, 0, 3, ch); g.fillRect(cw - 12, 0, 3, ch);
    g.fillStyle = '#E8B824';
    g.fillRect(cw / 2 - 5, 0, 3, ch); g.fillRect(cw / 2 + 2, 0, 3, ch);
    g.fillStyle = 'rgba(20, 22, 24, .25)';
    g.fillRect(cw * 0.28, 0, 8, ch); g.fillRect(cw * 0.7, 0, 8, ch);
  });
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, ...offset });
  const shoulder = canvasTex(64, 64, (g, cw, ch) => {
    g.fillStyle = '#A99B7E';
    g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(90, 76, 56, .4)' : 'rgba(210, 196, 166, .4)';
      g.fillRect(rnd() * cw, rnd() * ch, 1.5, 1.5);
    }
  });
  const shoulderMat = new THREE.MeshStandardMaterial({ map: shoulder, roughness: 1, ...offset, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const gravel = canvasTex(64, 128, (g, cw, ch) => {
    g.fillStyle = '#928670';
    g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(70, 60, 44, .45)' : 'rgba(214, 202, 176, .5)';
      g.fillRect(rnd() * cw, rnd() * ch, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
    }
    g.fillStyle = 'rgba(60, 50, 36, .22)';
    g.fillRect(cw * 0.25, 0, 7, ch); g.fillRect(cw * 0.65, 0, 7, ch);
    g.fillStyle = 'rgba(90, 120, 60, .25)';
    g.fillRect(cw * 0.46, 0, 5, ch);
  });
  const gravelMat = new THREE.MeshStandardMaterial({ map: gravel, roughness: 1, ...offset });
  const dirt = canvasTex(64, 64, (g, cw, ch) => {
    const grd = g.createLinearGradient(0, 0, cw, 0);
    grd.addColorStop(0, 'rgba(96, 74, 46, 0)');
    grd.addColorStop(0.22, 'rgba(112, 86, 54, .95)');
    grd.addColorStop(0.5, 'rgba(140, 112, 76, 1)');
    grd.addColorStop(0.78, 'rgba(112, 86, 54, .95)');
    grd.addColorStop(1, 'rgba(96, 74, 46, 0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(70, 52, 32, .4)' : 'rgba(190, 166, 124, .35)';
      g.fillRect(cw * (0.2 + rnd() * 0.6), rnd() * ch, 1.5, 1.5);
    }
  });
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirt, roughness: 1, transparent: true, depthWrite: false, ...offset });

  // Route 61
  const hw = HIGHWAY;
  ribbon([[hw.x, hw.z0], [hw.x, hw.z1]], hw.w + 1.8, shoulderMat, 6);
  ribbon([[hw.x, hw.z0], [hw.x, hw.z1]], hw.w, roadMat, 8);
  // camp road
  const cr = CAMP_ROAD;
  ribbon([[cr.x0 - 1.5, cr.z], [cr.x1 - hw.w / 2 + 0.5, cr.z]], cr.w, gravelMat, 6);
  // the shore trail
  ribbon(TRAIL.map(([x, z]) => [x, z]), 1.8, dirtMat, 3);

  // gas station lot: asphalt with painted bays and a concrete slab under the canopy
  const lot = GAS.lot;
  const lw = lot.x1 - lot.x0;
  const ld = lot.z1 - lot.z0;
  const PX = 16;
  const lotTex = canvasTex(Math.round(lw * PX), Math.round(ld * PX), (g, cw, ch) => {
    g.fillStyle = '#42464A';
    g.fillRect(0, 0, cw, ch);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(20, 22, 24, .35)' : 'rgba(130, 134, 138, .2)';
      g.fillRect(rnd() * cw, rnd() * ch, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    const X = (x) => (x - lot.x0) * PX;
    const Z = (z) => (z - lot.z0) * PX;
    g.fillStyle = '#B8B6AE';
    g.fillRect(X(GAS.canopy.x - 4.6), Z(GAS.canopy.z - 5.6), 9.2 * PX, 11.2 * PX);
    g.strokeStyle = 'rgba(70, 70, 66, .55)';
    g.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(X(GAS.canopy.x - 4.6 + i * 2.3), Z(GAS.canopy.z - 5.6)); g.lineTo(X(GAS.canopy.x - 4.6 + i * 2.3), Z(GAS.canopy.z + 5.6)); g.stroke(); }
    // bays along the south edge of the store lot
    g.strokeStyle = '#E9E6DA';
    g.lineWidth = 3;
    for (let k = 0; k <= 5; k++) { const x = 32.2 + k * 2.7; g.beginPath(); g.moveTo(X(x), Z(lot.z0)); g.lineTo(X(x), Z(lot.z0 + 4.8)); g.stroke(); }
    g.beginPath(); g.moveTo(X(32.2), Z(lot.z0 + 4.8)); g.lineTo(X(45.7), Z(lot.z0 + 4.8)); g.stroke();
    // a curb stripe along the highway side and a stop line
    g.fillStyle = '#E8B824';
    g.fillRect(cw - 5, 0, 5, ch);
    g.fillStyle = '#E9E6DA';
    g.fillRect(X(49.4), Z(GAS.canopy.z - 3), 2, 6 * PX);
  });
  lotTex.wrapS = lotTex.wrapT = THREE.ClampToEdgeWrapping;
  const lotMesh = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), new THREE.MeshStandardMaterial({ map: lotTex, roughness: 0.95, ...offset, polygonOffsetFactor: -3 }));
  lotMesh.rotation.x = -Math.PI / 2;
  lotMesh.position.set((lot.x0 + lot.x1) / 2, 0.045, (lot.z0 + lot.z1) / 2);
  lotMesh.receiveShadow = true;
  scene.add(lotMesh);
  // dropped kerb where the lot meets the shoulder, and grass edging
  bx(0.25, 0.14, ld, 0xB9B6AC, lot.x0 - 0.1, 0.07, (lot.z0 + lot.z1) / 2);
  bx(lw, 0.14, 0.25, 0xB9B6AC, (lot.x0 + lot.x1) / 2 - 0.5, 0.07, lot.z0 - 0.1);
  bx(lw - 4, 0.14, 0.25, 0xB9B6AC, (lot.x0 + lot.x1) / 2 - 2, 0.07, lot.z1 + 0.1);

  // ---------- vehicles
  const M = {
    wheel: std(0x17191B, 0.9),
    glass: std(0x1E2E38, 0.25),
    head: glow(0xFFF6DC, 0xFFF1C0),
    tail: glow(0x7A1410, 0xFF2A1A),
    trim: std(0x2A2D30, 0.6),
  };
  function makeVehicle(kind, color) {
    const g = new THREE.Group();
    const paint = std(color, 0.4, { metalness: 0.25 });
    const part = (sx, sy, sz, mat, x, y, z) => add(new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat), x, y, z, { parent: g });
    let len = 4.4;
    let wid = 1.85;
    if (kind === 'pickup') {
      len = 5.2; wid = 2;
      part(5.2, 0.7, 2, paint, 0, 0.75, 0);
      part(1.9, 0.75, 1.9, paint, 0.65, 1.42, 0);
      part(0.06, 0.5, 1.7, M.glass, 1.62, 1.46, 0);
      part(0.06, 0.5, 1.7, M.glass, -0.3, 1.46, 0);
      part(0.02, 0.5, 2, M.glass, 0.65, 1.46, 0.955);
      part(0.02, 0.5, 2, M.glass, 0.65, 1.46, -0.955);
      part(2.3, 0.08, 1.9, M.trim, -1.5, 1.14, 0);
      part(2.3, 0.34, 0.08, paint, -1.5, 1.26, 0.96);
      part(2.3, 0.34, 0.08, paint, -1.5, 1.26, -0.96);
    } else if (kind === 'truck') {
      len = 7.2; wid = 2.3;
      part(1.9, 1.9, 2.3, paint, 2.6, 1.3, 0);
      part(0.08, 0.7, 2.0, M.glass, 3.56, 1.7, 0);
      part(5.2, 2.5, 2.3, std(0xE9E7DF, 0.6), -0.7, 1.75, 0);
      part(7.2, 0.4, 2.2, M.trim, 0, 0.5, 0);
    } else {
      part(4.4, 0.62, 1.85, paint, 0, 0.62, 0);
      part(2.3, 0.62, 1.65, paint, -0.2, 1.2, 0);
      part(0.06, 0.48, 1.5, M.glass, 0.98, 1.2, 0);
      part(0.06, 0.48, 1.5, M.glass, -1.38, 1.2, 0);
      part(0.02, 0.44, 2.2, M.glass, -0.2, 1.22, 0.83);
      part(0.02, 0.44, 2.2, M.glass, -0.2, 1.22, -0.83);
    }
    const hx = len / 2;
    for (const s of [-1, 1]) {
      part(0.06, 0.18, 0.4, M.head, hx + 0.01, 0.78, s * wid * 0.34);
      part(0.06, 0.16, 0.36, M.tail, -hx - 0.01, 0.78, s * wid * 0.34);
    }
    for (const fx of [len * 0.32, -len * 0.32]) {
      for (const s of [-1, 1]) {
        const wh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12), M.wheel), fx, 0.38, s * (wid / 2 - 0.05), { parent: g, rx: Math.PI / 2 });
        wh.castShadow = true;
      }
    }
    g.userData.len = len;
    return g;
  }
  const CAR_COLORS = [0xB53A2E, 0x2E5FA8, 0xD8D6CE, 0x2A2D31, 0x4B7A4F, 0xC9A23A, 0x7A4B86, 0x9AA3A8];
  function park(kind, color, x, z, ry) {
    const v = makeVehicle(kind, color);
    v.position.set(x, 0.04, z);
    v.rotation.y = ry;
    scene.add(v);
    const len = v.userData.len;
    const ax = Math.cos(ry);
    const az = -Math.sin(ry);
    for (const k of [-0.28, 0.28]) colliders.push({ x: x + ax * len * k, z: z + az * len * k, r: 1.05, h: kind === 'sedan' ? 1.3 : 1.6 });
    return v;
  }

  // ---------- Loon Gas & Go
  const S = GAS.store;
  const teal = std(TEAL, 0.7);
  const cream = std(0xE9E2CE, 0.85);
  const winMat = glow(0x9CC2CC, 0xFFD9A0, { transparent: true, opacity: 0.88, roughness: 0.2 });
  bx(S.w, S.h, S.d, 0, S.x, S.h / 2, S.z, { mat: cream });
  bx(S.w + 0.2, 0.5, S.d + 0.2, TEAL, S.x, S.h + 0.25, S.z, { mat: teal });
  bx(S.w + 0.24, 0.5, S.d + 0.24, 0, S.x, 0.25, S.z, { mat: std(0x8C877A, 0.95) });
  bx(S.w + 0.3, 0.22, S.d + 0.3, 0x2A2D30, S.x, S.h + 0.6, S.z);
  // storefront glass, door and mullions on the east face
  const fx = S.x + S.w / 2 + 0.03;
  bx(0.06, 1.9, 8.4, 0, fx, 1.75, S.z, { mat: winMat, shadow: false });
  bx(0.1, 2.1, 0.12, 0x23272A, fx + 0.02, 1.6, S.z - 0.62);
  bx(0.1, 2.1, 0.12, 0x23272A, fx + 0.02, 1.6, S.z + 0.62);
  bx(0.1, 0.12, 1.36, 0x23272A, fx + 0.02, 2.66, S.z);
  for (const dz of [-4.2, -2.9, 2.9, 4.2]) bx(0.08, 1.9, 0.08, 0x23272A, fx + 0.02, 1.75, S.z + dz);
  bx(0.05, 1.7, 1.0, 0x1A1D20, fx - 0.01, 1.45, S.z, { shadow: false });
  // side and back windows
  for (const sd of [-1, 1]) bx(1.6, 1.1, 0.06, 0, S.x - 0.6, 2, S.z + sd * (S.d / 2 + 0.03), { mat: winMat, shadow: false });
  // awning over the door
  const awn = canvasTex(64, 16, (g, cw, ch) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#F4EDE0' : '#1F7A78'; g.fillRect(i * 8, 0, 8, ch); } });
  bx(1.6, 0.06, 4.2, 0, fx + 0.75, 2.85, S.z, { mat: new THREE.MeshStandardMaterial({ map: awn, roughness: 0.9 }), rz: 0.25 });
  // roof gear
  bx(1.4, 0.6, 1.4, 0x9AA0A4, S.x - 1, S.h + 1.0, S.z + 3);
  bx(1.4, 0.6, 1.4, 0x9AA0A4, S.x - 1, S.h + 1.0, S.z - 3);
  cyl(0.1, 0.1, 1.2, 0x6E7276, S.x - 2, S.h + 1.0, S.z);
  // the sign on the roof
  const roofSign = signPlane(['LOON GAS & GO', { t: 'FOOD · ICE · BAIT · COFFEE', size: 0.3, color: '#F6C87A' }], 6, 1.4, '#14504E', '#F6F0DC', { border: '#F2A03D' });
  roofSign.position.set(S.x + S.w / 2 + 0.15, S.h + 1.55, S.z);
  roofSign.rotation.y = Math.PI / 2;
  scene.add(roofSign);
  bx(0.12, 1.0, 0.12, 0x2A2D30, S.x + S.w / 2 + 0.1, S.h + 1.0, S.z - 2.6);
  bx(0.12, 1.0, 0.12, 0x2A2D30, S.x + S.w / 2 + 0.1, S.h + 1.0, S.z + 2.6);
  const open = signPlane([{ t: 'OPEN', size: 0.7, color: '#FF5A48' }], 1.0, 0.5, '#0C0E10', '#FF5A48', { pad: 0.05 });
  open.position.set(fx + 0.06, 2.35, S.z + 1.9);
  open.rotation.y = Math.PI / 2;
  scene.add(open);
  // dumpster, ice chest, propane cage, vending machine, bench, trash
  bx(2.2, 1.2, 1.4, 0x2F5A3A, S.x - 4.1, 0.6, S.z + 2);
  bx(2.3, 0.1, 1.5, 0x22422A, S.x - 4.1, 1.25, S.z + 2, { rz: 0.03 });
  solid(S.x - 4.1, S.z + 2, 1.3);
  bx(1.5, 1.4, 0.8, 0xEEF2F4, fx + 0.5, 0.7, S.z - 5.2);
  bx(1.46, 0.05, 0.76, 0x2E6FB0, fx + 0.5, 1.4, S.z - 5.2);
  solid(fx + 0.5, S.z - 5.2, 0.85, 1.4);
  bx(0.9, 1.9, 0.9, 0xC73A28, fx + 0.5, 0.95, S.z + 5.4);
  bx(0.7, 1.2, 0.05, 0xF6F0DC, fx + 0.98, 1.2, S.z + 5.4, { mat: glow(0xF6E7BE, 0xFFE3A0) });
  solid(fx + 0.5, S.z + 5.4, 0.55, 1.9);
  for (let k = 0; k < 4; k++) cyl(0.22, 0.22, 0.8, 0xE9E6DA, S.x + 0.5 + k * 0.5, 0.4, S.z - 6.85, { mat: std(k % 2 ? 0xE9E6DA : ORANGE, 0.5) });
  bx(2.4, 1.6, 0.06, 0x8C9296, S.x + 1.2, 0.8, S.z - 6.5, { shadow: false });
  bx(1.8, 0.1, 0.5, 0x8A6A44, fx + 0.5, 0.5, S.z + 3.2);
  bx(1.8, 0.5, 0.08, 0x8A6A44, fx + 0.85, 0.8, S.z + 3.2, { rz: 0 });
  cyl(0.3, 0.26, 0.85, 0x3E4448, fx + 0.6, 0.42, S.z - 3.4);
  wall(S.x, S.z - S.d / 2 + 1.5, S.x, S.z + S.d / 2 - 1.5, 3.3, S.h);
  solid(S.x, S.z - S.d / 2, 3.2); solid(S.x, S.z + S.d / 2, 3.2);

  // canopy over the pumps
  const C = GAS.canopy;
  const ch = 4.7;
  const white = std(0xF1EFE8, 0.6);
  bx(C.w, 0.55, C.d, 0, C.x, ch, C.z, { mat: white });
  bx(C.w + 0.1, 0.36, C.d + 0.1, 0, C.x, ch + 0.05, C.z, { mat: std(ORANGE, 0.6) });
  bx(C.w + 0.12, 0.12, C.d + 0.12, 0, C.x, ch - 0.3, C.z, { mat: teal });
  const lamp = glow(0xFFFFFF, 0xFFF2C8, { roughness: 0.4 });
  for (const dz of [-3.2, 0, 3.2]) bx(C.w - 2, 0.06, 0.5, 0, C.x, ch - 0.3, C.z + dz, { mat: lamp, shadow: false });
  for (const [dx, dz] of [[-3.7, -4.6], [3.7, -4.6], [-3.7, 4.6], [3.7, 4.6]]) {
    cyl(0.25, 0.25, ch, 0, C.x + dx, ch / 2, C.z + dz, { mat: white });
    cyl(0.32, 0.32, 0.9, 0, C.x + dx, 0.45, C.z + dz, { mat: std(TEAL, 0.6) });
    solid(C.x + dx, C.z + dz, 0.4, ch);
  }
  const canopySign = signPlane('LOON GAS', 4, 0.7, '#F2A03D', '#1A2B2B', { pad: 0.05 });
  canopySign.position.set(C.x + C.w / 2 + 0.07, ch, C.z);
  canopySign.rotation.y = Math.PI / 2;
  scene.add(canopySign);
  const canopySign2 = canopySign.clone();
  canopySign2.position.x = C.x - C.w / 2 - 0.07;
  canopySign2.rotation.y = -Math.PI / 2;
  scene.add(canopySign2);
  if (high) {
    const gasLight = new THREE.PointLight(0xFFE6B0, 0, 20, 1.5);
    gasLight.position.set(C.x, ch - 0.8, C.z);
    scene.add(gasLight);
    lights.push({ light: gasLight, max: 10 });
  }

  // islands and pumps
  const pumpBody = std(0xF1EFE8, 0.5);
  for (const iz of [GAS.pumps[0][1], GAS.pumps[2][1]]) {
    bx(5.2, 0.2, 1.1, 0xB8B6AE, C.x, 0.1, iz);
    bx(0.3, 0.7, 0.3, 0xE8B824, C.x - 2.5, 0.35, iz);
    bx(0.3, 0.7, 0.3, 0xE8B824, C.x + 2.5, 0.35, iz);
  }
  for (const [px, pz] of GAS.pumps) {
    bx(0.72, 1.55, 0.55, 0, px, 0.98, pz, { mat: pumpBody });
    bx(0.76, 0.24, 0.6, 0, px, 1.86, pz, { mat: teal });
    bx(0.5, 0.3, 0.04, 0, px, 1.42, pz + (pz < C.z ? 0.29 : -0.29), { mat: glow(0x1E3A2E, 0x7CFFA8), shadow: false });
    bx(0.1, 0.5, 0.1, 0x22262A, px - 0.42, 0.9, pz);
    beam(new THREE.Vector3(px - 0.42, 1.1, pz), new THREE.Vector3(px - 0.55, 0.35, pz + 0.05), 0.03, 0x111214);
    colliders.push({ x: px, z: pz, r: 0.55 });
  }
  // air pump, stop bollards and cones at the lot edge
  const airZ = GAS.lot.z0 + 8.4;
  cyl(0.12, 0.12, 1.3, 0x2E6FB0, 33.4, 0.65, airZ);
  bx(0.7, 0.3, 0.4, 0x2E6FB0, 33.4, 1.4, airZ);
  solid(33.4, airZ, 0.4);
  for (const [px, pz] of [[41.4, C.z - 5.6], [48.6, C.z - 5.6], [41.4, C.z + 5.6], [48.6, C.z + 5.6]]) cyl(0.12, 0.12, 0.9, 0xE8B824, px, 0.45, pz);
  // price sign on a tall pole by the highway
  const P = GAS.sign;
  cyl(0.22, 0.28, 9.4, 0x9AA0A4, P.x, 4.7, P.z);
  const priceSign = signPlane([{ t: 'LOON GAS', size: 0.19, color: '#F6F0DC' }, { t: 'REG  3.49', size: 0.19, color: '#7CFFA8' }, { t: 'MID  3.79', size: 0.19, color: '#7CFFA8' }, { t: 'DSL  3.99', size: 0.19, color: '#FFD27A' }, { t: 'BAIT · ICE', size: 0.14, color: '#F6F0DC' }], 3.0, 4.2, '#14504E', '#F6F0DC', { border: '#F2A03D' });
  priceSign.position.set(P.x, 7.4, P.z);
  priceSign.rotation.y = Math.PI / 2;
  scene.add(priceSign);
  bx(0.12, 4.2, 3.06, 0x2A2D30, P.x - 0.07, 7.4, P.z, { shadow: false });
  solid(P.x, P.z, 0.4, 9.4);
  // parked at the store and a car at the pump
  park('pickup', 0x2E5FA8, 36.6, GAS.lot.z0 + 3.4, Math.PI / 2 + 0.05);
  park('sedan', 0xB53A2E, 39.3, GAS.lot.z0 + 3.2, Math.PI / 2 - 0.04);
  park('sedan', 0xD8D6CE, 45, C.z, 0);

  // ---------- Route 61 furniture: poles and wires, lamps, signs
  const poleTop = [];
  const wirePos = [];
  const poleX = hw.x + hw.w / 2 + 5.4;
  for (let z = -66; z <= 66; z += 22) {
    cyl(0.14, 0.2, 9, 0x5A4330, poleX, 4.5, z);
    bx(0.14, 0.14, 2.6, 0x5A4330, poleX, 8.6, z, { ry: 0 });
    bx(0.14, 0.14, 2.6, 0x5A4330, poleX, 7.9, z, { ry: 0 });
    for (const dz of [-1.1, 0, 1.1]) for (const y of [8.75]) poleTop.push(new THREE.Vector3(poleX, y, z + dz));
    if (Math.abs(z) < 1) { cyl(0.32, 0.32, 0.9, 0x6F7378, poleX - 0.5, 6.6, z); }
  }
  for (let i = 0; i < 3; i++) {
    const pts = poleTop.filter((_, k) => k % 3 === i);
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const n = 8;
      let prev = a;
      for (let s = 1; s <= n; s++) {
        const f = s / n;
        const p = new THREE.Vector3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * 0.9, a.z + (b.z - a.z) * f);
        wirePos.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
        prev = p;
      }
    }
  }
  const wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePos, 3));
  scene.add(new THREE.LineSegments(wireGeo, new THREE.LineBasicMaterial({ color: 0x141618 })));
  // street lamps on the west shoulder
  const lampX = hw.x - hw.w / 2 - 1.6;
  for (const lz of [-58, -30, 0, 47, 62]) {
    if (lz > GAS.lot.z0 - 4 && lz < GAS.lot.z1 + 4) continue;
    cyl(0.09, 0.12, 6.2, 0x3A3F44, lampX, 3.1, lz);
    beam(new THREE.Vector3(lampX, 6.1, lz), new THREE.Vector3(lampX + 1.5, 6.5, lz), 0.07, 0x3A3F44);
    bx(0.7, 0.14, 0.32, 0, lampX + 1.5, 6.45, lz, { mat: glow(0xEEEEEE, 0xFFE0A0) });
    solid(lampX, lz, 0.2);
  }
  // signs
  function postSign(x, z, sign, ry, height = 2.2) {
    cyl(0.05, 0.05, height, 0x7A7F84, x, height / 2, z);
    sign.position.set(x, height + sign.geometry.parameters.height / 2 - 0.1, z + (Math.abs(ry) < 0.1 ? 0.06 : 0));
    sign.rotation.y = ry;
    scene.add(sign);
    solid(x, z, 0.15);
  }
  const speed = (n) => signPlane([{ t: 'SPEED', size: 0.16, color: '#111' }, { t: 'LIMIT', size: 0.16, color: '#111' }, { t: String(n), size: 0.42, color: '#111' }], 0.7, 0.95, '#F6F6F2', '#111', { border: '#111', lit: false, double: true, pad: 0.05 });
  postSign(hw.x - 5.6, -34, speed(55), 0);
  postSign(hw.x + 5.6, 30, speed(55), Math.PI);
  const campSign = signPlane([{ t: 'LOON LAKE', size: 0.3, color: '#F6F0DC' }, { t: 'BAIT · CAMP · DERBY', size: 0.17, color: '#F6F0DC' }, { t: '←  0.5 mi', size: 0.24, color: '#F6F0DC' }], 3.0, 1.5, '#1B6B3A', '#F6F0DC', { border: '#F6F0DC', lit: false, double: true });
  cyl(0.07, 0.07, 3.1, 0x7A7F84, hw.x - 6.6, 1.55, 50);
  cyl(0.07, 0.07, 3.1, 0x7A7F84, hw.x - 4.2, 1.55, 50);
  campSign.position.set(hw.x - 5.4, 3.0, 50.05);
  scene.add(campSign);
  solid(hw.x - 6.6, 50, 0.2); solid(hw.x - 4.2, 50, 0.2);
  const gasSign = signPlane([{ t: 'GAS  FOOD', size: 0.3, color: '#111' }, { t: 'NEXT RIGHT', size: 0.2, color: '#111' }], 1.9, 0.9, '#2E6FB0', '#F6F0DC', { border: '#F6F0DC', lit: false, double: true });
  postSign(hw.x - 5.6, 6, gasSign, 0, 2.6);
  // stop sign where the camp road meets the highway
  const stopMat = new THREE.MeshStandardMaterial({
    map: canvasTex(128, 128, (g, cw, ch) => {
      g.fillStyle = '#C4262A';
      g.beginPath();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; g[i ? 'lineTo' : 'moveTo'](cw / 2 + Math.cos(a) * 62, ch / 2 + Math.sin(a) * 62); }
      g.fill();
      g.strokeStyle = '#F6F6F2'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#F6F6F2'; g.font = '700 34px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('STOP', cw / 2, ch / 2 + 2);
    }),
    transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6,
  });
  const stop = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), stopMat);
  cyl(0.05, 0.05, 2.3, 0x7A7F84, hw.x - 4.6, 1.15, cr.z + 2.6);
  stop.position.set(hw.x - 4.6, 2.3, cr.z + 2.6);
  stop.rotation.y = -Math.PI / 2;
  scene.add(stop);
  solid(hw.x - 4.6, cr.z + 2.6, 0.15);
  // camp-road mailbox and a pickup left near camp
  bx(0.06, 1.1, 0.06, 0x5A4330, 22, 0.55, cr.z - 2.6);
  bx(0.32, 0.26, 0.55, 0x2E5FA8, 22, 1.15, cr.z - 2.6);
  solid(22, cr.z - 2.6, 0.25);
  park('pickup', 0x9A3B2A, 33, cr.z + 3.2, 0.12);

  // ---------- the shore trail, water tower and radio tower
  const tt = TRAIL[0];
  bx(0.14, 1.5, 0.14, 0x5A4330, tt[0] - 1.6, 0.75, tt[1] - 1.6);
  const trailSign = signPlane('SHORE TRAIL', 1.5, 0.42, '#5C3A1E', '#F6E7BE', { lit: false });
  trailSign.position.set(tt[0] - 1.6, 1.45, tt[1] - 1.52);
  scene.add(trailSign);
  solid(tt[0] - 1.6, tt[1] - 1.6, 0.2);
  // picnic table by the trailhead
  bx(1.9, 0.08, 0.8, 0x7A5A3A, tt[0] - 4, 0.78, tt[1] + 0.4);
  bx(1.9, 0.08, 0.3, 0x7A5A3A, tt[0] - 4, 0.45, tt[1] + 1.05);
  bx(1.9, 0.08, 0.3, 0x7A5A3A, tt[0] - 4, 0.45, tt[1] - 0.25);
  colliders.push({ x: tt[0] - 4, z: tt[1] + 0.4, r: 1.0, h: 0.8 });

  const wt = WATER_TOWER;
  const wtGround = groundHeight(wt.x, wt.z);
  const wtMetal = std(0xB9C0C4, 0.55);
  const legAt = (a) => [wt.x + Math.cos(a) * 3.4, wt.z + Math.sin(a) * 3.4];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const [lx, lz] = legAt(a);
    beam(new THREE.Vector3(lx, wtGround, lz), new THREE.Vector3(wt.x + Math.cos(a) * 2.4, wtGround + 11.5, wt.z + Math.sin(a) * 2.4), 0.17, 0x8A9096);
    const [nx, nz] = legAt(a + Math.PI / 2);
    beam(new THREE.Vector3(lx, wtGround + 3.6, lz), new THREE.Vector3(nx, wtGround + 6.6, nz), 0.05, 0x7A8086);
    beam(new THREE.Vector3(nx, wtGround + 3.6, nz), new THREE.Vector3(lx, wtGround + 6.6, lz), 0.05, 0x7A8086);
    solid(lx, lz, 0.45);
  }
  cyl(3.1, 3.1, 4.4, 0, wt.x, wtGround + 13.7, wt.z, { mat: wtMetal, seg: 24 });
  add(new THREE.Mesh(new THREE.ConeGeometry(3.3, 1.6, 24), std(0x8A9096, 0.6)), wt.x, wtGround + 16.7, wt.z);
  cyl(0.12, 0.12, 1.4, 0x8A9096, wt.x, wtGround + 18.2, wt.z);
  const wtLabel = signPlane('LOON LAKE', 4.8, 1.1, '#9FC0CF', '#14504E', { lit: false, pad: 0.1 });
  wtLabel.position.set(wt.x + 3.12, wtGround + 13.6, wt.z);
  wtLabel.rotation.y = Math.PI / 2;
  wtLabel.scale.set(1.0, 1.0, 1);
  scene.add(wtLabel);
  solids.push({ x: wt.x, z: wt.z, r: 3.6, h: 19 });
  bx(1.4, 2, 1.4, 0x6E7A6A, wt.x - 5.6, 1, wt.z + 0.5);
  solid(wt.x - 5.6, wt.z + 0.5, 1.0, 2);

  const rt = RADIO_TOWER;
  const rtGround = groundHeight(rt.x, rt.z);
  const RH = 34;
  const rLeg = (i, y) => { const a = Math.PI / 4 + (i * Math.PI) / 2; const rr = 1.9 * (1 - (y / RH) * 0.85); return new THREE.Vector3(rt.x + Math.cos(a) * rr, rtGround + y, rt.z + Math.sin(a) * rr); };
  for (let i = 0; i < 4; i++) beam(rLeg(i, 0), rLeg(i, RH), 0.09, 0xC9C6BE);
  for (let y = 0; y < RH - 4; y += 4) {
    for (let i = 0; i < 4; i++) {
      beam(rLeg(i, y), rLeg((i + 1) % 4, y + 4), 0.035, 0xB9B6AE);
      beam(rLeg((i + 1) % 4, y), rLeg(i, y + 4), 0.035, 0xB9B6AE);
    }
  }
  cyl(0.06, 0.06, 5, 0xC9C6BE, rt.x, rtGround + RH + 2.5, rt.z);
  const beacon = glow(0x5A1410, 0xFF2A1A, { roughness: 0.4 });
  const beaconMesh = add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), beacon), rt.x, rtGround + RH + 5.2, rt.z, { shadow: false });
  const beaconMid = add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), beacon), rt.x + 0.3, rtGround + 20, rt.z, { shadow: false });
  for (let i = 0; i < 4; i++) solid(rLeg(i, 0).x, rLeg(i, 0).z, 0.4);
  // fenced compound and equipment shed
  bx(3, 2.3, 2.4, 0x6E7A6A, rt.x + 5, 1.15, rt.z - 1);
  bx(3.2, 0.2, 2.6, 0x3A3F44, rt.x + 5, 2.4, rt.z - 1);
  solid(rt.x + 5, rt.z - 1, 1.7, 2.4);
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    const fxp = rt.x + Math.cos(t) * 6.4;
    const fzp = rt.z + Math.sin(t) * 6.4;
    bx(0.08, 1.9, 0.08, 0x8A9096, fxp, 0.95, fzp);
    colliders.push({ x: fxp, z: fzp, r: 0.25 });
  }
  for (let a = 0; a < 16; a++) {
    const t0 = (a / 16) * Math.PI * 2;
    const t1 = ((a + 1) / 16) * Math.PI * 2;
    beam(new THREE.Vector3(rt.x + Math.cos(t0) * 6.4, 1.6, rt.z + Math.sin(t0) * 6.4), new THREE.Vector3(rt.x + Math.cos(t1) * 6.4, 1.6, rt.z + Math.sin(t1) * 6.4), 0.025, 0x8A9096);
    beam(new THREE.Vector3(rt.x + Math.cos(t0) * 6.4, 0.5, rt.z + Math.sin(t0) * 6.4), new THREE.Vector3(rt.x + Math.cos(t1) * 6.4, 0.5, rt.z + Math.sin(t1) * 6.4), 0.025, 0x8A9096);
  }
  animated.push((t) => {
    const on = Math.sin(t * 2.2) > 0.35;
    beacon.emissiveIntensity = on ? 3 : 0.05;
    beaconMesh.scale.setScalar(on ? 1.2 : 1);
    beaconMid.scale.setScalar(on ? 1.2 : 1);
  });

  // ---------- traffic on Route 61
  const traffic = [];
  const kinds = ['sedan', 'sedan', 'pickup', 'truck', 'sedan', 'pickup'];
  const carN = high ? 6 : 3;
  for (let i = 0; i < carN; i++) {
    const car = { g: null, dir: i % 2 ? 1 : -1, speed: 0, wait: rnd() * 14 + i * 3, kind: '' };
    traffic.push(car);
  }
  function launch(car) {
    if (car.g) scene.remove(car.g);
    car.kind = kinds[Math.floor(rnd() * kinds.length)];
    car.g = makeVehicle(car.kind, CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]);
    car.speed = 11 + rnd() * 8;
    car.dir = rnd() < 0.5 ? 1 : -1;
    car.z = car.dir > 0 ? hw.z0 - 6 : hw.z1 + 6;
    const lane = car.dir > 0 ? hw.x - 2 : hw.x + 2; // northbound keeps west, southbound east (right-hand traffic)
    car.g.position.set(lane, 0.05, car.z);
    car.g.rotation.y = car.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    scene.add(car.g);
  }
  animated.push((t, dt) => {
    for (const car of traffic) {
      if (!car.g) {
        car.wait -= dt;
        if (car.wait <= 0) launch(car);
        continue;
      }
      car.z += car.dir * car.speed * dt;
      car.g.position.z = car.z;
      car.g.position.y = 0.05 + Math.sin(t * 9 + car.speed) * 0.006;
      if (car.z > hw.z1 + 8 || car.z < hw.z0 - 8) { scene.remove(car.g); car.g = null; car.wait = 4 + rnd() * 18; }
    }
  });

  // =================================================================== the big water
  const sea = w.sea || [];
  const seaAt = (id) => sea.find((s) => s.id === id);
  const bob = (obj, x, z, t, amount = 1, yOff = 0) => {
    obj.position.y = WATER_Y + wave(x, z, t) * amount + yOff;
    obj.rotation.x = Math.sin(t * 0.9 + x * 0.1) * 0.03 * amount;
    obj.rotation.z = Math.cos(t * 0.7 + z * 0.1) * 0.04 * amount;
  };

  // --- the fishing pier
  const docks = w.docks || [];
  const pierY = w.pierY || 0.95;
  const plank = canvasTex(64, 128, (g, cw, ch) => {
    g.fillStyle = '#8B6844';
    g.fillRect(0, 0, cw, ch);
    for (let y = 0; y < ch; y += 16) { g.fillStyle = (y / 16) % 2 ? '#7A5A38' : '#9A7650'; g.fillRect(0, y, cw, 14); }
  });
  const deckMat = new THREE.MeshStandardMaterial({ map: plank, roughness: 0.85 });
  const postMat = std(0x4E3A26, 0.95);
  docks.slice(1).forEach((d) => {
    const dw = d.maxX - d.minX;
    const dl = d.maxZ - d.minZ;
    const cx = (d.minX + d.maxX) / 2;
    const cz = (d.minZ + d.maxZ) / 2;
    const deckTex = plank.clone();
    deckTex.needsUpdate = true;
    deckTex.repeat.set(dw > dl ? dl / 3 : dw / 3, (dw > dl ? dw : dl) / 4);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(dw, 0.24, dl), new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.85 }));
    add(deck, cx, pierY - 0.12, cz);
    const long = dl >= dw;
    const span = long ? dl : dw;
    for (let s = 0.4; s < span; s += 3.2) {
      for (const side of [-1, 1]) {
        const px = long ? cx + side * (dw / 2 - 0.2) : d.minX + s;
        const pz = long ? d.minZ + s : cz + side * (dl / 2 - 0.2);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, pierY + 4.2, 8), postMat);
        add(post, px, (pierY - 4.2) / 2 - 0.2, pz);
      }
    }
    // low rail posts with a rope
    for (const side of [-1, 1]) {
      const pts = [];
      for (let s = 0.6; s < span; s += 2.4) pts.push(long ? [cx + side * (dw / 2 - 0.08), d.minZ + s] : [d.minX + s, cz + side * (dl / 2 - 0.08)]);
      pts.forEach(([px, pz]) => bx(0.1, 0.85, 0.1, 0x4E3A26, px, pierY + 0.42, pz));
      for (let i = 0; i < pts.length - 1; i++) beam(new THREE.Vector3(pts[i][0], pierY + 0.75, pts[i][1]), new THREE.Vector3(pts[i + 1][0], pierY + 0.75, pts[i + 1][1]), 0.025, 0xC9B48A);
    }
  });
  const stem = docks[1];
  const head = docks[2];
  if (stem && head) {
    const sx = (stem.minX + stem.maxX) / 2;
    // lamp posts down the stem
    for (let z = stem.minZ + 6; z < stem.maxZ - 2; z += 12) {
      cyl(0.06, 0.08, 2.4, 0x2A2D30, stem.maxX - 0.25, pierY + 1.2, z);
      bx(0.3, 0.3, 0.3, 0, stem.maxX - 0.25, pierY + 2.55, z, { mat: glow(0x3A2E20, 0xFFB45C) });
    }
    // bait shack at the T head, benches and crates
    const hx = head.minX + 3.5;
    const hz = (head.minZ + head.maxZ) / 2;
    bx(3.2, 2.4, 2.6, 0x6B4A32, hx, pierY + 1.2, hz);
    bx(3.7, 0.16, 3.1, 0x3A2418, hx, pierY + 2.5, hz, { rx: 0.05 });
    bx(0.8, 1.7, 0.06, 0x2A1A10, hx + 1.65, pierY + 0.95, hz);
    const shackSign = signPlane("Pier Bait", 1.9, 0.5, '#5C3A1E', '#F6E7BE', { lit: false });
    shackSign.position.set(hx + 1.62, pierY + 2.1, hz - 0.9);
    shackSign.rotation.y = Math.PI / 2;
    scene.add(shackSign);
    solid(hx, hz, 1.9, pierY + 2.5);
    colliders.push({ x: head.maxX - 2, z: hz, r: 0.6, h: pierY + 0.5 }, { x: head.maxX - 3, z: hz + 0.2, r: 0.5, h: pierY + 0.9 });
    bx(0.8, 0.5, 0.8, 0x9A6B3A, head.maxX - 2, pierY + 0.25, hz);
    bx(0.7, 0.9, 0.7, 0x9A6B3A, head.maxX - 3, pierY + 0.45, hz + 0.2);
    bx(1.8, 0.1, 0.5, 0x7A5A3A, hx - 3, pierY + 0.5, hz + 0.9);
    // a life ring on the stem
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.1, 8, 16), std(0xE05A2A, 0.6));
    add(ring, stem.minX + 0.12, pierY + 0.95, stem.minZ + 12, { ry: Math.PI / 2 });
  }

  // --- the island
  const isl = seaAt('island');
  if (isl) {
    const geo = new THREE.IcosahedronGeometry(1, 4);
    const pos = geo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const c1 = new THREE.Color(0xD6C6A0);
    const c2 = new THREE.Color(0x5E7A46);
    const c3 = new THREE.Color(0x77736C);
    const tmp = new THREE.Color();
    const IR = isl.r * 0.84;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i);
      const n = Math.sin(v.x * 4.1 + 1.3) * Math.cos(v.z * 3.7) + 0.5 * Math.sin(v.x * 9 + v.z * 7);
      const ang = Math.atan2(v.z, v.x);
      const rr = 1 + 0.1 * Math.sin(ang * 3 + 1) + 0.06 * Math.sin(ang * 7);
      let y = v.y;
      if (y < 0) y = y * 0.35 - 0.2;
      const h = Math.max(0, y);
      const nh = h * (1.6 + n * 0.5) * 2.7;
      pos.setXYZ(i, v.x * IR * rr, Math.max(-3, nh - 0.3 + (y < 0 ? y * 5 : 0)), v.z * IR * rr);
      const t = Math.min(1, Math.max(0, (nh - 0.2) / 2.2));
      tmp.copy(c1).lerp(c2, Math.min(1, t * 1.6));
      if (nh > 4.2) tmp.lerp(c3, Math.min(1, (nh - 4.2) / 1.5));
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const island = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    island.position.set(isl.x, WATER_Y, isl.z);
    island.castShadow = island.receiveShadow = true;
    scene.add(island);
    const surface = (dx, dz) => {
      // find the island top at an offset by sampling the mesh with a raycast
      const ray = new THREE.Raycaster(new THREE.Vector3(isl.x + dx, 30, isl.z + dz), new THREE.Vector3(0, -1, 0), 0, 60);
      const hit = ray.intersectObject(island)[0];
      return hit ? hit.point.y : null;
    };
    island.updateMatrixWorld(true);
    // pines and rocks on the high ground
    const pineMat = std(0x27472F, 0.9, { flatShading: true });
    const barkMat = std(0x5A4130, 0.95);
    let planted = 0;
    for (let tries = 0; tries < 120 && planted < (high ? 22 : 12); tries++) {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * IR * 0.6;
      const dx = Math.cos(a) * r;
      const dz = Math.sin(a) * r;
      const y = surface(dx, dz);
      if (y === null || y < WATER_Y + 1.1) continue;
      const s = 0.8 + rnd() * 0.9;
      cyl(0.16 * s, 0.24 * s, 1.4 * s, 0, isl.x + dx, y + 0.6 * s, isl.z + dz, { mat: barkMat, seg: 6 });
      for (let k = 0; k < 3; k++) add(new THREE.Mesh(new THREE.ConeGeometry((1.5 - k * 0.32) * s, 2.3 * s, 7), pineMat), isl.x + dx, y + (1.9 + k * 1.15) * s, isl.z + dz);
      colliders.push({ x: isl.x + dx, z: isl.z + dz, r: 0.35 * s });
      planted++;
    }
    const rockMat = std(0x7C7A74, 1, { flatShading: true });
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const r = IR * (0.7 + rnd() * 0.3);
      const s = 0.5 + rnd() * 1.4;
      add(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat), isl.x + Math.cos(a) * r, WATER_Y + 0.15 + s * 0.2, isl.z + Math.sin(a) * r, { rz: rnd(), rx: rnd() });
    }
    // a wrecked hull on the sand and a driftwood pile
    const wreck = new THREE.Group();
    wreck.position.set(isl.x + IR * 0.72, WATER_Y + 0.2, isl.z - IR * 0.3);
    wreck.rotation.set(0.1, 0.9, 0.28);
    scene.add(wreck);
    const hullMat = std(0x5A3A24, 0.95);
    add(new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 2.2), hullMat), 0, 0.2, 0, { parent: wreck });
    for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 0.2), hullMat), 0, 0.85, s * 1.05, { parent: wreck, rx: s * 0.2 });
    add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), barkMat), -0.5, 1.9, 0, { parent: wreck, rz: 0.15 });
    for (let k = 0; k < 4; k++) add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.2), hullMat), -2 + k * 1.2, 1.1, 1.05 * (k % 2 ? 1 : -1), { parent: wreck });
    colliders.push({ x: wreck.position.x, z: wreck.position.z, r: 2.6, h: 1.2 });
    // a driftwood campfire ring and a flag
    const flagY = surface(-1.5, 1) || 3;
    cyl(0.04, 0.04, 4.2, 0xC9C2B0, isl.x - 1.5, flagY + 2, isl.z + 1);
    bx(1.3, 0.8, 0.03, 0xC43B2B, isl.x - 0.85, flagY + 3.8, isl.z + 1);
  }

  // --- sea stacks
  for (const s of sea.filter((o) => o.id.startsWith('stack'))) {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = 0.75 + 0.25 * Math.sin(v.x * 5 + v.y * 4) * Math.cos(v.z * 6);
      p.setXYZ(i, v.x * s.r * 0.62 * n, v.y * s.r * (v.y > 0 ? 2.4 : 1.4) * n - 0.6, v.z * s.r * 0.62 * n);
    }
    geo.computeVertexNormals();
    const st = new THREE.Mesh(geo, std(0x6E6C66, 1, { flatShading: true }));
    add(st, s.x, WATER_Y + s.r * 0.6, s.z);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(s.r * 0.36, 8, 6), std(0xDDDAD0, 1, { flatShading: true }));
    add(cap, s.x + 0.4, WATER_Y + s.r * 2.75, s.z, { shadow: false });
  }

  // --- the oil rig
  const rig = seaAt('rig');
  let flame = null;
  let rigBeacon = null;
  if (rig) {
    const g = new THREE.Group();
    g.position.set(rig.x, 0, rig.z);
    scene.add(g);
    const steel = std(0xB5B9BC, 0.55);
    const dark = std(0x3B4044, 0.6);
    const yellow = std(0xE8B824, 0.6);
    const DECK = 11.5;
    const pt = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const [lx, lz] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) {
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, DECK + 3.4, 12), steel), lx, (DECK - 3) / 2, lz, { parent: g });
      add(new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 2.2, 12), std(0xC43B2B, 0.7)), lx, WATER_Y + 0.6, lz, { parent: g });
    }
    for (const y0 of [1.5, 6]) {
      const y1 = y0 + 4.5;
      beam(pt(-5.5, y0, -5.5), pt(5.5, y1, -5.5), 0.14, 0x9AA0A4, g);
      beam(pt(5.5, y0, -5.5), pt(-5.5, y1, -5.5), 0.14, 0x9AA0A4, g);
      beam(pt(-5.5, y0, 5.5), pt(5.5, y1, 5.5), 0.14, 0x9AA0A4, g);
      beam(pt(5.5, y0, 5.5), pt(-5.5, y1, 5.5), 0.14, 0x9AA0A4, g);
      beam(pt(-5.5, y0, -5.5), pt(-5.5, y1, 5.5), 0.14, 0x9AA0A4, g);
      beam(pt(-5.5, y0, 5.5), pt(-5.5, y1, -5.5), 0.14, 0x9AA0A4, g);
      beam(pt(5.5, y0, -5.5), pt(5.5, y1, 5.5), 0.14, 0x9AA0A4, g);
      beam(pt(5.5, y0, 5.5), pt(5.5, y1, -5.5), 0.14, 0x9AA0A4, g);
    }
    add(new THREE.Mesh(new THREE.BoxGeometry(15, 1.2, 15), dark), 0, DECK, 0, { parent: g });
    add(new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.3, 15.4), yellow), 0, DECK + 0.75, 0, { parent: g });
    // rails
    for (const s of [-1, 1]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.08, 0.08), yellow), 0, DECK + 1.9, s * 7.6, { parent: g, shadow: false });
      add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 15.4), yellow), s * 7.6, DECK + 1.9, 0, { parent: g, shadow: false });
    }
    // living quarters
    add(new THREE.Mesh(new THREE.BoxGeometry(6.4, 4.4, 5), std(0xEDEAE0, 0.7)), -3.4, DECK + 3.2, 3.6, { parent: g });
    const qw = glow(0x8FB0BA, 0xFFD9A0, { roughness: 0.3 });
    for (let k = 0; k < 4; k++) add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.06), qw), -5.7 + k * 1.5, DECK + 3.5, 6.12, { parent: g, shadow: false });
    add(new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.3, 5.2), std(0xC43B2B, 0.7)), -3.4, DECK + 5.5, 3.6, { parent: g });
    // helideck
    add(new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.3, 24), std(0x3A6B4A, 0.7)), 7, DECK + 3.4, -6, { parent: g });
    const heli = new THREE.Mesh(new THREE.CircleGeometry(3.3, 24), new THREE.MeshStandardMaterial({
      map: canvasTex(128, 128, (c, cw, ch) => { c.fillStyle = '#3A6B4A'; c.fillRect(0, 0, cw, ch); c.strokeStyle = '#F6F0DC'; c.lineWidth = 6; c.beginPath(); c.arc(cw / 2, ch / 2, 58, 0, 7); c.stroke(); c.fillStyle = '#F6F0DC'; c.font = '700 70px Fredoka, system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', cw / 2, ch / 2 + 4); }),
      roughness: 0.8,
    }));
    heli.rotation.x = -Math.PI / 2;
    heli.position.set(7, DECK + 3.56, -6);
    g.add(heli);
    for (const [hx, hz] of [[4.4, -4.4], [9.6, -4.4], [4.4, -7.6], [9.6, -7.6]]) beam(pt(hx > 7 ? 7.6 : 6.4, DECK + 0.6, hz > -6 ? -5 : -7), pt(hx, DECK + 3.3, hz), 0.08, 0x9AA0A4, g);
    // derrick: a tapering lattice
    const dv = (i, y) => { const a = Math.PI / 4 + (i * Math.PI) / 2; const r = 2.2 * (1 - y / 26); return pt(2.5 + Math.cos(a) * r, DECK + 0.9 + y, 1 + Math.sin(a) * r); };
    for (let i = 0; i < 4; i++) beam(dv(i, 0), dv(i, 26), 0.11, 0xC9C6BE, g);
    for (let y = 0; y < 24; y += 3) for (let i = 0; i < 4; i++) { beam(dv(i, y), dv((i + 1) % 4, y + 3), 0.04, 0xB9B6AE, g); beam(dv((i + 1) % 4, y), dv(i, y + 3), 0.04, 0xB9B6AE, g); }
    rigBeacon = glow(0x5A1410, 0xFF2A1A);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), rigBeacon), 2.5, DECK + 27.4, 1, { parent: g, shadow: false });
    // crane
    add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 4, 0.8), yellow), -6.6, DECK + 2.8, -3, { parent: g });
    beam(pt(-6.6, DECK + 4.6, -3), pt(-6.6, DECK + 8, -10), 0.14, 0xE8B824, g);
    beam(pt(-6.6, DECK + 8, -10), pt(-6.6, DECK + 3, -10), 0.02, 0x222222, g);
    // flare boom with a flame
    beam(pt(-6, DECK + 1, -6.6), pt(-12.5, DECK + 9, -12), 0.16, 0x9AA0A4, g);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xFF8A2E, transparent: true, opacity: 0.9, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
    flame = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 8), flameMat);
    flame.position.set(-12.5, DECK + 10.4, -12);
    g.add(flame);
    if (high) {
      const flareLight = new THREE.PointLight(0xFF8A3D, 0, 70, 1.4);
      flareLight.position.set(rig.x - 12.5, DECK + 9.5, rig.z - 12);
      scene.add(flareLight);
      lights.push({ light: flareLight, max: 26 });
    }
    // deck lamps
    const deckLamp = glow(0xFFFFFF, 0xFFF2C8);
    for (const [lx, lz] of [[-7.4, -7.4], [7.4, -7.4], [-7.4, 7.4], [7.4, 7.4], [0, 7.4], [0, -7.4]]) add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), deckLamp), lx, DECK + 2.1, lz, { parent: g, shadow: false });
    add(new THREE.Mesh(new THREE.BoxGeometry(9, 0.9, 2.8), std(0xEDEAE0, 0.7)), 0.5, DECK - 1.1, 6.6, { parent: g });
    const rigSign = signPlane('LOON OFFSHORE 7', 6, 1.0, '#14504E', '#F6F0DC', { lit: true, pad: 0.1 });
    rigSign.position.set(0, DECK + 1.5, 7.75);
    g.add(rigSign);
    animated.push((t, dt, night) => {
      const f = 0.85 + Math.sin(t * 13) * 0.1 + Math.sin(t * 5.3) * 0.1;
      flame.scale.set(f, 0.85 + f * 0.3, f);
      flameMat.opacity = 0.75 + Math.sin(t * 9) * 0.1;
      rigBeacon.emissiveIntensity = Math.sin(t * 1.6) > 0.2 ? 3 : 0.05;
    });
  }

  // --- a sailboat at anchor
  const sail = seaAt('sail');
  if (sail) {
    const g = new THREE.Group();
    scene.add(g);
    const hull = std(0xF1EFE8, 0.5);
    add(new THREE.Mesh(new THREE.BoxGeometry(7.4, 1.0, 2.6), hull), 0, 0.5, 0, { parent: g });
    add(new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.16, 2.7), std(0x1F4E8A, 0.6)), 0, 0.98, 0, { parent: g });
    add(new THREE.Mesh(new THREE.ConeGeometry(1.35, 2.2, 4), hull), 4.45, 0.5, 0, { parent: g, rz: -Math.PI / 2 });
    add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.7), std(0xDAD3C2, 0.7)), -1, 1.4, 0, { parent: g });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 11, 6), std(0xC9C6BE, 0.5)), 0.6, 6.4, 0, { parent: g });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), std(0xC9C6BE, 0.5)), -1.4, 2.6, 0, { parent: g, rz: Math.PI / 2 });
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0.7, 1.4, 0, 0.7, 11.3, 0, -3.2, 1.6, 0.2, 0.7, 1.4, 0, -3.2, 1.6, 0.2, 0.7, 11.3, 0], 3));
    sailGeo.computeVertexNormals();
    const cloth = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color: 0xF6F2E6, roughness: 0.85, side: THREE.DoubleSide }));
    cloth.castShadow = true;
    g.add(cloth);
    const jib = new THREE.BufferGeometry();
    jib.setAttribute('position', new THREE.Float32BufferAttribute([0.9, 1.5, 0, 0.9, 10.2, 0, 4.6, 1.5, 0], 3));
    jib.computeVertexNormals();
    g.add(new THREE.Mesh(jib, new THREE.MeshStandardMaterial({ color: 0xF0C24A, roughness: 0.85, side: THREE.DoubleSide })));
    const anchorLamp = glow(0xEEEEEE, 0xFFF2C8);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), anchorLamp), 0.6, 11.4, 0, { parent: g, shadow: false });
    animated.push((t) => {
      g.position.x = sail.x;
      g.position.z = sail.z;
      g.rotation.y = 0.5 + Math.sin(t * 0.08) * 0.35;
      bob(g, sail.x, sail.z, t, 0.9, -0.15);
    });
  }

  // --- buoys marking the way out of the channel and around the rig and island
  const buoys = [];
  const buoyBody = (color) => std(color, 0.5);
  function makeBuoy(x, z, color, blink) {
    const g = new THREE.Group();
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 1.0, 10), buoyBody(color)), 0, 0.3, 0, { parent: g });
    add(new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.5, 8), buoyBody(color)), 0, 1.5, 0, { parent: g });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 5), std(0x3A3F44)), 0, 2.7, 0, { parent: g });
    const lampMat = glow(0x333333, color === 0xC43B2B ? 0xFF3A2A : color === 0x2E9E5A ? 0x40FF8A : 0xFFD24A);
    const lamp = add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lampMat), 0, 3.4, 0, { parent: g, shadow: false });
    lampMat.emissiveIntensity = 0.3;
    g.position.set(x, WATER_Y, z);
    scene.add(g);
    buoys.push({ g, x, z, lampMat, lamp, phase: rnd() * 6, blink });
  }
  for (let i = 0; i < 4; i++) {
    const z = -128 - i * 20;
    makeBuoy(-8, z, 0xC43B2B, true);
    makeBuoy(8, z, 0x2E9E5A, true);
  }
  if (isl) for (const a of [0.4, 2.2, 4.1]) makeBuoy(isl.x + Math.cos(a) * (isl.r + 6), isl.z + Math.sin(a) * (isl.r + 6), 0xE8B824, true);
  if (rig) for (const a of [0.8, 3.9]) makeBuoy(rig.x + Math.cos(a) * 16, rig.z + Math.sin(a) * 16, 0xE8B824, true);
  animated.push((t) => {
    for (const b of buoys) {
      bob(b.g, b.x, b.z, t, 1, -0.2);
      b.g.rotation.x *= 2.2; b.g.rotation.z *= 2.2;
      b.lampMat.userData.blink = Math.sin(t * 2.4 + b.phase) > 0.4;
    }
  });

  // --- a freighter crossing the horizon, in step for everyone (driven by wall-clock time)
  const ship = new THREE.Group();
  scene.add(ship);
  {
    const sh = new THREE.Shape();
    sh.moveTo(-48, -8); sh.lineTo(38, -8); sh.quadraticCurveTo(54, 0, 38, 8); sh.lineTo(-48, 8); sh.lineTo(-48, -8);
    const hullGeo = new THREE.ExtrudeGeometry(sh, { depth: 9, bevelEnabled: false });
    hullGeo.rotateX(Math.PI / 2);
    hullGeo.translate(0, 8.4, 0);
    const hullMesh = new THREE.Mesh(hullGeo, std(0x2A3A4E, 0.7));
    hullMesh.castShadow = true;
    ship.add(hullMesh);
    add(new THREE.Mesh(new THREE.BoxGeometry(94, 0.4, 15.6), std(0xB8322A, 0.7)), -4, 4.6, 0, { parent: ship, shadow: false });
    add(new THREE.Mesh(new THREE.BoxGeometry(92, 0.6, 15.5), std(0x5A6470, 0.8)), -4, 8.5, 0, { parent: ship });
    const boxCols = [0xC43B2B, 0x2E6FB0, 0xE0A02A, 0x3E8E5A, 0xD8D6CE, 0x6A4E8E];
    const contGeo = new THREE.BoxGeometry(5.6, 2.6, 2.4);
    const conts = new THREE.InstancedMesh(contGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), 8 * 5 * 3);
    let ci = 0;
    const dm = new THREE.Object3D();
    const cc = new THREE.Color();
    for (let ix = 0; ix < 8; ix++) for (let iz = 0; iz < 5; iz++) for (let iy = 0; iy < 3; iy++) {
      if (iy > 0 && rnd() < 0.25) { dm.scale.setScalar(0); } else dm.scale.setScalar(1);
      dm.position.set(-38 + ix * 5.8, 10 + iy * 2.65, -6 + iz * 3);
      dm.updateMatrix();
      conts.setMatrixAt(ci, dm.matrix);
      cc.set(boxCols[Math.floor(rnd() * boxCols.length)]);
      conts.setColorAt(ci, cc);
      ci++;
    }
    conts.castShadow = true;
    ship.add(conts);
    add(new THREE.Mesh(new THREE.BoxGeometry(9, 12, 15), std(0xEDEAE0, 0.7)), -42, 15, 0, { parent: ship });
    add(new THREE.Mesh(new THREE.BoxGeometry(5, 3, 15.6), std(0xEDEAE0, 0.7)), -40, 22, 0, { parent: ship });
    const bridgeGlass = glow(0x1E2E38, 0xFFD9A0, { roughness: 0.3 });
    add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.3, 15.8), bridgeGlass), -37.6, 22, 0, { parent: ship, shadow: false });
    add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 6, 10), std(0xC43B2B, 0.6)), -45.5, 24, 0, { parent: ship });
    add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), glow(0x333333, 0xFF3A2A)), 38, 20, 0, { parent: ship, shadow: false });
    const mast = glow(0x333333, 0xFFF2C8);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), mast), -42, 25, 0, { parent: ship, shadow: false });
  }
  const shipZ = -318;
  ship.userData.update = () => {
    const sp = 3.5;
    const span = 760;
    const x = -380 + ((Date.now() / 1000) * sp) % span;
    ship.position.set(x, WATER_Y - 0.6, shipZ);
    ship.rotation.z = Math.sin(Date.now() / 3000) * 0.012;
  };

  // --- gulls over the beach and the pier
  const gulls = [];
  const gullMat = std(0xF3F3EE, 0.8);
  const gullN = high ? 9 : 5;
  for (let i = 0; i < gullN; i++) {
    const g = new THREE.Group();
    add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), gullMat), 0, 0, 0, { parent: g, shadow: false }).scale.set(1.9, 0.75, 0.8);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 5), std(0xE0A02A)), 0.44, 0, 0, { parent: g, rz: -Math.PI / 2, shadow: false });
    const wl = new THREE.Group();
    const wr = new THREE.Group();
    add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.85), std(0xE4E6E2, 0.8)), 0, 0, 0.42, { parent: wl, shadow: false });
    add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.85), std(0xE4E6E2, 0.8)), 0, 0, -0.42, { parent: wr, shadow: false });
    wl.position.z = 0.12; wr.position.z = -0.12;
    g.add(wl, wr);
    scene.add(g);
    gulls.push({ g, wl, wr, cx: -14 + rnd() * 30, cz: -112 - rnd() * 40, r: 14 + rnd() * 28, y: 9 + rnd() * 10, sp: (0.18 + rnd() * 0.14) * (rnd() < 0.5 ? 1 : -1), ph: rnd() * 6.3 });
  }

  animated.push((t, dt, night) => {
    for (const s of gulls) {
      const a = s.ph + t * s.sp;
      const x = s.cx + Math.cos(a) * s.r;
      const z = s.cz + Math.sin(a) * s.r;
      s.g.position.set(x, s.y + Math.sin(t * 0.7 + s.ph) * 1.2, z);
      const dir = s.sp > 0 ? 1 : -1;
      s.g.rotation.y = Math.atan2(-Math.cos(a) * dir, -Math.sin(a) * dir);
      s.g.rotation.x = 0.2 * dir;
      const flap = Math.sin(t * 5 + s.ph * 3) * 0.55;
      s.wl.rotation.x = flap;
      s.wr.rotation.x = -flap;
      s.g.visible = night < 0.7;
    }
  });

  function update(t, dt, night) {
    for (const fn of animated) fn(t, dt, night);
    for (const b of buoys) b.lampMat.emissiveIntensity = b.lampMat.userData.blink ? 3.2 : 0.15;
    ship.userData.update();
  }
  return { update };
}
