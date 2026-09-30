// Loon Lake client.
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { initTouch } from './touch.js';
import { createWorld, makeLabel, wave, WATER_Y, DOCK_Y, isNightHour, isGoldenHour, groundHeight } from './world.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createFx } from './fx.js';
import { groundMove, airMove, nextHopBoost, FEEL } from './movement.js';
import { loadModels, LOOKS, SKINS, aimBone } from './models.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ================================================================ basics

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const fmtTime = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtHour = (h) => {
  const hh = Math.floor(h);
  const mm = Math.floor(((h - hh) * 60) / 10) * 10;
  const ap = hh >= 12 ? 'pm' : 'am';
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`;
};

function makeToken() {
  const a = new Uint8Array(18);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}
let token = store.get('loonlake.token', null);
if (!/^[A-Za-z0-9_-]{16,64}$/.test(token || '')) {
  token = makeToken();
  store.set('loonlake.token', token);
}

const settings = { sens: 1, volume: 0.8, bright: 0.8, invertY: false, shake: true, quality: 'auto', blood: true, ...store.get('loonlake.settings', {}) };
sfx.setVolume(settings.volume);

const isTouch = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
if (isTouch) document.body.classList.add('touch');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const TUNING = {
  camDist: 7.5, camMin: 3.5, camMax: 16, aimDist: 3.1,
  castCharge: 0.85,
  reelRate: 0.26, reelDecay: 0.03, tensionUp: 0.35, tensionDown: 0.9, redline: 0.72,
  look: 0.0024, touchLook: 0.0058,
};
const LINE_PTS = 20;
const RARITY_COLOR = {
  common: '#7F9A8F', uncommon: '#4FA3A5', rare: '#3E7CC9', epic: '#9B6FC2',
  legendary: '#D8961B', junk: '#8A7E6E', treasure: '#4E9A48',
};
const RARITY_LABEL = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic',
  legendary: 'Legendary', junk: 'Junk', treasure: 'Treasure',
};
const RARITY_RANK = { junk: 0, common: 1, uncommon: 2, treasure: 3, rare: 3, epic: 4, legendary: 5 };
const DRUGS = ['weed', 'whiskey', 'crank'];
const DRUG_INFO = {
  weed: 'Calms the reel and fish bite sooner. Slows your feet and your aim.',
  whiskey: 'Sways the camera and makes the line jumpy. Cheap courage.',
  crank: 'Faster feet and a steadier rifle. Fish fight harder.',
};
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['\u2660', '\u2665', '\u2666', '\u2663'];
const HAND_TEXT = {
  blackjack: 'Blackjack. Pays 3 to 2.',
  push: 'Push. Your bet comes back.',
  win: 'You win the hand.',
  lose: 'Inez takes it.',
  bust: 'Bust.',
};
const GOALS = [
  { id: 'cast', text: 'Hold left click to charge a cast, aim at the water, and let go.', touch: 'Hold Cast, aim at the water, and let go.' },
  { id: 'land', text: 'When the bobber dunks, click. Then hold left click to reel and ease off before the red line.', touch: 'When the bobber dunks, tap Hook. Hold Reel and ease off before the red line.' },
  { id: 'sell', text: 'Walk to Moss (the M on your map) and press E to sell your bag.', touch: 'Walk to Moss (the M on your map) and tap Use to sell your bag.' },
  { id: 'gear', text: 'Buy better bait or a longer rod from Moss. Better bait draws bigger fish.' },
  { id: 'hot', text: 'Land a fish from a hot spot. Look for bubbles on the water, or gold rings on your map.' },
  { id: 'derby', text: 'Land a fish during a derby. The heaviest one when the horn blows takes the pot.' },
];

// ================================================================ renderer

// auto means high on computers and low on phones; phones can still opt into high
const quality = () => (settings.quality === 'auto' ? (isTouch ? 'low' : 'high') : settings.quality);
const pixelRatio = () => Math.min(devicePixelRatio, quality() === 'high' ? (isTouch ? 1.75 : 2) : 1.25);
const loadQuality = quality();
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // set from the Brightness setting below
$('game').append(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 22, 55);
const world = createWorld(scene, renderer, camera, { isTouch, high: loadQuality === 'high' });
const fx = createFx(scene, camera);

// post: bloom makes the fire, lanterns, sun glints, and sparkles glow, then a soft vignette frames it
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.45, 0.93);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const vignette = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(d * vec2(1.1, 1.0)));
      c.rgb *= mix(1.0 - uStrength, 1.0, v);
      c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.96), 0.6);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.2);
      c.rgb = (c.rgb - 0.5) * 1.1 + 0.5;
      gl_FragColor = c;
    }`,
});
composer.addPass(vignette);
function applyBrightness() { renderer.toneMappingExposure = settings.bright; }
applyBrightness();
function applyQuality() {
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(pixelRatio());
  composer.setSize(innerWidth, innerHeight);
}
applyQuality();
if (location.search.includes('debug')) window.__loon = { renderer, scene, camera, world, THREE };

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyQuality();
});

// ================================================================ state

// the model kit loads while the join screen is up; if it fails the game still runs with the old blocky people
let kit = null;
const joinLabel = $('joinBtn').textContent;
$('joinBtn').disabled = true;
$('joinBtn').textContent = 'Loading the lake';
const modelsReady = loadModels((f) => { $('joinBtn').textContent = `Loading the lake, ${Math.round(f * 100)}%`; })
  .then((k) => { kit = k; return k; })
  .catch((err) => { console.warn('Models failed to load, using simple shapes.', err); return null; })
  .finally(() => { $('joinBtn').disabled = false; $('joinBtn').textContent = joinLabel; });

const socket = io();
let W = null;
let speciesById = {};
let myId = null;
let myData = null;
let joinInfo = null;
let chosenColor = store.get('loonlake.color', null);
let chosenLook = store.get('loonlake.look', LOOKS.length);
let chosenSkin = store.get('loonlake.skin', 1);
let journal = {};
let hotspots = [];
let derbyState = null;
let clockHour = 9;
let clockInit = false;
const views = new Map();
const npcViews = new Map();
const fishViews = new Map();
const pickupViews = new Map();
const leaps = [];

let phase = 'idle';
let power = 0;
let powerDir = 1;
let holdFish = false;
let lmbFish = false;
let lmbHeld = false;
let aimDist = 0;
let jumpY = 0;
let jumpV = 0;
const vel = { x: 0, z: 0 };
let hopBoost = 1;
let landedAt = -9;
let curMax = 6;
const JUMP_V = 9.4; // about 1.5 m up, 0.6 s in the air: snappy like Roblox
const JUMP_G = 30;
let jumpBufferAt = -9;

let reel = null;
let castSwing = 0;
let nibbleAt = 0;
let nibble = 0;
let table = { active: false };
let openPanel = null;
let chatOpen = false;
let flash = null;
let audioT = 0;
let nextShotAt = 0;
let hurtT = 0;
let deathUntil = 0;
let aimRot = 0;
let castInfo = { valid: false, hot: false };
const cam = { yaw: 0, pitch: 0.34, dist: TUNING.camDist, aim: 0, shake: 0 };
if (window.__loon) Object.assign(window.__loon, { cam, vel, fishViews: () => fishViews, makeFish, species: () => speciesById, hold: (h) => { held = h; hotbarSig = ''; }, data: () => myData, me: () => views.get(myId), npcViews: () => npcViews, ragStep: (id, n) => { const v = npcViews.get(id) || views.get(id); for (let i = 0; v && v.rag && i < n; i++) stepRagdoll(v, 1 / 60, audioT); } });
let pointerLocked = false;
// automated browsers can't hold pointer lock (it also blocks screenshots), so they use drag-to-look
let noLock = isTouch || !!navigator.webdriver;
let lockFromClick = false;
let aimHeld = false;
let orbitDrag = null;
const keys = new Set();
let touch = null;
const me = () => views.get(myId);
const alive = () => !myData || myData.alive !== false;

const onDock = (x, z) => W && x >= W.dock.minX && x <= W.dock.maxX && z >= W.dock.minZ && z <= W.dock.maxZ;
const inChannel = (x, z, m = 0) => W && x >= W.channel.minX - m && x <= W.channel.maxX + m && z >= W.channel.minZ - m && z <= W.channel.maxZ + m;
const inOcean = (x, z) => W && x > W.ocean.minX && x < W.ocean.maxX && z > W.ocean.minZ && z < W.ocean.maxZ;
const onLand = (x, z) => onDock(x, z) || (Math.hypot(x, z) >= W.shoreRadius && Math.abs(x) <= W.bounds && Math.abs(z) <= W.bounds && !inChannel(x, z, 0.8));
const inWater = (x, z) => W && !onDock(x, z) && (Math.hypot(x, z) < W.lakeRadius - 0.3 || inChannel(x, z) || inOcean(x, z));
// where a body or boat rests: water surface, dock planks, or the ground
const surfaceAt = (x, z, t) => (inWater(x, z) ? WATER_Y + wave(x, z, t) : onDock(x, z) ? DOCK_Y : groundHeight(x, z));
const isGun = (h) => !!(W && W.guns && W.guns[h]);
const gunOf = (h) => (W && W.guns ? W.guns[h] : null);
// a gun's stats once its attachments are on (mirrors the server)
function effGun(id) {
  const base = gunOf(id);
  if (!base) return null;
  const a = (myData && myData.att && myData.att[id]) || {};
  const A = W.attachments;
  let { mag, reload, cooldown, spread, auto } = base;
  if (a.drum) { mag = Math.round(mag * A.drum.magMul); reload += A.drum.reloadAdd; }
  if (a.switch) { cooldown = Math.round(cooldown * A.switch.cooldownMul); spread *= A.switch.spreadMul; auto = true; }
  if (a.laser) spread *= A.laser.spreadMul;
  const level = (myData && myData.glvl && myData.glvl[id]) || 0;
  return { ...base, mag, reload, cooldown, spread, auto, level, damage: base.damage * W.gunLevels.mul[level] };
}
const ownsGun = (h) => !!(myData && myData.guns && myData.guns[h]);
const footOk = (x, z) => onLand(x, z) || inWater(x, z) || inChannel(x, z, 0.8) || Math.hypot(x, z) < W.shoreRadius;
fx.setFloor((x, z) => surfaceAt(x, z, audioT), (x, z) => inWater(x, z));
const boating = () => !!(myData && myData.boat);
const near = (m, spot) => W && m && spot && Math.hypot(m.x - spot.x, m.z - spot.z) <= W.camp.range;
const hotAt = (x, z) => hotspots.some((h) => Math.hypot(x - h.x, z - h.z) <= h.r);

// ================================================================ meshes

const GEO = {
  body: new THREE.CapsuleGeometry(0.32, 0.55, 4, 10),
  leg: new THREE.CapsuleGeometry(0.11, 0.38, 3, 8),
  arm: new THREE.CapsuleGeometry(0.08, 0.36, 3, 8),
  head: new THREE.SphereGeometry(0.24, 16, 12),
  brim: new THREE.CylinderGeometry(0.4, 0.4, 0.045, 16),
  crown: new THREE.CylinderGeometry(0.2, 0.26, 0.22, 16),
  boot: new THREE.BoxGeometry(0.16, 0.08, 0.28),
  rod: new THREE.CylinderGeometry(0.012, 0.028, 2.5, 6),
  barrel: new THREE.CylinderGeometry(0.025, 0.03, 0.72, 8),
  stock: new THREE.BoxGeometry(0.06, 0.1, 0.32),
  scope: new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8),
  mark: new THREE.SphereGeometry(0.08, 8, 6),
  bud: new THREE.SphereGeometry(0.08, 8, 6),
  hand: new THREE.SphereGeometry(0.095, 12, 10),
  eye: new THREE.SphereGeometry(0.032, 8, 6),
  belt: new THREE.CylinderGeometry(0.335, 0.335, 0.07, 18),
  nose: new THREE.SphereGeometry(0.05, 8, 6),
  bottle: new THREE.CylinderGeometry(0.045, 0.05, 0.22, 8),
  pack: new THREE.BoxGeometry(0.12, 0.05, 0.16),
};
const MAT = {
  skin: new THREE.MeshStandardMaterial({ color: 0xE2B48C, roughness: 0.65 }),
  hat: new THREE.MeshStandardMaterial({ color: 0x4B5A3A, roughness: 0.8 }),
  boot: new THREE.MeshStandardMaterial({ color: 0x2C241C, roughness: 0.9 }),
  pants: new THREE.MeshStandardMaterial({ color: 0x34405A, roughness: 0.85 }),
  belt: new THREE.MeshStandardMaterial({ color: 0x3A2A1C, roughness: 0.6 }),
  eye: new THREE.MeshBasicMaterial({ color: 0x1A1512 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x2C3034, roughness: 0.35, metalness: 0.55 }),
  stock: new THREE.MeshStandardMaterial({ color: 0x6A4328, roughness: 0.7 }),
};

function limb(geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function makeHpBar() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 18;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  sprite.scale.set(0.9, 0.127, 1);
  sprite.position.y = 2.2;
  sprite.visible = false;
  sprite.renderOrder = 5;
  return { sprite, c, tex, last: -1 };
}

function drawHp(bar, hp) {
  if (bar.last === hp) return;
  bar.last = hp;
  const g = bar.c.getContext('2d');
  g.clearRect(0, 0, 128, 18);
  g.fillStyle = 'rgba(16, 34, 30, .82)';
  g.beginPath(); g.roundRect(0, 0, 128, 18, 9); g.fill();
  g.fillStyle = hp > 50 ? '#6DBF67' : hp > 25 ? '#F2B134' : '#E0452B';
  g.beginPath(); g.roundRect(3, 3, Math.max(4, 122 * hp / 100), 12, 6); g.fill();
  bar.tex.needsUpdate = true;
}

function makeBubble(text) {
  const k = 2;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `500 ${21 * k}px Fredoka, system-ui, sans-serif`;
  g.font = font;
  const maxW = 250 * k;
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? line + ' ' + word : word;
    if (g.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > 3) { lines.length = 3; lines[2] += '…'; }
  const lh = 27 * k;
  const w = Math.min(maxW, Math.max(...lines.map((l) => g.measureText(l).width))) + 28 * k;
  const tail = 12 * k;
  const h = lines.length * lh + 18 * k + tail;
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  g.font = font;
  g.fillStyle = 'rgba(238, 242, 236, .96)';
  g.beginPath(); g.roundRect(0, 0, w, h - tail, 14 * k); g.fill();
  g.beginPath(); g.moveTo(w / 2 - 9 * k, h - tail); g.lineTo(w / 2, h); g.lineTo(w / 2 + 9 * k, h - tail); g.fill();
  g.fillStyle = '#1D2A25';
  g.textAlign = 'center';
  g.textBaseline = 'top';
  lines.forEach((l, i) => g.fillText(l, w / 2, 10 * k + i * lh));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  const worldH = (h / k) * 0.0105;
  sprite.scale.set(worldH * (c.width / c.height), worldH, 1);
  sprite.center.set(0.5, 0);
  sprite.position.y = 2.72;
  sprite.renderOrder = 6;
  return sprite;
}

// NPCs get fixed looks so they're recognizable
const NPC_LOOKS = { dealer: [1, 3], boss: [3, 4], 'angler-1': [0, 1], 'angler-2': [1, 0], 'angler-3': [2, 2], 'angler-4': [0, 5] };

function makeAvatar(color, name, look = 0, skin = 0) {
  if (kit && look < LOOKS.length) return makeModelAvatar(color, name, look, skin);
  return makeBlockAvatar(color, name, skin);
}

function makeModelAvatar(color, name, look, skin) {
  const group = new THREE.Group();
  const model = kit.character(look, color, SKINS[skin] || SKINS[0]);
  group.add(model.group);
  const hat = new THREE.Group();
  hat.add(limb(GEO.brim, MAT.hat, 0, 0, 0), limb(GEO.crown, MAT.hat, 0, 0.12, 0));
  hat.scale.setScalar(0.62);
  const pivot = new THREE.Group();
  const rodMat = new THREE.MeshStandardMaterial({ color: 0xC9A36A, roughness: 0.5, metalness: 0.15 });
  const rod = new THREE.Mesh(GEO.rod, rodMat);
  rod.position.y = 1.25;
  rod.castShadow = true;
  const tip = new THREE.Object3D();
  tip.position.y = 2.5;
  pivot.add(rod, tip);
  const rifle = new THREE.Group();
  const gun = kit.prop('rifle', 0.2);
  const gs = kit.baked('rifle', 0.2).size;
  gun.scale.setScalar(1.05 / Math.max(gs.z, gs.x));
  gun.position.set(0, -0.02, 0.28);
  rifle.add(gun);
  rifle.visible = false;
  const hand = new THREE.Group();
  const weed = new THREE.Mesh(GEO.bud, new THREE.MeshStandardMaterial({ color: 0x6DBF67, roughness: 0.55 }));
  const whiskey = new THREE.Mesh(GEO.bottle, new THREE.MeshStandardMaterial({ color: 0xC47A32, roughness: 0.32, metalness: 0.08 }));
  const crank = new THREE.Mesh(GEO.pack, new THREE.MeshStandardMaterial({ color: 0xF4F1EA, roughness: 0.4 }));
  weed.name = 'weed'; whiskey.name = 'whiskey'; crank.name = 'crank';
  hand.add(weed, whiskey, crank);
  hand.visible = false;
  const highMark = new THREE.Mesh(GEO.mark, new THREE.MeshBasicMaterial({ color: 0x6DBF67 }));
  highMark.position.set(0.3, 1.95, 0);
  highMark.visible = false;
  const label = makeLabel(name);
  label.position.y = 2.32;
  const hp = makeHpBar();
  hp.sprite.position.y = 2.08;
  group.add(hat, pivot, rifle, hand, highMark, label, hp.sprite);
  return {
    group, model, hat, body: new THREE.Object3D(), pivot, tip, rifle, hand, highMark, label, hp,
    cloth: model.flashMat, rodMat, limbs: null, bubble: null, bubbleUntil: 0, flash: 0, punchT: 1, punchSide: 'r', punchHeavy: false, speed: 0,
  };
}

const tmpHand = new THREE.Vector3();
const tmpHead = new THREE.Vector3();
// drive the model: pick a clip, advance it, bend arms around what's in hand, then pin the rod, rifle, and hat
function animateModel(v, dt, moving, fast, pose, aliveNow, sit) {
  const ch = v.model;
  if (v.rag) {
    // the ragdoll event can beat the snapshot that marks them dead, so only stand back up after a real respawn
    if (!aliveNow) v.rag.sawDead = true;
    if (aliveNow && (v.rag.sawDead || v.rag.t > 3)) { v.rag = null; ch.play('idle', 0); } else {
      stepRagdoll(v, dt, audioT);
      v.hat.visible = false;
      v.pivot.visible = v.rifle.visible = v.hand.visible = false;
      return;
    }
  }
  if (!aliveNow) ch.play('death', 0.15);
  else if (sit) ch.play('idle');
  else if (audioT < ch.punchUntil) { /* the punch clip is playing */ }
  else if (moving) {
    ch.play(fast || v.speed > 4 ? 'run' : 'walk');
    const a = ch.actions[fast || v.speed > 4 ? 'run' : 'walk'];
    if (a) a.timeScale = clamp(v.speed / (fast || v.speed > 4 ? 6 : 2.2), 0.6, 1.6);
  } else ch.play('idle');
  ch.mixer.update(dt);
  v.group.updateMatrixWorld(true);
  if (aliveNow && audioT >= ch.punchUntil && pose !== 'idle') ch.aimArms(pose, v.group.quaternion);
  if (aliveNow && sit) ch.sit(v.group.quaternion);
  v.group.updateMatrixWorld(true);
  ch.handWorld(tmpHand);
  v.group.worldToLocal(tmpHand);
  v.pivot.position.copy(tmpHand);
  v.rifle.position.copy(tmpHand);
  v.hand.position.copy(tmpHand);
  ch.headWorld(tmpHead);
  v.group.worldToLocal(tmpHead);
  v.hat.position.set(tmpHead.x, tmpHead.y + 0.19, tmpHead.z + 0.01);
  v.hat.visible = aliveNow;
}

const RAG_BONES = ['Hips', 'Neck', 'Head', 'UpperArmL', 'LowerArmL', 'PalmL', 'UpperArmR', 'LowerArmR', 'PalmR', 'UpperLegL', 'LowerLegL', 'FootL', 'UpperLegR', 'LowerLegR', 'FootR'];
const RAG_LINKS = [[0, 1], [1, 2], [1, 3], [1, 6], [3, 6], [3, 4], [4, 5], [6, 7], [7, 8], [0, 9], [0, 12], [9, 12], [9, 10], [10, 11], [12, 13], [13, 14],
  [3, 9], [6, 12], [3, 12], [6, 9], [2, 3], [2, 6], [0, 3], [0, 6]];
const ragTmp = new THREE.Vector3();

function startRagdoll(v, dx, dz, force) {
  if (!v || !v.model || v.rag) return;
  const root = v.model.root;
  v.group.updateMatrixWorld(true);
  const bones = RAG_BONES.map((n) => root.getObjectByName(n));
  if (bones.some((b) => !b)) return;
  const P = bones.map((b, i) => {
    const p = b.getWorldPosition(new THREE.Vector3());
    if (i === 2) p.y += 0.18;
    return { p, o: p.clone() };
  });
  const links = RAG_LINKS.map(([a, b]) => [a, b, P[a].p.distanceTo(P[b].p)]);
  const h = 1 / 60;
  P.forEach((q, i) => {
    const upper = i === 1 || i === 2 || (i >= 3 && i <= 8) ? 1 : 0.55;
    q.o.x -= dx * force * upper * h + (Math.random() - 0.5) * 0.02;
    q.o.z -= dz * force * upper * h + (Math.random() - 0.5) * 0.02;
    q.o.y -= (1.6 + Math.random()) * h * upper;
  });
  v.rag = { P, links, bones, t: 0, pooled: false };
  v.model.mixer.stopAllAction();
}

