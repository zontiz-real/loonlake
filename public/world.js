// Loon Lake world: sky and day cycle, water, terrain, camp, forest, and loons.
import * as THREE from 'three';

export const WATER_Y = 0.2;
export const DOCK_Y = 0.55;

// must match the water vertex shader
const sstep = (a, b, v) => { const k = Math.min(1, Math.max(0, (v - a) / (b - a))); return k * k * (3 - 2 * k); };
// open water swells in from the south; the lake and channel stay calm
export const oceanMask = (z) => 1 - sstep(-140, -95, z);
export const wave = (x, z, t) => {
  let h = 0.07 * Math.sin(x * 0.35 + t * 1.3) + 0.05 * Math.sin(z * 0.5 + t * 0.9) + 0.03 * Math.sin(x * 0.9 + z * 0.7 + t * 2.1);
  if (z < -95) h += oceanMask(z) * (0.35 * Math.sin(z * 0.12 + t * 0.8) + 0.2 * Math.sin(x * 0.09 + z * 0.05 + t * 0.6));
  return h;
};

// water outside the lake: the channel south and the big water past the beach
export const CHANNEL = { minX: -4.5, maxX: 4.5, minZ: -124, maxZ: -26 };
export const OCEAN_Z = -118;
export const nearWaterArea = (x, z, pad = 0) =>
  z < OCEAN_Z + 16 + pad || (Math.abs(x) < CHANNEL.maxX + 3 + pad && z < CHANNEL.maxZ && z > CHANNEL.minZ - 6);

// the play area stays flat; hills rise only outside it, as a backdrop
export function groundHeight(x, z) {
  const e = Math.max(Math.abs(x), Math.abs(z));
  let h = 0;
  const k = Math.min(1, Math.max(0, (e - 66) / 60));
  if (k > 0) {
    const s = k * k * (3 - 2 * k);
    h = s * (10 + 5 * Math.sin(x * 0.045 + 1.3) + 4 * Math.cos(z * 0.052) + 3 * Math.sin((x - z) * 0.09));
  }
  const ax = Math.abs(x);
  if (z < -24) {
    // hills roll down into a valley around the channel, then the channel cuts through
    if (z > -130) h *= sstep(4.5, 18, ax);
    if (z > CHANNEL.minZ - 2) h = h * sstep(4.5, 5.3, ax) + -2.2 * (1 - sstep(4.5, 5.3, ax));
  }
  // hills flatten into a beach, and the beach drops under the big water
  h *= sstep(-106, -92, z);
  if (z < -106) h = Math.min(h, -3 * sstep(-106, OCEAN_Z, z));
  return h;
}

// The ground is one grid with fine spacing where the terrain has sharp features (the canal banks, the
// beach, the ocean shelf) and wide spacing on the flat play area and far hills.
export const GROUND = { x0: -310, x1: 310, z0: -220, z1: 220 };
function gridLines(lo, hi, zones, coarse) {
  const set = new Set();
  const add = (v) => { if (v >= lo - 1e-6 && v <= hi + 1e-6) set.add(Math.round(v * 1000) / 1000); };
  add(lo); add(hi);
  for (let v = lo; v <= hi; v += coarse) add(v);
  for (const [a, b, step] of zones) for (let v = Math.ceil(a / step) * step; v <= b; v += step) add(v);
  return [...set].sort((p, q) => p - q);
}
const GRID_X = gridLines(GROUND.x0, GROUND.x1, [[-8, 8, 0.5], [-44, 44, 2]], 5);
const GRID_Z = gridLines(GROUND.z0, GROUND.z1, [[-135, -18, 1.5]], 5);
// a slice of the shared grid, lifted by `lift`
function gridGeometry(x0, x1, z0, z1, lift, withUv) {
  const xs = GRID_X.filter((v) => v >= x0 - 1e-6 && v <= x1 + 1e-6);
  const zs = GRID_Z.filter((v) => v >= z0 - 1e-6 && v <= z1 + 1e-6);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  const uv = new Float32Array(nx * nz * 2);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      pos[k * 3] = xs[i];
      pos[k * 3 + 1] = groundHeight(xs[i], zs[j]) + lift;
      pos[k * 3 + 2] = zs[j];
      uv[k * 2] = (xs[i] - GROUND.x0) / (GROUND.x1 - GROUND.x0);
      uv[k * 2 + 1] = 1 - (zs[j] - GROUND.z0) / (GROUND.z1 - GROUND.z0);
    }
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (withUv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// the barn model's doors face this way relative to the shack's front
const BARN_YAW = Math.PI / 2;

export const isNightHour = (h) => h >= 20.5 || h < 5.5;
export const isGoldenHour = (h) => (h >= 5.5 && h < 8) || (h >= 18 && h < 20.5);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  return tex;
}

