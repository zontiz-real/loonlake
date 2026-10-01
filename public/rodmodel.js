import * as THREE from 'three';

// A fishing rod: cork grip, reel with a turning crank, a tapering blank in segments that can bend, and line guides.
// Tier 0 (the cane pole) is plain bamboo with knots; better rods add the reel and guides and richer fittings.
export function makeRod(blankMat) {
  const root = new THREE.Group();
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o });
  const cork = mat(0xB98A52, { roughness: 0.9 });
  const steel = mat(0xB8BEC4, { roughness: 0.3, metalness: 0.7 });
  const dark = mat(0x23282B);
  const accent = mat(0xF2F2EC);
  const add = (parent, geo, material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  // grip
  add(root, new THREE.CylinderGeometry(0.034, 0.03, 0.58, 10), cork, 0, 0.09, 0);
  for (const y of [-0.12, -0.02, 0.08, 0.18, 0.28]) add(root, new THREE.CylinderGeometry(0.037, 0.037, 0.012, 10), mat(0x7A5A34), 0, y, 0);
  add(root, new THREE.CylinderGeometry(0.036, 0.036, 0.03, 10), dark, 0, -0.21, 0);
  add(root, new THREE.CylinderGeometry(0.04, 0.04, 0.1, 10), steel, 0, 0.45, 0);
  // reel on the underside (local +z), with a crank that turns while reeling
  const reel = new THREE.Group();
  reel.position.set(0, 0.42, 0.075);
  add(reel, new THREE.BoxGeometry(0.03, 0.09, 0.05), steel, 0, 0.03, -0.035);
  add(reel, new THREE.CylinderGeometry(0.055, 0.055, 0.075, 12), mat(0x2B3034, { metalness: 0.5 }), 0, 0, 0).rotation.z = Math.PI / 2;
  add(reel, new THREE.CylinderGeometry(0.047, 0.047, 0.03, 12), steel, 0, 0, 0).rotation.z = Math.PI / 2;
  const crank = new THREE.Group();
  crank.position.set(0.05, 0, 0);
  add(crank, new THREE.BoxGeometry(0.012, 0.012, 0.1), steel, 0.006, 0, 0.05);
  add(crank, new THREE.CylinderGeometry(0.014, 0.014, 0.035, 8), dark, 0.02, 0, 0.1).rotation.z = Math.PI / 2;
  reel.add(crank);
  root.add(reel);
  // the blank: six tapering segments, each hanging off the one below so the rod can bend along its length
  const SEG = 6;
  const segLen = (2.5 - 0.5) / SEG;
  const segs = [];
  let parent = root;
  for (let i = 0; i < SEG; i++) {
    const g = new THREE.Group();
    g.position.y = i === 0 ? 0.5 : segLen;
    const r0 = 0.027 - (0.019 * i) / SEG;
    const r1 = 0.027 - (0.019 * (i + 1)) / SEG;
    add(g, new THREE.CylinderGeometry(r1, r0, segLen, 7), blankMat, 0, segLen / 2, 0);
    // a thread wrap at the joint, a bamboo knot for the cane pole, and (past the first) a guide ring on the underside
    const wrap = add(g, new THREE.CylinderGeometry(r0 + 0.003, r0 + 0.003, 0.035, 7), accent, 0, 0.012, 0);
    const knot = add(g, new THREE.CylinderGeometry(r0 + 0.006, r0 + 0.006, 0.02, 7), mat(0x6A4A22), 0, segLen * 0.5, 0);
    let ring = null;
    let foot = null;
    if (i > 0) {
      const gr = 0.03 - i * 0.0035;
      ring = add(g, new THREE.TorusGeometry(gr, 0.0045, 4, 10), steel, 0, 0.02, r0 + gr * 0.9);
      ring.rotation.y = Math.PI / 2;
      foot = add(g, new THREE.BoxGeometry(0.006, 0.014, r0 + 0.004), steel, 0, 0.02, (r0 + 0.004) / 2);
    }
    g.userData = { wrap, knot, ring, foot };
    parent.add(g);
    segs.push(g);
    parent = g;
  }
  const tip = new THREE.Object3D();
  tip.position.y = segLen;
  parent.add(tip);
  const tipRing = add(parent, new THREE.TorusGeometry(0.014, 0.0035, 4, 10), steel, 0, segLen, 0.012);
  tipRing.rotation.y = Math.PI / 2;
  return {
    group: root, tip, reel, crank, segs, tipRing,
    // tier 0 is a bamboo cane; the rest get the reel, guides and thread wraps, richer as they climb
    setTier(i, hex) {
      reel.visible = i >= 1;
      tipRing.visible = i >= 1;
      for (const g of segs) {
        const u = g.userData;
        if (u.ring) u.ring.visible = u.foot.visible = i >= 1;
        u.wrap.visible = i >= 1;
        u.knot.visible = i === 0;
        u.wrap.material = mat(i >= 5 ? 0xF2B134 : new THREE.Color(hex).offsetHSL(0, 0, 0.3).getHex(), i >= 5 ? { metalness: 0.7, roughness: 0.3, emissive: 0x4A3000 } : {});
      }
      blankMat.emissive.setHex(i >= 6 ? 0x4A3300 : 0x000000);
    },
    bend: 0,
    update(dt, bend, spin) {
      this.bend += (bend - this.bend) * Math.min(1, dt * 10);
      const each = this.bend / SEG;
      segs.forEach((g, i) => { g.rotation.x = each * (0.6 + i * 0.16); });
      if (spin) crank.rotation.x += dt * 14;
    },
  };
}