function stepRagdoll(v, dt, t) {
  const R = v.rag;
  R.t += dt;
  const h = Math.min(dt, 1 / 30);
  const settle = R.t > 6 ? 0.9 : 0.985;
  for (const q of R.P) {
    const vx = (q.p.x - q.o.x) * settle;
    const vy = (q.p.y - q.o.y) * settle;
    const vz = (q.p.z - q.o.z) * settle;
    q.o.copy(q.p);
    q.p.x += vx;
    q.p.y += vy - 14 * h * h;
    q.p.z += vz;
  }
  for (let it = 0; it < 8; it++) {
    for (const [a, b, len] of R.links) {
      const A = R.P[a].p;
      const B = R.P[b].p;
      ragTmp.subVectors(B, A);
      const d = ragTmp.length() || 1e-6;
      ragTmp.multiplyScalar((d - len) / d * 0.5);
      A.add(ragTmp);
      B.sub(ragTmp);
    }
    for (const q of R.P) {
      world.collide(q.p, 0.12);
      const water = inWater(q.p.x, q.p.z);
      const floor = surfaceAt(q.p.x, q.p.z, t) + (water ? -0.12 : 0.06);
      if (q.p.y < floor) {
        q.p.y = water ? q.p.y + (floor - q.p.y) * 0.3 : floor;
        q.o.x += (q.p.x - q.o.x) * (water ? 0.1 : 0.45);
        q.o.z += (q.p.z - q.o.z) * (water ? 0.1 : 0.45);
      }
    }
  }
  // drive the model: put the hips on the hip point, then point each bone at the next point
  const B = R.bones;
  v.group.rotation.set(0, v.group.rotation.y, 0);
  v.group.updateMatrixWorld(true);
  B[0].getWorldPosition(ragTmp);
  v.group.position.add(ragTmp.sub(R.P[0].p).negate());
  v.group.updateMatrixWorld(true);
  const dir = (a, b) => new THREE.Vector3().subVectors(R.P[b].p, R.P[a].p).normalize();
  const root = v.model.root;
  const bone = (n) => root.getObjectByName(n);
  aimBone(B[0], bone('Abdomen') || B[1], dir(0, 1));
  const ab = bone('Abdomen');
  const to = bone('Torso');
  if (ab && to) { aimBone(ab, B[1], dir(0, 1)); aimBone(to, B[1], dir(0, 1)); }
  aimBone(B[1], B[2], dir(1, 2));
  aimBone(B[3], B[4], dir(3, 4)); aimBone(B[4], B[5], dir(4, 5));
  aimBone(B[6], B[7], dir(6, 7)); aimBone(B[7], B[8], dir(7, 8));
  aimBone(B[9], B[10], dir(9, 10)); aimBone(B[10], B[11], dir(10, 11));
  aimBone(B[12], B[13], dir(12, 13)); aimBone(B[13], B[14], dir(13, 14));
  if (!R.pooled && R.t > 0.8) {
    R.pooled = true;
    const hp = R.P[0].p;
    if (settings.blood) {
      if (inWater(hp.x, hp.z)) fx.waterBlood(hp.x, hp.z, 8);
      else fx.bloodPool(hp.x, surfaceAt(hp.x, hp.z, t), hp.z, 1.6 + Math.random() * 0.8);
    }
  }
}

// A Roblox-style avatar: rounded blocks, a smiley face, and stiff swinging arms and legs
const blockyFaces = new Map();
function blockyFace(skinHex) {
  if (blockyFaces.has(skinHex)) return blockyFaces.get(skinHex);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = skinHex;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1B1B1F';
  g.beginPath(); g.ellipse(44, 52, 7, 12, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(84, 52, 7, 12, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1B1B1F'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.arc(64, 68, 30, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  blockyFaces.set(skinHex, tex);
  return tex;
}
const BLOCK = {
  torso: new RoundedBoxGeometry(0.82, 0.82, 0.42, 3, 0.07),
  head: new RoundedBoxGeometry(0.5, 0.5, 0.5, 3, 0.11),
  leg: new RoundedBoxGeometry(0.39, 0.82, 0.39, 3, 0.06),
  sleeve: new RoundedBoxGeometry(0.37, 0.34, 0.37, 3, 0.06),
  forearm: new RoundedBoxGeometry(0.37, 0.5, 0.37, 3, 0.06),
};
function makeBlockAvatar(color, name, skin = 0) {
  const group = new THREE.Group();
  const skinHex = SKINS[skin] || SKINS[0];
  const plastic = (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, metalness: 0 });
  const cloth = plastic(color);
  const pantsMat = plastic(new THREE.Color(color).multiplyScalar(0.42).lerp(new THREE.Color(0x35507A), 0.5));
  const skinMat = plastic(skinHex);
  const faceMat = new THREE.MeshStandardMaterial({ map: blockyFace(skinHex), roughness: 0.5 });
  const body = limb(BLOCK.torso, cloth, 0, 1.21, 0);
  const belt = new THREE.Object3D();
  // hips and shoulders are pivots, so limbs swing from the joint instead of the middle
  const joint = (x, y) => { const g = new THREE.Group(); g.position.set(x, y, 0); return g; };
  const legL = joint(-0.205, 0.8);
  const legR = joint(0.205, 0.8);
  legL.add(limb(BLOCK.leg, pantsMat, 0, -0.41, 0));
  legR.add(limb(BLOCK.leg, pantsMat, 0, -0.41, 0));
  const armL = joint(-0.6, 1.56);
  const armR = joint(0.6, 1.56);
  armL.add(limb(BLOCK.sleeve, cloth, 0, -0.17, 0), limb(BLOCK.forearm, skinMat, 0, -0.55, 0));
  armR.add(limb(BLOCK.sleeve, cloth, 0, -0.17, 0), limb(BLOCK.forearm, skinMat, 0, -0.55, 0));
  const handR = new THREE.Object3D();
  armR.add(handR);
  // BoxGeometry face order is +x, -x, +y, -y, +z, -z: the smiley goes on +z
  const head = new THREE.Mesh(BLOCK.head, [skinMat, skinMat, skinMat, skinMat, faceMat, skinMat]);
  head.position.set(0, 1.86, 0);
  head.castShadow = true;
  const brim = limb(GEO.brim, MAT.hat, 0, 2.08, 0);
  const crown = limb(GEO.crown, MAT.hat, 0, 2.2, 0);
  brim.scale.setScalar(0.8);
  crown.scale.setScalar(0.8);
  const eyeL = new THREE.Object3D();
  const eyeR = new THREE.Object3D();
  const nose = new THREE.Object3D();

  const pivot = new THREE.Group();
  pivot.position.set(0.6, 1.05, 0.35);
  const rodMat = new THREE.MeshStandardMaterial({ color: 0xC9A36A, roughness: 0.5, metalness: 0.15 });
  const rod = new THREE.Mesh(GEO.rod, rodMat);
  rod.position.y = 1.25;
  rod.castShadow = true;
  const tip = new THREE.Object3D();
  tip.position.y = 2.5;
  pivot.add(rod, tip);

  const rifle = new THREE.Group();
  rifle.position.set(0.34, 1.32, 0.3);
  const barrel = new THREE.Mesh(GEO.barrel, MAT.metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 0.32;
  const stock = new THREE.Mesh(GEO.stock, MAT.stock);
  stock.position.set(0, -0.02, -0.16);
  const scope = new THREE.Mesh(GEO.scope, MAT.metal);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.06, 0.18);
  rifle.add(barrel, stock, scope);
  rifle.visible = false;

  const hand = new THREE.Group();
  hand.position.set(0, -0.9, 0.12);
  const weed = new THREE.Mesh(GEO.bud, new THREE.MeshStandardMaterial({ color: 0x6DBF67, roughness: 0.55 }));
  const whiskey = new THREE.Mesh(GEO.bottle, new THREE.MeshStandardMaterial({ color: 0xC47A32, roughness: 0.32, metalness: 0.08 }));
  const crank = new THREE.Mesh(GEO.pack, new THREE.MeshStandardMaterial({ color: 0xF4F1EA, roughness: 0.4 }));
  weed.name = 'weed';
  whiskey.name = 'whiskey';
  crank.name = 'crank';
  whiskey.position.y = 0.02;
  hand.add(weed, whiskey, crank);
  hand.visible = false;

  const highMark = new THREE.Mesh(GEO.mark, new THREE.MeshBasicMaterial({ color: 0x6DBF67 }));
  highMark.position.set(0.34, 2.5, 0);
  highMark.visible = false;

  const label = makeLabel(name);
  label.position.y = 2.65;
  const hp = makeHpBar();
  armR.add(hand);
  group.add(body, belt, legL, legR, armL, armR, head, eyeL, eyeR, nose, brim, crown, pivot, rifle, highMark, label, hp.sprite);
  return {
    group, body, pivot, tip, rifle, hand, highMark, label, hp, cloth, rodMat, limbs: { legL, legR, armL, armR },
    bubble: null, bubbleUntil: 0, flash: 0, punchT: 1, punchSide: 'r', punchHeavy: false,
  };
}

function disposeAvatar(v) {
  [v.label, v.hp.sprite, v.bubble].forEach((s) => { if (s) { s.material.map?.dispose(); s.material.dispose(); } });
  if (v.model) v.model.dispose(); else v.cloth.dispose();
  v.rodMat.dispose();
  v.highMark.material.dispose();
}

function setBubble(v, text) {
  if (v.bubble) { v.group.remove(v.bubble); v.bubble.material.map.dispose(); v.bubble.material.dispose(); }
  v.bubble = makeBubble(text);
  if (v.model) v.bubble.position.y = 2.52;
  v.group.add(v.bubble);
  v.bubbleUntil = audioT + 6;
}

const BOAT_MODELS = ['boat_row', 'boat_fish', 'boat_speed'];
function makeBoatMesh(tier = 0) {
  const def = (W && W.boats && W.boats[tier]) || { scale: 1 };
  const g = new THREE.Group();
  if (kit) {
    const name = BOAT_MODELS[tier] || BOAT_MODELS[0];
    const hull = kit.prop(name, 0.75);
    const sz = kit.baked(name, 0.75).size;
    hull.scale.setScalar((3.2 * def.scale) / Math.max(sz.x, sz.z));
    if (sz.x > sz.z) hull.rotation.y = Math.PI / 2;
    g.add(hull);
  } else {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 3), new THREE.MeshStandardMaterial({ color: 0x6A3A1C }));
    hull.position.y = 0.2;
    g.add(hull);
  }
  if (tier === 0 || !kit) {
    // the rowboat gets a little outboard; the fishing boat and speedboat come with their own
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.32), new THREE.MeshStandardMaterial({ color: 0x2B2F33, roughness: 0.5 }));
    motor.position.set(0, 0.45, -1.55 * def.scale);
    const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.36), new THREE.MeshStandardMaterial({ color: 0xE0452B, roughness: 0.5 }));
    cowl.position.set(0, 0.75, -1.55 * def.scale);
    g.add(motor, cowl);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// ---------- guns: each one built from parts, muzzle toward +z, grip at the origin
const GM = {
  steel: new THREE.MeshStandardMaterial({ color: 0x1B1D20, roughness: 0.35, metalness: 0.75 }),
  poly: new THREE.MeshStandardMaterial({ color: 0x2A2C2F, roughness: 0.7, metalness: 0.1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7A4A28, roughness: 0.65, metalness: 0.05 }),
  darkWood: new THREE.MeshStandardMaterial({ color: 0x4A2E1A, roughness: 0.7 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x24344E, roughness: 0.1, metalness: 0.6 }),
  laser: new THREE.MeshStandardMaterial({ color: 0x552222, emissive: 0xFF2A2A, emissiveIntensity: 1.4, roughness: 0.4 }),
  switchPlate: new THREE.MeshStandardMaterial({ color: 0xC9A227, roughness: 0.3, metalness: 0.8 }),
};
function buildGunModel(id, a = {}) {
  const g = new THREE.Group();
  const part = (geo, mat, x, y, z, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const box = (w, h, d, mat, x, y, z, rx = 0, rz = 0) => part(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, rz);
  const tube = (r, len, mat, x, y, z) => part(new THREE.CylinderGeometry(r, r, len, 10), mat, x, y, z, Math.PI / 2);
  const drum = (r, y, z) => part(new THREE.CylinderGeometry(r, r, 0.07, 16), GM.poly, 0, y, z, 0, Math.PI / 2);
  const grip = (h = 0.11, z = -0.01) => box(0.032, h, 0.05, GM.poly, 0, -h / 2 - 0.01, z, -0.2);
  const guard = (z = 0.045) => box(0.02, 0.008, 0.06, GM.steel, 0, -0.03, z);
  if (id === 'pistol') {
    tube(0.012, 0.16, GM.steel, 0, 0.035, 0.14);
    tube(0.03, 0.05, GM.steel, 0, 0.02, 0.055);
    box(0.03, 0.05, 0.12, GM.steel, 0, 0.03, 0.0);
    grip(0.11, -0.03);
    box(0.02, 0.012, 0.03, GM.steel, 0, 0.065, -0.05);
  } else if (id === 'glock') {
    box(0.03, 0.038, 0.2, GM.steel, 0, 0.05, 0.07);
    box(0.028, 0.022, 0.17, GM.poly, 0, 0.022, 0.06);
    grip(0.115, -0.02);
    guard(0.05);
    if (a.drum) drum(0.055, -0.15, -0.035);
    else box(0.024, 0.11, 0.036, GM.steel, 0, -0.14, -0.035, -0.2);
    if (a.switch) box(0.022, 0.018, 0.03, GM.switchPlate, 0, 0.078, -0.03);
    if (a.laser) { box(0.022, 0.02, 0.05, GM.poly, 0, 0.0, 0.14); box(0.012, 0.012, 0.012, GM.laser, 0, 0.0, 0.17); }
  } else if (id === 'arp') {
    box(0.04, 0.06, 0.2, GM.poly, 0, 0.03, 0.0);
    box(0.034, 0.02, 0.2, GM.steel, 0, 0.075, 0.03);
    tube(0.02, 0.24, GM.poly, 0, 0.045, 0.22);
    tube(0.009, 0.08, GM.steel, 0, 0.045, 0.37);
    tube(0.017, 0.14, GM.poly, 0, 0.02, -0.16);
    grip(0.11, -0.03);
    guard(0.03);
    if (a.drum) drum(0.07, -0.13, 0.05);
    else box(0.03, 0.13, 0.045, GM.steel, 0, -0.1, 0.06, 0.15);
    if (a.laser) { box(0.02, 0.02, 0.05, GM.poly, 0.03, 0.03, 0.28); box(0.012, 0.012, 0.012, GM.laser, 0.03, 0.03, 0.31); }
  } else if (id === 'draco') {
    box(0.04, 0.07, 0.22, GM.steel, 0, 0.035, 0.0);
    box(0.045, 0.05, 0.16, GM.wood, 0, 0.03, 0.2);
    tube(0.012, 0.3, GM.steel, 0, 0.055, 0.32);
    tube(0.02, 0.05, GM.steel, 0, 0.055, 0.46);
    box(0.02, 0.02, 0.04, GM.steel, 0, 0.09, 0.4);
    grip(0.1, -0.06);
    guard(0.0);
    if (a.drum) drum(0.09, -0.16, 0.06);
    else box(0.034, 0.16, 0.05, GM.steel, 0, -0.11, 0.07, 0.35);
    if (a.laser) { box(0.02, 0.02, 0.05, GM.poly, 0.032, 0.04, 0.3); box(0.012, 0.012, 0.012, GM.laser, 0.032, 0.04, 0.33); }
  } else if (id === 'smg') {
    box(0.045, 0.07, 0.26, GM.poly, 0, 0.04, 0.0);
    tube(0.012, 0.16, GM.steel, 0, 0.05, 0.21);
    box(0.02, 0.02, 0.04, GM.steel, 0, 0.09, 0.02);
    grip(0.11, -0.05);
    guard(0.0);
    if (a.drum) drum(0.075, -0.15, 0.02);
    else box(0.03, 0.15, 0.035, GM.steel, 0, -0.11, 0.06);
    box(0.02, 0.03, 0.14, GM.steel, 0, 0.03, -0.2);
    if (a.laser) { box(0.02, 0.02, 0.05, GM.poly, 0, 0.0, 0.2); box(0.012, 0.012, 0.012, GM.laser, 0, 0.0, 0.23); }
  } else if (id === 'shotgun') {
    tube(0.018, 0.62, GM.steel, 0, 0.055, 0.34);
    tube(0.014, 0.44, GM.steel, 0, 0.02, 0.26);
    box(0.05, 0.05, 0.16, GM.steel, 0, 0.03, 0.0);
    box(0.045, 0.04, 0.16, GM.wood, 0, 0.005, 0.28);
    box(0.05, 0.1, 0.26, GM.darkWood, 0, 0.0, -0.2, 0, 0);
    grip(0.09, -0.06);
    box(0.012, 0.012, 0.012, GM.steel, 0, 0.09, 0.64);
  } else if (id === 'rifle') {
    tube(0.011, 0.6, GM.steel, 0, 0.05, 0.4);
    box(0.045, 0.06, 0.28, GM.steel, 0, 0.03, 0.06);
    box(0.05, 0.11, 0.32, GM.wood, 0, 0.0, -0.22);
    box(0.04, 0.04, 0.3, GM.wood, 0, 0.0, 0.3);
    tube(0.016, 0.16, GM.glass, 0, 0.1, 0.06);
    box(0.02, 0.03, 0.02, GM.steel, 0, 0.075, 0.03);
    guard(0.02);
  } else if (id === 'sniper') {
    tube(0.014, 0.85, GM.steel, 0, 0.055, 0.55);
    tube(0.02, 0.06, GM.steel, 0, 0.055, 0.98);
    box(0.05, 0.065, 0.3, GM.poly, 0, 0.03, 0.05);
    box(0.055, 0.12, 0.34, GM.poly, 0, 0.0, -0.25);
    tube(0.03, 0.34, GM.poly, 0, 0.115, 0.08);
    tube(0.033, 0.04, GM.glass, 0, 0.115, 0.27);
    tube(0.033, 0.04, GM.glass, 0, 0.115, -0.1);
    box(0.02, 0.05, 0.03, GM.steel, 0, 0.075, 0.08);
    box(0.03, 0.09, 0.04, GM.steel, 0, -0.08, 0.06);
    guard(0.0);
  } else {
    tube(0.012, 0.5, GM.steel, 0, 0.05, 0.3);
    box(0.045, 0.07, 0.3, GM.poly, 0, 0.03, 0.0);
    grip(0.1, -0.05);
  }
  return g;
}

function makeBeam() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xFF2A2A, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 1), mat);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat);
  g.add(line, dot);
  g.traverse((o) => { o.frustumCulled = false; });
  return g;
}

function makeBobber() {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xE0452B, roughness: 0.4 }));
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xF1F4EE, roughness: 0.4 }));
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.14, 5), new THREE.MeshStandardMaterial({ color: 0x1D2A25 }));
  stem.position.y = 0.17;
  g.add(top, bottom, stem);
  return g;
}

const LONG_FISH = new Set(['walleye', 'pike', 'muskie', 'eelpout', 'sturgeon', 'golden', 'catfish']);

function makeFish(sid) {
  if (kit && sid !== 'boot' && sid !== 'can' && sid !== 'tacklebox') {
    const f = kit.fish(sid, (speciesById[sid] || {}).color, speciesById[sid]);
    f.userData.sid = sid;
    return f;
  }
  const g = new THREE.Group();
  const s = speciesById[sid] || {};
  const color = new THREE.Color(s.color || '#4FA3A5');
  if (sid === 'boot') {
    const m = new THREE.MeshStandardMaterial({ color: 0x4A3A2A, roughness: 0.9 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.22), m);
    a.position.y = 0.1;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.42), m);
    b.position.set(0, -0.08, 0.1);
    g.add(a, b);
  } else if (sid === 'can') {
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 10), new THREE.MeshStandardMaterial({ color: 0x8A8680, roughness: 0.4, metalness: 0.6 })));
  } else if (sid === 'tacklebox') {
    const m = new THREE.MeshStandardMaterial({ color: 0x3E6B4F, roughness: 0.5 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.3), m));
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 10, Math.PI), MAT.metal);
    h.position.y = 0.13;
    g.add(h);
  } else {
    const long = LONG_FISH.has(sid);
    const metal = sid === 'golden' ? 0.6 : 0.08;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: metal, emissive: sid === 'golden' ? 0x6A4500 : 0x000000 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), mat);
    body.scale.set(long ? 0.62 : 0.85, long ? 0.42 : 0.55, long ? 2.3 : 1.6);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.32, 4), new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.55) }));
    tail.rotation.x = Math.PI / 2;
    tail.position.z = long ? -0.66 : -0.46;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 4), mat);
    fin.position.set(0, 0.15, -0.05);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(0.1, 0.04, long ? 0.46 : 0.3);
    g.add(body, tail, fin, eye);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.sid = sid;
  return g;
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.shared) o.geometry.dispose();
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

function makePickupMesh(it) {
  let mesh;
  if (it.kind === 'cash') {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), new THREE.MeshStandardMaterial({ color: 0xF2B134, metalness: 0.6, roughness: 0.3, emissive: 0x4A3000 }));
    mesh.rotation.x = Math.PI / 2;
    const g = new THREE.Group();
    g.add(mesh);
    return g;
  }
  if (it.kind === 'weed') mesh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0x6DBF67 }));
  else if (it.kind === 'whiskey') mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0x8A4B1F }));
  else if (it.kind === 'crank') mesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.22), new THREE.MeshStandardMaterial({ color: 0xF4F1EA }));
  if (mesh) {
    const g = new THREE.Group();
    g.add(mesh);
    return g;
  }
  const sp = W && W.species.find((s) => s.name === it.name);
  const fish = makeFish(sp ? sp.id : 'bluegill');
  fish.scale.setScalar(0.7);
  return fish;
}

// ================================================================ views

function makeLine() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINE_PTS * 3), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xF1F4EE, transparent: true, opacity: 0.8 }));
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function makeView(d) {
  const av = makeAvatar(d.color, d.name, d.look || 0, d.skin || 0);
  scene.add(av.group);
  const line = makeLine();
  const bobber = makeBobber();
  bobber.visible = false;
  scene.add(line, bobber);
  return {
    ...av, line, bobber, data: d, state: d.state, x: d.x, z: d.z, y: 0, rot: d.rot,
    tx: d.x, tz: d.z, trot: d.rot, bobberPos: null, fly: null, walking: false, rodLevel: -1,
  };
}

function removeView(v) {
  scene.remove(v.group, v.line, v.bobber);
  if (v.beam) scene.remove(v.beam);
  disposeAvatar(v);
  v.line.geometry.dispose();
  v.line.material.dispose();
}

function makeNpcView(d) {
  const [look, skin] = NPC_LOOKS[d.id] || [0, 1];
  const av = makeAvatar(d.color, d.name, look, skin);
  av.rodMat.color.set(0x6A5A40);
  scene.add(av.group);
  const bobber = makeBobber();
  bobber.visible = false;
  const line = makeLine();
  scene.add(bobber, line);
  return { ...av, bobber, line, data: d, x: d.x, z: d.z, rot: d.rot, tx: d.x, tz: d.z, trot: d.rot, combat: false };
}

