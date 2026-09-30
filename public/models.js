// Loon Lake models: CC0 low-poly assets by Quaternius (see /models/CREDITS.txt).
// Everything is recolored in code so one file can serve many players and species.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const LOOKS = [
  { id: 'man_tee', label: 'Tee', clips: 'man_tee', shirt: ['Shirt'] },
  { id: 'man_flannel', label: 'Long sleeve', clips: 'man_tee', shirt: ['Shirt'] },
  { id: 'woman_casual', label: 'Casual', clips: 'woman_casual', shirt: ['Shirt'] },
  { id: 'woman_jacket', label: 'Jacket', clips: 'woman_casual', shirt: ['Jacket', 'LightJacket'] },
];
export const SKINS = ['#F3CFA8', '#E2B07E', '#C68642', '#9E6639', '#744626', '#4B2C18'];

const PROPS = ['fish_long', 'fish_round', 'rowboat', 'boat_row', 'boat_fish', 'boat_speed', 'barn', 'well', 'fence', 'rifle', 'barrel',
  'rock1', 'rock2', 'rock3', 'bush1', 'bush2', 'bush3', 'maple1', 'maple2', 'maple3', 'maple4'];

// the pack ships some props untextured, so paint them by material name
const PAINT = {
  rifle: { Gold: '#B8913A', Dark: '#2B2E31', Glass: '#24344E', Wood: '#6A4328', DarkWood: '#4A2E1A', Light: '#9AA0A6', Barrel: '#3A3F44' },
  barrel: { Wood: '#8B5A2B', DarkWood: '#5A3A1E', Metal: '#55595D' },
  rock: { Rock: '#8C8882' },
  bush: { Leaves: '#FFFFFF', Tree: '#4A2E1A' },
  maple: { Leaves: '#FFFFFF', Tree: '#4A3322' },
};

const LONG_FISH = new Set(['walleye', 'pike', 'muskie', 'eelpout', 'sturgeon', 'golden', 'catfish', 'bass', 'perch', 'cisco', 'whitefish', 'salmon', 'laketrout', 'pressie']);
const CHAR_HEIGHT = 1.85;
// the fish models swim along -z; the game expects heads toward +z
const FISH_YAW = Math.PI;

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Quaternion();
const tmpW = new THREE.Quaternion();
const IDENT = new THREE.Quaternion();

function cloneMats(root, shared) {
  const mats = {};
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    if (o.isSkinnedMesh) o.frustumCulled = false;
    if (shared) o.userData.shared = true;
    const arr = Array.isArray(o.material);
    const list = (arr ? o.material : [o.material]).map((m) => {
      const c = m.clone();
      c.name = (m.name || '').trim();
      if ('metalness' in c) { c.metalness = Math.min(c.metalness, 0.1); c.roughness = Math.max(c.roughness, 0.7); }
      mats[c.name] = c;
      return c;
    });
    o.material = arr ? list : list[0];
  });
  return mats;
}

// rotate a bone so the direction to its child points along dir (world space)
export function aimBone(bone, child, dir, weight = 1) {
  bone.getWorldPosition(tmpA);
  child.getWorldPosition(tmpB);
  tmpB.sub(tmpA).normalize();
  tmpQ.setFromUnitVectors(tmpB, dir);
  if (weight < 1) tmpQ.slerp(IDENT, 1 - weight);
  bone.getWorldQuaternion(tmpW).premultiply(tmpQ);
  bone.parent.getWorldQuaternion(tmpP).invert();
  bone.quaternion.copy(tmpP.multiply(tmpW));
  bone.updateMatrixWorld(true);
}