export function makeLabel(text, opts = {}) {
  const c = document.createElement('canvas');
  const scale = 2;
  const g = c.getContext('2d');
  const font = `600 ${28 * scale}px Fredoka, system-ui, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width + 30 * scale);
  c.width = w; c.height = 46 * scale;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = opts.bg || 'rgba(16, 34, 30, 0.72)';
  g.beginPath(); g.roundRect(0, 4 * scale, w, 38 * scale, 19 * scale); g.fill();
  g.fillStyle = opts.fg || '#EEF2EC';
  g.fillText(text, w / 2, 24 * scale);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  const h = opts.height || 0.42;
  sprite.scale.set(h * (c.width / c.height), h, 1);
  sprite.position.y = 2.6;
  sprite.renderOrder = 5;
  return sprite;
}

const DAY_KEYS = [
  { h: 0, top: '#08112A', hor: '#1C2A48', fog: '#172339', sun: 0.42, hemi: 0.62, light: '#9FB4FF', night: 1 },
  { h: 4.8, top: '#0E1734', hor: '#2C3252', fog: '#212B43', sun: 0.42, hemi: 0.64, light: '#9FB4FF', night: 0.95 },
  { h: 6, top: '#3E5C92', hor: '#F0A77E', fog: '#C99A86', sun: 0.8, hemi: 0.62, light: '#FFC08A', night: 0.25 },
  { h: 7.5, top: '#6F9FCF', hor: '#E9D6BC', fog: '#D9D6C8', sun: 1.25, hemi: 0.8, light: '#FFE2B8', night: 0 },
  { h: 12, top: '#3F86CC', hor: '#A9CBDD', fog: '#AFC8D2', sun: 1.55, hemi: 0.88, light: '#FFF2DC', night: 0 },
  { h: 17, top: '#4A85C4', hor: '#B9CFD4', fog: '#B8C8C6', sun: 1.4, hemi: 0.84, light: '#FFE7C4', night: 0 },
  { h: 19, top: '#4D5F9A', hor: '#F29A62', fog: '#D98D6A', sun: 0.85, hemi: 0.65, light: '#FFB070', night: 0.15 },
  { h: 20.6, top: '#1B2152', hor: '#5B3F66', fog: '#36304E', sun: 0.45, hemi: 0.66, light: '#B7A8E8', night: 0.75 },
  { h: 22, top: '#08112A', hor: '#1C2A48', fog: '#172339', sun: 0.42, hemi: 0.62, light: '#9FB4FF', night: 1 },
  { h: 24, top: '#08112A', hor: '#1C2A48', fog: '#172339', sun: 0.42, hemi: 0.62, light: '#9FB4FF', night: 1 },
].map((k) => ({ ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), fog: new THREE.Color(k.fog), light: new THREE.Color(k.light) }));

const WATER_DAY = { deep: new THREE.Color('#0F4F5C'), shallow: new THREE.Color('#2C8A86') };
const WATER_NIGHT = { deep: new THREE.Color('#051219'), shallow: new THREE.Color('#0F2C36') };

export function createWorld(scene, renderer, camera, { isTouch, high = !isTouch }) {
  const hemi = new THREE.HemisphereLight(0xE7F2FA, 0x3E4A32, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFF6E4, 1.5);
  sun.castShadow = true;
  const shadowRes = isTouch ? 1024 : high ? 4096 : 2048;
  sun.shadow.mapSize.set(shadowRes, shadowRes);
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 160 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x8FB4C9, 0.4);
  fill.position.set(20, 12, -30);
  scene.add(fill);
  scene.fog = new THREE.Fog(0xD5E3E0, 75, 210);

  // ---------- sky
  const skyU = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color('#1F2B24') },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 0.92, 0.75) },
    uGlow: { value: 1 },
    uTime: { value: 0 },
    uCloud: { value: new THREE.Color(1, 1, 1) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyU,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSunColor, uCloud; uniform float uGlow, uTime; varying vec3 vDir;
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1.0,0.0)), u.x), mix(h2(i+vec2(0.0,1.0)), h2(i+vec2(1.0,1.0)), u.x), u.y); }
        float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p *= 2.03; a *= 0.5; } return v; }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5)) : mix(uHorizon, uBottom, clamp(-h * 4.0, 0.0, 1.0));
          float cover = 0.0;
          if (h > 0.0) {
            vec2 uv = d.xz / (h + 0.12) * 1.5 + vec2(uTime * 0.008, uTime * 0.003);
            float c = fbm(uv);
            cover = smoothstep(0.5, 0.78, c) * smoothstep(0.0, 0.2, h);
            vec3 cc = uCloud * (0.82 + 0.3 * smoothstep(0.55, 0.95, c));
            col = mix(col, cc, cover * 0.88);
          }
          float s = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(s, 900.0) * 3.0 * (1.0 - cover) + pow(s, 14.0) * 0.28) * uGlow;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -2;
  scene.add(sky);

  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(900 * 3);
  const srnd = mulberry32(99);
  for (let i = 0; i < 900; i++) {
    const u = srnd() * Math.PI * 2;
    const v = 0.04 + srnd() * 0.96;
    const r = Math.sqrt(1 - v * v);
    starPos.set([Math.cos(u) * r * 280, v * 280, Math.sin(u) * r * 280], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -1;
  scene.add(stars);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(8, 20, 14), new THREE.MeshBasicMaterial({ color: 0xE9EEF5, fog: false, transparent: true }));
  moon.renderOrder = -1;
  scene.add(moon);

  // ---------- water
  const waterU = {
    uTime: { value: 0 },
    uDeep: { value: WATER_DAY.deep.clone() },
    uShallow: { value: WATER_DAY.shallow.clone() },
    uSky: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 75 },
    uFogFar: { value: 210 },
    uRadius: { value: 30 },
    uNight: { value: 0 },
  };
  const makeWater = (lake) => new THREE.ShaderMaterial({
    uniforms: { ...waterU, uLake: { value: lake ? 1 : 0 } },
    transparent: true,
    vertexShader: `
      uniform float uTime; varying vec3 vWorld; varying vec3 vN;
      void main(){
        vec3 pos = position; vec2 p = pos.xz;
        vec4 w0 = modelMatrix * vec4(pos, 1.0);
        p = w0.xz;
        float m = 1.0 - smoothstep(-140.0, -95.0, p.y);
        pos.y += 0.07*sin(p.x*0.35 + uTime*1.3) + 0.05*sin(p.y*0.5 + uTime*0.9) + 0.03*sin(p.x*0.9 + p.y*0.7 + uTime*2.1);
        pos.y += m * (0.35*sin(p.y*0.12 + uTime*0.8) + 0.2*sin(p.x*0.09 + p.y*0.05 + uTime*0.6));
        float dx = 0.07*0.35*cos(p.x*0.35 + uTime*1.3) + 0.03*0.9*cos(p.x*0.9 + p.y*0.7 + uTime*2.1) + m*0.2*0.09*cos(p.x*0.09 + p.y*0.05 + uTime*0.6);
        float dz = 0.05*0.5*cos(p.y*0.5 + uTime*0.9) + 0.03*0.7*cos(p.x*0.9 + p.y*0.7 + uTime*2.1) + m*(0.35*0.12*cos(p.y*0.12 + uTime*0.8) + 0.2*0.05*cos(p.x*0.09 + p.y*0.05 + uTime*0.6));
        vN = normalize(vec3(-dx, 1.0, -dz));
        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform float uTime, uFogNear, uFogFar, uRadius, uNight, uLake;
      uniform vec3 uDeep, uShallow, uSky, uSunDir, uSunColor, uFogColor;
      varying vec3 vWorld; varying vec3 vN;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), u.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), u.x), u.y);
      }
      void main(){
        float r = length(vWorld.xz) / uRadius;
        vec2 np = vWorld.xz * 1.1 + vec2(uTime * 0.22, uTime * 0.16);
        float n1 = vnoise(np); float n2 = vnoise(np * 2.3 - uTime * 0.35);
        float n3 = vnoise(np * 5.3 + vec2(uTime * 0.7, -uTime * 0.5));
        vec3 n = normalize(vN + vec3((n1 - 0.5) * 0.32 + (n3 - 0.5) * 0.14, 0.0, (n2 - 0.5) * 0.32 + (n3 - 0.5) * 0.14));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
        vec3 base = mix(uDeep, uShallow, smoothstep(0.5, 1.0, r));
        if (uLake < 0.5) {
          // channel water is shallow and green; open water goes deep blue away from the beach
          float open = smoothstep(-100.0, -150.0, vWorld.z);
          base = mix(uShallow * 0.9, mix(uDeep, vec3(0.02, 0.09, 0.16) * (1.0 - uNight * 0.7), 0.6), open);
        }
        vec3 col = mix(base, uSky, 0.1 + fres * 0.65);
        vec3 H = normalize(normalize(uSunDir) + V);
        float nh = max(dot(n, H), 0.0);
        col += uSunColor * (pow(nh, 260.0) * 1.1 + pow(nh, 28.0) * 0.06);
        // sun glitter that twinkles across the ripples, and a soft glow from light in the water
        float twinkle = smoothstep(0.82, 1.0, vnoise(vWorld.xz * 5.5 + vec2(uTime * 1.6, uTime * 1.2)));
        col += uSunColor * twinkle * pow(nh, 14.0) * 0.55;
        col += uShallow * 0.1 * (1.0 - fres) * (1.0 - uNight * 0.8);
        float foam = uLake * smoothstep(0.93, 0.997, r) * (0.35 + 0.65 * vnoise(vWorld.xz * 1.8 + vec2(uTime * 0.5, -uTime * 0.35))) * (0.6 + 0.4 * sin(uTime * 1.6 + vWorld.x * 0.7 + vWorld.z * 0.4));
        if (uLake < 0.5) foam = smoothstep(0.55, 0.95, sin(vWorld.z * 0.12 + uTime * 0.8) * 0.5 + 0.5) * smoothstep(-126.0, -118.0, vWorld.z) * 0.6;
        col = mix(col, vec3(0.92, 0.96, 0.94) * (1.0 - uNight * 0.65), foam * 0.6);
        float alpha = uLake > 0.5 ? mix(0.9, 0.74, smoothstep(0.86, 1.0, r)) : mix(0.8, 0.97, smoothstep(-110.0, -135.0, vWorld.z));
        float fogF = smoothstep(uFogNear, uFogFar, length(vWorld - cameraPosition));
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  // ---------- state built later
  let W = null;
  const colliders = [];
  const solids = []; // tall things the camera should not pass through
  const lights = [];
  const emissives = [];
  const firePos = new THREE.Vector3();
  let fireLight = null;
  let pads = null;
  let flowers = null;
  const padData = [];
  const loons = [];
  const day = { night: 0, golden: false, hour: 9, horizon: new THREE.Color(), top: new THREE.Color(), fog: new THREE.Color(), light: new THREE.Color() };
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const tmpV = new THREE.Vector3();
  const sunDir = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const grassTime = { value: 0 };
  const WHITE = new THREE.Color(1, 1, 1);
  const moonDir = new THREE.Vector3();

  // ---------- roads: ribbons laid on the ground, sampled so trees, grass and rocks keep off them
  const roads = [];
  // named spots for the compass, maps and signs (the camp's own are added from the server's world data)
  const places = [
    { id: 'stop', name: 'Road Stop', x: 49, z: 50 },
    { id: 'cabin', name: 'Old Cabin', x: -49, z: 50 },
    { id: 'ramp', name: 'Boat ramp', x: -33.5, z: 0 },
    { id: 'channel', name: 'Channel', x: 10.5, z: -48 },
  ];
  const PLAZA = { x: -1, z: 43.5, r: 8 };
  const roadPts = [];
  const nearRoad = (x, z, pad = 0) => {
    if ((x - PLAZA.x) ** 2 + (z - PLAZA.z) ** 2 < (PLAZA.r + pad) ** 2) return true;
    for (const p of roadPts) {
      const r = p[2] + pad;
      if ((x - p[0]) ** 2 + (z - p[1]) ** 2 < r * r) return true;
    }
    return false;
  };

  function flat(mesh, y) {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function box(w, h, d, color, x, y, z, opts = {}) {
    const mat = opts.mat || new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (opts.ry) mesh.rotation.y = opts.ry;
    if (opts.rz) mesh.rotation.z = opts.rz;
    if (opts.rx) mesh.rotation.x = opts.rx;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function lantern(x, y, z, withLight) {
    box(0.1, y, 0.1, 0x3A2A1C, x, y / 2, z);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3A2E20, emissive: 0xFFB45C, emissiveIntensity: 0.2 });
    const glass = box(0.3, 0.38, 0.3, 0, x, y + 0.2, z, { mat });
    glass.castShadow = false;
    emissives.push(mat);
    if (withLight) {
      const light = new THREE.PointLight(0xFFBE7A, 0, 14, 1.6);
      light.position.set(x, y + 0.3, z);
      scene.add(light);
      lights.push({ light, max: 9 });
    }
  }

  let boats = [];
  let birdFlock = null;
  const birdDummy = new THREE.Object3D();
  function build(w, kit) {
    W = w;
    waterU.uRadius.value = w.lakeRadius;
    const grass = canvasTex(256, 256, (g, cw, ch) => {
      g.fillStyle = '#5A7A46';
      g.fillRect(0, 0, cw, ch);
      const r = mulberry32(3);
      for (let i = 0; i < 9; i++) {
        const x = 30 + r() * (cw - 60);
        const y = 30 + r() * (ch - 60);
        const grd = g.createRadialGradient(x, y, 10, x, y, 90);
        grd.addColorStop(0, i % 2 ? 'rgba(118, 150, 80, .6)' : 'rgba(56, 82, 42, .5)');
        grd.addColorStop(1, 'rgba(90, 122, 70, 0)');
        g.fillStyle = grd;
        g.fillRect(0, 0, cw, ch);
      }
      for (let i = 0; i < 900; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(40, 64, 30, .35)' : 'rgba(140, 170, 96, .25)';
        g.fillRect(r() * cw, r() * ch, 1.5, 3);
      }
    }, [9, 9]);
    const sand = canvasTex(128, 128, (g, cw, ch) => {
      g.fillStyle = '#D6C6A0';
      g.fillRect(0, 0, cw, ch);
      const r = mulberry32(5);
      for (let i = 0; i < 500; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(150, 128, 90, .25)' : 'rgba(250, 240, 214, .3)';
        g.fillRect(r() * cw, r() * ch, 2, 2);
      }
    }, [6, 6]);
    const woodTex = canvasTex(128, 256, (g, cw, ch) => {
      g.fillStyle = '#8B6844';
      g.fillRect(0, 0, cw, ch);
      for (let y = 0; y < ch; y += 18) {
        g.fillStyle = y % 36 ? '#6E4E32' : '#A17A52';
        g.fillRect(0, y, cw, 16);
        g.strokeStyle = 'rgba(40, 24, 12, 0.35)';
        g.beginPath();
        g.moveTo(0, y + 8);
        g.bezierCurveTo(cw * 0.3, y + 2, cw * 0.6, y + 14, cw, y + 6);
        g.stroke();
      }
    });
    grass.repeat.set((GROUND.x1 - GROUND.x0) / 22, (GROUND.z1 - GROUND.z0) / 22);
    const groundGeo = gridGeometry(GROUND.x0, GROUND.x1, GROUND.z0, GROUND.z1, 0, true);
    const groundMat = new THREE.MeshStandardMaterial({ map: grass, roughness: 1 });
    // broad patches of lush and dry grass, so the meadow doesn't read as one repeating tile
    groundMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vWPos;
          float gh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float gn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(gh(i), gh(i+vec2(1.0,0.0)), u.x), mix(gh(i+vec2(0.0,1.0)), gh(i+vec2(1.0,1.0)), u.x), u.y); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          float m1 = gn(vWPos.xz * 0.045);
          float m2 = gn(vWPos.xz * 0.17 + 7.0);
          float m3 = gn(vWPos.xz * 0.6);
          vec3 dry = vec3(1.16, 1.05, 0.74);
          vec3 lush = vec3(0.84, 1.04, 0.82);
          diffuseColor.rgb *= mix(lush, dry, smoothstep(0.35, 0.75, m1)) * (0.88 + 0.24 * m2) * (0.94 + 0.12 * m3);`);
    };
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    scene.add(ground);
    flat(new THREE.Mesh(new THREE.RingGeometry(w.lakeRadius - 1.2, w.shoreRadius + 2.4, 128), new THREE.MeshStandardMaterial({ map: sand, roughness: 1 })), 0.02);
    flat(new THREE.Mesh(new THREE.CircleGeometry(w.lakeRadius, 96), new THREE.MeshStandardMaterial({ color: 0x1A3A3E, roughness: 1 })), 0.015);
    places.unshift({ id: 'camp', name: 'Camp', x: w.camp.fire.x, z: w.camp.fire.z }, { id: 'dock', name: 'Dock', x: 0, z: w.dock.minZ + 1.5 });
    places.push({ id: 'moss', name: "Moss's stand", x: w.camp.dealer.x, z: w.camp.dealer.z }, { id: 'shack', name: 'The Shack', x: w.camp.shack.x, z: w.camp.shack.z });
    buildRoads(w, kit);

    const waterGeo = new THREE.RingGeometry(0.01, w.lakeRadius, 140, 34);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, makeWater(true));
    water.position.y = WATER_Y;
    water.renderOrder = 1;
    scene.add(water);
    buildBigWater(w);

    // dock
    const d = w.dock;
    const wood = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.82 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(d.maxX - d.minX, 0.2, d.maxZ - d.minZ), wood);
    deck.position.set((d.minX + d.maxX) / 2, DOCK_Y - 0.1, (d.minZ + d.maxZ) / 2);
    deck.castShadow = deck.receiveShadow = true;
    scene.add(deck);
    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8);
    for (let z = d.minZ + 0.3; z < d.maxZ; z += 3) {
      for (const x of [d.minX + 0.15, d.maxX - 0.15]) {
        const post = new THREE.Mesh(postGeo, wood);
        post.position.set(x, DOCK_Y - 0.5, z);
        post.castShadow = true;
        scene.add(post);
      }
    }
    lantern(d.maxX - 0.2, 1.2, d.minZ + 0.4, false);
    lantern(d.minX + 0.2, 1.2, d.minZ + 0.4, false);
    box(0.12, 2.0, 0.12, 0x4A3322, 2.8, 1.0, d.maxZ + 1.2);
    board(2.8, 1.8, d.maxZ + 1.2, 'Loon Lake', null);

    // camp
    const camp = w.camp;
    const away = Math.hypot(camp.shack.x, camp.shack.z) || 1;
    const bx = camp.shack.x + (camp.shack.x / away) * 3.6;
    const bz = camp.shack.z + (camp.shack.z / away) * 3.6;
    const shackRy = Math.atan2(camp.shack.x - bx, camp.shack.z - bz);
    const face = new THREE.Vector3(Math.sin(shackRy), 0, Math.cos(shackRy));
    const side = new THREE.Vector3(Math.cos(shackRy), 0, -Math.sin(shackRy));
    const winMat = new THREE.MeshStandardMaterial({ color: 0xF2E2A8, emissive: 0xFFC36B, emissiveIntensity: 0.1 });
    emissives.push(winMat);
    if (kit) {
      const barn = kit.prop('barn', 4.6);
      barn.position.set(bx - face.x * 0.4, 0, bz - face.z * 0.4);
      barn.rotation.y = shackRy + BARN_YAW;
      scene.add(barn);
      // a warm lit window on the side facing camp
      const win = box(0.9, 0.8, 0.06, 0, bx + face.x * 2.62 + side.x * 1.7, 1.9, bz + face.z * 2.62 + side.z * 1.7, { mat: winMat, ry: shackRy });
      win.castShadow = false;
    } else {
      const siding = new THREE.MeshStandardMaterial({ color: 0x6B4A32, roughness: 0.9 });
      box(5.6, 3.1, 4.4, 0, bx, 1.55, bz, { mat: siding, ry: shackRy });
      const roof = box(6.4, 0.45, 5.2, 0x3A2418, bx, 3.35, bz, { ry: shackRy });
      roof.rotation.x = 0.06;
      [-1.3, 1.3].forEach((o) => {
        const win = box(0.8, 0.75, 0.08, 0, bx + face.x * 2.22 + side.x * o, 1.9, bz + face.z * 2.22 + side.z * o, { mat: winMat, ry: shackRy });
        win.castShadow = false;
      });
      box(0.9, 1.9, 0.08, 0x3A2418, bx + face.x * 2.22, 0.95, bz + face.z * 2.22, { ry: shackRy });
    }
    colliders.push({ x: bx, z: bz, r: 3.2 });
    solids.push({ x: bx, z: bz, r: 3.4, h: kit ? 4.8 : 3.8 });
    // card table and slot machine
    box(1.8, 0.1, 1.05, 0x2E5A3A, camp.shack.x, 0.78, camp.shack.z - 0.4);
    box(1.5, 0.72, 0.8, 0x5A4130, camp.shack.x, 0.36, camp.shack.z - 0.4);
    const slot = box(0.75, 1.5, 0.6, 0xA8322A, camp.shack.x + 1.9, 0.75, camp.shack.z - 0.2);
    slot.material.roughness = 0.5;
    const slotFace = new THREE.MeshStandardMaterial({ color: 0xF6E7BE, emissive: 0xFFD27A, emissiveIntensity: 0.25 });
    emissives.push(slotFace);
    box(0.5, 0.3, 0.05, 0, camp.shack.x + 1.9, 1.1, camp.shack.z - 0.52, { mat: slotFace });
    colliders.push({ x: camp.shack.x, z: camp.shack.z - 0.4, r: 1.0 }, { x: camp.shack.x + 1.9, z: camp.shack.z - 0.2, r: 0.5 });
    lantern(camp.shack.x - 1.6, 2.1, camp.shack.z - 1.2, true);
    const shackSign = makeLabel('The Shack', { bg: 'rgba(92, 58, 30, .92)', fg: '#F6E7BE', height: 0.7 });
    shackSign.position.set(bx + face.x * 2.8, kit ? 3.4 : 4.3, bz + face.z * 2.8);
    scene.add(shackSign);

    // Moss's stand
    const m = camp.dealer;
    box(2.6, 1.0, 1.0, 0x5A4130, m.x, 0.5, m.z - 0.5);
    box(2.8, 0.08, 1.2, 0x7A5A3A, m.x, 1.04, m.z - 0.5);
    [-1.25, 1.25].forEach((o) => box(0.1, 2.6, 0.1, 0x4A3322, m.x + o, 1.3, m.z - 1.0));
    const awning = canvasTex(64, 16, (g, cw, ch) => {
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#F4EDE0' : '#C73A28'; g.fillRect(i * 8, 0, 8, ch); }
    });
    box(3.0, 0.06, 1.6, 0, m.x, 2.55, m.z - 0.4, { mat: new THREE.MeshStandardMaterial({ map: awning, roughness: 0.9 }), rx: -0.22 });
    if (kit) {
      [[-1.9, -0.2, 0.95], [1.9, -0.3, 0.85], [-2.5, 0.5, 0.8]].forEach(([ox, oz, h]) => {
        const b = kit.prop('barrel', h);
        b.position.set(m.x + ox, 0, m.z + oz);
        b.rotation.y = ox;
        scene.add(b);
      });
    } else {
      box(0.7, 0.55, 0.6, 0x7A5A3A, m.x - 1.9, 0.28, m.z - 0.2, { ry: 0.3 });
      box(0.6, 0.5, 0.5, 0x6B4A32, m.x + 1.9, 0.25, m.z - 0.3, { ry: -0.2 });
    }
    box(0.5, 0.35, 0.35, 0x3E6B4F, m.x - 0.6, 1.25, m.z - 0.5);
    box(0.3, 0.4, 0.3, 0xC4B48A, m.x + 0.5, 1.28, m.z - 0.5);
    solids.push({ x: m.x, z: m.z - 0.5, r: 1.6, h: 2.8 });
    colliders.push({ x: m.x, z: m.z - 0.5, r: 1.5 }, { x: m.x - 1.9, z: m.z - 0.2, r: 0.5 }, { x: m.x + 1.9, z: m.z - 0.3, r: 0.45 });
    lantern(m.x + 1.5, 2.1, m.z - 1.3, true);
    const mossSign = makeLabel("Moss's Bait & Tackle", { bg: 'rgba(92, 58, 30, .92)', fg: '#F6E7BE', height: 0.56 });
    mossSign.position.set(m.x, 3.25, m.z - 0.4);
    scene.add(mossSign);

    // campfire
    const f = camp.fire;
    firePos.set(f.x, 0.3, f.z);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x77736C, roughness: 1, flatShading: true });
    const stoneGeo = new THREE.DodecahedronGeometry(0.22, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = new THREE.Mesh(stoneGeo, stoneMat);
      s.position.set(f.x + Math.sin(a) * 0.75, 0.1, f.z + Math.cos(a) * 0.75);
      s.rotation.set(a, a * 2, 0);
      s.castShadow = true;
      scene.add(s);
    }
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4A3020, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), logMat);
      log.position.set(f.x, 0.22, f.z);
      log.rotation.set(Math.PI / 2 - 0.35, (i / 3) * Math.PI * 2, 0, 'YXZ');
      scene.add(log);
    }
    const embers = new THREE.Mesh(new THREE.CircleGeometry(0.45, 12), new THREE.MeshBasicMaterial({ color: 0xFF7A2E }));
    flat(embers, 0.06);
    fireLight = new THREE.PointLight(0xFF8A3D, 3, 18, 1.5);
    fireLight.position.set(f.x, 1.1, f.z);
    scene.add(fireLight);
    colliders.push({ x: f.x, z: f.z, r: 0.9 });
    // benches around the fire
    [[-2.6, 0.4, 0.2], [2.6, 0.2, -0.2], [0, 2.7, Math.PI / 2]].forEach(([ox, oz, ry]) => {
      box(0.35, 0.35, 1.8, 0x5A3E28, f.x + ox, 0.18, f.z + oz, { ry });
      colliders.push({ x: f.x + ox, z: f.z + oz, r: 0.6, h: 0.36 });
    });

    // a staircase of crates and some barrels to hop up: 0.6 m, 1.1 m, then 1.6 m
    const crate = (x, z, h) => {
      box(1.3, h, 1.3, 0x9A6B3A, x, h / 2, z);
      box(1.36, 0.08, 1.36, 0x6E4A26, x, h - 0.04, z);
      colliders.push({ x, z, r: 0.75, h });
    };
    const cx0 = camp.dealer.x + 10;
    const cz0 = camp.dealer.z + 6;
    crate(cx0, cz0, 0.6);
    crate(cx0 + 1.7, cz0, 1.1);
    crate(cx0 + 3.4, cz0, 1.6);
    crate(cx0 + 1.7, cz0 + 1.8, 0.6);
    [[cx0 - 1.2, cz0 + 2.2], [cx0 - 2.2, cz0 + 1.2]].forEach(([bx2, bz2]) => {
      const b = kit.prop('barrel', 1.0);
      b.position.set(bx2, 0, bz2);
      scene.add(b);
      colliders.push({ x: bx2, z: bz2, r: 0.5, h: 1.0 });
    });

    // forest, instanced
    const rnd = mulberry32(7);
    const treeCount = high ? 340 : 170;
    const coneGeo = new THREE.ConeGeometry(1.5, 2.4, 7);
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.3, 6);
    const pineA = new THREE.MeshStandardMaterial({ color: 0x2A4834, roughness: 0.86, flatShading: true });
    const pineB = new THREE.MeshStandardMaterial({ color: 0x21392A, roughness: 0.9, flatShading: true });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5A4130, roughness: 0.95 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const low = new THREE.InstancedMesh(coneGeo, pineB, treeCount);
    const mid = new THREE.InstancedMesh(coneGeo, pineA, treeCount);
    const top = new THREE.InstancedMesh(coneGeo, pineA, treeCount);
    [trunks, low, mid, top].forEach((im) => { im.castShadow = true; im.receiveShadow = true; });
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    let groundY = 0;
    const place = (im, i, x, y, z, s, sx) => {
      dummy.position.set(x, groundY + y * s, z);
      dummy.scale.set(s * sx, s, s * sx);
      dummy.rotation.set(0, rnd() * Math.PI, 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    };
    for (let placed = 0; placed < treeCount;) {
      const spread = placed < treeCount * 0.45 ? w.bounds + 25 : 150;
      const x = (rnd() * 2 - 1) * spread;
      const z = (rnd() * 2 - 1) * spread;
      if (Math.hypot(x, z) < w.shoreRadius + 7) continue;
      if (nearWaterArea(x, z, 3)) continue;
      if (nearRoad(x, z, 2.2)) continue;
      if (Math.abs(x) < 6 && z > 0 && z < 50) continue;
      if (Math.hypot(x - camp.dealer.x, z - camp.dealer.z) < 8) continue;
      if (Math.hypot(x - camp.shack.x, z - camp.shack.z) < 11) continue;
      if (Math.hypot(x - f.x, z - f.z) < 7) continue;
      const s = 0.7 + rnd() * 0.9;
      groundY = groundHeight(x, z) - 0.1;
      tint.setHSL(0.36 + (rnd() - 0.5) * 0.06, 0.9, 0.85 + rnd() * 0.3);
      [low, mid, top].forEach((im) => im.setColorAt(placed, tint));
      place(trunks, placed, x, 0.65, z, s, 1);
      place(low, placed, x, 2.15, z, s, 1.15);
      place(mid, placed, x, 3.15, z, s, 1);
      place(top, placed, x, 4.15, z, s, 0.72);
      if (Math.abs(x) <= w.bounds + 1 && Math.abs(z) <= w.bounds + 1) colliders.push({ x, z, r: 0.35 * s });
      placed++;
    }
    scene.add(trunks, low, mid, top);

    // birches along the shore, for a Minnesota treeline
    const birchN = high ? 44 : 22;
    const bark = canvasTex(32, 256, (g, cw, ch) => {
      g.fillStyle = '#EDEBE3';
      g.fillRect(0, 0, cw, ch);
      const r = mulberry32(11);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = r() > 0.3 ? '#2A2622' : '#8C857A';
        g.fillRect(r() * cw, r() * ch, 4 + r() * 12, 1.5 + r() * 2.5);
      }
    });
    const birchTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.15, 4.4, 7), new THREE.MeshStandardMaterial({ map: bark, roughness: 0.8 }), birchN);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x86AC4E, roughness: 0.8, flatShading: true });
    const birchLeaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), leafMat, birchN * 3);
    birchTrunks.castShadow = birchLeaves.castShadow = true;
    birchLeaves.receiveShadow = true;
    for (let placed = 0, tries = 0; placed < birchN && tries < 4000; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = w.shoreRadius + 6 + rnd() * 38;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.abs(x) < 7 && z > 0 && z < 52) continue;
      if (nearWaterArea(x, z, 2)) continue;
      if (nearRoad(x, z, 1.6)) continue;
      if (Math.hypot(x - camp.dealer.x, z - camp.dealer.z) < 8 || Math.hypot(x - camp.shack.x, z - camp.shack.z) < 11 || Math.hypot(x - f.x, z - f.z) < 7) continue;
      if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 1.2)) continue;
      const s = 0.8 + rnd() * 0.5;
      const gy = groundHeight(x, z);
      const lean = (rnd() - 0.5) * 0.12;
      dummy.position.set(x, gy + 2.2 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(lean, rnd() * Math.PI, -lean);
      dummy.updateMatrix();
      birchTrunks.setMatrixAt(placed, dummy.matrix);
      for (let k = 0; k < 3; k++) {
        dummy.position.set(x + (rnd() - 0.5) * 1.1 * s, gy + (3.6 + k * 0.7 + rnd() * 0.3) * s, z + (rnd() - 0.5) * 1.1 * s);
        dummy.scale.setScalar((1.25 - k * 0.2) * s);
        dummy.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        dummy.updateMatrix();
        birchLeaves.setMatrixAt(placed * 3 + k, dummy.matrix);
        tint.setHSL(0.21 + rnd() * 0.05, 0.3, 0.6 + rnd() * 0.22, THREE.SRGBColorSpace);
        birchLeaves.setColorAt(placed * 3 + k, tint);
      }
      if (Math.abs(x) <= w.bounds + 1 && Math.abs(z) <= w.bounds + 1) colliders.push({ x, z, r: 0.3 * s });
      placed++;
    }
    scene.add(birchTrunks, birchLeaves);

    // grass tufts that sway in the wind
    const grassN = high ? 9000 : 2600;
    const bladeCount = 3;
    const gpos = [];
    const gcol = [];
    const gnorm = [];
    for (let b = 0; b < bladeCount; b++) {
      const ang = (b / bladeCount) * Math.PI + 0.3;
      const cx = Math.cos(ang) * 0.035;
      const cz = Math.sin(ang) * 0.035;
      const lean = (b - 1) * 0.07;
      const top = [lean, 0.3 + b * 0.05, lean * 0.5];
      // both windings with upward normals, so the back of a blade is lit like the front
      gpos.push(-cx, 0, -cz, cx, 0, cz, ...top, cx, 0, cz, -cx, 0, -cz, ...top);
      gcol.push(0.26, 0.38, 0.18, 0.26, 0.38, 0.18, 0.52, 0.66, 0.32, 0.26, 0.38, 0.18, 0.26, 0.38, 0.18, 0.52, 0.66, 0.32);
      gnorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    }
    const tuft = new THREE.BufferGeometry();
    tuft.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
    tuft.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
    tuft.setAttribute('normal', new THREE.Float32BufferAttribute(gnorm, 3));
    const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    grassMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = grassTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 gw = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.7 + gw.x * 0.35 + gw.z * 0.27) + 0.5 * sin(uTime * 2.9 + gw.x * 0.8);
        transformed.x += sway * 0.08 * position.y;
        transformed.z += cos(uTime * 1.3 + gw.z * 0.4) * 0.05 * position.y;`);
    };
    const grassField = new THREE.InstancedMesh(tuft, grassMat, grassN);
    grassField.receiveShadow = false;
    grassField.frustumCulled = false;
    const clear = [...colliders.filter((c) => c.r > 0.5), { x: f.x, z: f.z, r: 1.6 }];
    let gi = 0;
    for (let tries = 0; gi < grassN && tries < grassN * 4; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = w.shoreRadius + 2.8 + rnd() * 40;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.abs(x) > w.bounds + 12 || Math.abs(z) > w.bounds + 12) continue;
      if (Math.abs(x) < 2.4 && z > w.dock.minZ && z < w.dock.maxZ + 3) continue;
      if (nearWaterArea(x, z, 0.5)) continue;
      if (nearRoad(x, z, 0.5)) continue;
      if (clear.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 0.4) ** 2)) continue;
      const s = 0.7 + rnd() * 0.6;
      dummy.position.set(x, groundHeight(x, z), z);
      dummy.scale.set(s, s * (0.7 + rnd() * 0.6), s);
      dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
      dummy.updateMatrix();
      grassField.setMatrixAt(gi, dummy.matrix);
      tint.setHSL(0.22 + (rnd() - 0.5) * 0.07, 0.45, 0.9 + rnd() * 0.3);
      grassField.setColorAt(gi, tint);
      gi++;
    }
    grassField.count = gi;
    scene.add(grassField);

    // wildflowers in clumps through the meadow (not on the Low setting)
    if (high) {
      const flowerN = 700;
      const stemGeo = new THREE.CylinderGeometry(0.008, 0.01, 0.3, 3);
      stemGeo.translate(0, 0.15, 0);
      const headGeo = new THREE.SphereGeometry(0.05, 6, 4);
      headGeo.scale(1, 0.55, 1);
      headGeo.translate(0, 0.31, 0);
      const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshStandardMaterial({ color: 0x4F7A34, roughness: 1 }), flowerN);
      const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.7 }), flowerN);
      const palette = ['#F6F1E4', '#F2D54A', '#B58BE0', '#F08AA8', '#F2A04A', '#8EB8F0'];
      let fi = 0;
      for (let tries = 0; fi < flowerN && tries < flowerN * 8; tries++) {
        const a = rnd() * Math.PI * 2;
        const r = w.shoreRadius + 3 + rnd() * 44;
        const x = Math.sin(a) * r;
        const z = Math.cos(a) * r;
        if (Math.abs(x) > w.bounds - 2 || Math.abs(z) > w.bounds - 2) continue;
        if (nearWaterArea(x, z, 1) || nearRoad(x, z, 0.8)) continue;
        if (Math.abs(x) < 2.4 && z > w.dock.minZ && z < w.dock.maxZ + 3) continue;
        const patch = Math.sin(x * 0.21) + Math.cos(z * 0.17) + Math.sin((x + z) * 0.11);
        if (patch < 0.6 && rnd() < 0.85) continue; // mostly in patches
        if (clear.some((c) => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + 0.4) ** 2)) continue;
        const sc = 0.8 + rnd() * 0.7;
        dummy.position.set(x, groundHeight(x, z), z);
        dummy.scale.setScalar(sc);
        dummy.rotation.set(0, rnd() * 6.28, 0);
        dummy.updateMatrix();
        stems.setMatrixAt(fi, dummy.matrix);
        heads.setMatrixAt(fi, dummy.matrix);
        tint.set(palette[Math.floor(rnd() * palette.length)]);
        heads.setColorAt(fi, tint);
        fi++;
      }
      stems.count = heads.count = fi;
      stems.frustumCulled = heads.frustumCulled = false;
      scene.add(stems, heads);
    }

    // a loose flock wheeling high over the lake in daylight
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.2, -0.55, 0.06, -0.12, 0, 0, -0.14, 0, 0, 0.2, 0, 0, -0.14, 0.55, 0.06, -0.12], 3));
    birdGeo.computeVertexNormals();
    birdFlock = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x1F2626, side: THREE.DoubleSide }), 14);
    birdFlock.frustumCulled = false;
    scene.add(birdFlock);

    if (kit) buildModelScenery(w, kit, rnd, dummy, tint, camp, f);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8A8680, roughness: 1, flatShading: true });
    const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.45, 0), rockMat, kit ? 0 : 34);
    rocks.castShadow = rocks.receiveShadow = true;
    for (let i = 0; i < (kit ? 0 : 34); i++) {
      const a = rnd() * Math.PI * 2;
      const r = w.shoreRadius + 1.2 + rnd() * 4;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      dummy.position.set(x, 0.12 + rnd() * 0.15, z);
      const s = 0.5 + rnd() * 1.3;
      dummy.scale.setScalar(s);
      dummy.rotation.set(rnd(), rnd(), rnd());
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    scene.add(rocks);

    // reeds along the water's edge
    const reedN = 160;
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.02, 0.03, 1.4, 4), new THREE.MeshStandardMaterial({ color: 0x5E7A3A, roughness: 1 }), reedN);
    const heads = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.05, 0.2, 2, 6), new THREE.MeshStandardMaterial({ color: 0x5A3A22, roughness: 1 }), reedN);
    let ri = 0;
    while (ri < reedN) {
      const a = rnd() * Math.PI * 2;
      const cx = Math.sin(a) * (w.lakeRadius + 0.2);
      const cz = Math.cos(a) * (w.lakeRadius + 0.2);
      if (Math.abs(cx) < 4 && cz > 0) continue;
      if (Math.abs(cx) < 7 && cz < 0) continue;
      const clump = 5 + Math.floor(rnd() * 6);
      for (let k = 0; k < clump && ri < reedN; k++, ri++) {
        const x = cx + (rnd() - 0.5) * 1.6;
        const z = cz + (rnd() - 0.5) * 1.6;
        const h = 0.8 + rnd() * 0.6;
        const lean = (rnd() - 0.5) * 0.25;
        dummy.position.set(x, 0.7 * h, z);
        dummy.scale.set(1, h, 1);
        dummy.rotation.set(lean, 0, lean);
        dummy.updateMatrix();
        stems.setMatrixAt(ri, dummy.matrix);
        dummy.position.set(x + lean * h * 0.7, 1.35 * h, z - lean * h * 0.7);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        heads.setMatrixAt(ri, dummy.matrix);
      }
    }
    stems.castShadow = true;
    scene.add(stems, heads);

    // lily pads that ride the waves
    const padN = 46;
    const padGeo = new THREE.CircleGeometry(0.42, 12, 0.35, Math.PI * 2 - 0.35);
    padGeo.rotateX(-Math.PI / 2);
    pads = new THREE.InstancedMesh(padGeo, new THREE.MeshStandardMaterial({ color: 0x4E7A3A, roughness: 0.7, side: THREE.DoubleSide }), padN);
    flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xF2D8E4, roughness: 0.6 }), padN);
    let pi = 0;
    while (pi < padN) {
      const a = rnd() * Math.PI * 2;
      const r = 22 + rnd() * 6.5;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.abs(x) < 4 && z > 10) continue;
      padData.push({ x, z, rot: rnd() * Math.PI * 2, s: 0.7 + rnd() * 0.7, flower: rnd() < 0.3 });
      pi++;
    }
    scene.add(pads, flowers);

    for (let i = 0; i < 2; i++) loons.push(makeLoon(i));
  }

  let beam = null;
  let lighthouseLamp = null;
  function buildBigWater(w) {
    const openMat = makeWater(false);
    const chGeo = new THREE.PlaneGeometry(CHANNEL.maxX - CHANNEL.minX + 1, 88, 6, 60);
    chGeo.rotateX(-Math.PI / 2);
    const channel = new THREE.Mesh(chGeo, openMat);
    channel.position.set(0, WATER_Y, -29.6 - 44);
    channel.renderOrder = 1;
    scene.add(channel);
    const ocGeo = new THREE.PlaneGeometry(620, 350, 140, 80);
    ocGeo.rotateX(-Math.PI / 2);
    const ocean = new THREE.Mesh(ocGeo, openMat);
    ocean.position.set(0, WATER_Y, -117.5 - 175);
    ocean.renderOrder = 1;
    scene.add(ocean);
    // sand: a strip that lines the channel bed and banks, and the beach along the big water
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xD6C6A0, roughness: 1 });
    // the sand shares the ground's grid lines, so it sits a hair above it everywhere and never pokes through
    const strip = (x0, x1, z0, z1) => {
      const g = gridGeometry(x0, x1, z0, z1, 0.035, false);
      const m = new THREE.Mesh(g, sandMat);
      m.receiveShadow = true;
      scene.add(m);
    };
    strip(-7, 7, -122, -31);
    strip(GROUND.x0, GROUND.x1, -126, -99);
    // a lighthouse where the channel meets the big water
    const lx = 13;
    const lz = -109;
    const gy = groundHeight(lx, lz);
    const white = new THREE.MeshStandardMaterial({ color: 0xF2EFE6, roughness: 0.7 });
    const red = new THREE.MeshStandardMaterial({ color: 0xB8322A, roughness: 0.7 });
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.35 - i * 0.12 - 0.12, 1.35 - i * 0.12, 2.2, 14), i % 2 ? red : white);
      seg.position.set(lx, gy + 1.1 + i * 2.2, lz);
      seg.castShadow = seg.receiveShadow = true;
      scene.add(seg);
    }
    lighthouseLamp = new THREE.MeshStandardMaterial({ color: 0xFFF2C0, emissive: 0xFFD27A, emissiveIntensity: 1 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12), lighthouseLamp);
    lamp.position.set(lx, gy + 11.6, lz);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.2, 12), red);
    cap.position.set(lx, gy + 12.8, lz);
    scene.add(lamp, cap);
    emissives.push(lighthouseLamp);
    beam = new THREE.Mesh(
      new THREE.ConeGeometry(4, 40, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xFFE9B0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    beam.geometry.translate(0, -20, 0);
    beam.geometry.rotateZ(Math.PI / 2);
    beam.position.set(lx, gy + 11.6, lz);
    scene.add(beam);
    colliders.push({ x: lx, z: lz, r: 1.5 });
  }

  function dirtTexture(ruts) {
    return canvasTex(256, 256, (g, cw, ch) => {
      const r = mulberry32(ruts ? 5 : 9);
      g.fillStyle = '#8E7656';
      g.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 2600; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(66, 48, 30, .32)' : 'rgba(176, 152, 114, .34)';
        g.fillRect(r() * cw, r() * ch, 1 + r() * 3, 1 + r() * 2.5);
      }
      for (let i = 0; i < 110; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(120, 110, 98, .55)' : 'rgba(150, 138, 120, .5)';
        g.beginPath(); g.ellipse(r() * cw, r() * ch, 1.5 + r() * 3, 1 + r() * 2, r() * 3, 0, Math.PI * 2); g.fill();
      }
      if (ruts) {
        for (const rx of [0.3, 0.7]) {
          const gr = g.createLinearGradient((rx - 0.1) * cw, 0, (rx + 0.1) * cw, 0);
          gr.addColorStop(0, 'rgba(58, 42, 26, 0)');
          gr.addColorStop(0.5, 'rgba(58, 42, 26, .5)');
          gr.addColorStop(1, 'rgba(58, 42, 26, 0)');
          g.fillStyle = gr;
          g.fillRect((rx - 0.1) * cw, 0, 0.2 * cw, ch);
        }
        for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(86, 120, 56, .5)'; g.fillRect((0.44 + r() * 0.12) * cw, r() * ch, 1.5, 2 + r() * 4); }
      }
      // soft, ragged edges
      g.globalCompositeOperation = 'destination-in';
      if (ruts) {
        const gr = g.createLinearGradient(0, 0, cw, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.16, 'rgba(0,0,0,1)'); gr.addColorStop(0.84, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      } else {
        const gr = g.createRadialGradient(cw / 2, ch / 2, cw * 0.28, cw / 2, ch / 2, cw * 0.5);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      }
    });
  }

  function roadMesh(pts, width, mat) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    const n = Math.max(6, Math.ceil(curve.getLength() / 1.2));
    const pos = [];
    const uv = [];
    const idx = [];
    const line = [];
    let dist = 0;
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const p = curve.getPoint(i / n);
      const tg = curve.getTangent(i / n);
      const hw = (width / 2) * (1 + 0.07 * Math.sin(i * 0.8 + pts[0][0] * 0.3));
      if (prev) dist += Math.hypot(p.x - prev.x, p.z - prev.z);
      prev = p;
      const nx = -tg.z;
      const nz = tg.x;
      for (const sd of [1, -1]) pos.push(p.x + nx * hw * sd, groundHeight(p.x, p.z) + 0.05, p.z + nz * hw * sd);
      uv.push(0, dist / 6, 1, dist / 6);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      line.push([p.x, p.z]);
      if (i % 2 === 0) roadPts.push([p.x, p.z, width / 2 + 0.4]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    scene.add(mesh);
    roads.push({ pts: line, width });
  }

  // a painted wooden board; `to` is where it points (it ends in an arrow tip), or null for a plain board
  const boardWood = new THREE.MeshStandardMaterial({ color: 0x6B4A2E, roughness: 0.9 });
  const boardCache = new Map();
  function boardFace(text, sub) {
    const key = text + '|' + sub;
    if (boardCache.has(key)) return boardCache.get(key);
    const tex = canvasTex(512, 128, (g, cw, ch) => {
      g.fillStyle = '#6B4A2E';
      g.fillRect(0, 0, cw, ch);
      const r = mulberry32(text.length * 31 + 3);
      for (let y = 4; y < ch; y += 8) { g.strokeStyle = `rgba(40, 24, 12, ${0.16 + r() * 0.16})`; g.beginPath(); g.moveTo(0, y + r() * 3); g.bezierCurveTo(cw * 0.3, y + r() * 4, cw * 0.65, y - r() * 4, cw, y + r() * 3); g.stroke(); }
      g.strokeStyle = '#3A2616'; g.lineWidth = 6; g.strokeRect(5, 5, cw - 10, ch - 10);
      g.fillStyle = '#F6E7BE';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      let size = sub ? 60 : 72;
      g.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
      while (g.measureText(text).width > cw - 60 && size > 28) { size -= 4; g.font = `700 ${size}px Fredoka, system-ui, sans-serif`; }
      g.fillText(text, cw / 2, sub ? ch * 0.4 : ch / 2);
      if (sub) { g.fillStyle = '#D9C493'; g.font = '600 34px Fredoka, system-ui, sans-serif'; g.fillText(sub, cw / 2, ch * 0.78); }
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
    boardCache.set(key, m);
    return m;
  }
  function board(x, y, z, text, to, sub = '') {
    const w = 1.5;
    const g = new THREE.Group();
    const face = boardFace(text, sub);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(w, 0.36, 0.05), [boardWood, boardWood, boardWood, boardWood, face, face]);
    plank.castShadow = true;
    g.add(plank);
    if (to) {
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.255, 0.255, 0.05), boardWood);
      tip.rotation.z = Math.PI / 4;
      tip.position.x = w / 2;
      tip.castShadow = true;
      g.add(tip);
    }
    // the board hangs off the post and points along `to`; a plain board faces the road
    const dx = to ? to[0] - x : 0;
    const dz = to ? to[1] - z : 1;
    const len = Math.hypot(dx, dz) || 1;
    const ang = to ? Math.atan2(-dz / len, dx / len) : 0;
    g.rotation.y = ang;
    const ox = to ? (dx / len) * (w / 2 - 0.12) : 0;
    const oz = to ? (dz / len) * (w / 2 - 0.12) : 0;
    g.position.set(x + ox, y, z + oz);
    scene.add(g);
    return g;
  }
  // boards: [text, [x, z] it points to or null]; the distance from the post is painted under the name
  function signpost(x, z, boards) {
    box(0.14, 2.5, 0.14, 0x4A3322, x, 1.25, z);
    boards.forEach(([text, to], i) => {
      const sub = to ? `${Math.round(Math.hypot(to[0] - x, to[1] - z))} m` : '';
      board(x, 2.3 - i * 0.42, z, text, to, sub);
    });
    colliders.push({ x, z, r: 0.2 });
  }

  function buildRoads(w, kit) {
    const ruts = new THREE.MeshStandardMaterial({ map: dirtTexture(true), roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const flatDirt = new THREE.MeshStandardMaterial({ map: dirtTexture(false), roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    ruts.map.wrapS = THREE.ClampToEdgeWrapping;
    const R = w.shoreRadius + 5.5;
    const gap = 0.26; // the channel breaks the ring at the south
    const arc = (r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [Math.sin(a) * r, Math.cos(a) * r]; });
    const at = (r, a) => [Math.sin(a) * r, Math.cos(a) * r];
    const defs = [
      [3.6, arc(R, -(Math.PI - gap), Math.PI - gap, 40)],
      [4.2, [[0, w.shoreRadius + 2.3], [-0.3, 35.5], [-0.9, 38]]],
      [4, [[-1.2, 49], [-1.35, 53], [-1.35, 57], [-1.2, 60]]],
      [3.6, [at(R, 0.85), [36, 33], [43, 41], [49, 50]]],
      [3.6, [at(R, -0.85), [-36, 33], [-43, 41], [-49, 50]]],
      [3, [[-R, 0], [-(w.shoreRadius + 2.2), 0]]],
      [3.2, [at(R, Math.PI - gap), [9.8, -40], [10.6, -48], [10.2, -58]]],
      [3.2, [at(R, -(Math.PI - gap)), [-9.8, -40], [-10.6, -48], [-10.2, -58]]],
    ];
    defs.forEach(([width, pts]) => roadMesh(pts, width, ruts));
    // the clearing round the fire
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA.r + 1.5, 48), flatDirt);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(PLAZA.x, 0.045, PLAZA.z);
    plaza.receiveShadow = true;
    plaza.renderOrder = 1;
    scene.add(plaza);

    // signposts at the junctions and where the road runs out
    const P = Object.fromEntries(places.map((q) => [q.id, [q.x, q.z]]));
    signpost(-3.8, 34.6, [['Camp', P.camp], ['Dock', P.dock], ['Road Stop', P.stop], ['Old Cabin', P.cabin]]);
    signpost(...at(R - 2.8, 0.78), [['Road Stop', P.stop], ['Camp', P.camp]]);
    signpost(...at(R - 2.8, -0.78), [['Old Cabin', P.cabin], ['Camp', P.camp]]);
    signpost(-(R - 2.8), 3.4, [['Boat ramp', P.ramp], ['Camp', P.camp]]);
    signpost(...at(R - 2.8, Math.PI - gap - 0.12), [['Channel', P.channel], ['Camp', P.camp]]);
    signpost(...at(R - 2.8, -(Math.PI - gap - 0.12)), [['Channel', P.channel], ['Camp', P.camp]]);
    signpost(12.4, -56.5, [['Boats only', null], ['past here', null]]);
    signpost(-12.4, -56.5, [['Boats only', null], ['past here', null]]);
    // lamps round the ring that glow at night
    for (let k = 0; k < 8; k++) {
      const [lx, lz] = at(R + 2.7, -2.6 + k * 0.75);
      lantern(lx, 2.2, lz, false);
    }

    // the boat ramp: a concrete slab running into the water, with two bollards
    const concrete = new THREE.MeshStandardMaterial({ color: 0x9A9A94, roughness: 0.95 });
    box(6.5, 0.14, 4, 0, -(w.lakeRadius + 1.4), 0.12, 0, { mat: concrete, rz: 0.05 });
    for (const bz of [-1.7, 1.7]) box(0.22, 0.5, 0.22, 0x3A3F44, -(w.lakeRadius + 3.8), 0.3, bz);

    // set pieces where the two corner roads end
    const piece = (cx, cz, fx, fz, title, extras) => {
      const ry = Math.atan2(fx, fz);
      if (kit) {
        const barn = kit.prop('barn', 4.4);
        barn.position.set(cx, 0, cz);
        barn.rotation.y = ry + BARN_YAW;
        scene.add(barn);
      } else {
        box(5.6, 3.1, 4.4, 0x6B4A32, cx, 1.55, cz, { ry });
        box(6.4, 0.45, 5.2, 0x3A2418, cx, 3.35, cz, { ry });
      }
      colliders.push({ x: cx, z: cz, r: 3.2 });
      signpost(cx + fx * 6.2 + fz * 3.2, cz + fz * 6.2 - fx * 3.2, [[title, null]]);
      extras(cx, cz, fx, fz);
    };
    const barrel = (x, z) => {
      if (kit) { const b = kit.prop('barrel', 0.9); b.position.set(x, 0, z); scene.add(b); } else box(0.7, 0.9, 0.7, 0x6A4328, x, 0.45, z);
      colliders.push({ x, z, r: 0.5, h: 0.9 });
    };
    const fence = (x, z, ry) => {
      if (kit) { const f = kit.prop('fence', 1.1); f.position.set(x, 0, z); f.rotation.y = ry; scene.add(f); }
      for (let k = -2; k <= 2; k += 1) colliders.push({ x: x + Math.cos(ry) * k, z: z - Math.sin(ry) * k, r: 0.35 });
    };
    piece(51.6, 54.4, -0.55, -0.83, 'Road Stop', (cx, cz) => {
      [[-4.6, -2.3], [-3.7, -3.2], [-5, -3.4]].forEach(([dx, dz]) => barrel(cx + dx, cz + dz));
      box(1.1, 0.9, 1.1, 0x7A5A38, cx - 6.2, 0.45, cz + 0.2);
      box(1, 0.7, 1, 0x6A4A2E, cx - 6.4, 1.25, cz + 0.2);
      fence(cx - 1.5, cz - 6.2, 0.3);
      fence(cx + 4.4, cz - 6.6, 0.1);
    });
    piece(-51.6, 54.4, 0.55, -0.83, 'Old Cabin', (cx, cz) => {
      if (kit) { const well = kit.prop('well', 2.3); well.position.set(cx + 5.2, 0, cz - 4.6); scene.add(well); colliders.push({ x: cx + 5.2, z: cz - 4.6, r: 0.9 }); }
      for (let k = 0; k < 3; k++) box(1.8, 0.28, 0.28, 0x5A3A22, cx + 4.6, 0.16 + k * 0.28, cz + 0.4 + (k % 2) * 0.05, { ry: 0.2 });
      for (let k = 0; k < 2; k++) box(1.8, 0.28, 0.28, 0x6A4A2E, cx + 4.6, 0.3 + k * 0.28, cz + 0.8, { ry: 0.2 });
      fence(cx + 1.5, cz - 6.2, -0.3);
      fence(cx - 4.4, cz - 6.6, -0.1);
    });
  }

  function buildModelScenery(w, kit, rnd, dummy, tint, camp, f) {
    const avoid = (x, z, pad) =>
      nearWaterArea(x, z, pad) ||
      nearRoad(x, z, pad + 0.6) ||
      (Math.abs(x) < 5 && z > 0 && z < 52) ||
      Math.hypot(x - camp.dealer.x, z - camp.dealer.z) < 7 + pad ||
      Math.hypot(x - camp.shack.x, z - camp.shack.z) < 10 + pad ||
      Math.hypot(x - f.x, z - f.z) < 6 + pad ||
      colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + pad);
    const place = (set, i, x, z, s, ry, colors) => {
      dummy.position.set(x, groundHeight(x, z) - 0.05, z);
      dummy.scale.setScalar(s);
      dummy.rotation.set(0, ry, 0);
      dummy.updateMatrix();
      set.set(i, dummy.matrix, colors);
    };

    // shoreline rocks
    const rockSets = [1, 2, 3].map((n) => kit.instanced('rock' + n, 0.7, 16));
    const rockCount = [0, 0, 0];
    for (let i = 0; i < 42; i++) {
      const a = rnd() * Math.PI * 2;
      const r = w.shoreRadius + 0.6 + rnd() * 5;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (Math.abs(x) < 3 && z > 0) continue;
      if (Math.abs(x) < 7 && z < 0) continue;
      if (nearRoad(x, z, 1.2)) continue;
      const k = i % 3;
      if (rockCount[k] >= 16) continue;
      tint.setHSL(0.08, 0.05, 0.75 + rnd() * 0.35);
      const rs = 0.5 + rnd() * 1.4;
      place(rockSets[k], rockCount[k]++, x, z, rs, rnd() * 6.3, { Rock: tint });
      colliders.push({ x, z, r: 0.5 * rs + 0.1, h: 0.62 * rs });
    }
    rockSets.forEach((set, k) => { set.finish(rockCount[k]); scene.add(...set.meshes); });

    // bushes along the shore and the forest edge
    const bushSets = [1, 2, 3].map((n) => kit.instanced('bush' + n, 1.1, 40));
    const bushCount = [0, 0, 0];
    const bark = new THREE.Color(1, 1, 1);
    for (let tries = 0; tries < 900 && bushCount.reduce((a, b) => a + b) < (high ? 105 : 60); tries++) {
      const a = rnd() * Math.PI * 2;
      const r = w.shoreRadius + 3 + rnd() * 30;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (avoid(x, z, 0.8)) continue;
      const k = Math.floor(rnd() * 3);
      if (bushCount[k] >= 40) continue;
      tint.setHSL(0.26 + rnd() * 0.07, 0.42 + rnd() * 0.2, 0.26 + rnd() * 0.1, THREE.SRGBColorSpace);
      place(bushSets[k], bushCount[k]++, x, z, 0.7 + rnd() * 0.8, rnd() * 6.3, { Leaves: tint, Tree: bark });
    }
    bushSets.forEach((set, k) => { set.finish(bushCount[k]); scene.add(...set.meshes); });

    // maples and oaks mixed into the pines, a few already turning for fall
    const mapleSets = [1, 2, 3, 4].map((n) => kit.instanced('maple' + n, 5.5, 30));
    const mapleCount = [0, 0, 0, 0];
    const fall = ['#D9772B', '#C44A28', '#E0A92E', '#B8502A'];
    for (let tries = 0; tries < 1500 && mapleCount.reduce((a, b) => a + b) < (high ? 90 : 48); tries++) {
      const far = rnd() < 0.45;
      const a = rnd() * Math.PI * 2;
      const r = far ? 70 + rnd() * 70 : w.shoreRadius + 8 + rnd() * 34;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (avoid(x, z, 2.2)) continue;
      const k = Math.floor(rnd() * 4);
      if (mapleCount[k] >= 30) continue;
      if (rnd() < 0.3) tint.set(fall[Math.floor(rnd() * fall.length)]);
      else tint.setHSL(0.25 + rnd() * 0.07, 0.45 + rnd() * 0.2, 0.25 + rnd() * 0.1, THREE.SRGBColorSpace);
      const s = 0.75 + rnd() * 0.6;
      place(mapleSets[k], mapleCount[k]++, x, z, s, rnd() * 6.3, { Leaves: tint, Tree: bark });
      if (Math.abs(x) <= w.bounds + 1 && Math.abs(z) <= w.bounds + 1) colliders.push({ x, z, r: 0.4 * s });
    }
    mapleSets.forEach((set, k) => { set.finish(mapleCount[k]); scene.add(...set.meshes); });

    // a rowboat tied to the dock and one pulled up on the beach
    const d = w.dock;
    const moored = kit.prop('boat_row', 0.75);
    const mSize = kit.baked('boat_row', 0.75).size;
    const ms = 3.2 / Math.max(mSize.x, mSize.z);
    moored.scale.setScalar(ms);
    scene.add(moored);
    boats.push({ obj: moored, x: d.maxX + 1.5, z: d.minZ + 5, ry: 0.08, float: true });
    const beached = kit.prop('boat_row', 0.75);
    beached.scale.setScalar(ms);
    const ba = 2.5;
    beached.position.set(Math.sin(ba) * (w.shoreRadius + 0.6), 0.05, Math.cos(ba) * (w.shoreRadius + 0.6));
    beached.rotation.set(0.05, ba + 0.4, 0.12);
    scene.add(beached);
    colliders.push({ x: beached.position.x, z: beached.position.z, r: 1.2, h: 0.55 });

    // the old well and a split-rail fence behind camp
    const well = kit.prop('well', 2.3);
    well.position.set(camp.dealer.x - 5.5, 0, camp.dealer.z + 5.5);
    well.rotation.y = 0.5;
    scene.add(well);
    colliders.push({ x: well.position.x, z: well.position.z, r: 0.9 });
    solids.push({ x: well.position.x, z: well.position.z, r: 0.9, h: 2.3 });
    const fenceZ = camp.fire.z + 8.5;
    for (let x = -22; x < 20; x += 5.9) {
      if (Math.abs(x + 4.3) < 0.05) continue; // the gate: the north road runs through here
      const fence = kit.prop('fence', 1.1);
      fence.position.set(x + 2.95, 0, fenceZ + Math.sin(x) * 0.25);
      fence.rotation.y = Math.sin(x * 0.7) * 0.05;
      scene.add(fence);
      for (let k = 0; k < 6; k++) colliders.push({ x: x + k, z: fenceZ, r: 0.35 });
    }
  }

  function makeLoon(i) {
    const g = new THREE.Group();
    const black = new THREE.MeshStandardMaterial({ color: 0x141818, roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: 0xE8ECEA, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), black);
    body.scale.set(0.9, 0.55, 1.6);
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6), new THREE.MeshStandardMaterial({ color: 0x2A3030, roughness: 0.6 }));
    back.scale.set(0.8, 0.4, 1.3);
    back.position.y = 0.1;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.35, 8), black);
    neck.position.set(0, 0.25, 0.42);
    neck.rotation.x = 0.4;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 6, 12), white);
    band.position.set(0, 0.28, 0.44);
    band.rotation.x = Math.PI / 2 + 0.4;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), black);
    head.position.set(0, 0.42, 0.55);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 6), new THREE.MeshStandardMaterial({ color: 0x1E2222 }));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.41, 0.74);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), new THREE.MeshBasicMaterial({ color: 0xB02020 }));
    eye.position.set(0.09, 0.45, 0.6);
    g.add(body, back, neck, band, head, beak, eye);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    const a = i * 2.4 + 0.8;
    return { g, x: Math.sin(a) * 14, z: Math.cos(a) * 14, heading: a, dive: 0, under: 0, nextDive: 20 + Math.random() * 30, sink: 0 };
  }

  function lerpKeys(hour) {
    let a = DAY_KEYS[0];
    let b = DAY_KEYS[1];
    for (let i = 0; i < DAY_KEYS.length - 1; i++) {
      if (hour >= DAY_KEYS[i].h && hour <= DAY_KEYS[i + 1].h) { a = DAY_KEYS[i]; b = DAY_KEYS[i + 1]; break; }
    }
    const f = b.h > a.h ? (hour - a.h) / (b.h - a.h) : 0;
    day.top.copy(a.top).lerp(b.top, f);
    day.horizon.copy(a.hor).lerp(b.hor, f);
    day.fog.copy(a.fog).lerp(b.fog, f);
    day.light.copy(a.light).lerp(b.light, f);
    day.sun = a.sun + (b.sun - a.sun) * f;
    day.hemi = a.hemi + (b.hemi - a.hemi) * f;
    day.night = a.night + (b.night - a.night) * f;
  }

  // focus is where the player (or the camera) is, so shadows stay sharp there
  const STORM = { top: new THREE.Color(0x5B6772), hor: new THREE.Color(0x8C979E), fog: new THREE.Color(0x7B878E) };
  const tmpStorm = new THREE.Color();
  // wet: 0 (clear) to 1 (storm) dims the sun, greys the sky, and pulls the fog in
  function update(dt, t, hour, focus, events, wet = 0) {
    day.hour = hour;
    day.golden = isGoldenHour(hour);
    lerpKeys(hour);
    const sa = ((hour - 6) / 12) * Math.PI;
    sunDir.set(-Math.cos(sa), Math.sin(sa), 0.35).normalize();
    const ma = ((hour - 18) / 12) * Math.PI;
    moonDir.set(-Math.cos(ma), Math.sin(ma), -0.3).normalize();
    const daytime = hour >= 5.5 && hour < 20.5;
    const lightDir = daytime ? sunDir : moonDir;
    tmpV.copy(lightDir);
    if (tmpV.y < 0.18) { tmpV.y = 0.18; tmpV.normalize(); }
    sun.position.copy(focus).addScaledVector(tmpV, 70);
    sun.target.position.copy(focus);
    sun.color.copy(day.light);
    sun.intensity = day.sun * (1 - 0.72 * wet);
    hemi.intensity = day.hemi * (1 - 0.34 * wet);
    hemi.color.copy(day.top).lerp(day.horizon, 0.5).lerp(WHITE, 0.35);
    if (wet > 0.01) hemi.color.lerp(tmpStorm.copy(STORM.hor).multiplyScalar(1 - day.night * 0.85), wet * 0.7);
    fill.intensity = 0.4 * (1 - day.night * 0.6);

    skyU.uTop.value.copy(day.top);
    skyU.uHorizon.value.copy(day.horizon);
    skyU.uSunDir.value.copy(sunDir);
    skyU.uGlow.value = Math.max(0, 1 - day.night * 1.2);
    skyU.uTime.value = t;
    skyU.uCloud.value.copy(day.horizon).lerp(WHITE, 0.72 * (1 - day.night)).multiplyScalar(1 - day.night * 0.62);
    const dark = 1 - day.night * 0.85;
    if (wet > 0.01) {
      skyU.uTop.value.lerp(tmpStorm.copy(STORM.top).multiplyScalar(dark), wet * 0.85);
      skyU.uHorizon.value.lerp(tmpStorm.copy(STORM.hor).multiplyScalar(dark), wet * 0.85);
      skyU.uCloud.value.lerp(tmpStorm.copy(STORM.fog).multiplyScalar(dark * 0.9), wet * 0.8);
      skyU.uGlow.value *= 1 - wet * 0.95;
    }
    grassTime.value = t;
    if (birdFlock) {
      birdFlock.visible = day.night < 0.6 && wet < 0.5;
      if (birdFlock.visible) {
        for (let i = 0; i < 14; i++) {
          const ang = t * (0.09 + (i % 3) * 0.01) + i * 0.55;
          const rad = 55 + (i % 4) * 9;
          const cx = Math.sin(t * 0.017) * 14;
          const cz = Math.cos(t * 0.013) * 14;
          birdDummy.position.set(cx + Math.sin(ang) * rad, 38 + (i % 3) * 7 + Math.sin(t * 0.4 + i) * 2.5, cz + Math.cos(ang) * rad);
          birdDummy.rotation.set(Math.sin(t * 6 + i * 2) * 0.12, ang + Math.PI / 2, Math.sin(ang * 2) * 0.2);
          const flap = 0.7 + 0.3 * Math.sin(t * 8 + i * 1.7);
          birdDummy.scale.set(2.4 * flap, 2.4, 2.4);
          birdDummy.updateMatrix();
          birdFlock.setMatrixAt(i, birdDummy.matrix);
        }
        birdFlock.instanceMatrix.needsUpdate = true;
      }
    }
    sky.position.copy(camera.position);
    stars.position.copy(camera.position);
    starMat.opacity = Math.max(0, day.night - 0.2) * 1.2;
    stars.rotation.y = t * 0.004;
    moon.position.copy(camera.position).addScaledVector(moonDir, 250);
    moon.visible = moonDir.y > -0.05;
    moon.material.opacity = 0.35 + day.night * 0.65;
    scene.fog.color.copy(day.fog);
    if (wet > 0.01) scene.fog.color.lerp(tmpStorm.copy(STORM.fog).multiplyScalar(dark), wet * 0.85);
    scene.fog.near = 75 * (1 - 0.55 * wet);
    scene.fog.far = 210 * (1 - 0.5 * wet);

    waterU.uTime.value = t;
    waterU.uSky.value.copy(day.horizon).lerp(day.top, 0.35);
    waterU.uDeep.value.copy(WATER_DAY.deep).lerp(WATER_NIGHT.deep, day.night);
    waterU.uShallow.value.copy(WATER_DAY.shallow).lerp(WATER_NIGHT.shallow, day.night);
    waterU.uSunDir.value.copy(daytime ? sunDir : moonDir);
    waterU.uSunColor.value.copy(day.light).multiplyScalar((daytime ? Math.min(1, day.sun / 2) : 0.35) * (1 - 0.85 * wet));
    waterU.uFogColor.value.copy(scene.fog.color);
    waterU.uFogNear.value = scene.fog.near;
    waterU.uFogFar.value = scene.fog.far;
    waterU.uNight.value = day.night;

    const glow = Math.max(0.12, day.night * 1.4 + (day.golden ? 0.2 : 0));
    emissives.forEach((mat) => { mat.emissiveIntensity = glow * 1.6; });
    lights.forEach(({ light, max }) => { light.intensity = max * Math.max(0, day.night - 0.1); });
    if (fireLight) fireLight.intensity = (1.2 + day.night * 5) * (0.82 + Math.sin(t * 17) * 0.06 + Math.sin(t * 7.3) * 0.08 + Math.random() * 0.06);

    if (pads) {
      padData.forEach((p, i) => {
        const y = WATER_Y + wave(p.x, p.z, t) + 0.04;
        tmpQ.setFromAxisAngle(UP, p.rot + Math.sin(t * 0.3 + i) * 0.05);
        tmpS.setScalar(p.s);
        tmpM.compose(tmpV.set(p.x, y, p.z), tmpQ, tmpS);
        pads.setMatrixAt(i, tmpM);
        tmpS.setScalar(p.flower ? 1 : 0.0001);
        tmpM.compose(tmpV.set(p.x + 0.1 * p.s, y + 0.06, p.z + 0.08 * p.s), tmpQ, tmpS);
        flowers.setMatrixAt(i, tmpM);
      });
      pads.instanceMatrix.needsUpdate = true;
      flowers.instanceMatrix.needsUpdate = true;
    }
    if (beam) {
      beam.rotation.y = t * 0.6;
      beam.material.opacity = Math.max(0, day.night - 0.2) * 0.1;
    }
    for (const b of boats) {
      if (!b.float) continue;
      b.obj.position.set(b.x, WATER_Y + wave(b.x, b.z, t) - 0.12, b.z);
      b.obj.rotation.set(Math.sin(t * 0.9 + b.x) * 0.04, b.ry + Math.sin(t * 0.3) * 0.04, Math.cos(t * 1.1) * 0.05);
    }
    updateLoons(dt, t, events);
  }

  function updateLoons(dt, t, events) {
    for (const l of loons) {
      if (l.under > 0) {
        l.under -= dt;
        l.g.visible = false;
        if (l.under <= 0) {
          const a = Math.random() * Math.PI * 2;
          const r = 6 + Math.random() * 16;
          l.x = Math.sin(a) * r;
          l.z = Math.cos(a) * r;
          if (Math.abs(l.x) < 4 && l.z > 10) l.x += 8;
          l.sink = 0.5;
          l.g.visible = true;
          events.ripple(l.x, l.z, 1.2);
        }
        continue;
      }
      l.nextDive -= dt;
      if (l.nextDive <= 0 && l.dive <= 0) { l.dive = 0.6; l.nextDive = 25 + Math.random() * 35; }
      if (l.dive > 0) {
        l.dive -= dt;
        l.sink = Math.min(0.6, l.sink + dt);
        if (l.dive <= 0) { l.under = 3 + Math.random() * 5; events.ripple(l.x, l.z, 1); }
      } else if (l.sink > 0) l.sink = Math.max(0, l.sink - dt * 0.8);
      l.heading += Math.sin(t * 0.21 + l.x) * 0.25 * dt;
      const r = Math.hypot(l.x, l.z);
      if (r > 24) l.heading += (((Math.atan2(-l.x, -l.z) - l.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * dt * 1.2;
      if (Math.abs(l.x) < 5 && l.z > 11) l.heading += dt * 1.5;
      l.x += Math.sin(l.heading) * 0.55 * dt;
      l.z += Math.cos(l.heading) * 0.55 * dt;
      l.g.position.set(l.x, WATER_Y + wave(l.x, l.z, t) - 0.1 - l.sink, l.z);
      l.g.rotation.set(Math.sin(t * 1.1 + l.x) * 0.04, l.heading, 0);
    }
  }

  // push a circle of radius pr out of any collider. Low ones (with a top height h) only block you if your
  // feet are more than a step below their top, so you can hop up onto them.
  const STEP = 0.3;
  function collide(pos, pr, feet = 0) {
    for (const c of colliders) {
      if (c.h !== undefined && feet >= c.h - STEP) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const min = c.r + pr;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x = c.x + (dx / d) * min;
        pos.z = c.z + (dz / d) * min;
      }
    }
  }

  // how high the ground is under (x, z) for someone whose feet are at height `feet`: the top of the tallest
  // low object they are over and can stand on, or 0
  function platformAt(x, z, feet) {
    let top = 0;
    for (const c of colliders) {
      if (c.h === undefined || c.h <= top || feet < c.h - STEP) continue;
      if ((x - c.x) ** 2 + (z - c.z) ** 2 <= c.r * c.r) top = c.h;
    }
    return top;
  }

  // true if a point sits inside a building, so the camera can pull in
  function blocked(x, y, z) {
    for (const b of solids) if (y < b.h && (x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return true;
    return false;
  }

  return { build, update, collide, platformAt, blocked, day, firePos, loons, sunDir, roads, plaza: PLAZA, places, onRoad: (x, z) => nearRoad(x, z, 0) };
}