let worldPending = false;
socket.on('world', async (w) => {
  if (W || worldPending) return;
  worldPending = true;
  await modelsReady;
  W = w;
  speciesById = Object.fromEntries(w.species.map((s) => [s.id, s]));
  world.build(w, kit);
  buildSwatches();
  renderJournal();
});

socket.on('connect', () => {
  if (joinInfo) socket.emit('join', joinInfo);
  socket.emit('peek', token, (prof) => {
    if (!prof || joinInfo) return;
    if (!$('name').value) $('name').value = prof.name;
    if (prof.color) chosenColor = prof.color;
    if (Number.isInteger(prof.look)) chosenLook = prof.look;
    if (Number.isInteger(prof.skin)) chosenSkin = prof.skin;
    markSwatch();
    const r = $('returning');
    r.textContent = `Welcome back, ${prof.name}. You've got $${prof.cash} and ${prof.caught} fish on the books.`;
    r.hidden = false;
    $('joinBtn').textContent = 'Back to the lake';
  });
});
socket.on('disconnect', () => pushFeed('Lost the connection. Reconnecting.', 'mine'));

socket.on('welcome', (w) => {
  const first = !myId;
  if (myId && myId !== w.id) {
    const old = views.get(myId);
    if (old) { removeView(old); views.delete(myId); }
  }
  myId = w.id;
  journal = w.journal || {};
  phase = 'idle';
  reel = null;
  holdFish = false;
  if (first) {
    cam.yaw = w.you.rot + Math.PI;
    cam.pitch = 0.3;
  }
  ['vitals', 'board', 'hotbar'].forEach((id) => { $(id).hidden = false; });
  if (w.guest) pushFeed('Your save is open in another tab, so this tab plays as a guest. Guest progress is not kept.', 'mine');
  if (w.returning) {
    completeGoal('cast', true);
    if (w.caught > 0) completeGoal('land', true);
    if (first) pushFeed(`Welcome back. $${w.cash} in your wallet.`, 'mine');
  } else if (first) {
    pushFeed(isTouch ? 'Moss and the shack are right here in camp. Tap Help any time for controls.' : 'Moss and the shack are right here in camp. Press H any time for controls.', 'mine');
  }
  renderGoal();
  renderJournal();
  if (isTouch && !touch) {
    touch = initTouch({
      unlock: () => sfx.unlock(),
      fishDown, fishUp,
      shoot: attack,
      use: interact,
      reelIn,
      phone: () => togglePanel('phone'),
      chat: openChat,
      help: () => togglePanel('help'),
    });
  }
});

let boardSig = '';
socket.on('state', (s) => {
  if (!W || !s) return;
  syncHour(s.hour);
  hotspots = s.hotspots || [];
  derbyState = s.derby;
  const seen = new Set();
  for (const d of s.players) {
    seen.add(d.id);
    let v = views.get(d.id);
    if (!v) { v = makeView(d); views.set(d.id, v); }
    const prevState = v.data.state;
    v.data = d;
    if (d.id !== myId) {
      v.tx = d.x; v.tz = d.z; v.trot = d.rot; v.state = d.state; v.jy = d.jy || 0;
      if (d.bobber && !v.bobberPos) v.fly = { t: 0, from: v.tip.getWorldPosition(new THREE.Vector3()), remote: true };
      if (d.state === 'bite' && prevState !== 'bite' && d.bobber) fx.ripple(d.bobber.x, d.bobber.z, 0.8, 0.9, 0.5);
      v.bobberPos = d.bobber;
    } else if (d.alive === false) {
      v.x = v.tx = d.x; v.z = v.tz = d.z;
    }
    if (v.rodLevel !== d.rod && W.rods[d.rod]) { v.rodLevel = d.rod; v.rodMat.color.set(W.rods[d.rod].color); }
  }
  for (const [id, v] of views) if (!seen.has(id)) { removeView(v); views.delete(id); }
  syncNpcs(s.npcs || []);
  syncFish(s.fish || []);
  syncPickups(s.pickups || []);
  if (myId) {
    const sig = s.players.map((p) => `${p.id}:${p.cash}:${p.alive}:${p.caught}:${p.best?.lbs}`).join('|');
    if (sig !== boardSig) { boardSig = sig; renderBoard(s.players); }
  }
});

socket.on('me', (d) => {
  myData = d;
  if (held !== 'rod' && !canHold(held)) { held = 'rod'; hotbarSig = ''; }
});

function syncHour(h) {
  if (!clockInit) { clockHour = h; clockInit = true; return; }
  let d = h - clockHour;
  if (d > 12) d -= 24;
  if (d < -12) d += 24;
  if (Math.abs(d) > 0.25) clockHour = h;
  else clockHour = (clockHour + d * 0.2 + 24) % 24;
}

function syncNpcs(list) {
  const seen = new Set();
  for (const d of list) {
    seen.add(d.id);
    let v = npcViews.get(d.id);
    if (!v) { v = makeNpcView(d); npcViews.set(d.id, v); }
    v.data = d;
    v.tx = d.x; v.tz = d.z; v.trot = d.rot;
  }
  for (const [id, v] of npcViews) {
    if (seen.has(id)) continue;
    scene.remove(v.group, v.bobber, v.line);
    disposeAvatar(v);
    npcViews.delete(id);
  }
}

function syncFish(list) {
  const seen = new Set();
  for (const f of list) {
    seen.add(f.id);
    let v = fishViews.get(f.id);
    if (!v || v.mesh.userData.sid !== f.sid) {
      if (v) { scene.remove(v.mesh); disposeGroup(v.mesh); }
      const mesh = makeFish(f.sid);
      scene.add(mesh);
      v = { mesh, x: f.x, z: f.z, rot: f.rot };
      fishViews.set(f.id, v);
    }
    v.tx = f.x; v.tz = f.z; v.trot = f.rot; v.alive = f.alive; v.hurt = f.hurt;
  }
  for (const [id, v] of fishViews) if (!seen.has(id)) { scene.remove(v.mesh); disposeGroup(v.mesh); fishViews.delete(id); }
}

function syncPickups(list) {
  const seen = new Set();
  for (const it of list) {
    seen.add(it.id);
    let v = pickupViews.get(it.id);
    if (!v) {
      const mesh = makePickupMesh(it);
      scene.add(mesh);
      v = { mesh, x: it.x, z: it.z, kind: it.kind };
      pickupViews.set(it.id, v);
    }
    v.tx = it.x; v.tz = it.z;
  }
  for (const [id, v] of pickupViews) if (!seen.has(id)) { scene.remove(v.mesh); disposeGroup(v.mesh); pickupViews.delete(id); }
}

// ================================================================ server events

socket.on('correct', ({ x, z }) => { const m = me(); if (m) { m.x = m.tx = x; m.z = m.tz = z; } });

socket.on('bite', () => {
  if (phase !== 'out') return;
  phase = 'bite';
  sfx.bite();
  const m = me();
  if (m && m.bobberPos) {
    fx.splash(m.bobberPos.x, m.bobberPos.z, 9, 0.6);
    fx.floater(m.bobberPos.x, 0.9, m.bobberPos.z, '!', 'dmg', 0.8);
  }
  cam.shake += 0.05;
});

socket.on('missed', () => {
  if (phase !== 'bite') return;
  phase = 'out';
  flashPrompt('Missed it. Wait for another bite.', '', 1600);
});

socket.on('feed', (f) => {
  if (typeof f === 'string') pushFeed(f, 'info');
  else pushFeed(f.text, f.kind || 'info');
});

const messageLog = [];
socket.on('chat', (c) => {
  pushChat(c);
  messageLog.push(c);
  if (messageLog.length > 40) messageLog.shift();
  if (openPanel === 'phone' && phoneApp === 'messages') renderMessages();
  const v = views.get(c.id);
  if (v) setBubble(v, c.text);
  if (c.id !== myId) sfx.chat();
});

socket.on('ragdoll', (r) => {
  const v = views.get(r.id) || npcViews.get(r.id);
  if (!v) return;
  if (v.model) startRagdoll(v, r.dx, r.dz, r.force);
  if (settings.blood) {
    const y = inWater(v.x, v.z) ? WATER_Y + 0.4 : 1.1;
    fx.blood(v.x, y, v.z, r.dx, r.dz, 26, 1.2);
    if (inWater(v.x, v.z)) fx.waterBlood(v.x, v.z, 6);
  }
});

socket.on('shot', (shot) => {
  if (!shot || !shot.from || !shot.to) return;
  if (shot.surface) shot.to.y = surfaceAt(shot.to.x, shot.to.z, audioT) + 0.05;
  fx.tracer(shot.from, shot.to);
  if (shot.gun) {
    // brass (or a red shotgun shell) pops out to the gun's right and bounces
    const cdx = shot.to.x - shot.from.x;
    const cdz = shot.to.z - shot.from.z;
    const cl = Math.hypot(cdx, cdz) || 1;
    if (camera.position.distanceTo(tmpA.set(shot.from.x, 1.3, shot.from.z)) < 45) fx.casing(shot.from.x + cdz / cl * 0.15, 1.25, shot.from.z - cdx / cl * 0.15, cdx / cl, cdz / cl, shot.gun === 'shotgun');
  }
  if (shot.surface === 'water') {
    fx.splash(shot.to.x, shot.to.z, 9, 0.55);
    fx.ripple(shot.to.x, shot.to.z, 0.9, 1.2, 0.5);
  } else if (shot.surface === 'ground') {
    fx.puff(shot.to.x, shot.to.y + 0.1, shot.to.z, 0x8A7A5A, 5);
  }
  if (shot.hit && settings.blood) {
    const dx = shot.to.x - shot.from.x;
    const dz = shot.to.z - shot.from.z;
    const d = Math.hypot(dx, dz) || 1;
    if (shot.hit === 'fish') fx.waterBlood(shot.to.x, shot.to.z, shot.killed ? 6 : 3);
    else {
      fx.blood(shot.to.x, 1.1, shot.to.z, dx / d, dz / d, shot.killed ? 22 : 14, 1);
      if (Math.random() < 0.6 && !inWater(shot.to.x, shot.to.z)) fx.bloodPool(shot.to.x + (dx / d) * 0.6, surfaceAt(shot.to.x, shot.to.z, audioT), shot.to.z + (dz / d) * 0.6, 0.5 + Math.random() * 0.4);
      const near = camera.position.distanceTo(new THREE.Vector3(shot.to.x, 1, shot.to.z));
      if (near < 25) sfx.splat(Math.max(0.2, 1 - near / 25));
    }
  }
  if (shot.by !== myId) {
    const d = camera.position.distanceTo(new THREE.Vector3(shot.from.x, 1, shot.from.z));
    sfx.distantShot(clamp(1.2 - d / 70, 0.15, 1));
  }
});

socket.on('punch', (p) => {
  if (!p || p.id === myId) return;
  const v = views.get(p.id);
  if (v) { v.trot = p.rot; startPunch(v, p.side, p.heavy); }
  const d = v ? camera.position.distanceTo(v.group.position) : 99;
  if (d < 30) sfx.whoosh(p.heavy, 0.5);
  if (p.hit) {
    if (d < 30) sfx.thud(p.heavy, 0.6);
    if (p.x != null) {
      if (settings.blood) fx.blood(p.x, 1.4, p.z, Math.sin(p.rot), Math.cos(p.rot), p.heavy ? 10 : 4, 0.6);
      else fx.puff(p.x, 1.25, p.z, 0xF2EEE4, p.heavy ? 12 : 6);
    }
    const target = [...views.values(), ...npcViews.values()].find((o) => o.data.alive !== false && Math.hypot(o.x - p.x, o.z - p.z) < 1.2);
    if (target) target.flash = 0.2;
  }
});

socket.on('knock', (k) => {
  const m = me();
  if (!m) return;
  m.x = m.tx = k.x;
  m.z = m.tz = k.z;
  cam.shake += k.heavy ? 0.45 : 0.2;
});

socket.on('hurt', (h) => {
  sfx.hurt();
  hurtT = 1;
  cam.shake += 0.35;
  const m = me();
  if (m) {
    m.flash = 0.25;
    if (settings.blood && h && h.how !== 'punch') {
      const dx = m.x - (h.from ? h.from.x : m.x);
      const dz = m.z - (h.from ? h.from.z : m.z);
      const d = Math.hypot(dx, dz) || 1;
      fx.blood(m.x, 1.2, m.z, dx / d, dz / d, 12, 0.9);
    }
  }
  if (m && h && h.from && !boating() && !m.swimming) {
    // getting shot shoves you: a bigger hit is a bigger shove, and friction brings you back to a stop
    const kx = m.x - h.from.x;
    const kz = m.z - h.from.z;
    const kd = Math.hypot(kx, kz) || 1;
    const kick = clamp((h.dmg || 20) * 0.1, 1, 6);
    vel.x += (kx / kd) * kick;
    vel.z += (kz / kd) * kick;
  }
  buzz(h && h.how === 'punch' ? 40 : 70);
  if (h && h.by) flashPrompt(h.how === 'punch' ? `${h.by} is swinging at you.` : `${h.by} is shooting at you.`, 'alert', 1200);
});

socket.on('lineCut', () => {
  phase = 'idle';
  reel = null;
  holdFish = false;
  const m = me();
  if (m) m.bobberPos = null;
});

socket.on('died', (d) => {
  sfx.down();
  phase = 'idle';
  reel = null;
  holdFish = false;
  const m = me();
  if (m) m.bobberPos = null;
  closePanels();
  deathUntil = performance.now() + (d.respawn || 3000);
  $('deathTitle').textContent = d.verb === 'knocked out' ? `${d.by} knocked you out.` : `${d.by} got you.`;
  const lost = [];
  if (d.dropped) lost.push(`$${d.dropped}`);
  if (d.bag) lost.push(`${d.bag} fish`);
  $('death').dataset.lost = lost.length ? `You dropped ${lost.join(' and ')} where you fell.` : 'You had nothing on you worth dropping.';
  $('death').hidden = false;
});

socket.on('respawn', ({ x, z, rot }) => {
  const m = me();
  $('death').hidden = true;
  if (!m) return;
  m.x = m.tx = x; m.z = m.tz = z; m.rot = m.trot = rot;
  phase = 'idle';
  reel = null;
  m.bobberPos = null;
  cam.yaw = rot + Math.PI;
});

socket.on('loot', (it) => {
  sfx.pickup();
  const y = 1.4;
  if (it.kind === 'cash') { fx.floater(it.x, y, it.z, `+$${it.amount}`, 'cash'); sfx.coin(); }
  else if (it.kind === 'fish') fx.floater(it.x, y, it.z, String(it.name).toLowerCase(), 'info');
  else fx.floater(it.x, y, it.z, `+1 ${it.kind}`, 'info');
});

socket.on('table', (t) => {
  const was = table;
  table = t || { active: false };
  renderShack();
  if (table.status === 'done' && was.status === 'play') {
    if (table.result === 'win' || table.result === 'blackjack') sfx.coin();
    else if (table.result !== 'push') sfx.ui();
  }
});

socket.on('caught', (c) => {
  const v = views.get(c.id);
  fx.splash(c.x, c.z, RARITY_RANK[c.rarity] >= 4 ? 26 : 14, RARITY_RANK[c.rarity] >= 4 ? 1.4 : 1);
  const mesh = makeFish(c.sid);
  const size = clamp(0.8 + Math.log10(1 + c.lbs) * 0.9, 0.7, 2.4);
  mesh.scale.setScalar(size);
  scene.add(mesh);
  leaps.push({ mesh, from: new THREE.Vector3(c.x, WATER_Y, c.z), view: v, t: 0, rarity: c.rarity });
  if (c.id !== myId) {
    const d = camera.position.distanceTo(new THREE.Vector3(c.x, 0, c.z));
    if (d < 30) sfx.splash(0.6);
  }
});

socket.on('derby', (d) => {
  sfx.horn();
  if (d.type === 'start') {
    flashPrompt('Derby! Heaviest fish before the horn wins the pot.', 'good', 3000);
  } else if (d.winnerId && d.winnerId === myId) {
    const m = me();
    sfx.land('legendary');
    if (m) {
      fx.sparkle(m.x, 1.6, m.z, 0xF2B134, 60, 3);
      fx.floater(m.x, 2.4, m.z, `+$${d.pot}`, 'cash', 2.2);
    }
    flashPrompt(`You won the derby and $${d.pot}.`, 'good', 4500);
  } else if (d.top && d.top[0]) {
    flashPrompt(`${d.top[0].name} won the derby.`, '', 2600);
  }
});

// ================================================================ join

function buildSwatches() {
  const box = $('swatches');
  box.replaceChildren();
  box.setAttribute('role', 'radiogroup');
  if (!chosenColor || !W.colors.includes(chosenColor)) chosenColor = W.colors[Math.floor(Math.random() * W.colors.length)];
  W.colors.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `Jacket color ${i + 1}`);
    b.dataset.color = c;
    b.addEventListener('click', () => { chosenColor = c; markSwatch(); });
    box.append(b);
  });
  markSwatch();
}
function markSwatch() {
  $('swatches').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === chosenColor)));
  $('looks').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.look) === chosenLook)));
  $('skins').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.skin) === chosenSkin)));
}
function buildLookPickers() {
  const looks = $('looks');
  looks.replaceChildren();
  LOOKS.forEach((l, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l.label;
    b.dataset.look = String(i);
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => { chosenLook = i; markSwatch(); });
    looks.append(b);
  });
  const blocky = document.createElement('button');
  blocky.type = 'button';
  blocky.textContent = 'Blocky';
  blocky.dataset.look = String(LOOKS.length);
  blocky.setAttribute('role', 'radio');
  blocky.addEventListener('click', () => { chosenLook = LOOKS.length; markSwatch(); });
  looks.prepend(blocky);
  const skins = $('skins');
  skins.replaceChildren();
  SKINS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.dataset.skin = String(i);
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `Skin tone ${i + 1}`);
    b.addEventListener('click', () => { chosenSkin = i; markSwatch(); });
    skins.append(b);
  });
}
buildLookPickers();

$('name').value = store.get('loonlake.name', '');
if (isTouch) document.querySelector('#joinForm .fine').textContent = 'Left thumb to walk, drag the right side to look, tap Cast to fish.';
$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!W) return;
  sfx.unlock();
  const name = $('name').value.trim();
  store.set('loonlake.name', name);
  store.set('loonlake.color', chosenColor);
  store.set('loonlake.look', chosenLook);
  store.set('loonlake.skin', chosenSkin);
  joinInfo = { name, token, color: chosenColor, look: chosenLook, skin: chosenSkin };
  socket.emit('join', joinInfo);
  $('name').blur();
  $('join').hidden = true;
  if (!isTouch) requestLock(true);
});

// ================================================================ input

function requestLock(fromClick) {
  if (noLock || isTouch || pointerLocked) return;
  lockFromClick = fromClick;
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => lockFailed());
  } catch { lockFailed(); }
}
function lockFailed() {
  if (!lockFromClick) return;
  noLock = true;
  pushFeed('This browser blocked mouse lock. Hold right click and drag to look instead.', 'mine');
}
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (!pointerLocked) { aimHeld = false; lmbHeld = false; }
});
document.addEventListener('pointerlockerror', lockFailed);

document.addEventListener('mousemove', (e) => {
  if (!pointerLocked || !myId) return;
  const s = TUNING.look * settings.sens * Math.max(0.25, camera.fov / 60);
  cam.yaw -= e.movementX * s;
  cam.pitch += e.movementY * s * (settings.invertY ? -1 : 1);
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// Pointer events only report the first button held, so buttons use mouse events. That keeps
// left click working while right click is held down to zoom.
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  // no pointer lock available: right-drag orbits the camera instead
  if (!myId || isTouch || e.pointerType === 'touch' || e.button !== 2 || pointerLocked) return;
  orbitDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
  aimHeld = true;
});
canvas.addEventListener('mousedown', (e) => {
  if (!myId || isTouch) return;
  if (chatOpen) closeChat();
  if (e.button === 0) {
    if (openPanel) { closePanels(); requestLock(true); return; }
    if (!pointerLocked && !noLock) { requestLock(true); return; }
    lmbHeld = true;
    usePrimary();
  } else if (e.button === 2 && pointerLocked) {
    aimHeld = true;
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!orbitDrag || e.pointerId !== orbitDrag.id) return;
  const s = TUNING.look * settings.sens * 1.3;
  cam.yaw -= (e.clientX - orbitDrag.x) * s;
  cam.pitch += (e.clientY - orbitDrag.y) * s * (settings.invertY ? -1 : 1);
  orbitDrag.x = e.clientX;
  orbitDrag.y = e.clientY;
});
const releaseLeft = () => {
  lmbHeld = false;
  if (lmbFish) { lmbFish = false; fishUp(); }
};
const releaseRight = () => { aimHeld = false; orbitDrag = null; };
addEventListener('mouseup', (e) => {
  if (e.button === 0) releaseLeft();
  else if (e.button === 2) releaseRight();
});
canvas.addEventListener('pointercancel', () => { releaseLeft(); releaseRight(); });
let wheelAt = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  // Ctrl + wheel moves the camera; plain wheel flips through your hotbar like most games
  if (e.ctrlKey) { cam.dist = clamp(cam.dist + e.deltaY * 0.01, TUNING.camMin, TUNING.camMax); return; }
  const now = performance.now();
  if (now - wheelAt < 110 || !myId || !alive() || openPanel || phase !== 'idle') return;
  wheelAt = now;
  const list = hotbarList().filter((a) => a !== 'bag' && canHold(a));
  if (!list.length) return;
  const at = Math.max(0, list.indexOf(held));
  selectHold(list[(at + (e.deltaY > 0 ? 1 : -1) + list.length) % list.length], false);
}, { passive: false });

