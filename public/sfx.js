// Loon Lake audio. Everything is synthesized with Web Audio, no files.
let ctx = null;
let master = null;
let ambienceGain = null;
let water = null;
let rainGain = null;
let volume = 0.8;
let stepAt = 0;
let reelAt = 0;
let birdAt = 3;
let cricketAt = 2;
let crackleAt = 0;
let motorAt = 0;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.34 * volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function envGain(duration, peak, delay = 0) {
  const audio = ac();
  if (!audio) return null;
  const gain = audio.createGain();
  gain.connect(master);
  const t = audio.currentTime + delay;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  return { audio, gain, t };
}

function tone(freq, duration, type, peak, slide, delay = 0) {
  const node = envGain(duration, peak, delay);
  if (!node) return;
  const osc = node.audio.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, node.t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), node.t + duration);
  osc.connect(node.gain);
  osc.start(node.t);
  osc.stop(node.t + duration + 0.03);
}

function noise(duration, peak, freq, q, delay = 0, type = 'bandpass') {
  const node = envGain(duration, peak, delay);
  if (!node) return;
  const frames = Math.max(1, Math.floor(node.audio.sampleRate * duration));
  const buffer = node.audio.createBuffer(1, frames, node.audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = node.audio.createBufferSource();
  src.buffer = buffer;
  const filter = node.audio.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  src.connect(filter);
  filter.connect(node.gain);
  src.start(node.t);
}

function ambience() {
  const audio = ac();
  if (!audio || water) return;
  const frames = audio.sampleRate * 2;
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < frames; i++) {
    last = last * 0.94 + (Math.random() * 2 - 1) * 0.06;
    data[i] = last;
  }
  const src = audio.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const filter = audio.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  ambienceGain = audio.createGain();
  ambienceGain.gain.value = 0.16;
  src.connect(filter);
  filter.connect(ambienceGain);
  ambienceGain.connect(master);
  src.start();
  water = src;
}

// the loon's wail: a slow rising, wavering glide
function loonCall(peak) {
  const audio = ac();
  if (!audio) return;
  const t = audio.currentTime;
  const gain = audio.createGain();
  gain.connect(master);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.4);
  gain.gain.setValueAtTime(peak, t + 1.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
  const osc = audio.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(560, t);
  osc.frequency.exponentialRampToValueAtTime(880, t + 0.9);
  osc.frequency.setValueAtTime(880, t + 1.5);
  osc.frequency.exponentialRampToValueAtTime(700, t + 2.5);
  const lfo = audio.createOscillator();
  lfo.frequency.value = 5.5;
  const lfoGain = audio.createGain();
  lfoGain.gain.value = 9;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  osc.connect(gain);
  osc.start(t);
  lfo.start(t);
  osc.stop(t + 2.7);
  lfo.stop(t + 2.7);
}

const FANFARE = {
  junk: [[220, 0], [196, 0.12]],
  common: [[660, 0], [880, 0.08]],
  uncommon: [[587, 0], [740, 0.08], [880, 0.16]],
  treasure: [[523, 0], [659, 0.08], [784, 0.16], [1047, 0.26]],
  rare: [[523, 0], [659, 0.08], [784, 0.16], [1047, 0.26]],
  epic: [[392, 0], [523, 0.1], [659, 0.2], [784, 0.3], [1047, 0.42]],
  legendary: [[392, 0], [523, 0.1], [659, 0.2], [784, 0.3], [1047, 0.42], [1319, 0.56], [1568, 0.7]],
};