// the FBX conversion left one primitive per face group (150 draw calls for one person);
// merge everything that shares a material back into one mesh
function mergeByMaterial(scene) {
  const groups = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    const key = o.parent.uuid + ':' + o.material.uuid;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const first = list[0];
    const names = Object.keys(first.geometry.attributes);
    const geos = list.map((m) => {
      const gg = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const n of Object.keys(gg.attributes)) if (!names.includes(n)) gg.deleteAttribute(n);
      gg.morphAttributes = {};
      return gg;
    });
    if (geos.some((gg) => Object.keys(gg.attributes).length !== names.length)) continue;
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    let mesh;
    if (first.isSkinnedMesh) {
      mesh = new THREE.SkinnedMesh(merged, first.material);
      mesh.bind(first.skeleton, first.bindMatrix);
    } else mesh = new THREE.Mesh(merged, first.material);
    mesh.name = (first.material.name || '').trim();
    mesh.position.copy(first.position);
    mesh.quaternion.copy(first.quaternion);
    mesh.scale.copy(first.scale);
    first.parent.add(mesh);
    list.forEach((m) => m.parent.remove(m));
  }
}

export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  const files = [...LOOKS.map((l) => l.id), ...PROPS];
  const g = {};
  let done = 0;
  await Promise.all(files.map(async (f) => {
    g[f] = await loader.loadAsync(`/models/${f}.glb`);
    mergeByMaterial(g[f].scene);
    done++;
    if (onProgress) onProgress(done / files.length);
  }));
  const heights = {};
  // measure from the skeleton: skinned mesh bounds don't account for the armature's scale
  for (const l of LOOKS) {
    const sc = g[l.id].scene;
    sc.updateMatrixWorld(true);
    const headY = sc.getObjectByName('Head').getWorldPosition(tmpA).y;
    const foot = sc.getObjectByName('FootL');
    const footY = foot ? foot.getWorldPosition(tmpB).y : 0;
    heights[l.id] = (headY - footY) * 1.16;
  }

  const kit = { LOOKS, SKINS };

  // ---------- people
  kit.character = (look, shirtHex, skinHex) => {
    const L = LOOKS[look] || LOOKS[0];
    const root = SkeletonUtils.clone(g[L.id].scene);
    root.scale.multiplyScalar(CHAR_HEIGHT / heights[L.id]);
    const group = new THREE.Group();
    group.add(root);
    const mats = cloneMats(root, true);
    const shirt = new THREE.Color(shirtHex || '#E0452B');
    L.shirt.forEach((n, i) => { if (mats[n]) mats[n].color.copy(shirt).multiplyScalar(i ? 0.72 : 1); });
    if (mats.Skin && skinHex) mats.Skin.color.set(skinHex);
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const clip of g[L.clips].animations) actions[clip.name] = mixer.clipAction(clip);
    if (actions.death) { actions.death.setLoop(THREE.LoopOnce, 1); actions.death.clampWhenFinished = true; }
    if (actions.punch) { actions.punch.setLoop(THREE.LoopOnce, 1); actions.punch.clampWhenFinished = false; }
    const bone = (n) => root.getObjectByName(n);
    const bones = {
      upR: bone('UpperArmR'), loR: bone('LowerArmR'), palmR: bone('PalmR'), fingR: bone('MiddleHandR'),
      upL: bone('UpperArmL'), loL: bone('LowerArmL'), palmL: bone('PalmL'), fingL: bone('MiddleHandL'),
      head: bone('Head'),
    };
    let current = null;
    const play = (name, fade = 0.2) => {
      const next = actions[name];
      if (!next || current === next) return;
      next.reset().play();
      if (current) next.crossFadeFrom(current, fade, false);
      current = next;
    };
    play('idle', 0);
    mixer.setTime(Math.random() * 4);
    return {
      group, root, mixer, actions, bones, mats,
      flashMat: mats[L.shirt[0]] || Object.values(mats)[0],
      punchUntil: 0,
      state: 'idle',
      play,
      punch(heavy, now) {
        const a = actions.punch;
        if (!a) return;
        a.timeScale = heavy ? 1.35 : 2.4;
        a.reset().play();
        if (current && current !== a) a.crossFadeFrom(current, 0.05, false);
        current = a;
        this.punchUntil = now + (heavy ? 0.62 : 0.36);
      },
      // pose is idle, rod, rifle, drug, or fists; dirs are in the avatar's own space (facing +z)
      aimArms(pose, groupQuat) {
        const dirs = ARM_POSES[pose];
        if (!dirs || !bones.upR) return;
        const d = (v) => tmpA.set(v[0], v[1], v[2]).normalize().applyQuaternion(groupQuat).clone();
        root.updateMatrixWorld(true);
        if (dirs.R) { aimBone(bones.upR, bones.loR, d(dirs.R[0])); aimBone(bones.loR, bones.palmR, d(dirs.R[1])); }
        if (dirs.L) { aimBone(bones.upL, bones.loL, d(dirs.L[0])); aimBone(bones.loL, bones.palmL, d(dirs.L[1])); }
      },
      // sitting in a boat: thighs forward, shins down
      sit(groupQuat) {
        const d = (x, y, z) => new THREE.Vector3(x, y, z).normalize().applyQuaternion(groupQuat);
        root.updateMatrixWorld(true);
        for (const side of ['L', 'R']) {
          const up = root.getObjectByName('UpperLeg' + side);
          const lo = root.getObjectByName('LowerLeg' + side);
          const ft = root.getObjectByName('Foot' + side);
          if (!up || !lo || !ft) continue;
          aimBone(up, lo, d(side === 'L' ? 0.12 : -0.12, -0.12, 1));
          aimBone(lo, ft, d(0, -1, 0.25));
        }
      },
      handWorld(out) { (bones.fingR || bones.palmR).getWorldPosition(out); return out; },
      headWorld(out) { bones.head.getWorldPosition(out); return out; },
      dispose() { Object.values(mats).forEach((m) => m.dispose()); mixer.stopAllAction(); },
    };
  };

  // ---------- fish, recolored per species
  // body proportions [width, height, length], plus belly and fin colors, so species read differently at a glance
  const FISH_SHAPE = {
    bluegill: [1.25, 1.35, 0.9], perch: [1, 1.15, 1], crappie: [1.15, 1.25, 0.95], bass: [1.05, 1.1, 1.05],
    walleye: [0.95, 0.95, 1.1], eelpout: [0.85, 0.8, 1.3], pike: [0.8, 0.8, 1.3], catfish: [1.3, 0.9, 1.1],
    muskie: [0.9, 0.9, 1.35], sturgeon: [0.95, 0.75, 1.4], golden: [1, 1.05, 1.1], cisco: [0.85, 0.9, 1.05],
    whitefish: [0.95, 1, 1.05], salmon: [1, 1.05, 1.15], laketrout: [1, 1, 1.2], pressie: [1.1, 1.1, 1.5],
  };
  const FISH_BELLY = { perch: '#F1E9A8', bluegill: '#F2B24A', salmon: '#EFD9D0', sturgeon: '#D8D0BC', bass: '#E4E0B4', pike: '#EEEBD0' };
  const FISH_FIN = { perch: '#E86A2A', salmon: '#B84A4A', bass: '#6E6A2E', golden: '#FFD36A', catfish: '#3A4448', bluegill: '#2D6E70', crappie: '#5E6B5E', pike: '#B0682C' };
  kit.fish = (sid, hex) => {
    const long = LONG_FISH.has(sid);
    const src = g[long ? 'fish_long' : 'fish_round'];
    const root = SkeletonUtils.clone(src.scene);
    const box = new THREE.Box3().setFromObject(src.scene).getSize(tmpA);
    const len = Math.max(box.x, box.z);
    root.scale.multiplyScalar((long ? 0.72 : 0.46) / len);
    const mats = cloneMats(root, true);
    const body = new THREE.Color(hex || '#4FA3A5');
    const belly = FISH_BELLY[sid] ? new THREE.Color(FISH_BELLY[sid]) : body.clone().lerp(new THREE.Color('#F2EEDC'), 0.6);
    const fin = FISH_FIN[sid] ? new THREE.Color(FISH_FIN[sid]) : body.clone().multiplyScalar(0.55);
    if (long) {
      mats.Top?.color.copy(body);
      mats.Bottom?.color.copy(belly);
      mats.Fins?.color.copy(fin);
    } else {
      mats.Body?.color.copy(body);
      mats.Front?.color.copy(belly);
      mats.Fins?.color.copy(fin);
    }
    if (sid === 'golden') Object.values(mats).forEach((m) => { m.metalness = 0.55; m.roughness = 0.35; m.emissive = new THREE.Color(0x4A3000); });
    const group = new THREE.Group();
    const turn = new THREE.Group();
    turn.rotation.y = FISH_YAW;
    if (FISH_SHAPE[sid]) turn.scale.set(...FISH_SHAPE[sid]);
    turn.add(root);
    group.add(turn);
    const mixer = new THREE.AnimationMixer(root);
    if (src.animations[0]) {
      const a = mixer.clipAction(src.animations[0]);
      a.play();
      mixer.setTime(Math.random() * 1.3);
    }
    group.userData.mixer = mixer;
    group.userData.mats = mats;
    return group;
  };

  // ---------- static props: baked into parts scaled to a height, base at y = 0
  const bakedCache = {};
  kit.baked = (name, height) => {
    const key = name + ':' + height;
    if (bakedCache[key]) return bakedCache[key];
    const scene = g[name].scene;
    scene.updateMatrixWorld(true);
    const parts = [];
    const box = new THREE.Box3();
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      geo.computeBoundingBox();
      box.union(geo.boundingBox);
      const paint = PAINT[name.replace(/\d+$/, '')] || {};
      const mat = o.material.clone();
      mat.name = (o.material.name || '').trim();
      if (paint[mat.name]) mat.color.set(paint[mat.name]);
      if ('metalness' in mat) { mat.metalness = Math.min(mat.metalness, 0.2); mat.roughness = Math.max(mat.roughness, 0.6); }
      if (mat.name === 'Leaves' || mat.name === 'Rock') mat.flatShading = true;
      parts.push({ geometry: geo, material: mat });
    });
    const s = height / (box.max.y - box.min.y);
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    parts.forEach((p) => {
      p.geometry.translate(-cx, -box.min.y, -cz);
      p.geometry.scale(s, s, s);
      p.geometry.computeBoundingSphere();
    });
    const size = box.getSize(new THREE.Vector3()).multiplyScalar(s);
    return (bakedCache[key] = { parts, size });
  };

  kit.prop = (name, height) => {
    const { parts } = kit.baked(name, height);
    const group = new THREE.Group();
    for (const p of parts) {
      const m = new THREE.Mesh(p.geometry, p.material);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
    return group;
  };

  // one InstancedMesh per material part; returns a setter that places instance i
  kit.instanced = (name, height, count) => {
    const { parts, size } = kit.baked(name, height);
    const meshes = parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geometry, p.material, count);
      im.castShadow = true;
      im.receiveShadow = true;
      im.userData.part = p.material.name;
      return im;
    });
    return {
      meshes,
      size,
      set(i, matrix, colors) {
        meshes.forEach((im) => {
          im.setMatrixAt(i, matrix);
          if (colors && colors[im.userData.part]) im.setColorAt(i, colors[im.userData.part]);
        });
      },
      finish(n) {
        meshes.forEach((im) => {
          im.count = n;
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
          im.computeBoundingSphere();
        });
      },
    };
  };

  return kit;
}

// arm aims per held item, in the avatar's space: [upper arm dir, forearm dir]
const ARM_POSES = {
  rod: { R: [[-0.1, -0.85, 0.5], [0.05, -0.05, 1]] },
  drug: { R: [[-0.2, -0.85, 0.45], [0.15, 0.75, 0.65]] },
  rifle: { R: [[-0.3, -0.6, 0.72], [0.35, 0.05, 0.94]], L: [[0.3, -0.45, 0.84], [-0.5, 0.1, 0.86]] },
  fists: { R: [[-0.3, -0.72, 0.6], [0.3, 0.82, 0.48]], L: [[0.3, -0.72, 0.6], [-0.3, 0.82, 0.48]] },
};