addEventListener('keydown', (e) => {
  if (!myId) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT') {
    if (e.target.id === 'chatInput' && e.code === 'Escape') { e.preventDefault(); closeChat(); }
    return;
  }
  if (tag === 'BUTTON' && (e.code === 'Space' || e.code === 'Enter')) return;
  sfx.unlock();
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      if (!e.repeat) jump();
      break;
    case 'KeyQ': if (!e.repeat) reelIn(); break;
    case 'KeyR': if (!e.repeat) reload(); break;
    case 'KeyE': if (!e.repeat) interact(); break;
    case 'KeyF': quickPunch(); break;
    case 'KeyJ': if (!e.repeat) togglePanel('journal'); break;
    case 'KeyP': if (!e.repeat) togglePanel('phone'); break;
    case 'KeyH': if (!e.repeat) togglePanel('help'); break;
    case 'Enter': e.preventDefault(); openChat(); break;
    case 'Escape': closePanels(); break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
    case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9':
      if (!e.repeat) selectSlot(Number(e.code.slice(5)) - 1);
      break;
    case 'Digit0': if (!e.repeat) selectSlot(9); break;
    case 'Minus': if (!e.repeat) selectSlot(10); break;
    case 'Equal': if (!e.repeat) selectSlot(11); break;
    default: break;
  }
  keys.add(e.code);
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
});
addEventListener('blur', () => {
  keys.clear();
  aimHeld = false;
  orbitDrag = null;
  holdFish = false;
  lmbFish = false;
  lmbHeld = false;
  if (phase === 'charging') phase = 'idle';
});

// ================================================================ chat and feed

function openChat() {
  if (chatOpen || !myId) return;
  chatOpen = true;
  keys.clear();
  holdFish = false;
  if (phase === 'charging') phase = 'idle';
  $('chatForm').hidden = false;
  $('chatInput').value = '';
  $('chatInput').focus();
}
function closeChat() {
  if (!chatOpen) return;
  chatOpen = false;
  $('chatForm').hidden = true;
  $('chatInput').blur();
}
$('chatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('chatInput').value.trim();
  if (text) socket.emit('chat', text);
  closeChat();
});
$('chatInput').addEventListener('blur', () => setTimeout(closeChat, 0));

function addFeedItem(li, life) {
  const feed = $('feed');
  feed.append(li);
  while (feed.children.length > 7) feed.firstChild.remove();
  setTimeout(() => li.classList.add('fade'), life);
  setTimeout(() => li.remove(), life + 700);
}
function pushFeed(text, kind = 'info') {
  const li = document.createElement('li');
  li.className = kind;
  li.textContent = text;
  addFeedItem(li, kind === 'derby' || kind === 'legendary' ? 12000 : 7500);
}
function pushChat(c) {
  const li = document.createElement('li');
  li.className = 'chat';
  const b = document.createElement('b');
  b.textContent = c.name;
  b.style.color = c.color === '#E8E3D3' || c.color === '#F2B134' ? '#6A5A20' : c.color;
  li.append(b, document.createTextNode(c.text));
  addFeedItem(li, 14000);
}

function buzz(ms) {
  if (isTouch && navigator.vibrate) { try { navigator.vibrate(ms); } catch { /* not allowed */ } }
}

function flashPrompt(text, cls, ms) {
  flash = { text, cls, until: performance.now() + ms };
}

// ================================================================ panels

const PANELS = ['shop', 'shack', 'journal', 'help', 'phone'];
let shopSig = '';

function togglePanel(name) {
  if (openPanel === name) { closePanels(); if (!isTouch) requestLock(false); return; }
  closePanels();
  openPanel = name;
  $(name).hidden = false;
  holdFish = false;
  if (phase === 'charging') phase = 'idle';
  if (pointerLocked) document.exitPointerLock();
  shopSig = '';
  if (name === 'shop') renderShop();
  if (name === 'shack') renderShack();
  if (name === 'journal') renderJournal();
  if (name === 'help') syncSettingsUI();
  if (name === 'phone') { showApp('home'); renderPhone(); }
  sfx.ui();
}
function closePanels() {
  PANELS.forEach((p) => { $(p).hidden = true; });
  openPanel = null;
}
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { closePanels(); if (!isTouch) requestLock(true); }));

function interact() {
  if (openPanel === 'shop' || openPanel === 'shack') { closePanels(); if (!isTouch) requestLock(false); return; }
  const m = me();
  if (!m || !W || !alive() || phase !== 'idle') return;
  if (boating()) { boatAction('land'); return; }
  if (near(m, W.camp.dealer)) togglePanel('shop');
  else if (near(m, W.camp.shack)) togglePanel('shack');
  else if (nearWaterEdge(m)) boatAction('launch', !myData.ownsBoat && onDock(m.x, m.z));
}

function nearWaterEdge(m) {
  for (let r = 1.4; r <= 4.4; r += 1) for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    if (inWater(m.x + Math.sin(a) * r, m.z + Math.cos(a) * r)) return true;
  }
  return false;
}
function nearLandEdge(m) {
  for (let r = 0.8; r <= 4.4; r += 0.9) for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    if (onLand(m.x + Math.sin(a) * r, m.z + Math.cos(a) * r)) return true;
  }
  return false;
}

function boatAction(action, rent = false) {
  socket.emit('boat', { action, rent }, (res) => {
    if (!res) return;
    const m = me();
    if (res.ok) {
      if (m) {
        m.x = m.tx = res.x;
        m.z = m.tz = res.z;
        if (Number.isFinite(res.rot)) { m.rot = m.trot = res.rot; cam.yaw = res.rot + Math.PI; }
      }
      if (myData) myData.boat = action === 'launch';
      fx.splash(res.x, res.z, 12, 0.8);
      sfx.splash(0.8);
      flashPrompt(action === 'launch' ? 'On the water. E near land to step ashore.' : 'Back on dry land.', 'good', 2000);
      if (openPanel === 'phone') renderPhone();
    } else if (res.needBoat) {
      openPhone('boat');
      flashPrompt(res.msg, '', 2400);
    } else if (res.msg) flashPrompt(res.msg, '', 1800);
  });
}

// ---------- phone

let phoneApp = 'home';
function openPhone(app) {
  if (openPanel !== 'phone') togglePanel('phone');
  showApp(app);
}
function showApp(app) {
  phoneApp = app;
  document.querySelectorAll('#phone .app').forEach((el) => el.classList.toggle('on', el.dataset.screen === app));
  renderPhone();
}
function renderPhone() {
  if (openPanel !== 'phone' || !myData || !W) return;
  $('phoneTime').textContent = fmtHour(clockHour);
  $('phoneTip').textContent = isTouch ? 'Tap Phone again to put it away' : 'P puts the phone away';
  const d = myData;
  if (phoneApp === 'market') {
    const cut = Math.floor(d.bag.value * W.market.remote);
    $('mkBag').textContent = d.bag.n ? `${d.bag.n} fish in your bag, worth $${d.bag.value} at Moss's stand.` : 'Your bag is empty. Go catch something.';
    $('mkSell').textContent = d.bag.n ? `Sell now for $${cut}` : 'Nothing to sell';
    $('mkSell').disabled = !d.bag.n;
  } else if (phoneApp === 'boat') {
    $('btStatus').textContent = d.boat ? "You're out on the water." : d.ownsBoat ? 'Your boat is ready at any shoreline.' : `No boat yet. Moss sells one for $${W.boat.buy}, or rent one for $${W.boat.rent} a trip.`;
    const box = $('btActions');
    box.replaceChildren();
    const add = (label, fn, primary) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (primary) b.className = 'primary';
      b.addEventListener('click', () => { b.blur(); fn(); });
      box.append(b);
    };
    const m = me();
    if (d.boat) add('Step ashore', () => boatAction('land'), true);
    else if (d.ownsBoat) add('Launch here', () => boatAction('launch'), true);
    else add(`Rent and launch for $${W.boat.rent}`, () => boatAction('launch', true), true);
    if (!d.boat && m && !nearWaterEdge(m)) {
      const note = document.createElement('p');
      note.className = 'small';
      note.textContent = 'Walk right up to the water first.';
      box.append(note);
    }
  } else if (phoneApp === 'messages') renderMessages();
}
function renderMessages() {
  const list = $('msgList');
  list.replaceChildren();
  for (const c of messageLog.slice(-20)) {
    const li = document.createElement('li');
    const b = document.createElement('b');
    b.textContent = c.name;
    b.style.color = c.color;
    li.append(b, document.createTextNode(c.text));
    list.append(li);
  }
  if (!messageLog.length) {
    const li = document.createElement('li');
    li.textContent = 'No messages yet. Say hi to the lake.';
    list.append(li);
  }
  list.scrollTop = list.scrollHeight;
}
function drawBigMap() {
  const c = $('bigMap');
  const g = c.getContext('2d');
  const m = me();
  if (!W || !m) return;
  // north-up: x from -70 to 70, z from 60 down to -150
  const S = c.width / 140;
  const map = (x, z) => [(x + 70) * S, (60 - z) * S];
  g.fillStyle = '#4A6A3C';
  g.fillRect(0, 0, c.width, c.height);
  const rect = (x0, z0, x1, z1, fill) => { const [a, b] = map(x0, z0); const [e, f] = map(x1, z1); g.fillStyle = fill; g.fillRect(a, b, e - a, f - b); };
  rect(-80, W.ocean.maxZ + 12, 80, -200, '#C9B98E');
  rect(-80, W.ocean.maxZ, 80, -200, '#1E5E7A');
  rect(W.channel.minX - 1.5, W.channel.maxZ, W.channel.maxX + 1.5, W.channel.minZ, '#C9B98E');
  rect(W.channel.minX, W.channel.maxZ, W.channel.maxX, W.channel.minZ, '#2E7F86');
  const [lx, lz] = map(0, 0);
  g.fillStyle = '#C9B98E'; g.beginPath(); g.arc(lx, lz, (W.shoreRadius + 2) * S, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2E7F86'; g.beginPath(); g.arc(lx, lz, W.lakeRadius * S, 0, Math.PI * 2); g.fill();
  rect(W.dock.minX, W.dock.maxZ, W.dock.maxX, W.dock.minZ, '#9A7650');
  for (const h of hotspots) { const [x, z] = map(h.x, h.z); g.strokeStyle = '#F2B134'; g.lineWidth = 3; g.beginPath(); g.arc(x, z, h.r * S, 0, Math.PI * 2); g.stroke(); }
  const label = (x, z, t, bg) => { const [px, pz] = map(x, z); g.fillStyle = bg; g.beginPath(); g.arc(px, pz, 13, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.font = '600 15px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, px, pz + 1); };
  label(W.camp.dealer.x, W.camp.dealer.z, 'M', '#C73A28');
  label(W.camp.shack.x, W.camp.shack.z, 'S', '#6B4A32');
  const [fx0, fz0] = map(13, -109);
  g.fillStyle = '#F2EFE6'; g.fillRect(fx0 - 4, fz0 - 9, 8, 18);
  for (const v of views.values()) {
    if (v.data.alive === false) continue;
    const [x, z] = map(v.x, v.z);
    g.fillStyle = v.data.color; g.strokeStyle = '#102220'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, z, v.data.id === myId ? 8 : 6, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.fillStyle = '#EEF2EC'; g.font = '600 14px Fredoka, sans-serif'; g.textAlign = 'center';
  g.fillText('The big water', c.width / 2, map(0, -140)[1]);
  g.fillText('N', c.width / 2, 16);
}
$('phone').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  btn.blur();
  sfx.ui();
  if (btn.id === 'phoneHome') return showApp('home');
  const app = btn.dataset.app;
  if (app === 'journal') { togglePanel('journal'); return; }
  if (app === 'settings') { togglePanel('help'); return; }
  if (app) showApp(app);
  if (btn.id === 'mkSell') {
    socket.emit('sellRemote', {}, (res) => {
      if (res && res.ok) {
        sfx.coin();
        completeGoal('sell');
        buzz(30);
        const m = me();
        if (m) fx.floater(m.x, 2.3, m.z, `+$${res.total}`, 'cash', 1.8);
      }
      if (res && res.msg) flashPrompt(res.msg, res.ok ? 'good' : '', 1800);
      setTimeout(renderPhone, 200);
    });
  }
  if (btn.id === 'camShot') takePhoto();
});
$('msgForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('msgInput').value.trim();
  if (text) socket.emit('chat', text);
  $('msgInput').value = '';
});
function takePhoto() {
  const was = openPanel;
  closePanels();
  document.body.classList.add('photo');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (quality() === 'high') composer.render(0); else renderer.render(scene, camera);
    let url = null;
    try { url = renderer.domElement.toDataURL('image/png'); } catch { /* blocked */ }
    document.body.classList.remove('photo');
    const sh = $('shutter');
    sh.hidden = true; void sh.offsetWidth; sh.hidden = false;
    setTimeout(() => { sh.hidden = true; }, 400);
    sfx.shutter();
    if (url) {
      const a = document.createElement('a');
      a.href = url;
      a.download = `loon-lake-${Date.now()}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      flashPrompt('Photo saved.', 'good', 1400);
    }
    if (was === 'phone') openPhone('camera');
  }));
}

// ---------- shop

function itemButton(action, title, desc, price, disabled, owned) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'item' + (owned ? ' owned' : '');
  if (action) b.dataset.buy = action;
  b.disabled = !!disabled;
  const t = document.createElement('b');
  t.textContent = title;
  const d = document.createElement('small');
  d.textContent = desc;
  const p = document.createElement('span');
  p.className = 'price';
  p.textContent = price;
  b.append(t, p, d);
  return b;
}

function renderShop() {
  if (openPanel !== 'shop' || !myData || !W) return;
  const d = myData;
  const sig = [d.cash, d.boatTier, d.rod, d.bait, Object.values(d.guns || {}).join(''), JSON.stringify(d.att || 0), JSON.stringify(d.glvl || 0), d.ammo, d.bag.n, d.bag.value, d.pocket.weed, d.pocket.whiskey, d.pocket.crank].join('|');
  if (sig === shopSig) return;
  shopSig = sig;
  const sell = $('sellBtn');
  sell.disabled = !d.bag.n;
  sell.textContent = d.bag.n ? `Sell ${d.bag.n} fish for $${d.bag.value}` : 'Your bag is empty. Go catch something.';

  const tackle = $('tackleList');
  tackle.replaceChildren();
  const nextRod = W.rods[d.rod + 1];
  const rod = W.rods[d.rod];
  tackle.append(nextRod
    ? itemButton('rod', nextRod.name, `${nextRod.desc} Casts ${nextRod.castMax} m. You have a ${rod.name.toLowerCase()}.`, `$${nextRod.price}`, d.cash < nextRod.price)
    : itemButton(null, rod.name, 'The best rod Moss has. Casts all the way to the deep middle.', 'Owned', true, true));
  const nextBait = W.baits[d.bait + 1];
  const bait = W.baits[d.bait];
  tackle.append(nextBait
    ? itemButton('bait', nextBait.name, `${nextBait.desc} You're using ${bait.name.toLowerCase()}.`, `$${nextBait.price}`, d.cash < nextBait.price)
    : itemButton(null, bait.name, 'Nothing better in the tackle box. Legends notice it.', 'Owned', true, true));

  const gear = $('gearList');
  gear.replaceChildren();
  const nextBoat = W.boats[(d.boatTier ?? -1) + 1];
  const boat = W.boats[d.boatTier];
  gear.append(nextBoat
    ? itemButton('boat', nextBoat.name, `${nextBoat.desc} Top speed ${nextBoat.speed}.${boat ? ` You have the ${boat.name.toLowerCase()}.` : ''}`, `$${nextBoat.price}`, d.cash < nextBoat.price)
    : itemButton(null, boat.name, 'The best boat Moss can get you. Launch it from any shore with E, or from your phone.', 'Owned', true, true));
  for (const id of Object.keys(W.guns)) {
    const g = W.guns[id];
    if (d.guns[id]) continue;
    gear.append(itemButton(id, g.name, `${g.desc} ${g.mag} per magazine. Comes loaded with ${g.start} spare rounds.`, `$${g.price}`, d.cash < g.price));
  }
  for (const id of GUN_ORDER) {
    if (!d.guns[id]) continue;
    const L = W.gunLevels;
    const lvl = d.glvl[id] || 0;
    if (lvl + 1 < L.names.length) {
      const cost = Math.max(60, Math.round(W.guns[id].price * L.price[lvl + 1]));
      const dmgNow = Math.round(W.guns[id].damage * L.mul[lvl]);
      const dmgNext = Math.round(W.guns[id].damage * L.mul[lvl + 1]);
      gear.append(itemButton(`lvl:${id}`, `${W.guns[id].name}: ${L.names[lvl + 1]}`, `Damage ${dmgNow} to ${dmgNext} per shot${W.guns[id].pellets > 1 ? ' pellet' : ''}.`, `$${cost}`, d.cash < cost));
    }
    for (const key of Object.keys(W.attachments)) {
      const at = W.attachments[key];
      if (d.att[id][key] || (at.only && !at.only.includes(id))) continue;
      gear.append(itemButton(`att:${id}:${key}`, `${W.guns[id].name}: ${at.name}`, at.desc, `$${at.price}`, d.cash < at.price));
    }
  }
  if (Object.values(d.guns).some(Boolean)) gear.append(itemButton('ammo', `Ammo, ${W.shop.ammoCount} rounds`, `You have ${d.ammo} spare. Press R to reload.`, `$${W.shop.ammo}`, d.cash < W.shop.ammo));

  const counter = $('counterList');
  counter.replaceChildren();
  DRUGS.forEach((name, i) => {
    counter.append(itemButton(name, `${name[0].toUpperCase()}${name.slice(1)}`, `${DRUG_INFO[name]} You have ${d.pocket[name]}.`, `$${W.shop[name]}`, d.cash < W.shop[name]));
  });
}

$('shop').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  btn.blur();
  if (btn.id === 'sellBtn') return sell();
  if (btn.dataset.buy) buy(btn.dataset.buy);
});

function sell() {
  socket.emit('sell', {}, (res) => {
    if (res && res.ok) {
      sfx.coin();
      completeGoal('sell');
      buzz(30);
      const m = me();
      if (m) {
        fx.floater(m.x, 2.3, m.z, `+$${res.total}`, 'cash', 1.8);
        fx.sparkle(m.x, 1.6, m.z, 0xF2B134, 22, 1.6);
      }
    } else if (res && res.msg) flashPrompt(res.msg, '', 1500);
    shopSig = '';
  });
}

function buy(item) {
  socket.emit('buy', item, (res) => {
    if (!res) return;
    if (res.ok) { sfx.coin(); if (res.gear) completeGoal('gear'); }
    if (res.msg) flashPrompt(res.msg, res.ok ? 'good' : '', 1600);
    shopSig = '';
  });
}

// ---------- shack

const SLOT_ICONS = {
  boot: '<path d="M14 6h12v22l12 4c3 1 4 3 4 6v4H10V30z" fill="#4A3A2A"/><path d="M10 38h32" stroke="#2A2018" stroke-width="3"/>',
  perch: '<path d="M4 24c8-9 22-10 32-4l8-6-2 10 2 10-8-6C26 34 12 33 4 24z" fill="#E0A106"/><path d="M16 17v14M22 16v16M28 17v14" stroke="#5A4A10" stroke-width="2.4"/><circle cx="10" cy="22" r="1.8" fill="#1D2A25"/>',
  pike: '<path d="M2 24c10-6 26-7 36-3l8-5-2 8 2 8-8-5C28 31 12 30 2 24z" fill="#6B8F4E"/><circle cx="8" cy="22.5" r="1.6" fill="#1D2A25"/><path d="M14 22h3M20 25h3M26 22h3M32 25h3" stroke="#E8E3C0" stroke-width="2"/>',
  muskie: '<path d="M2 24c10-7 26-8 36-3l8-5-2 8 2 8-8-5C28 32 12 31 2 24z" fill="#3E7C4A"/><path d="M14 18v12M20 17v14M26 18v12M32 19v10" stroke="#1E3E24" stroke-width="2.4"/><circle cx="8" cy="22.5" r="1.6" fill="#EEF2EC"/>',
  weed: '<path fill="#4E9A48" d="M24 44V26c-7-2-12-8-12-15 7 .5 11 5 12 11 1-6 5-10.5 12-11 0 7-5 13-12 15v18z"/>',
  seven: '<text x="24" y="38" text-anchor="middle" font-family="Alfa Slab One, Georgia, serif" font-size="34" fill="#C2261A">7</text>',
};
const SLOT_KEYS = Object.keys(SLOT_ICONS);
let spinning = false;

function cardEl(c) {
  const el = document.createElement('div');
  if (!c) { el.className = 'card back'; return el; }
  el.className = 'card' + (c.s === 1 || c.s === 2 ? ' red' : '');
  el.textContent = RANKS[c.r] + SUITS[c.s];
  return el;
}

let tableSig = '';
function renderShack() {
  const t = table;
  const playing = t && t.active && t.status === 'play';
  $('playRow').hidden = !playing;
  $('betRow').hidden = playing;
  const cash = myData ? myData.cash : 0;
  $('betRow').querySelectorAll('button').forEach((b) => { b.disabled = cash < Number(b.dataset.bet); });
  $('doubleBtn').disabled = !(t && t.canDouble);
  $('spinBtn').disabled = spinning || cash < 10 || playing;
  const sig = JSON.stringify(t);
  if (sig === tableSig) return;
  tableSig = sig;
  if (!t || !t.active) {
    $('dealerCards').replaceChildren();
    $('playerCards').replaceChildren();
    $('dealerTotal').textContent = '';
    $('playerTotal').textContent = '';
    $('handResult').textContent = 'Blackjack pays 3 to 2. Inez stands on 17.';
    $('handResult').className = '';
    return;
  }
  $('dealerCards').replaceChildren(...(t.dealer || []).map(cardEl));
  $('playerCards').replaceChildren(...(t.player || []).map(cardEl));
  $('dealerTotal').textContent = t.dealerTotal ?? '';
  $('playerTotal').textContent = t.playerTotal ?? '';
  const res = $('handResult');
  if (t.status === 'done') {
    const won = t.result === 'win' || t.result === 'blackjack';
    res.textContent = won ? `${HAND_TEXT[t.result]} +$${t.payout}.` : HAND_TEXT[t.result] || '';
    res.className = won ? 'win' : '';
  } else {
    res.textContent = `$${t.bet} on the table. Hit, stand, or double.`;
    res.className = '';
  }
}

function setReel(el, id) { el.innerHTML = `<svg viewBox="0 0 48 48" aria-label="${id}">${SLOT_ICONS[id]}</svg>`; }
document.querySelectorAll('#reels .reel').forEach((el, i) => setReel(el, SLOT_KEYS[(i * 2) % SLOT_KEYS.length]));

