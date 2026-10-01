// Loon Lake animation timelines. Each one is a pure function of progress p (0 to 1) that returns offsets
// for the held item and the arms, so it can be tested without a renderer. Rotations are radians, moves are metres:
//   px py pz / rx ry rz  offset of the held item (its group local space; +z is forward, rx > 0 tips the nose down)
//   mag, magOn           how far the magazine has dropped, and whether it is in the gun
//   lx lz / rrx rrz      extra rotation for the left and right arm (negative x raises the arm forward)
//   yaw                  body twist, lunge: body pushed forward, spin: extra full turns on the item's x axis

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
// rises over a..b, holds, falls over c..d
const pulse = (a, b, c, d, x) => sstep(a, b, x) * (1 - sstep(c, d, x));
const TAU = Math.PI * 2;

export const zero = () => ({ px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, mag: 0, magOn: 1, lx: 0, lz: 0, rrx: 0, rrz: 0, yaw: 0, lunge: 0 });

// sound cues: [progress, name]. The viewer plays a cue once when the animation passes it.
export const CUES = {
  'reload:mag': [[0.18, 'magout'], [0.6, 'magin'], [0.84, 'rack']],
  'reload:revolver': [[0.2, 'open'], [0.45, 'load'], [0.8, 'close']],
  'reload:shell': [[0.2, 'shell'], [0.42, 'shell'], [0.64, 'shell'], [0.9, 'pump']],
  'reload:bolt': [[0.2, 'boltup'], [0.42, 'load'], [0.72, 'boltdown']],
  draw: [[0.35, 'draw']],
  knifeDraw: [[0.3, 'draw'], [0.62, 'flick']],
  inspect: [[0.3, 'handle']],
  knifeInspect: [[0.2, 'flick'], [0.5, 'flick'], [0.78, 'flick']],
  slash1: [[0.32, 'slash']],
  slash2: [[0.32, 'slash']],
  stab: [[0.34, 'stab']],
};

// how long each animation takes, in seconds (reloads take the gun's own reload time)
export const DUR = { draw: 0.5, inspect: 3.2, knifeDraw: 0.9, knifeInspect: 3.6, slash1: 0.44, slash2: 0.44, stab: 0.85 };

// which reload style a gun uses
export const RELOAD_STYLE = { pistol: 'revolver', glock: 'mag', arp: 'mag', smg: 'mag', draco: 'mag', shotgun: 'shell', rifle: 'bolt', sniper: 'bolt' };

// ---- guns

function draw(p) {
  const o = zero();
  const e = easeOut(p / 0.85);
  const settle = Math.sin(clamp01(p) * Math.PI) * 0.06;
  o.py = -0.4 * (1 - e);
  o.pz = -0.12 * (1 - e);
  o.rx = 1.1 * (1 - e) - settle;
  o.rz = -0.35 * (1 - e);
  o.lx = 0.8 * (1 - e);
  o.rrx = 0.9 * (1 - e);
  return o;
}

function reloadMag(p) {
  const o = zero();
  const env = pulse(0, 0.14, 0.88, 1, p);
  o.rx = 0.32 * env;
  o.rz = -0.4 * env;
  o.py = 0.05 * env;
  o.lx = 0.5 * env; // left hand comes across to the magwell
  o.lz = -0.15 * env;
  // old magazine drops out, the hand goes off to fetch a new one, and the new one rises in
  if (p < 0.3) {
    o.mag = -0.6 * clamp01((p - 0.16) / 0.14);
    o.magOn = p < 0.16 ? 1 : 0;
  } else if (p < 0.54) {
    o.magOn = 0;
    o.lx += 1.0 * pulse(0.3, 0.38, 0.48, 0.56, p);
  } else {
    o.magOn = 1;
    o.mag = -0.5 * (1 - easeOut((p - 0.54) / 0.16));
  }
  o.pz -= 0.05 * pulse(0.6, 0.63, 0.66, 0.72, p); // slap it home
  // rack the slide: the left hand runs forward and back
  const rack = pulse(0.76, 0.82, 0.86, 0.92, p);
  o.lx -= 0.45 * rack;
  o.pz -= 0.03 * rack;
  return o;
}