export const sfx = {
  unlock() { if (ac()) ambience(); },
  setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = 0.34 * volume;
  },
  step(t, sprint) {
    if (t < stepAt) return;
    stepAt = t + (sprint ? 0.27 : 0.38);
    noise(0.08, 0.1, 180, 0.7);
  },
  cast() { tone(420, 0.14, 'triangle', 0.08, 180); noise(0.3, 0.16, 900, 0.8); },
  splash(size = 1) { noise(0.22 + size * 0.15, 0.12 + size * 0.1, 520 - size * 120, 0.6); tone(300, 0.08, 'sine', 0.04 * size, 120); },
  plop() { tone(260, 0.1, 'sine', 0.07, 90); noise(0.12, 0.06, 700, 1); },
  nibble() { tone(420, 0.05, 'sine', 0.03, 300); },
  bite() { tone(880, 0.08, 'square', 0.07, 1320); noise(0.2, 0.14, 500, 0.7); },
  reel(t, strain) {
    if (t < reelAt) return;
    reelAt = t + 0.1;
    noise(0.04, 0.05 + strain * 0.05, 900 + strain * 1400, 2.4);
  },
  strain() { tone(1600, 0.06, 'sawtooth', 0.02, 1500); },
  snap() { tone(1800, 0.05, 'square', 0.08, 400); noise(0.12, 0.14, 2600, 1.5); },
  land(rarity) {
    const notes = FANFARE[rarity] || FANFARE.common;
    notes.forEach(([f, d]) => tone(f, rarity === 'legendary' ? 0.5 : 0.28, 'triangle', 0.07, null, d));
    if (rarity === 'legendary' || rarity === 'epic') noise(0.6, 0.05, 6000, 0.6, 0.4, 'highpass');
  },
  coin() { tone(988, 0.07, 'square', 0.04); tone(1319, 0.2, 'square', 0.04, null, 0.07); },
  // steady rain hiss that follows how hard it is raining (0 to 1)
  rain(level) {
    const audio = ac();
    if (!audio) return;
    if (!rainGain) {
      if (level < 0.03) return;
      const frames = audio.sampleRate * 2;
      const buffer = audio.createBuffer(1, frames, audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
      const src = audio.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const band = audio.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 3200;
      band.Q.value = 0.35;
      rainGain = audio.createGain();
      rainGain.gain.value = 0;
      src.connect(band);
      band.connect(rainGain);
      rainGain.connect(master);
      src.start();
    }
    rainGain.gain.setTargetAtTime(level * 0.2, audio.currentTime, 0.7);
  },
  thunder(delay = 0) {
    noise(3.2, 0.55, 150, 0.4, delay);
    tone(52, 2.6, 'sawtooth', 0.12, 30, delay);
    noise(1.4, 0.3, 90, 0.5, delay + 0.7);
  },
  shot(kind) {
    if (kind === 'shotgun') { noise(0.34, 0.65, 160, 0.5); tone(90, 0.22, 'sawtooth', 0.16, 40); }
    else if (kind === 'smg') { noise(0.09, 0.35, 420, 0.6); tone(180, 0.06, 'square', 0.07, 90); }
    else if (kind === 'pistol') { noise(0.13, 0.4, 320, 0.55); tone(200, 0.08, 'sawtooth', 0.1, 80); }
    else if (kind === 'sniper') { noise(0.45, 0.6, 140, 0.4); tone(110, 0.3, 'sawtooth', 0.16, 35); }
    else if (kind === 'deagle') { noise(0.26, 0.6, 200, 0.45); tone(130, 0.16, 'sawtooth', 0.15, 45); }
    else if (kind === 'lmg') { noise(0.11, 0.42, 300, 0.55); tone(120, 0.07, 'square', 0.09, 60); }
    else if (kind === 'bow') { tone(520, 0.06, 'triangle', 0.08, 180); noise(0.05, 0.12, 900, 0.4); }
    else { noise(0.2, 0.5, 220, 0.5); tone(140, 0.12, 'sawtooth', 0.12, 60); }
  },
  // one-shot cues for the item animations (magazine clunks, knife flicks, shell loads)
  cue(name, vol = 1) {
    const v = Math.max(0.05, Math.min(1, vol));
    switch (name) {
      case 'magout': noise(0.09, 0.09 * v, 900, 1.2); tone(180, 0.06, 'square', 0.05 * v, 90); break;
      case 'magin': tone(240, 0.05, 'square', 0.08 * v, 160); noise(0.06, 0.1 * v, 1400, 1); break;
      case 'rack': noise(0.05, 0.1 * v, 2400, 1.5); tone(1200, 0.03, 'square', 0.05 * v, 700, 0.09); noise(0.05, 0.09 * v, 1800, 1.5, 0.1); break;
      case 'open': tone(700, 0.04, 'square', 0.06 * v, 500); break;
      case 'load': tone(520, 0.03, 'square', 0.06 * v, 400); tone(560, 0.03, 'square', 0.05 * v, 420, 0.07); break;
      case 'close': tone(300, 0.06, 'square', 0.08 * v, 180); break;
      case 'shell': tone(200, 0.05, 'triangle', 0.08 * v, 120); noise(0.05, 0.06 * v, 1200, 1); break;
      case 'pump': noise(0.07, 0.11 * v, 1000, 1); tone(150, 0.08, 'square', 0.07 * v, 90, 0.1); noise(0.06, 0.1 * v, 1500, 1, 0.16); break;
      case 'boltup': tone(900, 0.04, 'square', 0.06 * v, 600); break;
      case 'boltdown': tone(500, 0.05, 'square', 0.08 * v, 240); noise(0.05, 0.08 * v, 1200, 1); break;
      case 'draw': noise(0.12, 0.07 * v, 1800, 0.8); tone(360, 0.05, 'triangle', 0.04 * v, 260); break;
      case 'handle': noise(0.08, 0.05 * v, 1500, 1); break;
      case 'flick': noise(0.06, 0.09 * v, 3800, 2); tone(1900, 0.03, 'triangle', 0.04 * v, 1300); break;
      case 'slash': noise(0.16, 0.13 * v, 3000, 1.6); tone(1500, 0.1, 'sawtooth', 0.02 * v, 700); break;
      case 'stab': noise(0.12, 0.12 * v, 1200, 1); tone(240, 0.12, 'triangle', 0.08 * v, 110, 0.05); break;
      default: break;
    }
  },
  reload() { tone(300, 0.05, 'square', 0.06, 200); tone(420, 0.05, 'square', 0.06, 320, 0.32); tone(240, 0.08, 'square', 0.07, 200, 0.7); },
  distantShot(vol) { noise(0.25, 0.25 * vol, 160, 0.5); },
  whoosh(heavy, vol = 1) { noise(heavy ? 0.22 : 0.13, (heavy ? 0.16 : 0.1) * vol, heavy ? 700 : 1100, 0.7); },
  thud(heavy, vol = 1) {
    tone(heavy ? 90 : 130, heavy ? 0.2 : 0.12, 'sine', (heavy ? 0.26 : 0.18) * vol, 50);
    noise(0.08, (heavy ? 0.28 : 0.18) * vol, 380, 0.8);
  },
  splat(vol = 1) { noise(0.12, 0.14 * vol, 300, 0.9); tone(90, 0.08, 'sine', 0.06 * vol, 60); },
  motor(t, speed) {
    if (t < motorAt) return;
    motorAt = t + Math.max(0.07, 0.2 - speed * 0.014);
    noise(0.06, 0.05 + speed * 0.004, 140 + speed * 12, 1.4);
  },
  shutter() { noise(0.05, 0.25, 3000, 0.8); noise(0.08, 0.18, 1200, 0.8, 0.07); },
  hitmark() { tone(1900, 0.04, 'square', 0.05); },
  kill() { tone(1400, 0.05, 'square', 0.05); tone(1900, 0.08, 'square', 0.05, null, 0.06); },
  hurt() { tone(180, 0.16, 'sawtooth', 0.14, 70); },
  down() { tone(90, 0.5, 'triangle', 0.16, 40); },
  pickup() { tone(660, 0.08, 'sine', 0.08, 990); },
  drug(name) {
    if (name === 'weed') tone(220, 0.35, 'sine', 0.06, 160);
    else if (name === 'whiskey') noise(0.12, 0.08, 400, 0.4);
    else tone(740, 0.06, 'square', 0.05, 1480);
  },
  card() { noise(0.05, 0.1, 1800, 1.2); },
  slotTick() { tone(520, 0.03, 'square', 0.03, 480); },
  slotWin(big) {
    const n = big ? 8 : 3;
    for (let i = 0; i < n; i++) tone(700 + i * 90, 0.08, 'square', 0.04, null, i * 0.07);
  },
  ui() { tone(540, 0.05, 'sine', 0.05, 720); },
  chat() { tone(760, 0.05, 'sine', 0.04, 900); },
  horn() {
    tone(196, 0.9, 'sawtooth', 0.05, 190);
    tone(247, 0.9, 'sawtooth', 0.04, 245);
  },
  loon(dist = 20) { loonCall(Math.max(0.012, 0.05 - dist * 0.0006)); },
  // ambience ticks: birds by day, crickets by night, the campfire when close
  ambient(t, night, fireDist) {
    if (ambienceGain) ambienceGain.gain.value = night ? 0.1 : 0.16;
    if (!night && t >= birdAt) {
      birdAt = t + 5 + Math.random() * 7;
      tone(1400 + Math.random() * 800, 0.09, 'sine', 0.03, 1800);
      tone(1600 + Math.random() * 600, 0.07, 'sine', 0.02, 2000, 0.12);
    }
    if (night && t >= cricketAt) {
      cricketAt = t + 0.6 + Math.random() * 1.4;
      for (let i = 0; i < 3; i++) tone(4300, 0.03, 'sine', 0.012, null, i * 0.06);
    }
    if (fireDist < 12 && t >= crackleAt) {
      crackleAt = t + 0.08 + Math.random() * 0.35;
      noise(0.03, 0.05 * (1 - fireDist / 12), 2400 + Math.random() * 2000, 1.2);
    }
  },
};