function spin() {
  if (spinning) return;
  socket.emit('spin', {}, (res) => {
    if (!res || !res.ok) { if (res && res.msg) $('slotMsg').textContent = res.msg; return; }
    spinning = true;
    renderShack();
    const reels = [...document.querySelectorAll('#reels .reel')];
    reels.forEach((el) => el.classList.add('spin'));
    $('slotMsg').textContent = 'Spinning.';
    $('slotMsg').className = '';
    const stops = [500, 820, 1140];
    const start = performance.now();
    const tick = setInterval(() => {
      const el = performance.now() - start;
      reels.forEach((r, i) => { if (el < stops[i]) setReel(r, SLOT_KEYS[Math.floor(Math.random() * SLOT_KEYS.length)]); });
      sfx.slotTick();
    }, 75);
    stops.forEach((ms, i) => setTimeout(() => {
      reels[i].classList.remove('spin');
      setReel(reels[i], res.reels[i]);
      sfx.card();
    }, ms));
    setTimeout(() => {
      clearInterval(tick);
      spinning = false;
      const msg = $('slotMsg');
      if (res.mult >= 8) { msg.textContent = `Jackpot. $${res.payout}.`; msg.className = 'win'; sfx.slotWin(true); }
      else if (res.mult > 1) { msg.textContent = `Three of a kind. $${res.payout}.`; msg.className = 'win'; sfx.slotWin(false); }
      else if (res.mult === 1) { msg.textContent = 'A pair. Your $10 comes back.'; msg.className = ''; }
      else { msg.textContent = 'Nothing. The machine thanks you.'; msg.className = ''; }
      renderShack();
    }, 1200);
  });
}

$('shack').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  btn.blur();
  const say = (res) => { if (res && res.msg) $('handResult').textContent = res.msg; };
  if (btn.dataset.bet) { sfx.card(); socket.emit('bet', Number(btn.dataset.bet), say); }
  else if (btn.id === 'hitBtn') { sfx.card(); socket.emit('hit', {}, say); }
  else if (btn.id === 'standBtn') { sfx.card(); socket.emit('stand', {}, say); }
  else if (btn.id === 'doubleBtn') { sfx.card(); socket.emit('double', {}, say); }
  else if (btn.id === 'spinBtn') spin();
});

// ---------- journal and fish art

function fishSvg(sid, color, missing) {
  const fill = missing ? 'rgba(238,242,236,.14)' : color || '#4FA3A5';
  const ink = missing ? 'rgba(238,242,236,.25)' : '#1D2A25';
  if (sid === 'boot') return `<path d="M40 6h22v24l22 7c6 2 8 5 8 10v5H34V30z" fill="${missing ? fill : '#4A3A2A'}" stroke="${ink}" stroke-width="2"/>`;
  if (sid === 'can') return `<rect x="46" y="8" width="26" height="34" rx="4" fill="${missing ? fill : '#8A8680'}" stroke="${ink}" stroke-width="2"/><path d="M46 16h26M46 34h26" stroke="${ink}" stroke-width="1.5"/>`;
  if (sid === 'tacklebox') return `<rect x="30" y="16" width="60" height="28" rx="4" fill="${missing ? fill : '#3E6B4F'}" stroke="${ink}" stroke-width="2"/><path d="M50 16v-6h20v6" fill="none" stroke="${ink}" stroke-width="3"/><path d="M30 26h60" stroke="${ink}" stroke-width="1.5"/>`;
  const spec = speciesById[sid];
  const long = spec && spec.long !== undefined ? spec.long : LONG_FISH.has(sid);
  const body = long
    ? 'M8 24 C 22 13, 60 12, 90 20 L 112 9 L 107 24 L 112 39 L 90 28 C 60 36, 22 35, 8 24 Z'
    : 'M14 24 C 26 5, 62 3, 84 17 L 106 7 L 100 24 L 106 41 L 84 31 C 62 45, 26 43, 14 24 Z';
  const fin = long ? 'M56 14 L 66 7 L 74 16 Z' : 'M44 9 L 58 2 L 70 12 Z';
  let extra = '';
  if (!missing && spec && spec.pattern === 'spots') extra = '<g fill="#1D2A25" opacity=".55"><circle cx="36" cy="18" r="2"/><circle cx="48" cy="27" r="2"/><circle cx="58" cy="17" r="2"/><circle cx="70" cy="26" r="2"/><circle cx="80" cy="20" r="1.8"/></g>';
  if (!missing && spec && spec.pattern === 'bars') extra = '<path d="M38 12v24M50 10v28M62 12v24M74 15v18" stroke="#1D2A25" stroke-width="3" opacity=".45"/>';
  if (!missing && spec && spec.pattern === 'stripe') extra = '<path d="M22 24 C 44 22, 66 22, 92 24" stroke="#1D2A25" stroke-width="3" opacity=".5" fill="none"/>';
  if (!missing && sid === 'perch') extra = '<path d="M40 12v24M52 10v28M64 13v22" stroke="#5A4A10" stroke-width="3" opacity=".7"/>';
  if (!missing && (sid === 'muskie' || sid === 'pike')) extra = '<path d="M34 20h5M46 26h5M58 20h5M70 25h5" stroke="#EEF2EC" stroke-width="2.4" opacity=".7"/>';
  if (!missing && sid === 'catfish') extra = '<path d="M10 25 C 4 30, 2 36, 4 40M12 26 C 8 32, 8 38, 12 42" stroke="#1D2A25" stroke-width="1.6" fill="none"/>';
  const eye = long ? '<circle cx="18" cy="21.5" r="2.4"/>' : '<circle cx="25" cy="21" r="2.8"/>';
  return `<path d="${fin}" fill="${fill}" stroke="${ink}" stroke-width="2"/><path d="${body}" fill="${fill}" stroke="${ink}" stroke-width="2"/>${extra}<g fill="${ink}">${eye}</g>`;
}

function renderJournal() {
  if (!W) return;
  const grid = $('journalGrid');
  grid.replaceChildren();
  let got = 0;
  W.species.forEach((s) => {
    const entry = journal[s.id];
    const card = document.createElement('div');
    card.className = 'jcard' + (entry ? '' : ' missing');
    card.style.borderTopColor = entry ? RARITY_COLOR[s.rarity] : '';
    card.innerHTML = `<svg viewBox="0 0 120 48" aria-hidden="true">${fishSvg(s.id, s.color, !entry)}</svg>`;
    const h = document.createElement('h4');
    h.textContent = s.name;
    const p = document.createElement('p');
    if (entry) {
      got++;
      p.textContent = `${RARITY_LABEL[s.rarity]}. Caught ${entry.n}. Best ${entry.best} lb.`;
    } else {
      p.textContent = `${RARITY_LABEL[s.rarity]}. ${s.hint}`;
    }
    card.append(h, p);
    grid.append(card);
  });
  $('journalCount').textContent = `${got} of ${W.species.length} species`;
}

let tagTimer = null;
function showCatchTag(res) {
  const el = $('catchTag');
  const s = speciesById[res.id] || {};
  clearTimeout(tagTimer);
  el.classList.remove('out', 'legendary');
  el.hidden = true;
  void el.offsetWidth;
  el.hidden = false;
  el.classList.toggle('legendary', res.rarity === 'legendary');
  const stamp = $('tagStamp');
  stamp.textContent = RARITY_LABEL[res.rarity] || '';
  stamp.style.color = RARITY_COLOR[res.rarity] || '#1D2A25';
  $('tagFish').innerHTML = fishSvg(res.id, s.color, false);
  $('tagName').textContent = res.name;
  const w = $('tagWeight');
  w.textContent = String(res.lbs);
  const unit = document.createElement('small');
  unit.textContent = 'lb';
  w.append(unit);
  $('tagValue').textContent = res.value > 0
    ? (res.bagged ? `Worth $${res.value}. It's in your bag.` : `Your bag was full, so Moss paid $${res.value} on the spot.`)
    : 'Worth nothing. It goes in the bag anyway.';
  const flags = $('tagFlags');
  flags.replaceChildren();
  const add = (text, cls) => { const f = document.createElement('span'); f.textContent = text; if (cls) f.className = cls; flags.append(f); };
  if (res.first) add(`First ${res.name.toLowerCase()}`);
  if (res.pb) add('Personal best', 'pb');
  if (res.derbyLead) add('Leads the derby', 'derby');
  else if (res.derby) add('Weighed in for the derby', 'derby');
  if (res.hot) add('Hot spot');
  if (res.xpGain) add(`+${res.xpGain} XP`);
  if (res.levelUp) add(`Level ${res.level}! +$${res.levelBonus}`, 'pb');
  for (const q of res.questDone || []) add(`Quest done: +$${q.reward}`, 'derby');
  const stay = res.rarity === 'legendary' ? 6500 : RARITY_RANK[res.rarity] >= 4 ? 5200 : 4200;
  tagTimer = setTimeout(() => {
    el.classList.add('out');
    tagTimer = setTimeout(() => { el.hidden = true; }, 380);
  }, stay);
}

// ---------- help and settings

function syncSettingsUI() {
  $('setSens').value = settings.sens;
  $('setVol').value = settings.volume;
  $('setBright').value = settings.bright;
  $('setInvert').checked = settings.invertY;
  $('setShake').checked = settings.shake;
  $('setBlood').checked = settings.blood;
  $('setQuality').value = settings.quality;
}
function saveSettings() {
  settings.sens = Number($('setSens').value);
  settings.volume = Number($('setVol').value);
  settings.bright = Number($('setBright').value);
  applyBrightness();
  settings.invertY = $('setInvert').checked;
  settings.shake = $('setShake').checked;
  settings.blood = $('setBlood').checked;
  settings.quality = $('setQuality').value;
  $('qualityNote').hidden = quality() === loadQuality;
  applyQuality();
  sfx.setVolume(settings.volume);
  store.set('loonlake.settings', settings);
}
['setSens', 'setVol', 'setBright', 'setInvert', 'setShake', 'setQuality', 'setBlood'].forEach((id) => $(id).addEventListener('input', saveSettings));

// ---------- goals

const goalsDone = new Set(store.get('loonlake.goals', []));
function completeGoal(id, silent) {
  if (goalsDone.has(id)) return;
  goalsDone.add(id);
  store.set('loonlake.goals', [...goalsDone]);
  if (!silent) {
    const g = $('goal');
    g.classList.remove('done');
    void g.offsetWidth;
    g.classList.add('done');
    sfx.ui();
  }
  renderGoal();
}
function renderGoal() {
  const idx = GOALS.findIndex((g) => !goalsDone.has(g.id));
  const box = $('goal');
  if (idx < 0 || !myId) { box.hidden = true; return; }
  box.hidden = false;
  $('goalCount').textContent = `Step ${idx + 1} of ${GOALS.length}`;
  $('goalText').textContent = (isTouch && GOALS[idx].touch) || GOALS[idx].text;
}

// ================================================================ actions

function fishDown() {
  holdFish = true;
  if (!myId || !alive() || openPanel || chatOpen) return;
  if (phase === 'idle') {
    const sm = me();
    if (sm && sm.swimming) { flashPrompt('Get out of the water to fish.', '', 1400); return; }
    if (held !== 'rod') { held = 'rod'; hotbarSig = ''; }
    phase = 'charging'; power = 0; powerDir = 1;
  } else if (phase === 'out' || phase === 'bite') hook();
}

function jump() {
  const m = me();
  if (!m || !alive() || openPanel || chatOpen || phase !== 'idle' || boating() || m.swimming) return;
  // pressing jump a hair before you land still jumps the moment you touch down
  if (jumpY > 0) { jumpBufferAt = audioT; return; }
  // hopping again right as you land builds a speed boost; stopping the chain resets it
  hopBoost = nextHopBoost(hopBoost, audioT - landedAt);
  jumpV = JUMP_V;
  jumpY = 0.001;
  fx.puff(m.x, 0.15, m.z, 0xD9CDB0, 3);
}

function fishUp() {
  holdFish = false;
  if (phase === 'charging') cast();
}

function cast() {
  const m = me();
  if (!m) { phase = 'idle'; return; }
  phase = 'casting';
  const rot = aimRot;
  m.trot = m.rot = rot;
  castSwing = 1;
  sfx.cast();
  socket.emit('cast', { power, rot }, (res) => {
    if (res && res.ok) {
      phase = 'out';
      m.bobberPos = res.bobber;
      m.fly = { t: 0, from: m.tip.getWorldPosition(new THREE.Vector3()) };
      nibbleAt = audioT + rand(1.6, 3.5);
      completeGoal('cast');
      if (res.hot) flashPrompt('Right on a hot spot.', 'good', 1400);
    } else {
      phase = 'idle';
      if (res && res.msg) flashPrompt(res.msg, '', 1800);
    }
  });
}

function hook() {
  const wasBite = phase === 'bite';
  socket.emit('hook', {}, (res) => {
    if (!res) return;
    if (res.result === 'hooked') {
      phase = 'reeling';
      sfx.bite();
      const m = me();
      if (m && m.bobberPos) fx.splash(m.bobberPos.x, m.bobberPos.z, 12, 0.9);
      reel = {
        diff: res.difficulty, tol: res.tol || 1, speed: res.speed || 1, flags: res.reel || {}, heavy: res.heavy,
        tension: 0.15, progress: 0.2, surge: 0, surgeT: 1.4, dir: 0, dirT: 1.1, countered: false, strainAt: 0, side: 0,
      };
      cam.shake += 0.15;
      if (res.heavy) flashPrompt("It's a heavy one.", 'good', 1400);
    } else if (res.result === 'spooked') {
      flashPrompt('Too early. You spooked it.', '', 1600);
    } else if (wasBite && phase === 'bite') {
      phase = 'out';
    }
  });
}

function reelIn() {
  if (phase !== 'out' && phase !== 'bite') return;
  socket.emit('reelIn');
  phase = 'idle';
  const m = me();
  if (m) m.bobberPos = null;
}

function steerInput() {
  let s = 0;
  if (keys.has('KeyD') || keys.has('ArrowRight')) s += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) s -= 1;
  if (touch) s += touch.state.mx;
  return clamp(s, -1, 1);
}

function updateReel(dt) {
  const r = reel;
  const f = r.flags;
  let up = TUNING.tensionUp;
  let down = TUNING.tensionDown;
  let surgeMul = 1;
  if (f.calm) { up *= 0.65; down *= 1.25; }
  if (f.hard) up *= 1.55;
  if (f.spike) surgeMul = 1.8;
  r.surgeT -= dt;
  if (r.surgeT <= 0) {
    r.surge = r.surge ? 0 : 1;
    const pace = f.spike ? 0.55 : 1;
    r.surgeT = (r.surge ? 0.6 + Math.random() * 0.9 : 1.2 + Math.random() * 2.5 * (1.2 - r.diff)) * pace;
    const m = me();
    if (r.surge && m && m.bobberPos) { fx.splash(m.bobberPos.x, m.bobberPos.z, 8, 0.7); sfx.splash(0.5); }
  }
  r.dirT -= dt;
  if (r.dirT <= 0) {
    r.dir = Math.random() < 0.2 + (1 - r.diff) * 0.25 ? 0 : (Math.random() < 0.5 ? -1 : 1);
    r.dirT = 0.8 + Math.random() * 1.6 * (1.25 - r.diff);
  }
  r.side += (r.dir - r.side) * Math.min(1, dt * 3);
  const steer = steerInput();
  const sgn = Math.abs(steer) > 0.3 ? Math.sign(steer) : 0;
  r.countered = r.dir !== 0 && sgn === -r.dir;
  const wrong = r.dir !== 0 && sgn === r.dir;
  if (holdFish) {
    let gain = up + r.diff * 0.5 + r.surge * r.diff * 0.9 * surgeMul;
    if (r.dir !== 0) gain *= r.countered ? 0.55 : wrong ? 1.45 : 1.12;
    r.tension += (gain * dt) / r.tol;
    r.progress += TUNING.reelRate * r.speed * (1 - r.diff * 0.55) * (r.countered ? 1.25 : 1) * (f.calm ? 1.15 : 1) * dt;
    sfx.reel(audioT, r.tension);
  } else {
    r.tension = Math.max(0, r.tension - down * dt * (r.countered ? 1.2 : 1));
    r.progress -= (TUNING.reelDecay + r.surge * 0.05 + (r.dir && !r.countered ? 0.02 : 0)) * dt;
  }
  if (r.tension > TUNING.redline && audioT > r.strainAt) { r.strainAt = audioT + 0.22; sfx.strain(); cam.shake += 0.02; }
  if (r.tension >= 1) return finishReel(false, 'The line snapped.', true);
  if (r.progress <= 0) return finishReel(false, 'It got away.');
  if (r.progress >= 1) return finishReel(true);
}

function finishReel(ok, msg, snapped) {
  reel = null;
  phase = 'idle';
  const m = me();
  if (m) m.bobberPos = null;
  if (!ok) {
    socket.emit('lost');
    if (snapped) { sfx.snap(); cam.shake += 0.25; }
    flashPrompt(msg, '', 1700);
    return;
  }
  socket.emit('land', {}, (res) => {
    if (!res || !res.ok) { flashPrompt((res && res.msg) || 'It slipped off the hook.', '', 1700); return; }
    journal = res.journal || journal;
    showCatchTag(res);
    sfx.land(res.rarity);
    const mm = me();
    if (mm && !res.bagged && res.value > 0) fx.floater(mm.x, 2.3, mm.z, `+$${res.value}`, 'cash', 1.6);
    if (RARITY_RANK[res.rarity] >= 4) cam.shake += 0.3;
    if (mm && res.levelUp) { fx.floater(mm.x, 2.9, mm.z, `Level ${res.level}!`, 'cash', 2.2); sfx.land('legendary'); }
    completeGoal('land');
    if (res.hot) completeGoal('hot');
    if (res.derby) completeGoal('derby');
    if (openPanel === 'journal') renderJournal();
  });
}

// nudge an aim angle toward the nearest body inside a cone: punches always, rifle shots on touch
function assistRot(rot, range, cone) {
  const m = me();
  if (!m) return rot;
  let best = null;
  let bestA = cone;
  const check = (x, z, ok) => {
    if (!ok) return;
    const d = Math.hypot(x - m.x, z - m.z);
    if (d > range || d < 0.15) return;
    const a = Math.atan2(x - m.x, z - m.z);
    const diff = Math.abs(angleDiff(a, rot)) * (0.6 + d / range * 0.4);
    if (diff < bestA) { bestA = diff; best = a; }
  };
  for (const v of views.values()) if (v.data.id !== myId) check(v.x, v.z, v.data.alive !== false);
  for (const v of npcViews.values()) check(v.x, v.z, v.data.alive !== false);
  return best ?? rot;
}

function attack() {
  if (held === 'fists') tryPunch();
  else if (isGun(held)) tryShoot();
}

// left mouse always uses whatever is in your hands
function usePrimary() {
  if (phase !== 'idle' || held === 'rod') { lmbFish = true; fishDown(); return; }
  if (held === 'fists') tryPunch();
  else if (isGun(held)) tryShoot();
  else if (DRUGS.includes(held)) { lmbHeld = false; useDrug(held); }
  else if (held === 'bait') flashPrompt('Your bait goes on the hook when you cast.', '', 1500);
  else if (held === 'bag') {
    lmbHeld = false;
    if (near(me(), W.camp.dealer)) sell();
    else flashPrompt(myData && myData.bag.n ? 'Sell your bag to Moss, or from your phone (P).' : 'Your bag is empty.', '', 1600);
  }
}

function quickPunch() {
  if (!myId || !alive() || phase !== 'idle') return;
  if (held !== 'fists') selectHold('fists', false);
  tryPunch();
}

let nextPunchAt = 0;
let localCombo = 0;
let lastLocalPunch = 0;
function tryPunch() {
  if (!myId || !alive() || openPanel || chatOpen || phase !== 'idle') return;
  const now = performance.now();
  if (now < nextPunchAt) return;
  localCombo = now - lastLocalPunch < 1100 ? (localCombo % 3) + 1 : 1;
  lastLocalPunch = now;
  const heavy = localCombo === 3;
  nextPunchAt = now + (heavy ? 610 : 360);
  const m = me();
  const rot = assistRot(aimRot, 2.8, 1.1);
  if (m) { m.trot = m.rot = rot; startPunch(m, heavy || localCombo === 1 ? 'r' : 'l', heavy); }
  sfx.whoosh(heavy);
  socket.emit('punch', { rot }, (res) => {
    if (!res || !res.ok) { if (res && res.msg) flashPrompt(res.msg, '', 1300); return; }
    if (res.hit === 'safe') { flashPrompt('Camp is a no-fighting zone.', '', 1500); return; }
    if (res.hit === 'player' || res.hit === 'npc') {
      sfx.thud(res.heavy);
      if (res.killed) sfx.kill();
      showHitmark(res.killed);
      cam.shake += res.heavy ? 0.3 : 0.12;
      buzz(res.heavy ? 45 : 20);
      if (res.x != null) {
        if (settings.blood) fx.blood(res.x, 1.4, res.z, Math.sin(rot), Math.cos(rot), res.heavy ? 10 : 4, 0.6);
        else fx.puff(res.x, 1.25, res.z, 0xF2EEE4, res.heavy ? 14 : 7);
        if (res.heavy) fx.floater(res.x, 2.2, res.z, 'Haymaker!', 'dmg', 0.9);
      }
    }
  });
}

function reload() {
  if (!myId || !alive() || !isGun(held) || phase !== 'idle' || !myData) return;
  const g = effGun(held);
  if (!ownsGun(held) || myData.reloadGun || (myData.mag[held] || 0) >= g.mag) return;
  if (myData.ammo <= 0) { flashPrompt('No spare rounds. Moss sells more.', '', 1500); return; }
  socket.emit('reload', { gun: held }, (res) => {
    if (res && res.ok) {
      myData.reloadGun = held;
      myData.reloadLeft = res.ms;
      sfx.reload();
      hotbarSig = '';
    } else if (res && res.msg) flashPrompt(res.msg, '', 1500);
  });
}