function reloadRevolver(p) {
  const o = zero();
  const env = pulse(0, 0.14, 0.9, 1, p);
  o.rx = 0.25 * env;
  o.py = 0.05 * env;
  const open = pulse(0.14, 0.26, 0.74, 0.84, p);
  o.rz = -0.7 * open;
  o.lx = 0.55 * env - 0.2 * open;
  o.ry = 0.2 * open;
  // dump the empties, thumb in fresh rounds, then flick the cylinder shut
  o.rx += 0.35 * pulse(0.26, 0.34, 0.4, 0.46, p);
  o.lx += 0.6 * pulse(0.44, 0.5, 0.62, 0.7, p);
  o.rz += 1.1 * pulse(0.74, 0.79, 0.8, 0.86, p);
  o.rx -= 0.2 * pulse(0.78, 0.8, 0.82, 0.88, p);
  o.magOn = 1;
  return o;
}

function reloadShell(p) {
  const o = zero();
  const env = pulse(0, 0.12, 0.9, 1, p);
  o.rx = -0.3 * env; // belly up to load from below
  o.rz = 0.22 * env;
  o.py = 0.04 * env;
  o.lx = 0.6 * env;
  // one nod per shell as the hand goes to the pouch and back
  const shells = 3;
  const inLoad = pulse(0.12, 0.2, 0.78, 0.86, p);
  o.lx += 0.8 * inLoad * Math.max(0, Math.sin(clamp01((p - 0.14) / 0.68) * shells * TAU - Math.PI / 2) * 0.5 + 0.5);
  o.pz -= 0.012 * inLoad * Math.sin(clamp01((p - 0.14) / 0.68) * shells * TAU);
  // the pump
  const pump = pulse(0.86, 0.9, 0.92, 0.97, p);
  o.pz -= 0.08 * pump;
  o.lx -= 0.35 * pump;
  return o;
}

function reloadBolt(p) {
  const o = zero();
  const env = pulse(0, 0.14, 0.9, 1, p);
  o.rz = 0.25 * env;
  o.rx = 0.12 * env;
  o.lx = 0.35 * env;
  // bolt up, back, the hand fetches a round, bolt forward and down
  o.rz += 0.55 * pulse(0.14, 0.22, 0.68, 0.78, p);
  o.pz -= 0.06 * pulse(0.22, 0.32, 0.5, 0.6, p);
  o.py -= 0.05 * pulse(0.34, 0.42, 0.5, 0.58, p);
  o.lx += 0.7 * pulse(0.34, 0.42, 0.5, 0.58, p);
  o.pz += 0.03 * pulse(0.6, 0.66, 0.7, 0.76, p);
  o.mag = 0;
  return o;
}

function inspectGun(p) {
  const o = zero();
  const up = pulse(0, 0.18, 0.86, 1, p);
  o.px = -0.05 * up;
  o.py = 0.1 * up;
  o.pz = -0.06 * up;
  o.rrx = -0.25 * up;
  o.lx = 0.5 * up;
  // turn it to show one side, roll it to look at the top, then turn to the other side
  o.ry = -1.15 * pulse(0.1, 0.3, 0.42, 0.52, p) + 1.15 * pulse(0.52, 0.68, 0.8, 0.94, p);
  o.rz = 0.7 * pulse(0.28, 0.42, 0.5, 0.6, p) - 0.5 * pulse(0.6, 0.7, 0.78, 0.9, p);
  o.rx = 0.35 * pulse(0.3, 0.4, 0.5, 0.58, p);
  return o;
}

// recoil: k is 1 right after a shot and decays; scale comes from the gun's recoil
export function kick(k, scale = 1) {
  const o = zero();
  o.pz = -0.07 * k * scale;
  o.rx = -0.22 * k * scale;
  o.rrx = -0.14 * k * scale;
  o.lx = -0.08 * k * scale;
  return o;
}

// ---- the knife, after CS:GO: a flip on draw, two alternating slashes, a heavy stab, and a long inspect

function knifeDraw(p) {
  const o = zero();
  const e = easeOut(p / 0.8);
  o.py = -0.35 * (1 - e);
  o.pz = -0.1 * (1 - e);
  o.rx = -TAU * (1 - e) * 0.8 + 0.5 * (1 - e); // flips forward into the hand
  o.rrx = 0.8 * (1 - e);
  o.lx = 0.4 * (1 - e);
  return o;
}