function tryShoot() {
  if (!myId || !alive() || openPanel || chatOpen || phase !== 'idle') return;
  const g = effGun(held);
  if (!g) return;
  if (!ownsGun(held)) { flashPrompt(`You need the ${g.name.toLowerCase()}. Moss sells them.`, '', 1500); return; }
  if (myData.reloadGun) return;
  const mag = myData.mag[held] || 0;
  if (mag <= 0) {
    if (myData.ammo <= 0) { flashPrompt('Out of ammo. Moss sells more.', '', 1500); sfx.ui(); }
    else reload();
    return;
  }
  const now = performance.now();
  if (now < nextShotAt) return;
  nextShotAt = now + g.cooldown;
  myData.mag[held] = mag - 1;
  hotbarSig = '';
  const m = me();
  const shotRot = isTouch ? assistRot(aimRot, 60, 0.1) : aimRot;
  if (m) { m.trot = m.rot = shotRot; }
  sfx.shot(g.sound);
  cam.shake += 0.08 + g.pellets * 0.015;
  cam.pitch -= g.recoil || 0.015;
  const gun = held;
  socket.emit('shoot', { rot: shotRot, aiming: cam.aim > 0.5, gun, dist: isTouch ? 0 : aimDist }, (res) => {
    if (!res) return;
    if (res.mag != null && myData) myData.mag[gun] = res.mag;
    if (res.reloading && myData && !myData.reloadGun) { myData.reloadGun = gun; myData.reloadLeft = g.reload; sfx.reload(); }
    if (res.hit === 'safe') { flashPrompt('Camp is a no-shooting zone.', '', 1500); return; }
    if (res.msg) flashPrompt(res.msg, '', 1500);
    if (res.hit === 'player' || res.hit === 'npc' || res.hit === 'fish') {
      showHitmark(res.killed);
      if (res.dmg > 0 && res.x != null && res.hit !== 'fish') fx.floater(res.x, 2.1, res.z, res.crit ? `${res.dmg}!` : String(res.dmg), 'dmg', res.crit ? 1.15 : res.killed ? 1 : 0.8);
      buzz(20);
      if (res.killed) sfx.kill(); else sfx.hitmark();
      if (res.hit === 'fish') fx.splash(res.x, res.z, 10, 0.7);
      else if (res.x != null) fx.puff(res.x, 1.1, res.z);
    }
  });
}

let hitmarkTimer = null;
function showHitmark(kill) {
  const el = $('hitmark');
  el.hidden = false;
  el.classList.toggle('kill', !!kill);
  clearTimeout(hitmarkTimer);
  hitmarkTimer = setTimeout(() => { el.hidden = true; }, kill ? 380 : 180);
}

function useDrug(name) {
  if (!myId || !alive()) return;
  socket.emit('useDrug', name, (res) => {
    if (res && res.ok) {
      sfx.drug(name);
      const m = me();
      if (m) fx.puff(m.x, 1.9, m.z, name === 'weed' ? 0x9FC68A : name === 'whiskey' ? 0xC49A6A : 0xEEEEEE, 6);
    } else if (res && res.msg) flashPrompt(res.msg, '', 1400);
  });
}

// the hotbar only shows what you own, in order, and number keys pick by position
const GUN_ORDER = ['pistol', 'glock', 'arp', 'smg', 'draco', 'shotgun', 'rifle', 'sniper'];
const SLOT_KEYS_LABEL = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
function hotbarList() {
  const owned = myData && myData.guns ? GUN_ORDER.filter((g) => myData.guns[g]) : [];
  return ['fists', 'rod', 'bait', ...owned, ...DRUGS, 'bag'];
}
let held = 'rod';

function canHold(act) {
  if (!myData) return act === 'rod' || act === 'fists';
  if (act === 'fists' || act === 'rod' || act === 'bait' || act === 'bag') return true;
  if (isGun(act)) return ownsGun(act);
  if (DRUGS.includes(act)) return (myData.pocket[act] || 0) > 0;
  return false;
}

function selectHold(act, useIfHeld) {
  if (!myId || !alive()) return;
  if (phase !== 'idle') { flashPrompt('Reel in before you switch hands.', '', 1200); return; }
  if (!canHold(act)) {
    flashPrompt(isGun(act) ? `You need the ${gunOf(act).name.toLowerCase()}. Moss sells them.` : `You are out of ${act}.`, '', 1400);
    return;
  }
  if (useIfHeld && DRUGS.includes(act) && held === act) { useDrug(act); return; }
  if (held === act) return;
  held = act;
  hotbarSig = '';
  sfx.ui();
}

function selectSlot(i) {
  const act = hotbarList()[i];
  if (act) selectHold(act, true);
}

// hotbar clicks: first click puts it in your hands, a second click on a drug uses it
$('slots').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  btn.blur();
  const m = me();
  const act = btn.dataset.act;
  if (!hotbarList().includes(act)) return;
  if (act === 'bag') {
    if (near(m, W.camp.dealer)) sell();
    else if (myData && myData.bag.n) openPhone('market');
    else flashPrompt('Your bag is empty.', '', 1400);
    return;
  }
  if (held !== act) { selectHold(act, false); return; }
  if (DRUGS.includes(act)) useDrug(act);
  else if (act === 'bag') {
    if (near(m, W.camp.dealer)) sell();
    else flashPrompt('Sell your bag to Moss, the M on your map.', '', 1800);
  } else if (act === 'rod' || act === 'bait') {
    if (near(m, W.camp.dealer)) togglePanel('shop');
    else flashPrompt('Moss sells better tackle. Find the M on your map.', '', 1800);
  }
});

// ================================================================ per-frame updates

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const lineWhite = new THREE.Color(0xF1F4EE);
const lineRed = new THREE.Color(0xE0452B);
let sendTimer = 0;
let lastSent = {};
let stepSprint = false;

const castMarker = (() => {
  const g = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.42, 0.6, 32);
  ringGeo.rotateX(-Math.PI / 2);
  const dotGeo = new THREE.CircleGeometry(0.12, 16);
  dotGeo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.9, depthWrite: false });
  g.add(new THREE.Mesh(ringGeo, mat), new THREE.Mesh(dotGeo, mat));
  g.visible = false;
  g.renderOrder = 4;
  scene.add(g);
  g.userData.mat = mat;
  return g;
})();

function computeAim(m) {
  camera.getWorldDirection(tmpD);
  const o = camera.position;
  let t = tmpD.y < -0.02 ? (WATER_Y - o.y) / tmpD.y : 70;
  t = Math.min(t, 80);
  tmpA.copy(o).addScaledVector(tmpD, t);
  const dx = tmpA.x - m.x;
  const dz = tmpA.z - m.z;
  aimRot = Math.hypot(dx, dz) > 1.5 ? Math.atan2(dx, dz) : cam.yaw + Math.PI;
  aimDist = tmpD.y < -0.02 ? Math.hypot(dx, dz) : 0;
}

// bodies are solid: nudge out of any other player or NPC we overlap
function pushOutOfBodies(m) {
  const R = 0.8;
  const each = (x, z, ok) => {
    if (!ok) return;
    const dx = m.x - x;
    const dz = m.z - z;
    const d = Math.hypot(dx, dz);
    if (d >= R || d < 0.001) return;
    const push = R - d;
    const nx = m.x + (dx / d) * push;
    const nz = m.z + (dz / d) * push;
    if (footOk(nx, nz)) { m.x = nx; m.z = nz; }
  };
  for (const v of views.values()) if (v.data.id !== myId) each(v.x, v.z, v.data.alive !== false && !v.data.boat);
  for (const v of npcViews.values()) each(v.x, v.z, v.data.alive !== false);
}

function updateLocal(m, dt) {
  m.walking = false;
  stepSprint = false;
  if (!alive()) { vel.x = 0; vel.z = 0; return; }
  let ix = 0;
  let iz = 0;
  if (!chatOpen) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  }
  if (touch) { ix += touch.state.mx; iz += touch.state.mz; }
  const rifleUp = isGun(held) && ownsGun(held) && cam.aim > 0.3;
  const wasBoat = boating();
  m.swimming = !wasBoat && inWater(m.x, m.z);
  if (m.swimming && jumpY > 0) { jumpY = 0; jumpV = 0; }
  const inBoat = boating();
  const sprint = !rifleUp && !m.swimming && !inBoat && (keys.has('ShiftLeft') || keys.has('ShiftRight') || (touch && touch.state.sprint));
  const boatDef = W.boats[Math.max(0, (myData && myData.boatTier) ?? 0)] || W.boat;
  const baseSpeed = inBoat ? boatDef.speed : W.moveSpeed;
  if (jumpY === 0 && audioT - landedAt > FEEL.hopWindow) hopBoost = 1;
  const maxSpeed = baseSpeed * ((myData && myData.moveMul) || 1) * (sprint ? W.sprint : 1) * (rifleUp ? 0.6 : 1) * (m.swimming ? 0.55 : 1) * (inBoat || m.swimming ? 1 : hopBoost);
  curMax = maxSpeed;
  const canMove = phase === 'idle' && (ix || iz);
  const sy = Math.sin(cam.yaw);
  const cy = Math.cos(cam.yaw);
  let wx = -sy * iz + cy * ix;
  let wz = -cy * iz - sy * ix;
  const wlen = Math.hypot(wx, wz);
  if (wlen > 1) { wx /= wlen; wz /= wlen; }
  const ox = m.x;
  const oz = m.z;
  const ok = inBoat ? inWater : footOk;
  if (inBoat || m.swimming) {
    // boats and swimming move directly
    vel.x = 0; vel.z = 0;
    if (canMove && wlen > 0.05) {
      const step = maxSpeed * dt;
      if (ok(m.x + wx * step, m.z)) m.x += wx * step;
      if (ok(m.x, m.z + wz * step)) m.z += wz * step;
      if (!inBoat) { world.collide(m, 0.35); pushOutOfBodies(m); }
      if (!ok(m.x, m.z)) { m.x = ox; m.z = oz; }
      m.trot = rifleUp ? aimRot : Math.atan2(wx, wz);
    }
  } else {
    // on foot: quick to start and stop on the ground, free steering in the air (holding Space keeps hopping)
    if (jumpY === 0 && (keys.has('Space') || audioT - jumpBufferAt < 0.12) && !chatOpen) { jumpBufferAt = -9; jump(); }
    const airborne = jumpY > 0;
    const moving = canMove && wlen > 0.05;
    const dirx = moving ? wx / wlen : 0;
    const dirz = moving ? wz / wlen : 0;
    const wishSpeed = moving ? Math.min(wlen, 1) * maxSpeed : 0;
    if (airborne) airMove(vel, dirx, dirz, wishSpeed, dt);
    else groundMove(vel, dirx, dirz, wishSpeed, dt);
    if (moving) m.trot = rifleUp ? aimRot : Math.atan2(wx, wz);
    const stepX = vel.x * dt;
    const stepZ = vel.z * dt;
    if (ok(m.x + stepX, m.z)) m.x += stepX;
    if (ok(m.x, m.z + stepZ)) m.z += stepZ;
    world.collide(m, 0.35);
    pushOutOfBodies(m);
    if (!ok(m.x, m.z)) { m.x = ox; m.z = oz; }
    // whatever stopped us (walls, bodies, the shoreline) takes the speed with it
    if (dt > 0) { vel.x = (m.x - ox) / dt; vel.z = (m.z - oz) / dt; }
  }
  if (inBoat) {
    const sp = Math.hypot(m.x - ox, m.z - oz) / Math.max(dt, 1e-3);
    if (sp > 1) { fx.wake(m.x - Math.sin(m.rot) * 1.4, m.z - Math.cos(m.rot) * 1.4, Math.sin(m.rot), Math.cos(m.rot), sp); sfx.motor(audioT, sp); }
  }
  m.walking = Math.hypot(m.x - ox, m.z - oz) > 0.001;
  stepSprint = sprint;
  if (m.walking && !inBoat && !m.swimming && jumpY === 0) sfx.step(audioT, sprint);
  if (m.walking && m.swimming && Math.random() < dt * 5) fx.ripple(m.x, m.z, 0.7, 1, 0.4);
  if (!canMove && (phase === 'charging' || rifleUp)) m.trot = aimRot;
  if (lmbHeld && !openPanel && !chatOpen) {
    if (isGun(held) && effGun(held).auto) tryShoot();
    else if (held === 'fists') tryPunch();
  }
  if (phase === 'charging') {
    power += powerDir * TUNING.castCharge * dt;
    if (power >= 1) { power = 1; powerDir = -1; }
    if (power <= 0) { power = 0; powerDir = 1; }
  }
  if (jumpY > 0) {
    // let go of Space early for a short hop, and fall a touch faster than you rise
    const g = JUMP_G * (jumpV > 0 && !keys.has('Space') ? 2.3 : jumpV < 0 ? 1.2 : 1);
    jumpV -= g * dt;
    jumpY += jumpV * dt;
    if (jumpY <= 0) { jumpY = 0; jumpV = 0; landedAt = audioT; fx.puff(m.x, 0.15, m.z, 0xD9CDB0, 4); }
  }
  m.tx = m.x;
  m.tz = m.z;
  sendTimer += dt;
  if (sendTimer >= 0.05) {
    sendTimer = 0;
    if (m.x !== lastSent.x || m.z !== lastSent.z || m.trot !== lastSent.rot || held !== lastSent.held || jumpY !== lastSent.jy || Math.abs(aimRot - (lastSent.aim || 0)) > 0.01) {
      lastSent = { x: m.x, z: m.z, rot: m.trot, aim: aimRot, held, jy: jumpY };
      socket.emit('move', lastSent);
    }
  }
}

function updateCastMarker(m, t) {
  if (phase !== 'charging' || !W || !myData) { castMarker.visible = false; return; }
  const rod = W.rods[myData.rod] || W.rods[0];
  const dist = W.castMin + power * (rod.castMax - W.castMin);
  const x = m.x + Math.sin(aimRot) * dist;
  const z = m.z + Math.cos(aimRot) * dist;
  const valid = inWater(x, z);
  const hot = valid && hotAt(x, z);
  castInfo = { valid, hot, dock: onDock(x, z) };
  castMarker.visible = true;
  const y = valid ? WATER_Y + wave(x, z, t) + 0.05 : onDock(x, z) ? DOCK_Y + 0.02 : 0.06;
  castMarker.position.set(x, y, z);
  const s = 1 + Math.sin(t * 8) * 0.06;
  castMarker.scale.set(s, 1, s);
  castMarker.userData.mat.color.set(!valid ? 0xE0452B : hot ? 0xF2B134 : 0xFFFFFF);
}

// negative x on a shoulder raises the arm forward; +z on the left arm swings the hand toward the middle
const POSES = {
  idle: { lx: 0, lz: -0.08, rx: 0, rz: 0.08 },
  rod: { lx: 0, lz: -0.08, rx: -0.75, rz: 0.05 },
  rifle: { lx: -1.35, lz: 0.5, rx: -1.25, rz: 0.12 },
  drug: { lx: 0, lz: -0.08, rx: -0.85, rz: 0.1 },
  fists: { lx: -1.2, lz: 0.42, rx: -1.1, rz: -0.42 },
};
function poseLimbs(v, t, moving, fast, pose = 'idle', dt = 0.016) {
  const L = v.limbs;
  const swing = moving ? Math.sin(t * (fast ? 14 : 11)) * (fast ? 0.95 : 0.75) : 0;
  const air = !!v.airborne;
  const legKick = Math.min(1, dt * 18);
  const lTarget = air ? -0.55 : swing;
  const rTarget = air ? 0.4 : -swing;
  L.legL.rotation.x += (lTarget - L.legL.rotation.x) * legKick;
  L.legR.rotation.x += (rTarget - L.legR.rotation.x) * legKick;
  const P = POSES[pose] || POSES.idle;
  const free = pose === 'idle' || pose === 'drug' || pose === 'rod';
  let lx = P.lx - (free ? swing * 0.6 : 0);
  let rx = P.rx + (pose === 'idle' ? swing * 0.6 : 0);
  let lz = P.lz;
  let rz = P.rz;
  // jumping: arms fly up and out, like a Roblox jump
  if (air && pose === 'idle') { lx = -2.7; rx = -2.7; lz = -0.35; rz = 0.35; }
  if (pose === 'fists') {
    const bounce = Math.sin(t * (moving ? 10 : 4)) * 0.06;
    lx += bounce; rx -= bounce;
  }
  let lunge = 0;
  if (v.punchT < 1) {
    v.punchT = Math.min(1, v.punchT + dt / (v.punchHeavy ? 0.42 : 0.26));
    const p = v.punchT;
    const wind = v.punchHeavy ? 0.28 : 0.12;
    let ext;
    if (p < wind) ext = -0.35 * (p / wind);
    else if (p < wind + 0.2) ext = (p - wind) / 0.2;
    else ext = 1 - (p - wind - 0.2) / (0.8 - wind);
    ext = Math.max(-0.35, Math.min(1, ext));
    const reach = v.punchHeavy ? -1.75 : -1.6;
    if (v.punchSide === 'r') { rx = lerp(rx, reach, Math.max(0, ext)) - Math.min(0, ext); rz = lerp(rz, -0.08, Math.max(0, ext)); }
    else { lx = lerp(lx, reach, Math.max(0, ext)) - Math.min(0, ext); lz = lerp(lz, 0.08, Math.max(0, ext)); }
    lunge = Math.max(0, ext) * (v.punchHeavy ? 0.28 : 0.14);
    v.body.rotation.y = (v.punchSide === 'r' ? 0.35 : -0.35) * Math.max(0, ext) * (v.punchHeavy ? 1.4 : 1);
  } else v.body.rotation.y = 0;
  const k = Math.min(1, dt * 16);
  L.armL.rotation.x += (lx - L.armL.rotation.x) * (v.punchT < 1 ? 1 : k);
  L.armR.rotation.x += (rx - L.armR.rotation.x) * (v.punchT < 1 ? 1 : k);
  L.armL.rotation.z += (lz - L.armL.rotation.z) * k;
  L.armR.rotation.z += (rz - L.armR.rotation.z) * k;
  return lunge;
}

function startPunch(v, side, heavy) {
  if (!v) return;
  if (v.model) { v.model.punch(heavy, audioT); return; }
  v.punchT = 0;
  v.punchSide = side;
  v.punchHeavy = !!heavy;
}

function paintHigh(v, h) {
  const on = !!(h && (h.weed || h.whiskey || h.crank));
  v.highMark.visible = on && v.data.alive !== false;
  if (!on) return;
  v.highMark.material.color.set(h.whiskey ? 0xC47A32 : h.weed ? 0x6DBF67 : 0xF4F1EA);
}

function updateView(v, dt, t) {
  const k = 1 - Math.exp(-12 * dt);
  const isMe = v.data.id === myId;
  const aliveNow = v.data.alive !== false;
  if (!isMe) {
    v.walking = Math.hypot(v.tx - v.x, v.tz - v.z) > 0.02;
    v.x += (v.tx - v.x) * k;
    v.z += (v.tz - v.z) * k;
  }
  v.rot += angleDiff(v.trot, v.rot) * Math.min(1, dt * (isMe ? 16 : 12));
  const inBoat = isMe ? boating() : !!v.data.boat;
  if (inBoat && aliveNow) {
    const bt = isMe ? Math.max(0, (myData && myData.boatTier) ?? 0) : v.data.bt || 0;
    if (!v.boatMesh || v.boatBuilt !== bt) {
      if (v.boatMesh) v.group.remove(v.boatMesh);
      v.boatMesh = makeBoatMesh(bt);
      v.boatBuilt = bt;
      v.group.add(v.boatMesh);
    }
    v.boatMesh.visible = true;
    const wy = WATER_Y + wave(v.x, v.z, t);
    v.y = wy - (v.model ? 0.46 : 0.15);
    v.boatMesh.position.y = (v.model ? 0.46 : 0.15) - 0.18;
    v.boatMesh.rotation.set(Math.sin(t * 1.3 + v.x) * 0.05, 0, Math.cos(t * 1.1 + v.z) * 0.05);
    if (!isMe && v.walking && Math.random() < dt * 20) fx.wake(v.x - Math.sin(v.rot) * 1.4, v.z - Math.cos(v.rot) * 1.4, Math.sin(v.rot), Math.cos(v.rot), 7);
  } else {
    if (v.boatMesh) v.boatMesh.visible = false;
    const swimNow = isMe ? !!v.swimming : !!v.data.swim;
    const restY = swimNow ? WATER_Y + wave(v.x, v.z, t) - 0.3 : onDock(v.x, v.z) ? DOCK_Y : 0;
    v.y += (restY - v.y) * k;
    v.swimLean = (v.swimLean || 0) + ((swimNow && aliveNow ? 1.1 : 0) - (v.swimLean || 0)) * k;
  }
  v.group.rotation.order = 'YXZ';
  v.group.rotation.x = inBoat ? 0 : v.swimLean || 0;
  if (!isMe) v.jyS = (v.jyS || 0) + ((v.jy || 0) - (v.jyS || 0)) * k;
  const jOff = isMe ? jumpY : v.jyS || 0;
  const wasAir = !!v.airborne;
  v.airborne = jOff > 0.06 && aliveNow;
  if (wasAir && !v.airborne) v.squash = 1; // landing: a quick squash, then it springs back
  v.squash = Math.max(0, (v.squash || 0) - dt * 7);
  const bob = aliveNow && v.walking && !v.airborne ? Math.abs(Math.sin(t * 10)) * 0.06 : 0;
  v.group.rotation.y = v.rot;
  v.group.rotation.z = aliveNow ? 0 : Math.PI / 2;
  const state = isMe ? { charging: 'charging', casting: 'waiting', out: 'waiting', bite: 'bite', reeling: 'reeling' }[phase] || 'idle' : v.state;
  const inHand = isMe ? held : (v.data.held || 'rod');
  const fishing = state !== 'idle';
  v.pivot.visible = aliveNow && (fishing || inHand === 'rod');
  const gunHeld = isGun(inHand) && !!(v.data.guns && v.data.guns[inHand]);
  v.rifle.visible = aliveNow && !fishing && gunHeld;
  if (gunHeld) {
    const ga = (isMe ? myData && myData.att && myData.att[inHand] : v.data.ga) || {};
    const key = `${inHand}|${ga.drum ? 'd' : ''}${ga.laser ? 'l' : ''}${ga.switch ? 's' : ''}`;
    if (v.gunKey !== key) {
      if (v.gunMesh) v.rifle.remove(v.gunMesh);
      v.gunMesh = buildGunModel(inHand, ga);
      v.rifle.add(v.gunMesh);
      v.gunKey = key;
      v.rifle.children.forEach((c) => { c.visible = c === v.gunMesh; });
    }
    v.rifle.scale.setScalar(1);
  }
  const drug = !fishing && aliveNow && (inHand === 'weed' || inHand === 'whiskey' || inHand === 'crank');
  v.hand.visible = drug;
  for (const child of v.hand.children) child.visible = drug && child.name === inHand;
  v.label.visible = !isMe && aliveNow;
  const pose = !aliveNow ? 'idle' : fishing || inHand === 'rod' ? 'rod' : gunHeld ? 'rifle' : inHand === 'fists' ? 'fists' : drug ? 'drug' : 'idle';
  if (v.model) {
    const px = v.px ?? v.x;
    const pz = v.pz ?? v.z;
    v.speed += ((dt > 0 ? Math.hypot(v.x - px, v.z - pz) / dt : 0) - v.speed) * Math.min(1, dt * 8);
    v.px = v.x; v.pz = v.z;
    v.group.rotation.z = 0;
    v.group.position.set(v.x, v.y + jOff, v.z);
    animateModel(v, dt, aliveNow && v.walking && !inBoat, isMe && stepSprint, pose, aliveNow, inBoat && aliveNow);
  } else {
    const lunge = poseLimbs(v, t, aliveNow && v.walking, isMe && stepSprint, pose, dt);
    v.group.position.set(v.x + Math.sin(v.rot) * lunge, v.y + bob + jOff + (aliveNow ? 0 : 0.35), v.z + Math.cos(v.rot) * lunge);
    const sq = v.squash || 0;
    v.group.scale.set(1 + 0.09 * sq, 1 - 0.15 * sq, 1 + 0.09 * sq);
  }
  const beamOn = aliveNow && gunHeld && !fishing && !!(isMe ? myData && myData.att && myData.att[inHand] && myData.att[inHand].laser : v.data.lz);
  if (beamOn) {
    if (!v.beam) { v.beam = makeBeam(); scene.add(v.beam); }
    v.rifle.getWorldPosition(tmpA);
    const fwdX = Math.sin(isMe ? aimRot : v.rot);
    const fwdZ = Math.cos(isMe ? aimRot : v.rot);
    const len = isMe && aimDist > 0 ? Math.min(aimDist, 70) : 45;
    const endY = isMe && aimDist > 0 ? surfaceAt(tmpA.x + fwdX * len, tmpA.z + fwdZ * len, t) + 0.05 : tmpA.y;
    v.beam.visible = true;
    v.beam.position.copy(tmpA);
    tmpB.set(tmpA.x + fwdX * len, endY, tmpA.z + fwdZ * len);
    v.beam.lookAt(tmpB);
    v.beam.children[0].scale.z = len;
    v.beam.children[0].position.z = len / 2;
    v.beam.children[1].position.z = len;
    v.beam.children[1].scale.setScalar(0.8 + Math.sin(t * 30) * 0.15);
  } else if (v.beam) v.beam.visible = false;
  if (v.flash > 0) { v.flash -= dt; v.cloth.emissive.setRGB(v.flash > 0 ? 0.6 : 0, 0, 0); }

  let tilt = 0.45;
  if (state === 'waiting' || state === 'bite') tilt = 1.05;
  if (state === 'reeling') tilt = isMe && reel ? 0.75 - reel.tension * 0.45 + Math.sin(t * 22) * 0.04 * reel.tension : 0.7 + Math.sin(t * 14) * 0.08;
  if (state === 'charging') tilt = -0.4 - power * 0.5;
  if (isMe && castSwing > 0) { castSwing = Math.max(0, castSwing - dt * 3); tilt = lerp(1.25, -0.8, castSwing); }
  v.pivot.rotation.x += (tilt - v.pivot.rotation.x) * Math.min(1, dt * (isMe ? 18 : 12));
  v.pivot.rotation.z = isMe && reel ? -reel.side * 0.3 : 0;
  paintHigh(v, v.data.high);
  const hp = isMe && myData ? myData.hp : v.data.hp;
  v.hp.sprite.visible = aliveNow && hp < 100 && hp > 0;
  if (v.hp.sprite.visible) drawHp(v.hp, hp);
  if (v.bubble && t > v.bubbleUntil) {
    v.group.remove(v.bubble);
    v.bubble.material.map.dispose();
    v.bubble.material.dispose();
    v.bubble = null;
  }
  updateLine(v, dt, t, isMe, state);
}

function updateLine(v, dt, t, isMe, state) {
  if (!v.bobberPos || v.data.alive === false) { v.line.visible = v.bobber.visible = false; v.fly = null; return; }
  const tip = v.tip.getWorldPosition(tmpA);
  const pos = tmpB.set(v.bobberPos.x, WATER_Y + 0.05 + wave(v.bobberPos.x, v.bobberPos.z, t), v.bobberPos.z);
  if (state === 'bite') pos.y -= 0.2 + Math.sin(t * 22) * 0.08;
  if (state === 'waiting' && isMe && nibble > 0) pos.y -= nibble * 0.1;
  if (state === 'reeling') pos.y -= 0.28;
  if (isMe && reel) {
    const f = reel.progress * 0.8;
    const lx = -(pos.z - v.z);
    const lz = pos.x - v.x;
    const ll = Math.hypot(lx, lz) || 1;
    pos.x += (v.x - pos.x) * f + (lx / ll) * reel.side * 1.4 * (1 - reel.progress);
    pos.z += (v.z - pos.z) * f + (lz / ll) * reel.side * 1.4 * (1 - reel.progress);
    if (Math.random() < dt * 6) fx.bubbles(pos.x, pos.z, 1);
  }
  if (v.fly) {
    v.fly.t += dt / 0.55;
    const f = Math.min(v.fly.t, 1);
    const y = pos.y;
    tmpC.copy(pos);
    pos.lerpVectors(v.fly.from, tmpC, f);
    pos.y = v.fly.from.y + (y - v.fly.from.y) * f + Math.sin(f * Math.PI) * 3;
    if (f >= 1) {
      v.fly = null;
      fx.ripple(v.bobberPos.x, v.bobberPos.z, 0.7, 1.1, 0.6);
      if (isMe) { fx.splash(v.bobberPos.x, v.bobberPos.z, 6, 0.45); sfx.plop(); }
    }
  }
  v.bobber.position.copy(pos);
  v.bobber.visible = v.line.visible = true;
  if (isMe) v.line.material.color.copy(lineWhite).lerp(lineRed, reel ? clamp((reel.tension - 0.4) / 0.6, 0, 1) : 0);

  const mid = tmpC.addVectors(tip, pos).multiplyScalar(0.5);
  const taut = state === 'reeling';
  if (!v.fly) mid.y -= taut ? 0.05 : Math.min(1.2, tip.distanceTo(pos) * 0.06);
  const arr = v.line.geometry.attributes.position.array;
  for (let i = 0; i < LINE_PTS; i++) {
    const s = i / (LINE_PTS - 1);
    const a = (1 - s) * (1 - s);
    const b = 2 * (1 - s) * s;
    const c = s * s;
    arr[i * 3] = a * tip.x + b * mid.x + c * pos.x;
    arr[i * 3 + 1] = a * tip.y + b * mid.y + c * pos.y;
    arr[i * 3 + 2] = a * tip.z + b * mid.z + c * pos.z;
  }
  v.line.geometry.attributes.position.needsUpdate = true;
}

function updateNpc(v, dt, t) {
  const k = 1 - Math.exp(-12 * dt);
  const d = v.data;
  const aliveNow = d.alive !== false;
  v.x += (v.tx - v.x) * k;
  v.z += (v.tz - v.z) * k;
  v.rot += angleDiff(v.trot, v.rot) * k;
  const moving = aliveNow && Math.hypot(v.tx - v.x, v.tz - v.z) > 0.02;
  const combat = aliveNow && d.state === 'combat';
  v.group.rotation.y = v.rot;
  if (v.model) {
    v.group.position.set(v.x, onDock(v.x, v.z) ? DOCK_Y : 0, v.z);
    v.rifle.visible = combat;
    v.pivot.visible = aliveNow && d.role === 'angler' && !combat;
    v.speed = moving ? 2 : 0;
    animateModel(v, dt, moving, false, !aliveNow ? 'idle' : combat ? 'rifle' : d.role === 'angler' ? 'rod' : 'idle', aliveNow);
  } else {
    const y = (onDock(v.x, v.z) ? DOCK_Y : 0) + (moving ? Math.abs(Math.sin(t * 10)) * 0.06 : 0) + (aliveNow ? 0 : 0.35);
    v.group.position.set(v.x, y, v.z);
    v.group.rotation.z = aliveNow ? 0 : Math.PI / 2;
    v.rifle.visible = combat || (aliveNow && d.role !== 'angler');
    v.pivot.visible = d.role === 'angler' && !combat;
    poseLimbs(v, t, moving, false, !aliveNow ? 'idle' : v.rifle.visible ? 'rifle' : 'rod', dt);
  }
  if (combat !== v.combat) { v.combat = combat; v.label.material.color.set(combat ? 0xFF8A70 : 0xFFFFFF); }
  v.label.visible = aliveNow;
  if (v.flash > 0) { v.flash -= dt; v.cloth.emissive.setRGB(v.flash > 0 ? 0.6 : 0, 0, 0); }
  const fishing = aliveNow && d.state === 'fishing';
  v.pivot.rotation.x += ((fishing ? 1.05 : 0.45) - v.pivot.rotation.x) * k;
  v.hp.sprite.visible = aliveNow && d.hp < 100;
  if (v.hp.sprite.visible) drawHp(v.hp, d.hp);
  if (d.bobber && aliveNow) {
    v.bobber.visible = v.line.visible = true;
    v.bobber.position.set(d.bobber.x, WATER_Y + 0.05 + wave(d.bobber.x, d.bobber.z, t), d.bobber.z);
    const tip = v.tip.getWorldPosition(tmpA);
    const arr = v.line.geometry.attributes.position.array;
    const mid = tmpC.addVectors(tip, v.bobber.position).multiplyScalar(0.5);
    mid.y -= Math.min(1, tip.distanceTo(v.bobber.position) * 0.06);
    for (let i = 0; i < LINE_PTS; i++) {
      const s = i / (LINE_PTS - 1);
      const a = (1 - s) * (1 - s);
      const b = 2 * (1 - s) * s;
      const c = s * s;
      arr[i * 3] = a * tip.x + b * mid.x + c * v.bobber.position.x;
      arr[i * 3 + 1] = a * tip.y + b * mid.y + c * v.bobber.position.y;
      arr[i * 3 + 2] = a * tip.z + b * mid.z + c * v.bobber.position.z;
    }
    v.line.geometry.attributes.position.needsUpdate = true;
  } else {
    v.bobber.visible = v.line.visible = false;
  }
}

function updateFish(dt, t) {
  const k = 1 - Math.exp(-8 * dt);
  for (const v of fishViews.values()) {
    v.x += ((v.tx ?? v.x) - v.x) * k;
    v.z += ((v.tz ?? v.z) - v.z) * k;
    v.rot += angleDiff(v.trot ?? v.rot, v.rot) * k;
    const y = v.alive ? WATER_Y - 0.2 + Math.sin(t * 2 + v.x) * 0.04 : WATER_Y + wave(v.x, v.z, t) + 0.02;
    v.mesh.position.set(v.x, y, v.z);
    v.mesh.rotation.y = v.rot;
    v.mesh.rotation.z = v.alive ? (v.mesh.userData.mixer ? 0 : Math.sin(t * 6 + v.z) * 0.08) : 1.4;
    if (settings.blood && (v.hurt || !v.alive) && Math.random() < dt * (v.alive ? 5 : 1.5)) fx.waterBlood(v.x, v.z, 1);
    if (v.alive && v.mesh.userData.mixer) v.mesh.userData.mixer.update(dt);
  }
}

function updatePickups(dt, t) {
  const k = 1 - Math.exp(-10 * dt);
  for (const v of pickupViews.values()) {
    v.x += ((v.tx ?? v.x) - v.x) * k;
    v.z += ((v.tz ?? v.z) - v.z) * k;
    v.mesh.position.set(v.x, 0.4 + Math.sin(t * 3 + v.x) * 0.08, v.z);
    v.mesh.rotation.y = t * 1.6;
  }
}

function updateLeaps(dt) {
  for (let i = leaps.length - 1; i >= 0; i--) {
    const l = leaps[i];
    l.t += dt / 0.95;
    const f = Math.min(1, l.t);
    if (l.mesh.userData.mixer) l.mesh.userData.mixer.update(dt * 3);
    const target = l.view ? tmpA.set(l.view.x, (l.view.y || 0) + 1.3, l.view.z) : tmpA.copy(l.from);
    l.mesh.position.lerpVectors(l.from, target, f);
    l.mesh.position.y += Math.sin(f * Math.PI) * 2.8;
    l.mesh.rotation.set(Math.sin(f * 20) * 0.5, Math.atan2(target.x - l.from.x, target.z - l.from.z), f * Math.PI * 2);
    if (f >= 1) {
      const rank = RARITY_RANK[l.rarity] || 0;
      if (rank >= 3) fx.sparkle(target.x, target.y, target.z, rank >= 5 ? 0xF2B134 : rank >= 4 ? 0xC79BFF : 0x9FD0FF, rank >= 5 ? 70 : 30, rank >= 5 ? 3.2 : 2);
      scene.remove(l.mesh);
      disposeGroup(l.mesh);
      leaps.splice(i, 1);
    }
  }
}

const hotTimers = new Map();
let fireflyAcc = 0;
let nextLoon = 18;
function updateAmbientFx(dt, t) {
  for (const h of hotspots) {
    let tm = hotTimers.get(h.id);
    if (!tm) { tm = { b: 0, r: 0 }; hotTimers.set(h.id, tm); }
    const fade = Math.min(1, h.age / 2500) * Math.min(1, h.left / 2500);
    tm.b += dt * 9 * fade;
    while (tm.b > 1) {
      tm.b -= 1;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * h.r * 0.75;
      fx.bubbles(h.x + Math.sin(a) * rr, h.z + Math.cos(a) * rr, 1);
    }
    tm.r -= dt;
    if (tm.r <= 0) {
      tm.r = 0.9 + Math.random() * 0.6;
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * h.r * 0.6;
      fx.ripple(h.x + Math.sin(a) * rr, h.z + Math.cos(a) * rr, 0.6 + Math.random() * 0.6, 1.3, 0.4 * fade);
      if (Math.random() < 0.08 * fade) fx.splash(h.x + Math.sin(a) * rr, h.z + Math.cos(a) * rr, 5, 0.5);
    }
  }
  fx.fire(world.firePos, dt, 1);
  const night = world.day.night;
  if (night > 0.5) {
    fireflyAcc += dt * 6 * night;
    const f = me() || camera.position;
    while (fireflyAcc > 1) {
      fireflyAcc -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 22;
      const x = f.x + Math.sin(a) * r;
      const z = f.z + Math.cos(a) * r;
      if (Math.hypot(x, z) > (W ? W.lakeRadius - 3 : 27)) fx.firefly(x, 0.5 + Math.random() * 1.8, z);
    }
  }
  if (t > nextLoon && world.loons.length) {
    const early = world.day.golden || night > 0.5;
    nextLoon = t + (early ? rand(14, 32) : rand(35, 70));
    const l = world.loons[Math.floor(Math.random() * world.loons.length)];
    if (l.under <= 0) {
      sfx.loon(camera.position.distanceTo(l.g.position));
      fx.ripple(l.x, l.z, 1, 1.5, 0.45);
    }
  }
}

function updateCamera(m, dt, t) {
  if (!m) {
    const a = t * 0.04;
    camera.position.set(Math.sin(a) * 46, 15, Math.cos(a) * 46);
    camera.lookAt(0, 2, 0);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
    return;
  }
  if (touch) {
    const d = touch.takeLook();
    const s = TUNING.touchLook * settings.sens * Math.max(0.25, camera.fov / 60);
    cam.yaw -= d.x * s;
    cam.pitch += d.y * s * (settings.invertY ? -1 : 1);
  }
  cam.pitch = clamp(cam.pitch, -0.35, 1.25);
  const rifleOut = isGun(held) && ownsGun(held) && phase === 'idle' && alive();
  const aiming = aimHeld && alive() && !openPanel;
  cam.aim += ((aiming ? 1 : 0) - cam.aim) * Math.min(1, dt * 12);
  const dist = lerp(cam.dist, TUNING.aimDist, rifleOut ? cam.aim : cam.aim * 0.5);
  const shoulder = rifleOut ? lerp(0.45, 0.8, cam.aim) : cam.aim * 0.3;
  const sy = Math.sin(cam.yaw);
  const cy = Math.cos(cam.yaw);
  const target = tmpB.set(m.x + cy * shoulder, (m.y || 0) + 1.55 + cam.aim * 0.1, m.z - sy * shoulder);
  const horiz = Math.cos(cam.pitch) * dist;
  camera.position.set(target.x + sy * horiz, target.y + Math.sin(cam.pitch) * dist, target.z + cy * horiz);
  // pull the camera in rather than letting it sit inside the shack or Moss's stand
  for (let i = 1; i <= 14; i++) {
    const f = i / 14;
    const px = lerp(target.x, camera.position.x, f);
    const py = lerp(target.y, camera.position.y, f);
    const pz = lerp(target.z, camera.position.z, f);
    if (world.blocked(px, py, pz)) {
      const k = Math.max(0.12, f - 0.1);
      camera.position.set(lerp(target.x, camera.position.x, k), lerp(target.y, camera.position.y, k), lerp(target.z, camera.position.z, k));
      break;
    }
  }
  const floor = surfaceAt(camera.position.x, camera.position.z, audioT) + 0.45;
  if (camera.position.y < floor) camera.position.y = floor;
  const high = (myData && myData.high) || {};
  let sway = 0;
  if (high.weed) sway += 0.15;
  if (high.whiskey) sway += 0.32;
  if (sway && !reducedMotion) {
    camera.position.x += Math.sin(t * 1.35) * sway * 1.6;
    camera.position.y += Math.cos(t * 0.85) * sway * 0.7;
    camera.position.z += Math.sin(t * 0.7) * sway;
  }
  if (reel) cam.shake = Math.max(cam.shake, reel.tension > TUNING.redline ? 0.04 : 0);
  const shake = settings.shake && !reducedMotion ? Math.min(cam.shake, 0.6) : 0;
  camera.lookAt(target);
  if (shake > 0.001) {
    camera.rotation.x += (Math.random() - 0.5) * shake * 0.08;
    camera.rotation.y += (Math.random() - 0.5) * shake * 0.08;
  }
  cam.shake *= Math.exp(-dt * 8);
  const zoomFov = rifleOut ? gunOf(held).zoom : 40;
  const speedKick = clamp((Math.hypot(vel.x, vel.z) - 6.5) / 6, 0, 1) * 4 * (1 - cam.aim);
  const fov = lerp(60, zoomFov, cam.aim) + (high.crank ? 7 : 0) + speedKick;
  if (Math.abs(camera.fov - fov) > 0.05) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 8);
    camera.updateProjectionMatrix();
  }
}

// ================================================================ HUD