function slash(p, dir) {
  const o = zero();
  const wind = sstep(0, 0.28, p) * (1 - sstep(0.28, 0.36, p));
  const swing = sstep(0.28, 0.5, p);
  const back = sstep(0.5, 1, p);
  const s = swing * (1 - back); // 0 at rest, 1 at the end of the swing
  o.ry = dir * (0.95 * wind - 1.05 * s);
  o.rz = dir * (0.5 * wind - 0.7 * s);
  o.rx = -0.3 * wind + 0.35 * s;
  o.pz = -0.06 * wind + 0.22 * s;
  o.px = dir * (0.1 * wind - 0.16 * s);
  o.rrx = -0.35 * wind - 0.2 * s;
  o.rrz = dir * (0.35 * wind - 0.6 * s);
  o.yaw = dir * (0.3 * wind - 0.55 * s);
  o.lunge = 0.14 * s;
  return o;
}

function stab(p) {
  const o = zero();
  const cock = pulse(0, 0.3, 0.32, 0.36, p);
  const thrust = pulse(0.32, 0.42, 0.52, 0.85, p);
  o.pz = -0.28 * cock + 0.6 * thrust;
  o.rx = -0.4 * cock + 0.55 * thrust;
  o.py = 0.05 * cock - 0.06 * thrust;
  o.rrx = 0.45 * cock - 1.5 * thrust;
  o.lx = 0.3 * cock - 0.3 * thrust;
  o.yaw = 0.3 * cock - 0.25 * thrust;
  o.lunge = 0.38 * thrust;
  return o;
}

function inspectKnife(p) {
  const o = zero();
  const up = pulse(0, 0.12, 0.9, 1, p);
  o.py = 0.14 * up;
  o.pz = -0.05 * up;
  o.rrx = -0.3 * up;
  o.lx = 0.3 * up;
  o.rx = 0.5 * up;
  // spin it around the wrist twice, hold it up to the light, roll it, then flip it back into the palm
  o.rx += TAU * 2 * easeOut(pulse(0.16, 0.44, 1, 1.01, p) > 0 ? clamp01((p - 0.16) / 0.3) : 0) * (p < 0.46 ? 1 : 0);
  o.ry = 0.9 * pulse(0.46, 0.56, 0.68, 0.76, p);
  o.rz = 1.4 * pulse(0.5, 0.6, 0.66, 0.74, p) + TAU * easeOut(clamp01((p - 0.7) / 0.14)) * (p > 0.7 ? 1 : 0) * (p < 0.88 ? 1 : 0);
  o.rx += -TAU * easeOut(clamp01((p - 0.82) / 0.14)) * (p > 0.82 ? 1 : 0) * (p < 0.97 ? 1 : 0);
  return o;
}

export function evalAnim(name, p, style) {
  p = clamp01(p);
  switch (name) {
    case 'draw': return draw(p);
    case 'inspect': return inspectGun(p);
    case 'reload':
      if (style === 'revolver') return reloadRevolver(p);
      if (style === 'shell') return reloadShell(p);
      if (style === 'bolt') return reloadBolt(p);
      return reloadMag(p);
    case 'knifeDraw': return knifeDraw(p);
    case 'knifeInspect': return inspectKnife(p);
    case 'slash1': return slash(p, 1);
    case 'slash2': return slash(p, -1);
    case 'stab': return stab(p);
    default: return zero();
  }
}

// ---- body animations that are not about the held item

// an arm swinging over the head for a swimming stroke, phase in radians
export function swimArm(phase) {
  return { x: -2.4 + Math.sin(phase) * 1.2, z: Math.cos(phase) * 0.25 };
}
// an oar stroke: pull toward the chest and push away
export function rowArm(phase) {
  return { x: -0.9 + Math.sin(phase) * 0.7, z: 0.15 };
}
// what the hand does while using an item: to the mouth, hold, then away. Returns arm x rotation and bottle tilt
export function useArm(kind, p) {
  const up = pulse(0, 0.25, 0.75, 1, clamp01(p));
  return { x: -2.3 * up, tilt: kind === 'whiskey' ? -1.2 * pulse(0.3, 0.45, 0.6, 0.75, clamp01(p)) : 0, puff: kind === 'weed' ? pulse(0.4, 0.5, 0.6, 0.7, clamp01(p)) : 0 };
}
// holding a fresh catch up to show it off
export function catchArm(p) {
  const up = pulse(0, 0.18, 0.82, 1, clamp01(p));
  return { x: -2.5 * up, z: -0.25 * up + Math.sin(clamp01(p) * 20) * 0.04 * up, bob: Math.sin(clamp01(p) * 18) * 0.03 * up };
}