const SLOT_ART = {
  fists: '<path fill="currentColor" d="M6.5 9.2c0-1 .8-1.7 1.7-1.7s1.7.7 1.7 1.7V8c0-1 .8-1.7 1.7-1.7s1.7.7 1.7 1.7v.3c.2-.8.9-1.3 1.7-1.3 1 0 1.7.8 1.7 1.7v.9c.3-.4.8-.6 1.3-.6.9 0 1.6.7 1.6 1.6v4.2c0 3.4-2.7 6.2-6.2 6.2h-.8c-3.1 0-5.7-2.3-6.1-5.4l-.5-3.6c-.1-.8.4-1.5 1.2-1.6.5-.1 1 .1 1.3.5z"/><path d="M9.9 9.3v2.4M13.3 8.9v2.8M16.7 9.6v2.2" stroke="#163438" stroke-width="1.1" stroke-linecap="round"/>',
  rod: '<path d="M4 21 20 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="17" r="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M20 3v9" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>',
  bait: '<path d="M4 15c3-6 6 2 9-3s5 1 7-2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
  rifle: '<path fill="currentColor" d="M2 13.5h9.2l1.6-2.4H22v2.6h-2.4l-1.4 2.6H8.2L6.6 13.5z"/>',
  pistol: '<path fill="currentColor" d="M3 8.5h14.5l1.5 1.8H21v3h-4.2l-.9 4.2c-.2.8-.9 1.3-1.7 1.3h-2c-.9 0-1.6-.8-1.4-1.7l.6-3.8H3z"/>',
  shotgun: '<path fill="currentColor" d="M1 12.2h13.5l2-1.4H22v2.8h-4.5l-1.4 2.4h-3.6L11.2 14.6H1z"/><path d="M3 10.6h10" stroke="currentColor" stroke-width="1.2"/>',
  smg: '<path fill="currentColor" d="M2 9.5h14.5l1.5-1.4H22v3h-3l-1 1.4v5.6h-2.6v-4.6h-3.2l-.9 3.4H8.8l.8-3.4H2z"/>',
  sniper: '<path fill="currentColor" d="M1 13.6h12l1.2-2.2h2.4v-1.2h-4.6V8.6h-2v1.6H8.4v1.4H1z"/><path fill="currentColor" d="M14 13.6h8.5v1.6h-8.5z"/>',
  weed: '<path fill="currentColor" d="M12 22V12.2C8.6 11.4 6 8.6 6 5.2 9.4 5.4 11.4 7.6 12 10.6 12.6 7.6 14.6 5.4 18 5.2 18 8.6 15.4 11.4 12 12.2V22z"/>',
  whiskey: '<path fill="currentColor" d="M9 2h6v1.6h-.8v3.2L16.4 10v12H7.6V10l2.2-3.2V3.6H9z"/>',
  crank: '<path fill="currentColor" d="M13.2 2 5 13.2h6.2L10 22l9.2-12.4h-6z"/>',
  bag: '<path fill="currentColor" d="M2 12.2c4.2-4.6 9.2-4.8 13.4-2.2 2.2 1.3 4.2 1.4 6.6-.6-1.4 3.4-3.8 5.6-7 5.8C10.6 15.4 6.2 14.2 2 12.2z"/><circle cx="16.2" cy="10.6" r="1" fill="#163438"/>',
};
SLOT_ART.glock = SLOT_ART.pistol;
SLOT_ART.arp = SLOT_ART.smg;
SLOT_ART.draco = SLOT_ART.rifle;
let hotbarSig = '';
function renderHotbar() {
  const d = myData;
  if (!d || !W) return;
  const bagMax = W.bagMax;
  const gunSig = Object.keys(d.guns || {}).map((g) => `${d.guns[g] ? 1 : 0}${d.mag[g] || 0}`).join('') + JSON.stringify(d.att || 0);
  const sig = [held, d.rod, d.bait, gunSig, d.reloadGun, d.ammo, d.pocket.weed, d.pocket.whiskey, d.pocket.crank, d.bag.n, d.bag.value, d.highLeft.weed, d.highLeft.whiskey, d.highLeft.crank].join('|');
  if (sig === hotbarSig) return;
  hotbarSig = sig;
  const slots = [
    { act: 'fists', art: 'fists', label: 'Fists', key: '1' },
    { act: 'rod', art: 'rod', label: W.rods[d.rod].name, tier: [d.rod, W.rods.length], key: '2' },
    { act: 'bait', art: 'bait', label: W.baits[d.bait].name, tier: [d.bait, W.baits.length], key: '3' },
    ...GUN_ORDER.filter((g) => d.guns[g]).map((g) => ({
      act: g, art: g, label: `${W.guns[g].name}, ${d.mag[g] || 0} loaded, ${d.ammo} spare`, count: d.mag[g] || 0,
    })),
    ...DRUGS.map((n, i) => ({ act: n, art: n, label: `${n}, ${d.pocket[n]} left`, count: d.pocket[n], empty: !d.pocket[n] && !d.high[n], on: d.high[n], timer: d.highLeft[n] / 30 })),
    { act: 'bag', art: 'bag', label: d.bag.n ? `Bag, ${d.bag.n} fish worth $${d.bag.value}` : 'Bag is empty', count: `${d.bag.n}/${bagMax}`, empty: !d.bag.n, full: d.bag.n >= bagMax, key: '=' },
  ];
  slots.forEach((sl, i) => { sl.key = SLOT_KEYS_LABEL[i] || ''; });
  const box = $('slots');
  box.replaceChildren();
  for (const s of slots) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'slot' + (s.empty ? ' empty' : '') + (s.act === held ? ' held' : '') + (s.on ? ' on' : '') + (s.full ? ' full' : '');
    b.dataset.act = s.act;
    b.title = s.label;
    b.setAttribute('aria-label', s.label);
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${SLOT_ART[s.art]}</svg>`;
    if (s.key) { const k = document.createElement('span'); k.className = 'key'; k.textContent = s.key; b.append(k); }
    if (s.count !== undefined && s.count !== '') { const c = document.createElement('span'); c.className = 'count'; c.textContent = String(s.count); b.append(c); }
    if (s.tier) {
      const tier = document.createElement('span');
      tier.className = 'tier';
      for (let i = 0; i < s.tier[1]; i++) { const dot = document.createElement('i'); if (i <= s.tier[0]) dot.className = 'on'; tier.append(dot); }
      b.append(tier);
    }
    if (s.on && s.timer > 0) { const tm = document.createElement('span'); tm.className = 'timer'; tm.style.width = `${Math.min(1, s.timer) * 100}%`; b.append(tm); }
    box.append(b);
  }
}

function renderBoard(list) {
  const sorted = [...list].sort((a, b) => b.cash - a.cash);
  const ol = $('boardList');
  ol.replaceChildren();
  for (const p of sorted.slice(0, 8)) {
    const li = document.createElement('li');
    if (p.alive === false) li.className = 'down';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = p.color;
    const who = document.createElement('span');
    who.className = 'who' + (p.id === myId ? ' you' : '');
    who.textContent = p.name + (p.id === myId ? ' (you)' : '');
    const score = document.createElement('span');
    score.className = 'score';
    score.textContent = `$${p.cash}`;
    const best = document.createElement('small');
    best.textContent = p.best ? `${p.caught} caught. Best ${p.best.lbs} lb ${p.best.name.toLowerCase()}.` : `${p.caught || 0} caught`;
    li.append(dot, who, score, best);
    ol.append(li);
  }
}

function renderDerby() {
  const d = derbyState;
  const el = $('derby');
  if (!d || !myId) { el.hidden = true; return; }
  if (d.active) {
    el.hidden = false;
    el.replaceChildren();
    const b = document.createElement('b');
    b.textContent = 'Derby';
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = fmtTime(d.endsIn);
    const txt = d.leader ? `${d.leader.name} leads with ${d.leader.lbs} lb. Pot $${d.pot}.` : `No fish weighed yet. Pot $${d.pot}.`;
    el.append(b, time, document.createTextNode(txt));
    $('boardFoot').textContent = `Derby pot $${d.pot}. Heaviest fish wins.`;
  } else {
    el.hidden = true;
    $('boardFoot').textContent = `Next derby in ${fmtTime(d.nextIn)}`;
  }
}

const SUN_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.4" fill="#F2B134"/><g stroke="#F2B134" stroke-width="1.5" stroke-linecap="round"><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3"/></g></svg>';
const MOON_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.5 12.5A6 6 0 0 1 6 2.2a6 6 0 1 0 5.5 10.3z" fill="#DCE4F2"/></svg>';
let vitalsSig = '';
function renderVitals() {
  const d = myData;
  if (!d) return;
  const night = isNightHour(clockHour);
  const golden = isGoldenHour(clockHour);
  const clockText = fmtHour(clockHour) + (golden ? ', golden hour' : night ? ', night' : '');
  const status = d.alive === false ? '' : d.safe ? 'Safe in camp. No shooting.' : '';
  const questSig = (d.quests || []).map((q) => `${q.type}${q.n}/${q.goal}`).join(',');
  const sig = [clockText, d.hp, d.cash, d.bag.n, d.bag.value, status, d.xp, d.level, questSig].join('|');
  if (sig === vitalsSig) return;
  vitalsSig = sig;
  $('clockLine').innerHTML = night ? MOON_SVG : SUN_SVG;
  $('clockLine').append(document.createTextNode(clockText));
  const hp = $('hpBar');
  hp.firstElementChild.style.width = `${clamp(d.hp, 0, 100)}%`;
  hp.classList.toggle('low', d.hp <= 34);
  hp.setAttribute('aria-valuenow', String(d.hp));
  $('cashLine').textContent = `$${d.cash}`;
  $('bagLine').textContent = d.bag.n ? `${d.bag.n} fish in the bag, $${d.bag.value}` : 'Bag is empty';
  $('statusLine').textContent = status;
  if (d.level) {
    $('levelLine').textContent = `Angler level ${d.level}`;
    const span = Math.max(1, d.xpNext - d.xpLow);
    $('xpBar').firstElementChild.style.width = `${clamp(((d.xp - d.xpLow) / span) * 100, 0, 100)}%`;
  }
  const list = $('questList');
  list.replaceChildren();
  for (const q of d.quests || []) {
    const li = document.createElement('li');
    li.textContent = `${QUEST_TEXT[q.type](q.goal)}  ${q.n}/${q.goal}  ($${q.reward})`;
    list.append(li);
  }
}

const QUEST_TEXT = {
  catch: (n) => `Catch ${n} fish`,
  uncommon: (n) => `Catch ${n} uncommon or better`,
  hot: (n) => `Catch ${n} on a hot spot`,
};

const mm = $('minimap');
const mmCtx = mm.getContext('2d');
function drawMinimap(t) {
  const m = me();
  if (!m || !W) return;
  const g = mmCtx;
  const S = mm.width;
  const R = S / 2;
  const view = 46;
  const k = (R - 6) / view;
  const cy = Math.cos(cam.yaw);
  const sy = Math.sin(cam.yaw);
  const map = (x, z) => {
    const dx = x - m.x;
    const dz = z - m.z;
    return [R + (dx * cy - dz * sy) * k, R + (dx * sy + dz * cy) * k];
  };
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#4A6A3C';
  g.fillRect(0, 0, S, S);
  let [lx, lz] = map(0, 0);
  g.fillStyle = '#C9B98E';
  g.beginPath(); g.arc(lx, lz, (W.shoreRadius + 2) * k, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2E7F86';
  g.beginPath(); g.arc(lx, lz, W.lakeRadius * k, 0, Math.PI * 2); g.fill();
  const poly = (pts, fill) => {
    g.fillStyle = fill;
    g.beginPath();
    pts.forEach(([x, z], i) => { const [px, pz] = map(x, z); if (i) g.lineTo(px, pz); else g.moveTo(px, pz); });
    g.fill();
  };
  const ch = W.channel;
  poly([[ch.minX - 1.5, ch.maxZ], [ch.maxX + 1.5, ch.maxZ], [ch.maxX + 1.5, ch.minZ], [ch.minX - 1.5, ch.minZ]], '#C9B98E');
  poly([[ch.minX, ch.maxZ], [ch.maxX, ch.maxZ], [ch.maxX, ch.minZ], [ch.minX, ch.minZ]], '#2E7F86');
  poly([[-400, W.ocean.maxZ + 12], [400, W.ocean.maxZ + 12], [400, -600], [-400, -600]], '#C9B98E');
  poly([[-400, W.ocean.maxZ], [400, W.ocean.maxZ], [400, -600], [-400, -600]], '#1E5E7A');
  g.fillStyle = 'rgba(12, 60, 70, .45)';
  g.beginPath(); g.arc(lx, lz, 12 * k, 0, Math.PI * 2); g.fill();
  for (const h of hotspots) {
    const [hx, hz] = map(h.x, h.z);
    const pulse = 1 + Math.sin(t * 4) * 0.12;
    g.fillStyle = 'rgba(242, 177, 52, .35)';
    g.strokeStyle = '#F2B134';
    g.lineWidth = 3;
    g.beginPath(); g.arc(hx, hz, h.r * k * pulse, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  const dk = W.dock;
  g.fillStyle = '#9A7650';
  g.beginPath();
  [[dk.minX, dk.minZ], [dk.maxX, dk.minZ], [dk.maxX, dk.maxZ], [dk.minX, dk.maxZ]].forEach(([x, z], i) => {
    const [px, pz] = map(x, z);
    if (i) g.lineTo(px, pz); else g.moveTo(px, pz);
  });
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, .07)';
  [W.camp.dealer, W.camp.shack, W.camp.fire].forEach((s) => {
    const [x, z] = map(s.x, s.z);
    g.beginPath(); g.arc(x, z, W.camp.safeRadius * k, 0, Math.PI * 2); g.fill();
  });
  for (const v of pickupViews.values()) {
    const [x, z] = map(v.x, v.z);
    g.fillStyle = v.kind === 'cash' ? '#F2B134' : '#EEF2EC';
    g.beginPath(); g.arc(x, z, 3.5, 0, Math.PI * 2); g.fill();
  }
  const [fx0, fz0] = map(W.camp.fire.x, W.camp.fire.z);
  g.fillStyle = '#FF8A3D';
  g.beginPath(); g.arc(fx0, fz0, 5 + Math.sin(t * 9) * 0.8, 0, Math.PI * 2); g.fill();
  const icon = (spot, letter, bg) => {
    const [x, z] = map(spot.x, spot.z);
    g.fillStyle = bg;
    g.beginPath(); g.arc(x, z, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#FFF';
    g.font = '600 15px Fredoka, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, x, z + 1);
  };
  icon(W.camp.dealer, 'M', '#C73A28');
  icon(W.camp.shack, 'S', '#6B4A32');
  for (const v of npcViews.values()) {
    if (v.data.alive === false || v.data.role !== 'angler') continue;
    const [x, z] = map(v.x, v.z);
    g.fillStyle = v.data.state === 'combat' ? '#FF5A3A' : '#D8D2C4';
    g.beginPath(); g.arc(x, z, 4.5, 0, Math.PI * 2); g.fill();
  }
  for (const v of views.values()) {
    if (v.data.id === myId || v.data.alive === false) continue;
    const [x, z] = map(v.x, v.z);
    g.fillStyle = v.data.color;
    g.strokeStyle = '#102220';
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, z, 6, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  if (world.day.night > 0) {
    g.fillStyle = `rgba(8, 16, 40, ${world.day.night * 0.35})`;
    g.fillRect(0, 0, S, S);
  }
  const fvx = Math.sin(m.rot) * cy - Math.cos(m.rot) * sy;
  const fvz = Math.sin(m.rot) * sy + Math.cos(m.rot) * cy;
  const ang = Math.atan2(fvz, fvx);
  g.translate(R, R);
  g.rotate(ang + Math.PI / 2);
  g.fillStyle = '#FFF';
  g.strokeStyle = '#102220';
  g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 4); g.lineTo(-8, 8); g.closePath(); g.fill(); g.stroke();
  g.restore();
  const nx = -sy;
  const nz = cy;
  g.fillStyle = '#EEF2EC';
  g.font = '600 16px Fredoka, system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('N', R + nx * (R - 14), R + nz * (R - 14));
}

let lastPrompt = '';
let lastPromptCls = '';
function promptFor() {
  const now = performance.now();
  if (flash && now < flash.until) return [flash.text, flash.cls || ''];
  if (!myData || !myId || myData.alive === false || openPanel) return ['', ''];
  const m = me();
  if (phase === 'charging') {
    if (castInfo.valid) return [castInfo.hot ? 'Hot spot. Let go to cast.' : 'Let go to cast', castInfo.hot ? 'good' : ''];
    return [castInfo.dock ? 'That lands on the dock. Charge longer.' : 'That lands on shore. Aim at the water.', ''];
  }
  if (phase === 'out') return [isTouch ? 'Wait for the bobber to dunk. Reel in cancels.' : 'Wait for the bobber to dunk. Q reels in.', ''];
  if (phase === 'bite') return [isTouch ? 'Bite! Tap Hook' : 'Bite! Click', 'alert'];
  if (phase === 'reeling' && reel) {
    if (reel.tension > TUNING.redline) return ['Ease off!', 'alert'];
    return [reel.surge ? "It's running. Ease off." : isTouch ? 'Hold Reel' : 'Hold left click to reel', ''];
  }
  if (phase === 'idle' && m) {
    if (near(m, W.camp.dealer)) return [myData.bag.n ? (isTouch ? `Tap Moss to sell ${myData.bag.n} fish for $${myData.bag.value}` : `E to sell ${myData.bag.n} fish for $${myData.bag.value} and shop`) : (isTouch ? 'Tap Moss to trade' : 'E to trade with Moss'), 'good'];
    if (near(m, W.camp.shack)) return [isTouch ? 'Tap Shack to sit down' : 'E to sit down at the shack', ''];
    if (myData.bag.n >= W.bagMax) return [isTouch ? 'Your bag is full. Sell to Moss or on your phone.' : 'Your bag is full. Sell to Moss, or press P and use the Market app.', ''];
    if (boating() && nearLandEdge(m)) return [isTouch ? 'Tap Use to step ashore' : 'E to step ashore', ''];
    if (!boating() && myData.ownsBoat && nearWaterEdge(m)) return [isTouch ? 'Tap Use to launch your boat' : 'E to launch your boat', ''];
    if (!boating() && !myData.ownsBoat && onDock(m.x, m.z) && m.z < W.dock.minZ + 5) return [isTouch ? `Tap Use to rent a boat for $${W.boat.rent}` : `E to rent a boat for $${W.boat.rent}`, ''];
  }
  return ['', ''];
}

let slowT = 0;
function updateHud(dt, t) {
  const [text, cls] = promptFor();
  if (text !== lastPrompt || cls !== lastPromptCls) {
    lastPrompt = text;
    lastPromptCls = cls;
    const p = $('prompt');
    p.textContent = text;
    p.className = cls;
  }
  const showMeters = phase === 'charging' || !!reel;
  $('meters').hidden = !showMeters;
  $('powerMeter').hidden = phase !== 'charging';
  $('reelMeters').hidden = !reel;
  if (phase === 'charging') {
    $('powerFill').style.width = `${power * 100}%`;
    const rod = W && myData ? W.rods[myData.rod] : null;
    if (rod) $('powerLabel').textContent = `Cast distance, ${Math.round(W.castMin + power * (rod.castMax - W.castMin))} m`;
  }
  if (reel) {
    $('tensionFill').style.width = `${Math.min(reel.tension, 1) * 100}%`;
    $('tensionFill').classList.toggle('hot', reel.tension > TUNING.redline);
    $('progressFill').style.width = `${clamp(reel.progress, 0, 1) * 100}%`;
    const pull = $('pull');
    pull.className = reel.dir < 0 ? 'left' : reel.dir > 0 ? 'right' : '';
    if (reel.countered) pull.classList.add('countered');
    const counterKey = reel.dir < 0 ? (isTouch ? 'Push right' : 'Hold D') : (isTouch ? 'Push left' : 'Hold A');
    $('pullText').textContent = reel.dir === 0 ? 'Steady' : reel.countered ? 'Pulling against it' : `It's pulling ${reel.dir < 0 ? 'left' : 'right'}. ${counterKey}.`;
  }

  const d = myData;
  const showCross = !!(myId && alive() && !openPanel && !chatOpen && (pointerLocked || isTouch || noLock) && (phase === 'idle' || phase === 'charging'));
  const ch = $('crosshair');
  ch.hidden = !showCross;
  if (showCross) {
    const rifle = isGun(held) && ownsGun(held) && phase === 'idle';
    ch.classList.toggle('fists', held === 'fists' && phase === 'idle');
    ch.classList.toggle('rifle', rifle);
    if (rifle) {
      const h = d.high || {};
      const spread = (h.weed ? 1.6 : 1) * (h.whiskey ? 2 : 1) * (h.crank ? 0.6 : 1) * lerp(1, 0.55, cam.aim);
      ch.style.setProperty('--cs', `${clamp(22 * spread, 12, 52)}px`);
    }
  }
  $('scope').hidden = !(showCross && held === 'sniper' && ownsGun('sniper') && cam.aim > 0.8);
  const ammoEl = $('ammoHud');
  const gunOut = !!(d && myId && alive() && isGun(held) && ownsGun(held) && !openPanel);
  ammoEl.hidden = !gunOut;
  if (gunOut) {
    const g = gunOf(held);
    const txt = d.reloadGun === held ? 'Reloading…' : `${d.mag[held] || 0} / ${d.ammo}`;
    const at = (d.att && d.att[held]) || {};
    const tags = [at.drum && 'Drum', at.laser && 'Laser', at.switch && 'Switch'].filter(Boolean).join(' · ');
    const lvl = (d.glvl && d.glvl[held]) || 0;
    const title = `${g.name}${lvl ? ' ' + W.gunLevels.names[lvl] : ''}` + (tags ? ` · ${tags}` : '');
    if (ammoEl.dataset.t !== `${title}|${txt}`) {
      ammoEl.dataset.t = `${title}|${txt}`;
      ammoEl.replaceChildren();
      const n = document.createElement('small');
      n.textContent = title;
      const c = document.createElement('b');
      c.textContent = txt;
      ammoEl.append(n, c);
      ammoEl.classList.toggle('empty', (d.mag[held] || 0) <= 0);
    }
  }
  const speedEl = $('speedo');
  const spNow = Math.hypot(vel.x, vel.z);
  const showSpeed = !!(myId && alive() && !boating() && spNow > W.moveSpeed * 1.5 * 1.02);
  speedEl.hidden = !showSpeed;
  if (showSpeed) speedEl.textContent = `${Math.round((spNow / 6) * 320)} u/s`;
  $('lockHint').hidden = !(myId && !isTouch && !noLock && !pointerLocked && !openPanel && !chatOpen && alive());
  if (hurtT > 0) hurtT = Math.max(0, hurtT - dt * 1.8);
  $('hurtFlash').style.opacity = String(hurtT);
  if (!$('death').hidden) {
    const left = Math.max(0, deathUntil - performance.now());
    $('deathText').textContent = `${$('death').dataset.lost} Back on the shore in ${Math.ceil(left / 1000)}.`;
  }

  slowT -= dt;
  if (slowT > 0) return;
  slowT = 0.12;
  drawMinimap(t);
  renderVitals();
  renderHotbar();
  renderDerby();
  if (openPanel === 'shop') renderShop();
  if (openPanel === 'phone') { renderPhone(); if (phoneApp === 'map') drawBigMap(); }
  if (openPanel === 'shack') renderShack();
  if (d) {
    const h = d.high || {};
    const haze = $('haze');
    haze.classList.toggle('weed', !!h.weed);
    haze.classList.toggle('whiskey', !!h.whiskey);
    haze.classList.toggle('crank', !!h.crank);
    const m = me();
    if (openPanel === 'shop' && !near(m, W.camp.dealer)) closePanels();
    if (openPanel === 'shack' && !near(m, W.camp.shack) && !(table.active && table.status === 'play')) closePanels();
  }
  if (touch) {
    const m = me();
    let useLabel = m && phase === 'idle' ? (near(m, W.camp.dealer) ? 'Moss' : near(m, W.camp.shack) ? 'Shack' : null) : null;
    if (m && phase === 'idle' && !useLabel && d) {
      if (d.boat && nearLandEdge(m)) useLabel = 'Ashore';
      else if (!d.boat && d.ownsBoat && nearWaterEdge(m)) useLabel = 'Boat';
      else if (!d.boat && onDock(m.x, m.z) && m.z < W.dock.minZ + 5) useLabel = 'Rent boat';
    }
    const fishLabel = { idle: 'Cast', charging: 'Let go', casting: 'Cast', out: 'Hook', bite: 'Hook', reeling: 'Reel' }[phase] || 'Cast';
    const attackLabel = phase !== 'idle' ? null : held === 'fists' ? 'Punch' : isGun(held) && ownsGun(held) ? 'Shoot' : null;
    touch.sync({ fishLabel, fishAlert: phase === 'bite', attackLabel, useLabel, canReelIn: phase === 'out' || phase === 'bite' });
  }
}

// ================================================================ loop

const clock = new THREE.Clock();
const focus = new THREE.Vector3();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;
  audioT = t;
  if (W) clockHour = (clockHour + (dt * 24) / (W.dayMs / 1000)) % 24;
  const m = me();
  if (m && W) {
    updateLocal(m, dt);
    if (phase === 'out') {
      if (t >= nibbleAt) {
        nibble = 1;
        nibbleAt = t + rand(1.4, 4);
        sfx.nibble();
        if (m.bobberPos) fx.ripple(m.bobberPos.x, m.bobberPos.z, 0.4, 0.7, 0.4);
      }
    }
    nibble = Math.max(0, nibble - dt * 5);
    if (reel) updateReel(dt);
    focus.set(m.x, 0, m.z);
  } else {
    focus.set(0, 0, 0);
  }
  for (const v of npcViews.values()) updateNpc(v, dt, t);
  for (const v of views.values()) updateView(v, dt, t);
  updateFish(dt, t);
  updatePickups(dt, t);
  updateLeaps(dt);
  updateCamera(m, dt, t);
  if (m && W) {
    computeAim(m);
    updateCastMarker(m, t);
  }
  world.update(dt, t, clockHour, focus, { ripple: (x, z, s) => fx.ripple(x, z, s, 1.4, 0.5) });
  if (W) updateAmbientFx(dt, t);
  fx.update(dt);
  const fireDist = m ? Math.hypot(m.x - world.firePos.x, m.z - world.firePos.z) : 99;
  sfx.ambient(t, world.day.night > 0.5, fireDist);
  updateHud(dt, t);
  if (quality() === 'high') composer.render(dt);
  else renderer.render(scene, camera);
});
