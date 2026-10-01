// Loon Lake: authoritative game server.
// Owns positions, bites, species rolls, hot spots, derbies, the day clock,
// the school of fish, shots, NPCs, cash, gear, the shack, and saved profiles.
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const compression = require('compression');

const PORT = process.env.PORT || 3000;
const TICK_RATE = 20;
const DEBUG = process.env.LOON_DEBUG === '1';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SAVE_FILE = path.join(DATA_DIR, 'players.json');

// ---------------------------------------------------------------- world

const DAY_MS = 12 * 60 * 1000; // one full day on the lake

const WORLD = {
  lakeRadius: 30,
  shoreRadius: 31,
  bounds: 60, // the play area: spawns, NPCs and the map
  edge: 200, // how far you can walk: out over the hills, well past the play area
  dock: { minX: -1.6, maxX: 1.6, minZ: 14, maxZ: 32 },
  moveSpeed: 6,
  sprint: 1.5,
  castMin: 4,
  bagMax: 16, // the starting bag; bigger ones are in `bags`
  // bags you can buy from Moss, each one holding more fish
  bags: [
    { id: 'creel', name: 'Wicker creel', cap: 16, price: 0, desc: 'Holds 16 fish.' },
    { id: 'backpack', name: 'Tackle backpack', cap: 24, price: 150, desc: 'Holds 24 fish.' },
    { id: 'cooler', name: 'Cooler', cap: 36, price: 450, desc: 'Holds 36 fish on ice.' },
    { id: 'livewell', name: 'Live well', cap: 50, price: 1100, desc: 'Holds 50 fish, still kicking.' },
    { id: 'chest', name: 'Ice chest', cap: 75, price: 2400, desc: 'Holds 75 fish. A whole derby in one trip.' },
  ],
  // catch streak: land fish back to back (within `window` ms of each other) and each one sells for more
  streak: { window: 90000, step: 0.1, max: 2 },
  dayMs: DAY_MS,
  // a channel runs south from the lake out to the big water
  channel: { minX: -4.5, maxX: 4.5, minZ: -124, maxZ: -26 },
  ocean: { minX: -300, maxX: 300, minZ: -460, maxZ: -118 },
  boat: { buy: 180, rent: 15, speed: 9 },
  boats: [
    { id: 'row', name: 'Rowboat', price: 180, speed: 9, desc: 'A rowboat with a little motor. Gets you to the hot spots and down the channel.', color: '#6A3A1C', scale: 1 },
    { id: 'skiff', name: 'Aluminum skiff', price: 600, speed: 12.5, desc: 'Faster, wider, and it does not rot.', color: '#9AA5AD', scale: 1.15 },
    { id: 'cruiser', name: 'Sport cruiser', price: 1800, speed: 16.5, desc: 'Fast enough to cross the big water before the fish stop biting.', color: '#C43B2B', scale: 1.35 },
  ],
  // how far past sprint speed the server lets a player move before snapping them back. Hopping has no cap on the client,
  // so this is set far beyond what chained hops reach in practice (about 150 perfect hops in a row); it only stops teleports.
  bhop: 12,
  market: { remote: 0.7 },
  camp: {
    dealer: { x: 10, z: 40 },
    shack: { x: -12, z: 38 },
    fire: { x: -1.5, z: 43 },
    range: 4.2,
    safeRadius: 7,
  },
  shop: { ammo: 10, ammoCount: 12, weed: 25, whiskey: 15, crank: 40 },
  guns: {
    pistol: { name: 'Revolver', price: 60, mag: 6, reload: 1500, damage: 30, cooldown: 340, spread: 0.035, pellets: 1, range: 45, auto: false, start: 24, zoom: 52, look: 0.55, recoil: 0.02, sound: 'pistol', desc: 'Six shots of old-school stopping power.' },
    glock: { name: 'Glock 19', price: 140, mag: 15, reload: 1200, damage: 19, cooldown: 190, spread: 0.04, pellets: 1, range: 45, auto: false, start: 45, zoom: 52, look: 0.5, recoil: 0.012, sound: 'pistol', desc: 'Fifteen in the mag. Takes a switch, a laser, and a drum.' },
    rifle: { name: 'Hunting rifle', price: 80, mag: 5, reload: 2300, damage: 34, cooldown: 420, spread: 0.05, pellets: 1, range: 72, auto: false, start: 10, zoom: 42, look: 1, recoil: 0.02, sound: 'rifle', desc: 'Reliable at range.' },
    shotgun: { name: 'Shotgun', price: 220, mag: 6, reload: 2700, damage: 13, cooldown: 850, spread: 0.13, pellets: 8, range: 26, auto: false, start: 12, zoom: 54, look: 1.05, recoil: 0.045, sound: 'shotgun', desc: 'Devastating up close.' },
    smg: { name: 'SMG', price: 380, mag: 30, reload: 1900, damage: 11, cooldown: 95, spread: 0.075, pellets: 1, range: 42, auto: true, start: 60, zoom: 50, look: 0.75, recoil: 0.008, sound: 'smg', desc: 'Hold the button and hang on.' },
    arp: { name: 'AR pistol', price: 520, mag: 30, reload: 1900, damage: 17, cooldown: 82, spread: 0.062, pellets: 1, range: 52, auto: true, start: 90, zoom: 50, look: 0.8, recoil: 0.01, sound: 'smg', desc: 'Rifle round, pistol size. Full auto.' },
    draco: { name: 'Draco', price: 720, mag: 30, reload: 2100, damage: 28, cooldown: 115, spread: 0.07, pellets: 1, range: 58, auto: true, start: 90, zoom: 48, look: 0.85, recoil: 0.018, sound: 'rifle', desc: 'AK pistol. Hits hard, kicks harder. Takes a drum.' },
    sniper: { name: 'Sniper rifle', price: 900, mag: 4, reload: 3000, damage: 90, cooldown: 1300, spread: 0.006, pellets: 1, range: 110, auto: false, start: 8, zoom: 18, look: 1.25, recoil: 0.06, sound: 'sniper', desc: 'One or two shots at any distance.' },
    deagle: { name: 'Desert Eagle', price: 450, mag: 7, reload: 1700, damage: 52, cooldown: 430, spread: 0.03, pellets: 1, range: 55, auto: false, start: 21, zoom: 48, look: 0.65, recoil: 0.05, sound: 'deagle', desc: 'A hand cannon. Seven rounds that each hit like a rifle.' },
    dbarrel: { name: 'Double-barrel', price: 300, mag: 2, reload: 1900, damage: 15, cooldown: 220, spread: 0.15, pellets: 10, range: 20, auto: false, start: 16, zoom: 56, look: 1, recoil: 0.07, sound: 'shotgun', desc: 'Two shells, fired as fast as you can pull. Nothing survives both up close.' },
    m4: { name: 'M4 carbine', price: 1100, mag: 30, reload: 2000, damage: 24, cooldown: 85, spread: 0.042, pellets: 1, range: 78, auto: true, start: 90, zoom: 40, look: 0.9, recoil: 0.011, sound: 'rifle', desc: 'Accurate full-auto rifle. Takes a drum and a laser.' },
    lmg: { name: 'M249 LMG', price: 1700, mag: 100, reload: 4600, damage: 21, cooldown: 72, spread: 0.085, pellets: 1, range: 70, auto: true, start: 200, zoom: 46, look: 1.15, recoil: 0.009, sound: 'lmg', desc: 'A hundred-round belt. Slow to reload, slow to stop.' },
    crossbow: { name: 'Crossbow', price: 650, mag: 1, reload: 1300, damage: 75, cooldown: 400, spread: 0.008, pellets: 1, range: 85, auto: false, start: 12, zoom: 30, look: 1, recoil: 0.02, sound: 'bow', silent: true, desc: 'Silent. Nobody hears it, so nobody comes running.' },
  },
  // gun upgrades: each level adds damage; the price is a share of the gun's own price
  gunLevels: { names: ['Mk I', 'Mk II', 'Mk III', 'Mk IV', 'Mk V'], mul: [1, 1.12, 1.25, 1.4, 1.6], price: [0, 0.6, 1, 1.6, 2.4] },
  attachments: {
    laser: { name: 'Laser beam', price: 90, spreadMul: 0.55, desc: 'A red beam shows where it points, and shots group tighter.', only: null },
    drum: { name: 'Drum mag', price: 180, magMul: 2.5, reloadAdd: 700, desc: 'Two and a half times the rounds. Slower to reload.', only: ['glock', 'smg', 'arp', 'draco', 'm4'] },
    switch: { name: 'Auto switch', price: 320, cooldownMul: 0.3, spreadMul: 1.5, desc: 'Turns it full auto. Burns through the mag.', only: ['glock', 'pistol'] },
  },
  rods: [
    { id: 'cane', name: 'Cane pole', price: 0, castMax: 16, tol: 1, speed: 1, color: '#C9A36A', desc: 'Short casts. Snaps easy.' },
    { id: 'glass', name: 'Fiberglass rod', price: 75, castMax: 20, tol: 1.15, speed: 1.1, color: '#3E7CC9', desc: 'Longer casts, a little more give.' },
    { id: 'graphite', name: 'Graphite rod', price: 220, castMax: 24, tol: 1.32, speed: 1.22, color: '#2B2F33', desc: 'Reaches deep water. Reels faster.' },
    { id: 'boron', name: 'Lunker stick', price: 520, castMax: 28, tol: 1.55, speed: 1.38, color: '#E0452B', desc: 'Built for muskie and sturgeon.' },
    { id: 'carbon', name: 'Carbon pro rod', price: 900, castMax: 32, tol: 1.75, speed: 1.55, color: '#7B3FA0', desc: 'Light, stiff, and long. Casts a football field.' },
    { id: 'tourney', name: 'Tournament rod', price: 1600, castMax: 36, tol: 2.0, speed: 1.75, color: '#1FA89A', desc: 'What the derby champions use.' },
    { id: 'mythic', name: 'Mythic rod', price: 3000, castMax: 40, tol: 2.4, speed: 2.0, color: '#F2B134', desc: 'Takes anything the lake can throw at it.' },
  ],
  baits: [
    { id: 'worms', name: 'Nightcrawlers', price: 0, desc: 'Panfish love them.' },
    { id: 'leeches', name: 'Leeches', price: 50, desc: 'More walleye and bass.' },
    { id: 'minnows', name: 'Fathead minnows', price: 160, desc: 'Pike and muskie start biting.' },
    { id: 'spoon', name: 'Golden spoon', price: 420, desc: 'Trophy fish and the odd legend.' },
  ],
};

const TIMING = { biteMin: 3000, biteMax: 9000, biteWindow: 1400 };

const COMBAT = {
  hp: 100, damage: 34, range: 72, cone: 0.11, cooldown: 420, spread: 0.05,
  dropCash: 0.4, respawn: 3000, npcRespawn: 18000, stake: 100, spawnSafe: 5000,
};

// fists: every third punch inside the combo window is a haymaker
const PUNCH = { range: 2.3, cone: 0.8, damage: 14, heavy: 28, cooldown: 360, comboWindow: 1100, knock: 0.3, heavyKnock: 2.6 };
// everyone carries a hunting knife: slower than a jab, hits much harder, and a stab in the back nearly always kills
const KNIFE = { range: 2.5, cone: 0.7, damage: 38, backstab: 95, cooldown: 520, knock: 0.25 };

const DERBY = { firstIn: 75 * 1000, every: 6 * 60 * 1000, length: 150 * 1000, basePot: 100, perEntry: 40 };

const DRUG_MS = 30000;
const DRUGS = ['weed', 'whiskey', 'crank'];
const DRUG_USE = { weed: 'sparks a joint', whiskey: 'takes a pull of whiskey', crank: 'is wired' };

// rarity: common, uncommon, rare, epic, legendary, junk, treasure
const SPECIES = [
  { id: 'bluegill', where: 'lake', name: 'Bluegill', rarity: 'common', w: 30, lbs: [0.2, 1.1], diff: 0.2, base: 8, color: '#4FA3A5', hint: 'Bites on anything.' },
  { id: 'perch', where: 'lake', name: 'Yellow perch', rarity: 'common', w: 26, lbs: [0.3, 1.6], diff: 0.28, base: 11, color: '#E0A106', hint: 'Common all day.' },
  { id: 'crappie', where: 'lake', name: 'Black crappie', rarity: 'common', w: 18, lbs: [0.4, 2.4], diff: 0.32, base: 14, color: '#9AA59A', hint: 'Common all day.' },
  { id: 'bass', where: 'lake', name: 'Smallmouth bass', rarity: 'uncommon', w: 11, lbs: [1, 6.5], diff: 0.55, base: 34, color: '#8A7A3A', hint: 'Leeches help.' },
  { id: 'walleye', where: 'lake', name: 'Walleye', rarity: 'uncommon', w: 11, lbs: [1, 9], diff: 0.55, base: 42, color: '#C4B48A', golden: 2.2, hint: 'Bites best at dawn and dusk.' },
  { id: 'eelpout', where: 'lake', name: 'Eelpout', rarity: 'uncommon', w: 9, lbs: [1, 7], diff: 0.5, base: 38, when: 'night', color: '#6B5A48', hint: 'Only after dark.' },
  { id: 'pike', where: 'lake', name: 'Northern pike', rarity: 'rare', w: 6.5, lbs: [2, 18], diff: 0.72, base: 68, color: '#6B8F4E', hint: 'Minnows help.' },
  { id: 'catfish', where: 'lake', name: 'Channel catfish', rarity: 'rare', w: 7, lbs: [3, 22], diff: 0.7, base: 62, when: 'night', color: '#5E6B72', hint: 'Only after dark.' },
  { id: 'muskie', where: 'lake', name: 'Muskie', rarity: 'epic', w: 2.2, lbs: [10, 48], diff: 0.93, base: 190, color: '#3E7C4A', hint: 'Minnows, hot spots, patience.' },
  { id: 'sturgeon', name: 'Lake sturgeon', rarity: 'epic', w: 1.4, lbs: [20, 90], diff: 0.9, base: 230, color: '#6E6A5E', deep: true, hint: 'Lives in the deep middle. Cast far.' },
  { id: 'golden', where: 'lake', name: 'Golden walleye', rarity: 'legendary', w: 0.35, lbs: [5, 14], diff: 0.88, base: 650, color: '#F2B134', hint: 'Golden spoon, hot spot, golden hour.' },
  { id: 'boot', name: 'Old boot', rarity: 'junk', w: 4, lbs: [1.2, 1.2], diff: 0.1, base: 0, color: '#4A3A2A', hint: 'Somebody has to.' },
  { id: 'can', name: 'Rusty can', rarity: 'junk', w: 3, lbs: [0.2, 0.2], diff: 0.05, base: 1, color: '#8A8680', hint: 'Somebody has to.' },
  { id: 'cisco', where: 'ocean', name: 'Cisco', rarity: 'common', w: 30, lbs: [0.4, 2], diff: 0.25, base: 12, color: '#B8C4CC', hint: 'Big water only. Schools everywhere out there.' },
  { id: 'whitefish', where: 'ocean', name: 'Lake whitefish', rarity: 'common', w: 22, lbs: [1, 6], diff: 0.35, base: 22, color: '#D8D4C4', hint: 'Big water only.' },
  { id: 'salmon', where: 'ocean', name: 'Coho salmon', rarity: 'uncommon', w: 12, lbs: [3, 12], diff: 0.62, base: 52, color: '#7A8FA8', golden: 1.8, hint: 'Big water, best at dawn and dusk.' },
  { id: 'laketrout', where: 'ocean', name: 'Lake trout', rarity: 'rare', w: 8, lbs: [4, 30], diff: 0.74, base: 85, color: '#5E6A5A', hint: 'Deep, cold big water.' },
  { id: 'pressie', where: 'ocean', name: 'Pressie', rarity: 'legendary', w: 0.12, lbs: [180, 650], diff: 0.98, base: 2500, color: '#3E5E4E', hint: 'Old-timers swear it lives out past the channel.' },
  { id: 'bell', where: 'ocean', name: 'Shipwreck bell', rarity: 'treasure', w: 0.5, lbs: [40, 40], diff: 0.3, base: 400, color: '#B8913A', hint: 'From a freighter that never made port.' },
  { id: 'tacklebox', where: 'lake', name: 'Lost tackle box', rarity: 'treasure', w: 0.7, lbs: [4, 4], diff: 0.2, base: 120, color: '#3E6B4F', hint: 'Some unlucky angler dropped it.' },
];
// the original species: which use the long fish model, and a few color/shape touches
const LONG_IDS = new Set(['walleye', 'pike', 'muskie', 'eelpout', 'sturgeon', 'golden', 'catfish', 'bass', 'perch', 'cisco', 'whitefish', 'salmon', 'laketrout', 'pressie']);
SPECIES.forEach((s) => { s.long = LONG_IDS.has(s.id); });
SPECIES.push(...require('./species_extra'));
// Boss catches are hooked, shot to pieces and landed: they get journal entries like any fish, but never roll as a normal bite
const BOSSES = {
  snapjaw: { id: 'snapjaw', name: 'Snapjaw', tier: 1, rodMin: 0, where: 'lake', hp: 420, wearCap: 0.3, landAt: 0.35, radius: 1.6, lbs: [180, 320], base: 220, color: '#5E7A3A',
    hint: 'A snapping turtle the size of a table. Any rod can hook it.',
    moves: [{ name: 'Lunge', kind: 'spike', r: 5, dmg: 12 }, { name: 'Thrash', kind: 'spike', r: 0, dmg: 0 }] },
  piranha: { id: 'piranhastorm', name: 'Piranha Storm', tier: 1, rodMin: 0, where: 'lake', hp: 300, wearCap: 0.3, landAt: 0.35, radius: 2.2, lbs: [40, 70], base: 190, color: '#B02A2A',
    hint: 'One hook, twenty piranhas. Thin the swarm, then reel in the king.',
    moves: [{ name: 'Swarm', kind: 'spike', r: 6, dmg: 10 }, { name: 'Frenzy', kind: 'spike', r: 0, dmg: 0 }] },
  gator: { id: 'gatorking', name: 'Gator King', tier: 2, rodMin: 1, where: 'lake', hp: 1400, wearCap: 0.55, landAt: 0.35, radius: 3, lbs: [400, 700], base: 700, color: '#4A5A2E',
    hint: 'A scarred old alligator. Death rolls drag you off your feet.',
    moves: [{ name: 'Death roll', kind: 'spike', r: 7, dmg: 18 }, { name: 'Tail whip', kind: 'spike', r: 8, dmg: 16 }, { name: 'Submerge', kind: 'slack', r: 0, dmg: 0 }] },
  eel: { id: 'voltaiceel', name: 'Voltaic Eel', tier: 2, rodMin: 2, where: 'lake', hp: 1200, wearCap: 0.55, landAt: 0.35, radius: 2.4, lbs: [90, 160], base: 650, color: '#3AC8E8',
    hint: 'Glows blue. Every few seconds it discharges into the water and everyone near it.',
    moves: [{ name: 'Discharge', kind: 'spike', r: 10, dmg: 14 }, { name: 'Thrash', kind: 'spike', r: 0, dmg: 0 }] },
  leviathan: { id: 'leviathan', name: 'Leviathan Sturgeon', tier: 3, rodMin: 3, where: 'lake', hp: 3000, wearCap: 0.7, landAt: 0.35, radius: 4, lbs: [900, 1600], base: 1500, color: '#6E7A88',
    hint: 'Armored plates you have to shoot off. It dives, goes slack, and breaches.',
    moves: [{ name: 'Dive', kind: 'slack', r: 0, dmg: 0 }, { name: 'Breach', kind: 'spike', r: 9, dmg: 20 }, { name: 'Ram', kind: 'spike', r: 6, dmg: 16 }] },
  kraken: { id: 'kraken', name: 'The Kraken', tier: 3, rodMin: 4, where: 'ocean', hp: 5000, wearCap: 0.75, landAt: 0.35, radius: 5, lbs: [2000, 3200], base: 4000, color: '#7A2A5A',
    hint: 'Only in the big water. Tentacles slam the deck and it blots the screen with ink.',
    moves: [{ name: 'Tentacle slam', kind: 'spike', r: 9, dmg: 22 }, { name: 'Ink', kind: 'ink', r: 0, dmg: 0 }, { name: 'Grab', kind: 'spike', r: 7, dmg: 18 }] },
};
for (const b of Object.values(BOSSES)) {
  SPECIES.push({ id: b.id, name: b.name, where: b.where, rarity: 'legendary', w: 0, lbs: b.lbs, diff: 0.7 + b.tier * 0.08, base: b.base, color: b.color, hint: b.hint, boss: true, long: false });
}
// which 3D model each species uses (anything not listed uses the plain long or round fish)
const MODEL_OF = {};
const assignModel = (model, ids) => ids.forEach((id) => { MODEL_OF[id] = model; });
assignModel('fish_shark', ['mako', 'thresher', 'hammerhead', 'tigershark', 'greatwhite', 'whaleshark', 'dogfish']);
assignModel('fish_pike', ['pike', 'muskie', 'tigermuskie', 'barracuda', 'gar', 'bowfin', 'wahoo', 'swordfish', 'bluemarlin', 'moray', 'eel', 'eelpout']);
assignModel('fish_cat', ['catfish', 'bullhead', 'yellowbullhead', 'flathead', 'bluecat', 'albinocat']);
assignModel('fish_deep', ['bluegill', 'pumpkinseed', 'greensunfish', 'redear', 'rockbass', 'crappie', 'whitecrappie', 'whiteperch', 'pompano', 'permit', 'scup', 'tautog', 'blackdrum', 'snapper', 'grouper', 'seabass', 'drum']);
assignModel('fish_clown', ['killifish', 'warmouth', 'sheepshead', 'lionfish']);
SPECIES.forEach((s) => { if (MODEL_OF[s.id]) s.model = MODEL_OF[s.id]; });
const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
const FISHY = (s) => !['junk', 'treasure'].includes(s.rarity) && !s.when;
const SWIMMERS = SPECIES.filter((s) => ['common', 'uncommon', 'rare'].includes(s.rarity) && !s.when && s.where === 'lake');
// what you can see swimming in the big water: everything up to sharks
const OCEAN_SWIMMERS = SPECIES.filter((s) => s.where === 'ocean' && FISHY(s) && s.rarity !== 'legendary');
const LAKE_RARE = SPECIES.filter((s) => s.where === 'lake' && !s.when && (s.rarity === 'epic' || s.rarity === 'legendary') && !s.boss);
const CHANNEL_SWIMMERS = SWIMMERS.filter((s) => s.lbs[1] < 25);
const FISH_HP = { common: 2, uncommon: 2, rare: 3, epic: 5, legendary: 8 };
const RARITY_RANK = { junk: 0, common: 1, uncommon: 2, treasure: 3, rare: 3, epic: 4, legendary: 5 };

const BAIT_MUL = {
  common: [1, 0.85, 0.65, 0.5],
  uncommon: [1, 1.5, 1.7, 1.8],
  rare: [0.8, 1.3, 2.2, 2.8],
  epic: [0.5, 0.9, 2, 3.2],
  legendary: [0.3, 0.6, 1.5, 4],
  junk: [1, 0.7, 0.5, 0.35],
  treasure: [1, 1, 1.1, 1.2],
};
const HOT_MUL = { common: 0.7, uncommon: 1.3, rare: 1.8, epic: 2.2, legendary: 2.5, junk: 0.4, treasure: 1.5 };

const SLOT_SYMBOLS = [
  { id: 'boot', w: 30, triple: 3 },
  { id: 'perch', w: 24, triple: 5 },
  { id: 'pike', w: 18, triple: 8 },
  { id: 'muskie', w: 12, triple: 12 },
  { id: 'weed', w: 10, triple: 10 },
  { id: 'seven', w: 6, triple: 20 },
];
const SLOT_WEIGHT = SLOT_SYMBOLS.reduce((s, x) => s + x.w, 0);

const COLORS = ['#E0452B', '#F2B134', '#4FA3A5', '#9B6FC2', '#E8E3D3', '#6DBF67', '#3E7CC9', '#D9719B'];

// what the client needs to draw the world, shop, and journal
WORLD.species = SPECIES.map(({ id, name, rarity, lbs, color, hint, when, where, long, prop, belly, fin, pattern, model }) => ({ id, name, rarity, lbs, color, hint, when, where, long, prop, belly, fin, pattern, model }));
WORLD.colors = COLORS;

// ---------------------------------------------------------------- server

const app = express();
app.use(compression());
app.use('/vendor/three', express.static(path.join(__dirname, 'node_modules', 'three')));
app.use('/models', express.static(path.join(__dirname, 'public', 'models'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server);

const players = new Map();
const school = [];
const pickups = [];
let fishSerial = 1;
let pickupSerial = 1;
let bagSerial = 1;
let shoe = [];

const rand = (a, b) => a + Math.random() * (b - a);
const replyFn = (ack) => (typeof ack === 'function' ? ack : () => {});
const nowMs = () => Date.now();
const r2 = (v) => Math.round(v * 100) / 100;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const onDock = (x, z) => {
  const d = WORLD.dock;
  return x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ;
};
const inChannel = (x, z, m = 0) => {
  const c = WORLD.channel;
  return x >= c.minX - m && x <= c.maxX + m && z >= c.minZ - m && z <= c.maxZ + m;
};
const inOcean = (x, z) => {
  const o = WORLD.ocean;
  return x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ;
};
const onLand = (x, z) =>
  onDock(x, z) ||
  (Math.hypot(x, z) >= WORLD.shoreRadius && Math.abs(x) <= WORLD.edge && Math.abs(z) <= WORLD.edge && !inChannel(x, z, 0.8));
const inWater = (x, z) => !onDock(x, z) && (Math.hypot(x, z) < WORLD.lakeRadius - 0.3 || inChannel(x, z) || inOcean(x, z));
// on foot you can also wade and swim: land, any water, or the shoreline strip between them
const footOk = (x, z) => onLand(x, z) || inWater(x, z) || inChannel(x, z, 0.8) || Math.hypot(x, z) < WORLD.shoreRadius;
const waterRegion = (x, z) => (inOcean(x, z) || (inChannel(x, z) && z < -80) ? 'ocean' : 'lake');

// nearest open water to launch a boat into, and nearest dry ground to step back onto
function nearWater(x, z) {
  for (let r = 1.2; r <= 4.6; r += 0.4) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const wx = x + Math.sin(a) * r;
      const wz = z + Math.cos(a) * r;
      if ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([ox, oz]) => inWater(wx + ox, wz + oz))) return { x: wx, z: wz, rot: a };
    }
  }
  return null;
}
function nearLand(x, z) {
  for (let r = 0.8; r <= 4.6; r += 0.4) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const lx = x + Math.sin(a) * r;
      const lz = z + Math.cos(a) * r;
      if (onLand(lx, lz)) return { x: lx, z: lz };
    }
  }
  return null;
}
const distTo = (x, z, spot) => Math.hypot(x - spot.x, z - spot.z);
const atDealer = (p) => distTo(p.x, p.z, WORLD.camp.dealer) <= WORLD.camp.range;
const atShack = (p) => distTo(p.x, p.z, WORLD.camp.shack) <= WORLD.camp.range;
const inCamp = (p) => {
  const c = WORLD.camp;
  return [c.dealer, c.shack, c.fire].some((s) => distTo(p.x, p.z, s) <= c.safeRadius);
};

function shoreSpot(x, z) {
  if (onLand(x, z)) return { x, z };
  const d = Math.hypot(x, z) || 1;
  const r = WORLD.shoreRadius + 1.4;
  return {
    x: Math.max(-WORLD.bounds, Math.min(WORLD.bounds, (x / d) * r)),
    z: Math.max(-WORLD.bounds, Math.min(WORLD.bounds, (z / d) * r)),
  };
}

function campSpawn() {
  const f = WORLD.camp.fire;
  const a = rand(0, Math.PI * 2);
  return { x: f.x + Math.sin(a) * 2.6, z: f.z + Math.cos(a) * 2.6, rot: Math.PI };
}

function shoreSpawn() {
  const a = Math.random() * Math.PI * 2;
  return { x: Math.sin(a) * 36, z: Math.cos(a) * 36, rot: a + Math.PI };
}

// ---------------------------------------------------------------- clock

let clockBase = nowMs() - (3 / 24) * DAY_MS; // start the server at 9 am
function hourNow() {
  const t = (((nowMs() - clockBase) % DAY_MS) + DAY_MS) % DAY_MS;
  return (6 + (t / DAY_MS) * 24) % 24;
}
function setHour(h) {
  const frac = (((h - 6) % 24) + 24) % 24 / 24;
  clockBase = nowMs() - frac * DAY_MS;
}
const isNight = (h = hourNow()) => h >= 20.5 || h < 5.5;
const isGolden = (h = hourNow()) => (h >= 5.5 && h < 8) || (h >= 18 && h < 20.5);

// ---------------------------------------------------------------- saves

let profiles = {};
let saveDirty = false;
try {
  if (fs.existsSync(SAVE_FILE)) profiles = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8')) || {};
  console.log(`Loaded ${Object.keys(profiles).length} saved anglers`);
} catch (err) {
  console.warn('Could not read saves, starting fresh:', err.message);
  profiles = {};
}

function writeSaves() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = SAVE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(profiles));
    fs.renameSync(tmp, SAVE_FILE);
    saveDirty = false;
  } catch (err) {
    console.warn('Save failed:', err.message);
  }
}

function freshPocket() { return { weed: 0, whiskey: 0, crank: 0 }; }

const GUN_IDS = Object.keys(WORLD.guns);
const HOLDABLE = new Set(['fists', 'knife', 'rod', 'bait', ...GUN_IDS, 'weed', 'whiskey', 'crank', 'bag']);
function ownsHold(p, held) {
  if (held === 'fists' || held === 'knife' || held === 'rod' || held === 'bait' || held === 'bag') return true;
  if (GUN_IDS.includes(held)) return !!p.guns[held];
  return DRUGS.includes(held) && p.pocket[held] > 0;
}

// ---------------------------------------------------------------- progression

const XP_BY_RARITY = { junk: 2, common: 10, uncommon: 25, treasure: 40, rare: 60, epic: 120, legendary: 300 };
const levelOf = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
const xpFloor = (level) => (level - 1) * (level - 1) * 60;
const QUEST_TYPES = ['catch', 'uncommon', 'hot'];
const QUEST_GOALS = { catch: [3, 5, 8], uncommon: [1, 2, 3], hot: [1, 2, 3] };
const QUEST_PAY = { catch: [25, 45, 80], uncommon: [40, 70, 120], hot: [45, 80, 130] };

function newQuest(p, avoid) {
  const options = QUEST_TYPES.filter((t) => !avoid.includes(t));
  const type = options[Math.floor(Math.random() * options.length)];
  const tier = Math.min(2, Math.floor((levelOf(p.xp) - 1) / 3));
  return { type, goal: QUEST_GOALS[type][tier], n: 0, reward: QUEST_PAY[type][tier], xp: 15 + tier * 15 };
}

function ensureQuests(p) {
  if (!Array.isArray(p.quests)) p.quests = [];
  p.quests = p.quests.filter((q) => q && QUEST_TYPES.includes(q.type)).slice(0, 3);
  while (p.quests.length < 3) p.quests.push(newQuest(p, p.quests.map((q) => q.type)));
}

// returns the quests this catch completed; each one is swapped for a fresh quest
function advanceQuests(p, species, hot) {
  ensureQuests(p);
  const rank = RARITY_RANK[species.rarity];
  const real = species.rarity !== 'junk';
  const done = [];
  p.quests = p.quests.map((q, i, all) => {
    const hit = (q.type === 'catch' && real) || (q.type === 'uncommon' && real && rank >= 2) || (q.type === 'hot' && real && hot);
    if (!hit) return q;
    q.n += 1;
    if (q.n < q.goal) return q;
    done.push({ type: q.type, goal: q.goal, reward: q.reward, xp: q.xp });
    p.cash += q.reward;
    p.xp += q.xp;
    return newQuest(p, all.map((o) => o.type).filter((t, j) => j !== i));
  });
  return done;
}

// ---------------------------------------------------------------- guns

// critical hit chance per gun, and how hard a kill shot shoves the body
const CRIT = { pistol: 0.1, glock: 0.08, rifle: 0.12, shotgun: 0.05, smg: 0.05, arp: 0.07, draco: 0.09, sniper: 0.3, deagle: 0.15, dbarrel: 0.05, m4: 0.08, lmg: 0.06, crossbow: 0.35 };
const CRIT_MUL = { sniper: 2, crossbow: 2 };
const KICK = { pistol: 7, glock: 6, rifle: 11, shotgun: 16, smg: 6, arp: 8, draco: 11, sniper: 22, deagle: 13, dbarrel: 20, m4: 9, lmg: 9, crossbow: 14 };
// full damage up close, fading to 55% at the end of a gun's range
function falloff(dist, range) {
  const near = range * 0.4;
  if (dist <= near) return 1;
  return 1 - 0.45 * Math.min(1, (dist - near) / (range - near));
}

const freshLvl = () => Object.fromEntries(GUN_IDS.map((g) => [g, 0]));
const freshAtt = () => Object.fromEntries(GUN_IDS.map((g) => [g, { laser: false, drum: false, switch: false }]));
// a gun's real stats once its attachments are on
function effGun(p, id) {
  const base = WORLD.guns[id];
  const a = (p.att && p.att[id]) || {};
  const A = WORLD.attachments;
  let mag = base.mag;
  let reload = base.reload;
  let cooldown = base.cooldown;
  let spread = base.spread;
  let auto = base.auto;
  if (a.drum) { mag = Math.round(mag * A.drum.magMul); reload += A.drum.reloadAdd; }
  if (a.switch) { cooldown = Math.round(cooldown * A.switch.cooldownMul); spread *= A.switch.spreadMul; auto = true; }
  if (a.laser) spread *= A.laser.spreadMul;
  const level = (p.glvl && p.glvl[id]) || 0;
  const damage = base.damage * WORLD.gunLevels.mul[level];
  return { ...base, id, mag, reload, cooldown, spread, auto, damage, level, crit: CRIT[id] || 0.06, critMul: CRIT_MUL[id] || 1.75 };
}
const freshGuns = () => Object.fromEntries(GUN_IDS.map((g) => [g, false]));
const freshMag = () => Object.fromEntries(GUN_IDS.map((g) => [g, 0]));
const hasAnyGun = (p) => GUN_IDS.some((g) => p.guns[g]);

// a reload finishes lazily: the next thing that looks at the player settles it
function tickReload(p) {
  if (!p.reloadGun || nowMs() < p.reloadUntil) return;
  const g = effGun(p, p.reloadGun);
  const take = Math.max(0, Math.min(g.mag - p.mag[p.reloadGun], p.ammo));
  p.mag[p.reloadGun] += take;
  p.ammo -= take;
  p.reloadGun = null;
}

function startReload(p, gunId) {
  tickReload(p);
  const g = WORLD.guns[gunId] && effGun(p, gunId);
  if (!g || !p.guns[gunId] || p.reloadGun || p.mag[gunId] >= g.mag || p.ammo <= 0) return false;
  p.reloadGun = gunId;
  p.reloadUntil = nowMs() + g.reload;
  return true;
}

const boatSpeed = (p) => WORLD.boats[Math.max(0, p.boatTier)].speed;

function storeProfile(p) {
  if (!p || p.guest) return;
  profiles[p.token] = {
    name: p.name, color: p.color, look: p.look, skin: p.skin, cash: p.cash, rod: p.rod, bait: p.bait,
    guns: p.guns, mag: p.mag, att: p.att, glvl: p.glvl, ammo: p.ammo, pocket: p.pocket, bag: p.bag, bagTier: p.bagTier || 0, ownsBoat: !!p.ownsBoat, boatTier: p.boatTier,
    journal: p.journal, caught: p.caught, earned: p.earned, derbyWins: p.derbyWins,
    best: p.best, xp: p.xp, quests: p.quests, seen: nowMs(),
  };
  saveDirty = true;
}

setInterval(() => {
  players.forEach(storeProfile);
  if (saveDirty) writeSaves();
}, 10000);

function shutdown() {
  players.forEach(storeProfile);
  writeSaves();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------- hot spots

const hotspots = [0, 1, 2].map((i) => ({ id: 'hs' + i, x: 0, z: 0, r: 3.8, until: 0, born: 0 }));

function placeHotspot(h) {
  for (let tries = 0; tries < 40; tries++) {
    const a = rand(0, Math.PI * 2);
    const r = rand(5, WORLD.lakeRadius - 5);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    if (Math.abs(x) < 4 && z > 10) continue; // keep off the dock
    if (hotspots.some((o) => o !== h && o.until && Math.hypot(o.x - x, o.z - z) < 12)) continue;
    h.x = x; h.z = z;
    break;
  }
  h.born = nowMs();
  h.until = nowMs() + rand(50000, 95000);
}
hotspots.forEach(placeHotspot);

const hotspotAt = (x, z) => hotspots.find((h) => Math.hypot(x - h.x, z - h.z) <= h.r) || null;

function tickHotspots() {
  const now = nowMs();
  hotspots.forEach((h) => { if (now >= h.until) placeHotspot(h); });
}

// ---------------------------------------------------------------- derby

const derby = { active: false, endsAt: 0, nextAt: nowMs() + DERBY.firstIn, entries: new Map(), leader: null };

function derbyStandings() {
  return [...derby.entries.values()].sort((a, b) => b.lbs - a.lbs);
}

function startDerby() {
  derby.active = true;
  derby.endsAt = nowMs() + DERBY.length;
  derby.entries.clear();
  derby.leader = null;
  io.emit('derby', { type: 'start', length: DERBY.length });
  feed('The derby is on. Heaviest fish in the next few minutes takes the pot.', 'derby');
}

function finishDerby() {
  derby.active = false;
  derby.nextAt = nowMs() + DERBY.every;
  const standings = derbyStandings();
  const pot = DERBY.basePot + DERBY.perEntry * standings.length;
  const top = standings.slice(0, 3).map((e) => ({ name: e.name, lbs: e.lbs, fish: e.fish, color: e.color }));
  let winnerId = null;
  if (standings.length) {
    const w = standings[0];
    const live = [...players.values()].find((p) => p.token === w.token);
    if (live) {
      live.cash += pot;
      live.derbyWins += 1;
      winnerId = live.id;
      storeProfile(live);
    } else if (profiles[w.token]) {
      profiles[w.token].cash += pot;
      profiles[w.token].derbyWins = (profiles[w.token].derbyWins || 0) + 1;
      saveDirty = true;
    }
    feed(`${w.name} wins the derby with a ${w.lbs} lb ${w.fish.toLowerCase()} and takes $${pot}.`, 'derby');
  } else {
    feed('The derby ended with no fish weighed in.', 'derby');
  }
  io.emit('derby', { type: 'end', top, pot, winnerId });
}

function derbyWeighIn(p, species, lbs) {
  if (!derby.active || species.rarity === 'junk' || species.rarity === 'treasure') return false;
  const prev = derby.entries.get(p.token);
  if (!prev || lbs > prev.lbs) {
    derby.entries.set(p.token, { token: p.token, name: p.name, color: p.color, lbs, fish: species.name });
  }
  const lead = derbyStandings()[0];
  const leadKey = lead ? lead.token + ':' + lead.lbs : null;
  if (leadKey !== derby.leader) {
    derby.leader = leadKey;
    feed(`${lead.name} leads the derby with a ${lead.lbs} lb ${lead.fish.toLowerCase()}.`, 'derby');
    return lead.token === p.token;
  }
  return false;
}

function tickDerby() {
  const now = nowMs();
  if (!derby.active && now >= derby.nextAt) startDerby();
  else if (derby.active && now >= derby.endsAt) finishDerby();
}

// Everything that happens when a fish is landed, whether on the rod or with a gun: journal, best, streak, value,
// bag, XP, quests and level. `opts.rod` is true for a rod catch (the derby is rod-only).
function recordCatch(p, s, lbs, value, opts = {}) {
  const entry = p.journal[s.id] || (p.journal[s.id] = { n: 0, best: 0 });
  const first = entry.n === 0;
  const pb = !first && lbs > entry.best;
  entry.n += 1;
  entry.best = Math.max(entry.best, lbs);
  if (opts.rod) { entry.rod = (entry.rod || 0) + 1; }
  p.caught += 1;
  const rank = RARITY_RANK[s.rarity];
  if (rank >= 1 && s.rarity !== 'treasure' && (!p.best || lbs > p.best.lbs)) p.best = { name: s.name, lbs };
  // back-to-back catches build a streak, and the streak multiplies what each fish is worth
  const now = nowMs();
  p.streak = now < (p.streakUntil || 0) ? (p.streak || 0) + 1 : 1;
  p.streakUntil = now + WORLD.streak.window;
  const mult = Math.min(WORLD.streak.max, 1 + (p.streak - 1) * WORLD.streak.step);
  // a rod catch of a species for the first time pays a bonus of its own: the rod is how you fill the journal properly
  const rodFirst = !!opts.rod && (entry.rod || 0) === 1;
  value = Math.round(value * mult * (frenzy.active ? FRENZY.fishMul : 1) * (opts.valueMul || 1));
  if (frenzy.active) frenzyScore(p, Math.max(5, Math.round(value / 4)), false);
  const bagged = giveFish(p, s.name, lbs, value);
  const levelBefore = levelOf(p.xp);
  const xpGain = (XP_BY_RARITY[s.rarity] || 5) + (first ? 20 : 0) + (pb ? 10 : 0) + (opts.hot ? 5 : 0) + (opts.xpBonus || 0);
  p.xp += xpGain;
  const questDone = advanceQuests(p, s, opts.hot);
  const level = levelOf(p.xp);
  const levelBonus = level > levelBefore ? 25 * level : 0;
  if (levelBonus) {
    p.cash += levelBonus;
    feed(`${p.name} reached angler level ${level}`, 'join');
  }
  const derbyEntry = !!opts.rod && derby.active && s.rarity !== 'junk' && s.rarity !== 'treasure';
  const derbyLead = opts.rod ? derbyWeighIn(p, s, lbs) : false;
  if (rank >= 3) {
    const article = /^[aeiou]/i.test(s.name) ? 'an' : 'a';
    feed(`${p.name} ${opts.rod ? 'landed' : 'shot'} ${article} ${lbs} lb ${s.name.toLowerCase()}`, s.rarity);
  }
  return {
    value, bagged, streak: p.streak, mult, frenzy: frenzy.active, first, pb, rodFirst, hot: !!opts.hot, derby: derbyEntry, derbyLead,
    xpGain: xpGain + questDone.reduce((n, q) => n + q.xp, 0), level, levelUp: levelBonus > 0, levelBonus, questDone,
  };
}

// a fish taken by a gun: it is smaller than the trophy end of its range, but it pays and counts like any other catch
function rollShotFish(s) {
  const [lo, hi] = s.lbs;
  const frac = hi > lo ? Math.pow(Math.random(), 1.3) * 0.65 : 0.5;
  const places = hi < 1 ? 100 : 10;
  const lbs = Math.max(0.01, Math.round((lo + (hi - lo) * frac) * places) / places);
  return { lbs, value: Math.round(s.base * (0.6 + 0.9 * frac)) };
}

// ---------------------------------------------------------------- boss hooks
//
// Now and then a bite is not a fish. A boss takes the hook, and the fight is two people's job (or one person's, doing both):
// the rod keeps the line alive, the gun breaks the boss's armor and health. Even the starter rod can hook a Tier 1 boss.

function bossChance(p) {
  const hot = p.bobber && hotspotAt(p.bobber.x, p.bobber.z);
  return 0.06 + p.bait * 0.025 + (hot ? 0.05 : 0) + (isNight(hourNow()) ? 0.02 : 0) + (frenzy.active ? 0.08 : 0);
}

function rollBoss(p, forceId) {
  const region = p.bobber ? waterRegion(p.bobber.x, p.bobber.z) : 'lake';
  let pool = Object.values(BOSSES).filter((b) => b.where === region && p.rod >= b.rodMin);
  if (forceId && BOSSES[forceId]) pool = [BOSSES[forceId]];
  if (!pool.length) return null;
  const weights = pool.map((b) => (b.tier === 1 ? 6 : b.tier === 2 ? 3 : 1) * (b.tier > 1 ? 1 + p.bait * 0.3 : 1));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  let def = pool[0];
  for (let i = 0; i < pool.length; i++) if ((r -= weights[i]) <= 0) { def = pool[i]; break; }
  const species = SPECIES.find((s) => s.id === def.id);
  const [lo, hi] = def.lbs;
  const frac = Math.pow(Math.random(), 1.2);
  return {
    species, lbs: Math.round(lo + (hi - lo) * frac), value: Math.round(def.base * (0.8 + 0.5 * frac)), frac, difficulty: 0.55 + def.tier * 0.09, hot: false,
    bossDef: def,
  };
}

function startBossFight(p, def) {
  p.boss = { def, kind: def.id, hp: def.hp, maxHp: def.hp, hitBy: new Map(), staggerUntil: 0, nextMove: nowMs() + 3500, pending: 0, stage: 0, lastWear: 0 };
  io.emit('bossHooked', { pid: p.id, kind: def.id, name: def.name, tier: def.tier, x: p.bobber.x, z: p.bobber.z });
  feed(`${p.name} hooked ${def.name}!`, 'legendary');
}

function bossState(p) {
  const b = p.boss;
  const sock = sockOf(p.id);
  if (!b || !sock) return;
  sock.emit('bossState', { hp: b.hp / b.maxHp, stagger: nowMs() < b.staggerUntil, weak: b.hp <= b.maxHp * b.def.landAt, wearCap: b.def.wearCap, landAt: b.def.landAt });
}

// a hit on a hooked boss, from anyone with a gun; returns what the shooter sees
function hitBoss(owner, dmg, shooter) {
  const b = owner && owner.boss;
  if (!b) return { hit: null };
  const now = nowMs();
  const before = b.hp / b.maxHp;
  b.hp = Math.max(0, b.hp - dmg);
  if (shooter && shooter.id) b.hitBy.set(shooter.id, (b.hitBy.get(shooter.id) || 0) + dmg);
  const after = b.hp / b.maxHp;
  // armor plates come off at 66% and 33%: a stagger, wide open, and the boss's pull drops
  let armor = false;
  for (const mark of [0.66, 0.33]) if (before > mark && after <= mark) { armor = true; b.staggerUntil = now + 4200; b.stage += 1; }
  const at = owner.bobber || { x: owner.x, z: owner.z };
  io.emit('bossHit', { pid: owner.id, x: at.x, z: at.z, dmg: Math.round(dmg), armor, stage: b.stage });
  bossState(owner);
  return { hit: 'boss', killed: false, x: at.x, z: at.z, dmg: Math.round(dmg), stagger: now < b.staggerUntil, armor, bossHp: after };
}

function tickBosses() {
  const now = nowMs();
  for (const p of players.values()) {
    const b = p.boss;
    if (!b || p.state !== 'reeling' || !p.bobber) continue;
    if (b.pending || now < b.nextMove || now < b.staggerUntil) continue;
    const mv = b.def.moves[Math.floor(Math.random() * b.def.moves.length)];
    b.pending = now + 900;
    io.emit('bossMove', { pid: p.id, phase: 'warn', name: mv.name, kind: mv.kind, r: mv.r, x: p.bobber.x, z: p.bobber.z });
    setTimeout(() => {
      if (p.boss !== b || !p.bobber) return;
      if (mv.dmg && mv.r) {
        for (const q of players.values()) {
          if (q.alive && Math.hypot(q.x - p.bobber.x, q.z - p.bobber.z) < mv.r) hurtPlayer(q, mv.dmg, { name: b.def.name, id: 'bs' + p.id, x: p.bobber.x, z: p.bobber.z }, 'thrashed');
        }
      }
      io.emit('bossMove', { pid: p.id, phase: 'hit', name: mv.name, kind: mv.kind, r: mv.r, x: p.bobber.x, z: p.bobber.z });
      b.pending = 0;
      b.nextMove = nowMs() + rand(4200, 7000) * (b.hp / b.maxHp < 0.4 ? 0.75 : 1);
    }, 900);
  }
}

// ---------------------------------------------------------------- the frenzy
//
// The game's spine: the rod makes you money, the gun keeps you alive. Every few minutes the lake boils. Mutant fish
// leap out and hunt anyone near the water, and a boss surfaces near the end. Fish bite almost at once and are worth
// far more, so the best money in the game is fishing while things are trying to eat you. Mutants drop ammo and health,
// so the fight pays for itself. A badly hurt mutant staggers; finish it with the knife for health and a bigger drop.

const FRENZY = {
  firstIn: 3 * 60 * 1000, every: 7 * 60 * 1000, length: 110 * 1000, bossAt: 70 * 1000,
  fishMul: 2.5, // what rod-caught fish are worth during a frenzy
  biteScale: 0.25, // how much faster fish bite
  topBonus: [400, 200, 100], // paid to the top three scorers at the end
};
const MUTANT = {
  leaper: { name: 'Leaper', sid: 'walleye', hp: 40, speed: 5.0, bite: 6, reach: 1.5, bounty: 12, score: 10, radius: 0.5 },
  snapper: { name: 'Snapper', sid: 'pike', hp: 95, speed: 3.9, bite: 16, reach: 1.9, bounty: 30, score: 25, radius: 0.7 },
  gulper: { name: 'Gulper', sid: 'catfish', hp: 230, speed: 2.7, bite: 28, reach: 2.3, bounty: 80, score: 60, radius: 1.1 },
  boss: { name: 'The Old One', sid: 'sturgeon', hp: 2600, speed: 3.2, bite: 40, reach: 4, bounty: 1200, score: 500, radius: 3 },
};
const frenzy = { active: false, endsAt: 0, nextAt: nowMs() + FRENZY.firstIn, bossSpawned: false, scores: new Map(), nextSpawn: 0 };
const mutants = [];
let mutantSerial = 1;
// gunfire spooks the fish nearby for a while: bites slow down around it
const spooks = [];

function startFrenzy() {
  Object.assign(frenzy, { active: true, endsAt: nowMs() + FRENZY.length, bossSpawned: false, nextSpawn: nowMs() + 3000 });
  frenzy.scores.clear();
  io.emit('frenzy', { type: 'start', length: FRENZY.length });
  feed('The lake is boiling. FRENZY! Fish bite fast and pay x2.5, and something is coming out of the water.', 'derby');
}

function endFrenzy() {
  frenzy.active = false;
  frenzy.nextAt = nowMs() + FRENZY.every;
  // whatever is still out there sinks back down
  for (const m of mutants) io.emit('mutantDie', { id: m.id, x: m.x, z: m.z, k: m.kind, fled: true });
  mutants.length = 0;
  const top = [...frenzy.scores.values()].sort((a, b) => b.score - a.score).slice(0, 3);
  top.forEach((e, i) => {
    const p = players.get(e.id);
    if (!p) return;
    p.cash += FRENZY.topBonus[i];
    p.earned += FRENZY.topBonus[i];
    storeProfile(p);
  });
  if (top.length) feed(`The frenzy is over. ${top.map((e, i) => `${i + 1}. ${e.name} (${e.score})`).join(', ')}.`, 'derby');
  else feed('The frenzy is over. The lake settles.', 'derby');
  io.emit('frenzy', { type: 'end', top: top.map((e, i) => ({ name: e.name, score: e.score, kills: e.kills, bonus: FRENZY.topBonus[i] })) });
}

function frenzyScore(p, add, kill) {
  const e = frenzy.scores.get(p.id) || { id: p.id, name: p.name, score: 0, kills: 0 };
  e.score += add;
  if (kill) e.kills += 1;
  frenzy.scores.set(p.id, e);
}

// a spot in the water near a player, so mutants come at people who are fishing
function waterNear(x, z, minR, maxR) {
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = rand(minR, maxR);
    const px = x + Math.sin(a) * r;
    const pz = z + Math.cos(a) * r;
    if (inWater(px, pz)) return { x: px, z: pz };
  }
  return null;
}

function spawnMutant(kind, at) {
  const def = MUTANT[kind];
  const m = { id: 'mu' + (mutantSerial++), kind, x: at.x, z: at.z, rot: 0, hp: def.hp, maxHp: def.hp, target: null, nextBite: 0, staggerUntil: 0, leapAt: 0, born: nowMs(), hitBy: new Map() };
  mutants.push(m);
  return m;
}

const nearFire = (x, z) => Math.hypot(x - WORLD.camp.fire.x, z - WORLD.camp.fire.z) < 7;

function tickFrenzy(dt) {
  const now = nowMs();
  if (!frenzy.active) { if (now >= frenzy.nextAt) startFrenzy(); return; }
  if (now >= frenzy.endsAt) { endFrenzy(); return; }
  const hunters = [...players.values()].filter((p) => p.alive);
  // keep the pressure up: more mutants the more people there are, spawned in the water near someone
  // it ramps up: a few at first, a crowd by the end
  const ramp = 1 - (frenzy.endsAt - now) / FRENZY.length;
  const cap = Math.round(2 + hunters.length * (1.5 + ramp * 2.5));
  if (now >= frenzy.nextSpawn && mutants.length < cap && hunters.length) {
    frenzy.nextSpawn = now + rand(900, 2200);
    const p = hunters[Math.floor(Math.random() * hunters.length)];
    const spot = waterNear(p.x, p.z, 8, 22);
    if (spot) {
      const r = Math.random();
      spawnMutant(r < 0.62 ? 'leaper' : r < 0.9 ? 'snapper' : 'gulper', spot);
      io.emit('mutantRise', spot);
    }
  }
  if (!frenzy.bossSpawned && now >= frenzy.endsAt - FRENZY.length + FRENZY.bossAt) {
    frenzy.bossSpawned = true;
    spawnMutant('boss', { x: 0, z: 0 });
    io.emit('mutantRise', { x: 0, z: 0, boss: true });
    feed('THE OLD ONE has surfaced in the middle of the lake. Kill it before the frenzy ends.', 'legendary');
  }
  for (let i = mutants.length - 1; i >= 0; i--) {
    const m = mutants[i];
    const def = MUTANT[m.kind];
    if (now < m.staggerUntil) continue; // staggered: wide open for a knife
    // hunt the closest living player, ignoring anyone by the campfire (they hate the fire)
    let best = null;
    for (const p of hunters) {
      if (nearFire(p.x, p.z) && m.kind !== 'boss') continue;
      const d = Math.hypot(p.x - m.x, p.z - m.z);
      if (!best || d < best.d) best = { p, d };
    }
    if (!best) { m.rot += dt; continue; }
    const t = best.p;
    m.target = t.id;
    const toward = Math.atan2(t.x - m.x, t.z - m.z);
    if (m.kind === 'boss') {
      // the boss circles the lake and every few seconds hurls itself at the nearest player on the shore
      if (now >= m.leapAt + 5200 && best.d < 45) {
        m.leapAt = now;
        m.leapFrom = { x: m.x, z: m.z };
        m.leapTo = { x: t.x, z: t.z };
        io.emit('bossLeap', { id: m.id, from: m.leapFrom, to: m.leapTo });
        setTimeout(() => {
          if (!mutants.includes(m)) return;
          io.emit('bossSlam', { x: m.leapTo.x, z: m.leapTo.z });
          for (const p of players.values()) {
            if (p.alive && Math.hypot(p.x - m.leapTo.x, p.z - m.leapTo.z) < 4.5) hurtPlayer(p, def.bite, { name: def.name, id: m.id, x: m.leapTo.x, z: m.leapTo.z }, 'crushed');
          }
        }, 900);
      }
      const ang = Math.atan2(m.z, m.x) + dt * 0.18;
      const r = WORLD.lakeRadius * 0.55;
      m.x += (Math.cos(ang) * r - m.x) * Math.min(1, dt * 0.6);
      m.z += (Math.sin(ang) * r - m.z) * Math.min(1, dt * 0.6);
      m.rot = ang + Math.PI / 2;
      continue;
    }
    m.rot = toward;
    if (best.d > def.reach * 0.8) {
      const step = def.speed * dt;
      const nx = m.x + Math.sin(toward) * step;
      const nz = m.z + Math.cos(toward) * step;
      if (!nearFire(nx, nz) && (onLand(nx, nz) || inWater(nx, nz) || Math.hypot(nx, nz) < WORLD.shoreRadius + 0.5)) {
        const wasWater = inWater(m.x, m.z);
        m.x = nx; m.z = nz;
        if (wasWater && !inWater(nx, nz)) io.emit('mutantLeap', { id: m.id, x: nx, z: nz });
      }
    }
    if (best.d < def.reach && now >= m.nextBite) {
      m.nextBite = now + rand(1200, 1700);
      const res = hurtPlayer(t, def.bite, { name: `A ${def.name.toLowerCase()}`, id: m.id, x: m.x, z: m.z }, 'ate');
      io.emit('mutantBite', { id: m.id, x: t.x, z: t.z, hit: !!res });
    }
  }
  // old spooks fade
  for (let i = spooks.length - 1; i >= 0; i--) if (now > spooks[i].until) spooks.splice(i, 1);
}

// damage to a mutant from a player's gun or knife; returns what the shooter should see
function hitMutant(m, dmg, p, knife) {
  const def = MUTANT[m.kind];
  const now = nowMs();
  // a staggered mutant finished with the knife: a glory kill
  const glory = knife && now < m.staggerUntil && m.kind !== 'boss';
  if (glory) dmg = m.hp;
  m.hp -= dmg;
  if (p) m.hitBy.set(p.id, (m.hitBy.get(p.id) || 0) + Math.min(dmg, m.hp + dmg));
  if (m.hp > 0) {
    if (m.kind !== 'boss' && m.hp < m.maxHp * 0.25 && !m.staggered) {
      m.staggered = true;
      m.staggerUntil = now + 3200;
    }
    return { hit: 'mutant', killed: false, x: m.x, z: m.z, dmg: Math.round(dmg), stagger: now < m.staggerUntil };
  }
  mutants.splice(mutants.indexOf(m), 1);
  const out = { hit: 'mutant', killed: true, x: m.x, z: m.z, dmg: Math.round(dmg), glory, kind: m.kind, bounty: def.bounty };
  if (m.kind === 'boss') {
    // everyone who hurt it gets a share of the bounty by damage done
    const total = [...m.hitBy.values()].reduce((a, b) => a + b, 0) || 1;
    for (const [id, d] of m.hitBy) {
      const q = players.get(id);
      if (!q) continue;
      const share = Math.round(def.bounty * (d / total));
      q.cash += share;
      q.earned += share;
      frenzyScore(q, Math.round(def.score * (d / total)), id === (p && p.id));
      q.xp += 150;
      const sock = sockOf(id);
      if (sock) sock.emit('bossShare', { share, pct: Math.round((d / total) * 100) });
    }
    for (let i = 0; i < 6; i++) spawnPickup(i % 2 ? 'ammo' : 'heal', i % 2 ? 30 : 40, m.x + rand(-3, 3), m.z + rand(-3, 3));
    feed(`${p ? p.name : 'Someone'} landed the killing blow on THE OLD ONE.`, 'legendary');
  } else if (p) {
    p.cash += def.bounty * (glory ? 2 : 1);
    p.earned += def.bounty * (glory ? 2 : 1);
    p.xp += Math.round(def.score / 2);
    frenzyScore(p, def.score * (glory ? 2 : 1), true);
    if (glory) p.hp = Math.min(COMBAT.hp, p.hp + 25);
    // the fight pays for itself: ammo and health fall out of what you kill
    const r = Math.random();
    if (glory || r < 0.45) spawnPickup('ammo', Math.round((m.kind === 'gulper' ? 20 : m.kind === 'snapper' ? 12 : 6) * (glory ? 2 : 1)), m.x, m.z);
    if (glory || r > 0.72) spawnPickup('heal', m.kind === 'gulper' ? 35 : 15, m.x + 0.6, m.z);
  }
  io.emit('mutantDie', { id: m.id, x: m.x, z: m.z, k: m.kind, glory, by: p ? p.id : null });
  return out;
}

// ---------------------------------------------------------------- fishing

function pickSpecies(p) {
  const h = hourNow();
  const night = isNight(h);
  const golden = isGolden(h);
  const b = p.bobber || { x: 0, z: 0 };
  const region = waterRegion(b.x, b.z);
  const deep = region === 'ocean' || Math.hypot(b.x, b.z) < 12;
  const hot = hotspotAt(b.x, b.z);
  const weights = SPECIES.map((s) => {
    if (s.when === 'night' && !night) return 0;
    if (s.where && s.where !== region) return 0;
    let w = s.w * BAIT_MUL[s.rarity][p.bait];
    if (golden && s.golden) w *= s.golden;
    if (hot) w *= HOT_MUL[s.rarity];
    if (deep && (s.rarity === 'epic' || s.rarity === 'legendary')) w *= 1.6;
    if (s.deep && !deep) w *= 0.35;
    if (golden && s.rarity === 'legendary') w *= 1.8;
    return w;
  });
  const total = weights.reduce((a, b2) => a + b2, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SPECIES.length; i++) if ((r -= weights[i]) <= 0) return { species: SPECIES[i], hot: !!hot };
  return { species: SPECIES[0], hot: !!hot };
}

function rollCatch(p) {
  const { species, hot } = pickSpecies(p);
  const [lo, hi] = species.lbs;
  const skew = Math.max(0.9, 1.7 - p.bait * 0.2);
  const frac = hi > lo ? Math.pow(Math.random(), skew) : 0.5;
  const raw = lo + (hi - lo) * frac;
  const places = hi < 1 ? 100 : 10; // small fish keep two decimals so an anchovy is not zero pounds
  const lbs = Math.max(0.01, Math.round(raw * places) / places);
  const value = Math.round(species.base * (0.6 + 0.9 * frac));
  const difficulty = Math.min(0.98, species.diff + frac * 0.08);
  return { species, lbs, value, frac, difficulty, hot };
}

function highFlags(p) {
  const now = nowMs();
  return { weed: p.high.weed > now, whiskey: p.high.whiskey > now, crank: p.high.crank > now };
}

function highLeft(p) {
  const now = nowMs();
  return {
    weed: Math.max(0, Math.ceil((p.high.weed - now) / 1000)),
    whiskey: Math.max(0, Math.ceil((p.high.whiskey - now) / 1000)),
    crank: Math.max(0, Math.ceil((p.high.crank - now) / 1000)),
  };
}

function moveMul(p) {
  const h = highFlags(p);
  let m = 1;
  if (h.weed) m *= 0.75;
  if (h.whiskey) m *= 0.85;
  if (h.crank) m *= 1.35;
  return m;
}

function spreadMul(p) {
  const h = highFlags(p);
  let m = 1;
  if (h.weed) m *= 2.2;
  if (h.whiskey) m *= 3;
  if (h.crank) m *= 0.35;
  return m;
}

function reelPayload(p) {
  const h = highFlags(p);
  let difficulty = p.fish.difficulty;
  if (h.weed) difficulty *= 0.6;
  if (h.whiskey) difficulty = Math.min(1, difficulty * 1.35);
  if (h.crank) difficulty = Math.min(1, difficulty * 1.15);
  const rod = WORLD.rods[p.rod];
  const rank = RARITY_RANK[p.fish.species.rarity];
  return {
    difficulty,
    tol: rod.tol,
    speed: rod.speed,
    heavy: p.fish.frac > 0.7 || rank >= 4,
    boss: p.boss ? { name: p.boss.def.name, tier: p.boss.def.tier, hp: 1, landAt: p.boss.def.landAt, wearCap: p.boss.def.wearCap } : null,
    reel: { calm: h.weed, hard: h.whiskey, spike: h.crank },
  };
}

function clearTimers(p) {
  clearTimeout(p.biteTimer);
  clearTimeout(p.windowTimer);
  p.biteTimer = p.windowTimer = null;
}

function resetLine(p) {
  clearTimers(p);
  if (p.boss) { io.emit('bossEnd', { pid: p.id }); p.boss = null; }
  p.state = 'idle';
  p.bobber = null;
  p.fish = null;
}

function scheduleBite(p, socket) {
  clearTimers(p);
  p.state = 'waiting';
  const h = highFlags(p);
  let scale = h.weed ? 0.55 : 1;
  if (p.bobber && hotspotAt(p.bobber.x, p.bobber.z)) scale *= 0.45;
  if (isGolden()) scale *= 0.75;
  if (frenzy.active) scale *= FRENZY.biteScale;
  else if (p.bobber && spooks.some((sp) => Math.hypot(sp.x - p.bobber.x, sp.z - p.bobber.z) < 24)) scale *= 2.2; // gunfire nearby
  p.biteWindow = TIMING.biteWindow * (h.whiskey ? 0.7 : 1) * 1.15;
  const wait = Math.max(1200, rand(TIMING.biteMin, TIMING.biteMax) * scale * (p.fastBite ? 0.15 : 1));
  p.biteTimer = setTimeout(() => {
    if (p.state !== 'waiting') return;
    p.state = 'bite';
    const boss = p.forceBoss ? rollBoss(p, p.forceBoss) : Math.random() < bossChance(p) ? rollBoss(p) : null;
    p.forceBoss = null;
    p.fish = boss || rollCatch(p);
    p.biteAt = nowMs();
    socket.emit('bite', boss ? { boss: true } : undefined);
    p.windowTimer = setTimeout(() => {
      if (p.state !== 'bite') return;
      socket.emit('missed');
      scheduleBite(p, socket);
    }, p.biteWindow);
  }, wait);
}

// ---------------------------------------------------------------- loot

function spawnPickup(kind, amount, x, z, name) {
  const spot = shoreSpot(x, z);
  pickups.push({
    id: 'pk' + (pickupSerial++),
    kind, amount, name: name || kind,
    x: spot.x + rand(-0.6, 0.6),
    z: spot.z + rand(-0.6, 0.6),
  });
  if (pickups.length > 48) pickups.shift();
}

const bagCap = (p) => (WORLD.bags[p.bagTier || 0] || WORLD.bags[0]).cap;
const SPECIES_BY_NAME = new Map(SPECIES.map((s) => [s.name, s]));
function giveFish(p, name, lbs, value) {
  p.bagRev = (p.bagRev || 0) + 1;
  if (p.bag.length >= bagCap(p)) {
    p.cash += value;
    p.earned += value;
    return false;
  }
  const s = SPECIES_BY_NAME.get(name);
  p.bag.push({ id: 'b' + (bagSerial++), name, lbs, value, sid: s ? s.id : null, rarity: s ? s.rarity : 'common', t: nowMs() });
  return true;
}

function emptyBag(p, x, z) {
  const bag = p.bag;
  p.bag = [];
  bag.forEach((fish) => {
    const a = rand(0, Math.PI * 2);
    spawnPickup('fish', fish.value, x + Math.sin(a), z + Math.cos(a), fish.name);
  });
}

function emptyPocket(p, x, z) {
  DRUGS.forEach((name, i) => {
    const n = p.pocket[name];
    p.pocket[name] = 0;
    for (let k = 0; k < n; k++) {
      const a = rand(0, Math.PI * 2);
      spawnPickup(name, 1, x + Math.sin(a) * (0.8 + i * 0.3), z + Math.cos(a) * (0.8 + i * 0.3), name);
    }
  });
}

const feed = (text, kind) => io.emit('feed', { text, kind: kind || 'info' });
const sockOf = (id) => io.sockets.sockets.get(id);

// ---------------------------------------------------------------- combat

function sendRagdoll(id, x, z, from, verb) {
  let dx = 0;
  let dz = 1;
  if (from && Number.isFinite(from.x)) {
    const d = Math.hypot(x - from.x, z - from.z) || 1;
    dx = (x - from.x) / d;
    dz = (z - from.z) / d;
  }
  const kick = from && from.hitForce ? from.hitForce : 8;
  io.emit('ragdoll', { id, dx, dz, force: verb === 'knocked out' ? 5 : kick });
}

function killPlayer(p, byName, verb = 'shot', from) {
  sendRagdoll(p.id, p.x, p.z, from, verb);
  const sank = inWater(p.x, p.z);
  p.boat = false;
  p.alive = false;
  p.hp = 0;
  p.respawnAt = nowMs() + COMBAT.respawn;
  resetLine(p);
  p.high = { weed: 0, whiskey: 0, crank: 0 };
  // eaten in a frenzy: you keep your cash, but they get half your bag
  if (from && String(from.id || '').startsWith('mu')) {
    const eaten = Math.ceil(p.bag.length / 2);
    p.bag.sort(() => Math.random() - 0.5).splice(0, eaten);
    p.bagRev = (p.bagRev || 0) + 1;
    if (p.bj && p.bj.status === 'play') p.bj = null;
    feed(`${byName} ${verb} ${p.name}`, 'combat');
    const s = sockOf(p.id);
    if (s) s.emit('died', { by: byName, verb, dropped: 0, bag: 0, eaten, sank: false, respawn: COMBAT.respawn });
    storeProfile(p);
    return;
  }
  const drop = Math.floor(p.cash * COMBAT.dropCash);
  const bagCount = p.bag.length;
  if (drop > 0) {
    p.cash -= drop;
    if (!sank) spawnPickup('cash', drop, p.x, p.z, 'cash');
  }
  if (sank) { p.bag = []; p.pocket = freshPocket(); } else {
    emptyPocket(p, p.x, p.z);
    emptyBag(p, p.x, p.z);
  }
  if (p.bj && p.bj.status === 'play') p.bj = null;
  feed(`${byName} ${verb} ${p.name}`, 'combat');
  const sock = sockOf(p.id);
  if (sock) sock.emit('died', { by: byName, verb, dropped: drop, bag: bagCount, sank, respawn: COMBAT.respawn });
  storeProfile(p);
}

// returns 'safe', 'hit', or 'kill'
function hurtPlayer(target, dmg, shooter, verb) {
  if (!target || !target.alive) return null;
  const byPlayer = players.has(shooter.id);
  if (byPlayer && (inCamp(target) || nowMs() < target.safeUntil)) return 'safe';
  target.hp -= dmg;
  resetLine(target);
  if (byPlayer) witness(players.get(shooter.id), target);
  const sock = sockOf(target.id);
  if (sock) sock.emit('lineCut');
  if (target.hp <= 0) {
    killPlayer(target, shooter.name, verb, shooter);
    return 'kill';
  }
  if (sock) sock.emit('hurt', { hp: target.hp, dmg, by: shooter.name, how: verb === 'knocked out' ? 'punch' : 'shot', from: { x: shooter.x, z: shooter.z } });
  return 'hit';
}

function killNpc(n, byName, verb = 'dropped', from) {
  sendRagdoll(n.id, n.x, n.z, from, verb);
  n.alive = false;
  n.hp = 0;
  n.state = 'dead';
  n.bobber = null;
  n.aggro = null;
  n.respawnAt = nowMs() + COMBAT.npcRespawn;
  const cash = 15 + Math.floor(Math.random() * 45);
  spawnPickup('cash', cash, n.x, n.z, 'cash');
  if (Math.random() < 0.5) {
    const drug = DRUGS[Math.floor(Math.random() * DRUGS.length)];
    spawnPickup(drug, 1, n.x + 0.9, n.z, drug);
  } else {
    const species = SWIMMERS[Math.floor(Math.random() * SWIMMERS.length)];
    spawnPickup('fish', species.base, n.x - 0.7, n.z, species.name);
  }
  feed(`${byName} ${verb} ${n.name}`, 'combat');
}

function pointAlong(x, z, rot, dist) {
  return { x: x + Math.sin(rot) * dist, y: 1, z: z + Math.cos(rot) * dist };
}

function firstHit(ox, oz, rot, cone, range, skipId) {
  let best = null;
  const consider = (kind, id, x, z, alive, radius = 0.45) => {
    if (!alive || id === skipId) return;
    const dist = Math.hypot(x - ox, z - oz);
    if (dist < 0.35 || dist > range + radius) return;
    const ang = Math.atan2(x - ox, z - oz);
    // wider angular tolerance up close so point-blank shots register, and for big bodies
    const tol = Math.max(cone, Math.atan2(radius, dist));
    if (Math.abs(angleDiff(ang, rot)) > tol) return;
    if (!best || dist < best.dist) best = { kind, id, dist, x, z };
  };
  school.forEach((f) => consider('fish', f.id, f.x, f.z, f.alive));
  players.forEach((o) => consider('player', o.id, o.x, o.z, o.alive));
  npcs.forEach((n) => consider('npc', n.id, n.x, n.z, n.alive));
  mutants.forEach((m) => consider('mutant', m.id, m.x, m.z, true, MUTANT[m.kind].radius));
  players.forEach((o) => { if (o.boss && o.bobber && o.state === 'reeling') consider('boss', 'bs-' + o.id, o.bobber.x, o.bobber.z, true, o.boss.def.radius); });
  return best;
}

function applyHit(hit, shooter, dmg = COMBAT.damage) {
  if (!hit) return { hit: null };
  if (hit.kind === 'fish') {
    const f = school.find((x) => x.id === hit.id);
    if (!f || !f.alive) return { hit: null };
    const over = dmg - f.hp; // damage past what it took to kill it
    f.hp -= dmg;
    // wounding it first, and blowing it apart, both cost value: 12% per extra hit and up to 30% for pure overkill
    f.spoil = Math.min(0.6, (f.spoil || 0) + 0.12);
    if (f.hp <= 0 && over > f.maxHp * 1.2) f.spoil += Math.min(0.3, (over / f.maxHp) * 0.12);
    const spSp = SPECIES.find((x) => x.id === f.sid);
    const loss = spSp ? Math.max(1, Math.round(spSp.base * 0.12)) : 0;
    if (f.hp > 0) {
      // wounded: it bolts and bleeds, one more round finishes it
      f.hurtUntil = nowMs() + 5000;
      f.rot += Math.PI * (0.6 + Math.random() * 0.8);
      return { hit: 'fish', killed: false, x: f.x, z: f.z, dmg: Math.round(dmg), loss };
    }
    f.alive = false;
    f.floatUntil = nowMs() + 7000;
    // a shot fish is a real catch: bag, journal, XP, quests and streak all count. Only the derby and the trophy end of the
    // weight range are the rod's.
    const sp = SPECIES.find((x) => x.id === f.sid);
    if (!shooter.bag || !sp) return { hit: 'fish', killed: true, x: f.x, z: f.z };
    const shot = rollShotFish(sp);
    const rec = recordCatch(shooter, sp, shot.lbs, shot.value, { rod: false, valueMul: Math.max(0.4, 1 - (f.spoil || 0) + 0.12) });
    return { hit: 'fish', killed: true, x: f.x, z: f.z, dmg: Math.round(dmg), loss: 0, catch: { name: sp.name, sid: sp.id, rarity: sp.rarity, lbs: shot.lbs, ...rec } };
  }
  if (hit.kind === 'player') {
    const t = players.get(hit.id);
    const res = hurtPlayer(t, dmg, shooter);
    if (res === 'hit' && players.has(shooter.id)) feed(`${shooter.name} hit ${t.name}`, 'combat');
    return { hit: res === 'safe' ? 'safe' : 'player', killed: res === 'kill', x: hit.x, z: hit.z, dmg: res === 'safe' ? 0 : dmg };
  }
  if (hit.kind === 'boss') return hitBoss(players.get(String(hit.id).slice(3)), dmg, shooter);
  if (hit.kind === 'mutant') {
    const m = mutants.find((x) => x.id === hit.id);
    if (!m) return { hit: null };
    return hitMutant(m, dmg, players.get(shooter.id), false);
  }
  const n = npcs.find((x) => x.id === hit.id);
  if (!n || !n.alive) return { hit: null };
  n.hp -= dmg;
  n.lastHurt = nowMs();
  if (shooter.id && players.has(shooter.id)) provoke(n, players.get(shooter.id), 'I\'m hit!');
  const killed = n.hp <= 0;
  if (killed) killNpc(n, shooter.name, undefined, shooter);
  return { hit: 'npc', killed, x: hit.x, z: hit.z, dmg };
}

function emitShot(from, rot, hit, by, result, missDist, gunId) {
  const aimed = !hit && Number.isFinite(missDist);
  const dist = hit ? hit.dist : aimed ? missDist : COMBAT.range * 0.65;
  const to = pointAlong(from.x, from.z, rot, dist);
  to.y = hit ? 0.9 : aimed ? 0.05 : 1.1;
  const surface = aimed ? (inWater(to.x, to.z) ? 'water' : 'ground') : null;
  const kind = result && result.hit;
  io.emit('shot', { from: { x: from.x, y: 1.35, z: from.z }, to, by, rot, surface, gun: gunId || null, hit: kind === 'safe' ? null : kind || null, killed: !!(result && result.killed) });
}

function alertAnglers(p, rot) {
  // anglers near the line of fire turn on whoever fired it
  const now = nowMs();
  npcs.forEach((n) => {
    if (!n.alive || n.role !== 'angler') return;
    const dist = Math.hypot(n.x - p.x, n.z - p.z);
    if (dist > 30) return;
    const ang = Math.atan2(n.x - p.x, n.z - p.z);
    if (Math.abs(angleDiff(ang, rot)) < 0.3) provoke(n, p, 'Watch it!');
  });
}

function playerFire(p, aimRot, aiming, g, aimDist) {
  // a shot never carries far past the point the player is looking at (so aiming into the water splashes there)
  const range = Number.isFinite(aimDist) && aimDist > 0 ? Math.min(g.range, Math.max(8, aimDist + 8)) : g.range;
  const missDist = Number.isFinite(aimDist) && aimDist > 0 && aimDist < g.range ? aimDist : null;
  const spread = g.spread * spreadMul(p) * (aiming ? 0.45 : 1);
  p.rot = aimRot;
  p.hitForce = KICK[g.id] || 8;
  let out = { hit: null, dmg: 0, crit: false };
  for (let i = 0; i < g.pellets; i++) {
    const rot = aimRot + (Math.random() - 0.5) * 2 * spread;
    const hit = firstHit(p.x, p.z, rot, COMBAT.cone, range, p.id);
    // damage fades with distance, and some shots are critical hits
    const crit = !!hit && hit.kind !== 'fish' && Math.random() < g.crit;
    const dmg = hit ? g.damage * falloff(hit.dist, g.range) * (crit ? g.critMul : 1) : 0;
    const res = applyHit(hit, p, dmg);
    if (i < 4) emitShot(p, rot, hit, p.id, res, missDist, i === 0 ? g.id : null);
    if (res && res.hit) {
      out.dmg += res.dmg || 0;
      out.crit = out.crit || crit;
      if (!out.hit || res.killed) out = { ...out, ...res, dmg: out.dmg };
    }
  }
  p.hitForce = 0;
  if (!g.silent) {
    alertAnglers(p, aimRot);
    hearShot(p);
    if (!frenzy.active) spooks.push({ x: p.x, z: p.z, until: nowMs() + 15000 });
  }
  return { ...out, dmg: Math.round(out.dmg), ammo: p.ammo };
}

// NPCs fire short bursts. Their aim is good against someone standing still and falls apart against someone moving fast
// (so bunny hopping is a real defence), and it tightens the longer they stay on the same target.
const NPC_GUN = { damage: 12, range: 60, mag: 8, reload: 2300, burst: [2, 4], burstGap: 170, pause: [900, 1700], baseSpread: 0.065 };
function npcFire(n, target) {
  const dist = Math.hypot(target.x - n.x, target.z - n.z);
  const tspeed = target.speed || 0;
  const focus = Math.min(1, (n.onTarget || 0) / 4);
  const spread = NPC_GUN.baseSpread + tspeed * 0.012 + (n.moving ? 0.03 : 0) + dist * 0.0006 - focus * 0.025;
  const rot = Math.atan2(target.x - n.x, target.z - n.z) + (Math.random() - 0.5) * 2 * Math.max(0.01, spread);
  n.rot = rot;
  const hit = firstHit(n.x, n.z, rot, COMBAT.cone * 0.7, NPC_GUN.range, n.id);
  const dmg = hit ? NPC_GUN.damage * falloff(hit.dist, NPC_GUN.range) : 0;
  const res = hit ? applyHit(hit, { name: n.name, id: n.id, x: n.x, z: n.z }, dmg) : null;
  emitShot(n, rot, hit, n.id, res);
}

function npcSay(n, text) {
  const now = nowMs();
  if (now < (n.saidAt || 0) + 2500) return;
  n.saidAt = now;
  io.emit('npcSay', { id: n.id, text });
}

// turn an NPC on a player, and bring nearby anglers in after a short reaction delay
function provoke(n, p, line) {
  if (!n || !n.alive || !p || !p.alive) return;
  const now = nowMs();
  const fresh = n.aggro !== p.id;
  n.aggro = p.id;
  n.aggroUntil = now + 14000;
  n.lastSeen = { x: p.x, z: p.z, t: now };
  if (n.mode !== 'flee') n.mode = 'fight';
  if (fresh && line) npcSay(n, line);
  if (!fresh) return;
  npcs.forEach((o) => {
    if (o === n || !o.alive || o.role !== 'angler' || o.aggro) return;
    if (Math.hypot(o.x - n.x, o.z - n.z) > 30) return;
    o.joinAt = now + rand(400, 1300);
    o.joinId = p.id;
  });
  if (n.role === 'angler') npcSay(n, fresh ? (line || 'Help! Over here!') : line);
}

// gunfire carries: anglers within earshot stop fishing and look toward it, and come to check it out
function hearShot(p) {
  const now = nowMs();
  npcs.forEach((n) => {
    if (!n.alive || n.role !== 'angler' || n.aggro) return;
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (d > 45) return;
    n.mode = 'alert';
    n.alertUntil = now + rand(5000, 8000);
    n.lastSeen = { x: p.x, z: p.z, t: now };
    n.bobber = null;
    if (d < 20 && Math.random() < 0.5) npcSay(n, 'What was that?');
  });
}

// anglers who watch a player hurt someone close by step in
function witness(p, victim) {
  if (!p || !victim) return;
  npcs.forEach((n) => {
    if (!n.alive || n.role !== 'angler' || n.aggro || n === victim) return;
    if (Math.hypot(n.x - victim.x, n.z - victim.z) < 14 && Math.random() < 0.6) provoke(n, p, 'Leave them alone!');
  });
}

// ---------------------------------------------------------------- NPCs

function makeNpc(opts) {
  return {
    hp: COMBAT.hp, alive: true, state: 'idle', bobber: null, aggro: null, aggroUntil: 0,
    nextShot: 0, nextThink: 0, wander: 0, respawnAt: 0, ...opts,
  };
}

function anglerHome(angle) {
  const r = WORLD.shoreRadius + 5;
  return { x: Math.sin(angle) * r, z: Math.cos(angle) * r };
}

const npcs = [
  makeNpc({ id: 'dealer', role: 'dealer', name: 'Moss', color: '#C46B2C', ...WORLD.camp.dealer, homeX: WORLD.camp.dealer.x, homeZ: WORLD.camp.dealer.z + 1.2, rot: Math.PI }),
  makeNpc({ id: 'boss', role: 'boss', name: 'Inez', color: '#2A2622', ...WORLD.camp.shack, homeX: WORLD.camp.shack.x, homeZ: WORLD.camp.shack.z + 1.2, rot: Math.PI }),
];
[2.2, 3.5, 4.3, 5.5].forEach((angle, i) => {
  const home = anglerHome(angle);
  npcs.push(makeNpc({
    id: 'angler-' + (i + 1), role: 'angler',
    name: ['Red', 'Buck', 'Nell', 'Hank'][i],
    color: ['#8C4A3A', '#3E6B4F', '#6A4E8C', '#A6843D'][i],
    x: home.x, z: home.z, homeX: home.x, homeZ: home.z,
    rot: Math.atan2(-home.x, -home.z),
  }));
});

function respawnNpc(n) {
  n.alive = true;
  n.hp = COMBAT.hp;
  n.state = 'idle';
  n.x = n.homeX;
  n.z = n.homeZ;
  n.aggro = null;
  n.bobber = null;
  n.mode = 'calm';
  n.mag = NPC_GUN.mag;
  n.joinAt = 0;
  n.lastSeen = null;
}

// move an NPC along a heading, sliding along the shore instead of stopping dead
function npcStep(n, rot, speed, dt, strict = false) {
  const step = speed * dt;
  const nx = n.x + Math.sin(rot) * step;
  const nz = n.z + Math.cos(rot) * step;
  if (onLand(nx, nz)) { n.x = nx; n.z = nz; return true; }
  if (strict) return false;
  if (onLand(nx, n.z)) { n.x = nx; return true; }
  if (onLand(n.x, nz)) { n.z = nz; return true; }
  return false;
}

function tickNpc(n, dt) {
  const now = nowMs();
  if (!n.alive) {
    if (now >= n.respawnAt) respawnNpc(n);
    return;
  }
  n.moving = false;
  if (n.mag === undefined) n.mag = NPC_GUN.mag;
  // a friend called for help a moment ago
  if (n.joinAt && now >= n.joinAt) {
    const p = players.get(n.joinId);
    n.joinAt = 0;
    if (p && p.alive && !n.aggro) provoke(n, p, 'I got your back!');
  }
  let threat = null;
  if (n.aggro && now < n.aggroUntil) {
    const p = players.get(n.aggro);
    if (p && p.alive) threat = p;
  }
  if (!threat && n.aggro) {
    // lost them: go look where they were last seen, then give up
    n.aggro = null;
    n.onTarget = 0;
    if (n.lastSeen && n.role === 'angler') { n.mode = 'search'; n.searchUntil = now + 9000; }
  }
  // heal slowly once things have been quiet for a while
  if (!threat && n.hp < COMBAT.hp && now - (n.lastHurt || 0) > 6000) n.hp = Math.min(COMBAT.hp, n.hp + 5 * dt);
  if (threat) {
    const dist = Math.hypot(threat.x - n.x, threat.z - n.z);
    const toward = Math.atan2(threat.x - n.x, threat.z - n.z);
    n.lastSeen = { x: threat.x, z: threat.z, t: now };
    n.onTarget = (n.onTarget || 0) + dt;
    n.bobber = null;
    n.state = 'combat';
    // aggro stays fresh while they're close; far off, it runs out and they search instead
    if (dist < 40) n.aggroUntil = Math.max(n.aggroUntil, now + 4000);
    // badly hurt: break off and run, then come back once healed a bit
    // (once per scrape: if they're cornered again soon after, they fight it out)
    if (n.role === 'angler' && n.hp < 30 && n.mode !== 'flee' && now - (n.fledAt || -1e9) > 20000) {
      n.mode = 'flee';
      n.fledAt = now;
      n.fleeUntil = now + 7000;
      npcSay(n, 'I\'m out of here!');
    }
    if (n.mode === 'flee') {
      if (now < n.fleeUntil) {
        n.state = 'flee';
        // run away from the threat; if the shore is in the way, veer off to either side until there's ground
        const away = toward + Math.PI + Math.sin(now / 900) * 0.3;
        for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1]) {
          if (npcStep(n, away + off, 5.2, dt, true)) { n.rot = away + off; n.moving = true; break; }
        }
        return;
      }
      n.mode = 'fight';
    }
    // up close they use a knife instead of the gun
    if (dist < 2.2) {
      n.rot = toward;
      if (now >= (n.nextStab || 0)) {
        n.nextStab = now + 900;
        const res = hurtPlayer(threat, 20, { name: n.name, id: n.id, x: n.x, z: n.z }, 'stabbed');
        io.emit('punch', { id: n.id, rot: toward, heavy: false, knife: true, side: 'r', hit: !!res && res !== 'safe', x: threat.x, z: threat.z });
      }
      return;
    }
    if (n.role === 'angler') {
      // keep a fighting distance: close in when far, back off when crowded, otherwise strafe
      if (now >= (n.strafeFlip || 0)) { n.strafe = Math.random() < 0.5 ? -1 : 1; n.strafeFlip = now + rand(900, 2400); }
      let move = null;
      let speed = 3.4;
      if (dist > 20) { move = toward; speed = 4.6; } else if (dist < 8) { move = toward + Math.PI + n.strafe * 0.5; speed = 3.8; } else move = toward + (Math.PI / 2) * n.strafe;
      if (move !== null) n.moving = npcStep(n, move, speed, dt);
      if (!n.moving) n.strafe = -n.strafe;
    }
    n.rot = toward;
    // bursts, reloads
    if (now < (n.reloadUntil || 0)) return;
    if (n.mag <= 0) { n.mag = NPC_GUN.mag; n.reloadUntil = now + NPC_GUN.reload; if (Math.random() < 0.6) npcSay(n, 'Reloading!'); return; }
    if (now >= n.nextShot && dist < NPC_GUN.range) {
      if (!n.burstLeft) n.burstLeft = Math.floor(rand(NPC_GUN.burst[0], NPC_GUN.burst[1] + 1));
      npcFire(n, threat);
      n.mag -= 1;
      n.burstLeft -= 1;
      n.nextShot = now + (n.burstLeft > 0 ? NPC_GUN.burstGap : rand(NPC_GUN.pause[0], NPC_GUN.pause[1]) * (n.role === 'angler' ? 1 : 0.8));
    }
    return;
  }
  n.onTarget = 0;
  if (n.role !== 'angler') {
    n.state = 'idle';
    n.x += (n.homeX - n.x) * Math.min(1, dt * 2);
    n.z += (n.homeZ - n.z) * Math.min(1, dt * 2);
    n.rot += angleDiff(Math.PI, n.rot) * Math.min(1, dt * 3);
    return;
  }
  // heard something: look that way, and walk over if it was close
  if (n.mode === 'alert' || n.mode === 'search') {
    const until = n.mode === 'alert' ? n.alertUntil : n.searchUntil;
    if (now < until && n.lastSeen) {
      n.state = 'combat';
      const d = Math.hypot(n.lastSeen.x - n.x, n.lastSeen.z - n.z);
      n.rot = Math.atan2(n.lastSeen.x - n.x, n.lastSeen.z - n.z);
      if (d > 3 && (n.mode === 'search' || d < 25)) n.moving = npcStep(n, n.rot, n.mode === 'search' ? 3.6 : 2.4, dt);
      // spot a player with a gun out close to where the trouble was
      if (n.mode === 'alert') {
        players.forEach((p) => {
          if (!p.alive || n.aggro) return;
          const dp = Math.hypot(p.x - n.x, p.z - n.z);
          if (dp < 12 && GUN_IDS.includes(p.held) && Math.hypot(p.x - n.lastSeen.x, p.z - n.lastSeen.z) < 6) provoke(n, p, 'Drop it!');
        });
      }
      return;
    }
    n.mode = 'calm';
    n.state = 'idle';
    n.wander = Math.atan2(n.homeX - n.x, n.homeZ - n.z);
  }
  // wandered far from home during a fight: head back first
  if (Math.hypot(n.homeX - n.x, n.homeZ - n.z) > 9) {
    n.state = 'idle';
    n.bobber = null;
    n.rot = Math.atan2(n.homeX - n.x, n.homeZ - n.z);
    n.moving = npcStep(n, n.rot, 2.4, dt);
    return;
  }
  if (now > n.nextThink) {
    n.nextThink = now + rand(2500, 6000);
    if (Math.random() < 0.55) {
      const rot = Math.atan2(-n.x, -n.z);
      const dist = rand(6, 14);
      const bx = n.x + Math.sin(rot) * dist;
      const bz = n.z + Math.cos(rot) * dist;
      if (inWater(bx, bz)) {
        n.state = 'fishing';
        n.rot = rot;
        n.bobber = { x: bx, z: bz };
      } else n.state = 'idle';
    } else {
      n.state = 'idle';
      n.bobber = null;
      n.wander = Math.random() * Math.PI * 2;
    }
  }
  if (n.state === 'idle') {
    const nx = n.x + Math.sin(n.wander) * 1.4 * dt;
    const nz = n.z + Math.cos(n.wander) * 1.4 * dt;
    if (Math.hypot(nx - n.homeX, nz - n.homeZ) < 8 && onLand(nx, nz)) {
      n.x = nx; n.z = nz; n.rot = n.wander;
    } else n.wander = Math.atan2(n.homeX - n.x, n.homeZ - n.z);
  }
}

// ---------------------------------------------------------------- the school

// fish live in one of three places: the lake, the canal, and the big water
const FISH_AREAS = {
  lake: { pool: () => SWIMMERS, place: () => { const a = Math.random() * Math.PI * 2; const r = rand(4, WORLD.lakeRadius - 3); return { x: Math.sin(a) * r, z: Math.cos(a) * r }; }, speed: 2.4 },
  channel: { pool: () => CHANNEL_SWIMMERS, place: () => ({ x: rand(-3, 3), z: rand(-112, -34) }), speed: 2.2 },
  ocean: { pool: () => OCEAN_SWIMMERS, place: () => ({ x: rand(-170, 170), z: rand(-135, -300) }), speed: 3.2 },
};
function inFishArea(area, x, z) {
  if (area === 'lake') return Math.hypot(x, z) < WORLD.lakeRadius - 2.2;
  if (area === 'channel') return Math.abs(x) < 3.6 && z < -34 && z > -114;
  return Math.abs(x) < 180 && z < -128 && z > -310;
}

function spawnSchoolFish(slot, area) {
  const a = (slot && slot.area) || area || 'lake';
  const def = FISH_AREAS[a];
  const pool = def.pool();
  let species = pool[Math.floor(Math.random() * pool.length)];
  // now and then something big is in the school: epic and legendary fish can be shot too (they take real firepower)
  if (a === 'lake' && LAKE_RARE.length && Math.random() < 0.035) species = LAKE_RARE[Math.floor(Math.random() * LAKE_RARE.length)];
  const fish = slot || { id: 'fish-' + (fishSerial++) };
  const spot = def.place();
  fish.area = a;
  fish.name = species.name;
  fish.sid = species.id;
  fish.base = species.base;
  fish.x = spot.x;
  fish.z = spot.z;
  fish.rot = Math.random() * Math.PI * 2;
  fish.alive = true;
  fish.floatUntil = 0;
  fish.maxHp = (FISH_HP[species.rarity] || 2) * 22; // damage, not hits: a legendary takes about 170
  fish.hp = fish.maxHp;
  fish.hurtUntil = 0;
  fish.spoil = 0;
  return fish;
}
for (let i = 0; i < 40; i++) school.push(spawnSchoolFish(null, 'lake'));
for (let i = 0; i < 16; i++) school.push(spawnSchoolFish(null, 'channel'));
for (let i = 0; i < 60; i++) school.push(spawnSchoolFish(null, 'ocean'));

function tickFish(dt) {
  const now = nowMs();
  for (const f of school) {
    if (!f.alive) {
      if (now >= f.floatUntil) spawnSchoolFish(f);
      continue;
    }
    const fleeing = now < f.hurtUntil;
    const speed = FISH_AREAS[f.area].speed;
    f.rot += rand(-1.2, 1.2) * dt * (fleeing ? 2.5 : 1);
    f.x += Math.sin(f.rot) * (fleeing ? speed * 2.3 : speed) * dt;
    f.z += Math.cos(f.rot) * (fleeing ? speed * 2.3 : speed) * dt;
    if (!inFishArea(f.area, f.x, f.z)) {
      // turn back toward the middle of the fish's water
      const c = f.area === 'lake' ? { x: 0, z: 0 } : f.area === 'channel' ? { x: 0, z: -74 } : { x: 0, z: -215 };
      f.rot = Math.atan2(c.x - f.x, c.z - f.z);
    }
  }
}

function tickRespawns() {
  const now = nowMs();
  for (const p of players.values()) {
    if (p.alive || now < p.respawnAt) continue;
    const s = shoreSpawn();
    Object.assign(p, { x: s.x, z: s.z, rot: s.rot, hp: COMBAT.hp, alive: true, budget: 2, safeUntil: now + COMBAT.spawnSafe });
    const sock = sockOf(p.id);
    if (sock) sock.emit('respawn', { x: p.x, z: p.z, rot: p.rot, hp: p.hp });
  }
}

function collectPickups() {
  for (const p of players.values()) {
    if (!p.alive) continue;
    for (let i = pickups.length - 1; i >= 0; i--) {
      const it = pickups[i];
      if (Math.hypot(p.x - it.x, p.z - it.z) > 1.7) continue;
      if (it.kind === 'cash') p.cash += it.amount;
      else if (it.kind === 'fish') giveFish(p, it.name, null, it.amount);
      else if (DRUGS.includes(it.kind)) p.pocket[it.kind] += it.amount;
      else if (it.kind === 'ammo') p.ammo += it.amount;
      else if (it.kind === 'heal') p.hp = Math.min(COMBAT.hp, p.hp + it.amount);
      pickups.splice(i, 1);
      const sock = sockOf(p.id);
      if (sock) sock.emit('loot', { kind: it.kind, amount: it.amount, name: it.name, x: it.x, z: it.z });
    }
  }
}

// ---------------------------------------------------------------- snapshots

function snapshot() {
  const now = nowMs();
  const list = [];
  for (const p of players.values()) {
    list.push({
      id: p.id, name: p.name, color: p.color, look: p.look, skin: p.skin, x: r2(p.x), z: r2(p.z), rot: r2(p.rot), jy: r2(p.jy || 0), level: levelOf(p.xp),
      state: p.state, bobber: p.bobber, cash: p.cash, hp: Math.max(0, p.hp), alive: p.alive,
      guns: p.guns, ga: GUN_IDS.includes(p.held) ? p.att[p.held] : null, lz: !!(GUN_IDS.includes(p.held) && p.att[p.held] && p.att[p.held].laser), rod: p.rod, held: p.held || 'rod', boat: !!p.boat, bt: Math.max(0, p.boatTier), swim: !!p.swim, high: highFlags(p), caught: p.caught, best: p.best,
      boss: p.boss ? { k: p.boss.kind, hp: Math.round((p.boss.hp / p.boss.maxHp) * 1000) / 1000, st: nowMs() < p.boss.staggerUntil ? 1 : 0, stage: p.boss.stage } : null,
    });
  }
  const standings = derby.active ? derbyStandings() : [];
  return {
    hour: Math.round(hourNow() * 1000) / 1000,
    players: list,
    fish: school.map((f) => ({ id: f.id, sid: f.sid, x: r2(f.x), z: r2(f.z), rot: r2(f.rot), alive: f.alive, hurt: f.alive && f.hp < f.maxHp })),
    npcs: npcs.map((n) => ({
      id: n.id, role: n.role, name: n.name, color: n.color,
      x: r2(n.x), z: r2(n.z), rot: r2(n.rot), hp: Math.max(0, n.hp), alive: n.alive,
      state: n.state, bobber: n.bobber,
    })),
    mutants: mutants.map((m) => ({ id: m.id, k: m.kind, x: r2(m.x), z: r2(m.z), rot: r2(m.rot), hp: Math.max(0, m.hp) / m.maxHp, st: now < m.staggerUntil ? 'stag' : inWater(m.x, m.z) ? 'swim' : 'land' })),
    frenzy: { active: frenzy.active, endsIn: frenzy.active ? frenzy.endsAt - now : 0, nextIn: frenzy.active ? 0 : frenzy.nextAt - now, top: [...frenzy.scores.values()].sort((a, b) => b.score - a.score).slice(0, 3).map((e) => ({ name: e.name, score: e.score, id: e.id })) },
    pickups: pickups.map((it) => ({ id: it.id, kind: it.kind, name: it.name, amount: it.amount, x: r2(it.x), z: r2(it.z) })),
    hotspots: hotspots.map((h) => ({ id: h.id, x: r2(h.x), z: r2(h.z), r: h.r, age: now - h.born, left: h.until - now })),
    derby: {
      active: derby.active,
      endsIn: derby.active ? derby.endsAt - now : 0,
      nextIn: derby.active ? 0 : derby.nextAt - now,
      entries: standings.length,
      pot: DERBY.basePot + DERBY.perEntry * standings.length,
      leader: standings[0] ? { name: standings[0].name, lbs: standings[0].lbs, fish: standings[0].fish } : null,
    },
  };
}

function privateState(p) {
  tickReload(p);
  return {
    guns: p.guns, mag: p.mag, att: p.att, glvl: p.glvl, reloadGun: p.reloadGun, reloadLeft: p.reloadGun ? Math.max(0, p.reloadUntil - nowMs()) : 0, boatTier: p.boatTier,
    cash: p.cash, ammo: p.ammo, rod: p.rod, bait: p.bait, pocket: p.pocket,
    bag: { n: p.bag.length, value: p.bag.reduce((s, f) => s + f.value, 0), cap: bagCap(p), tier: p.bagTier || 0, rev: p.bagRev || 0 },
    streak: nowMs() < (p.streakUntil || 0) ? p.streak : 0, streakLeft: Math.max(0, (p.streakUntil || 0) - nowMs()),
    high: highFlags(p), highLeft: highLeft(p), moveMul: moveMul(p), hp: Math.max(0, p.hp),
    alive: p.alive, safe: inCamp(p) || nowMs() < p.safeUntil, state: p.state,
    xp: p.xp, level: levelOf(p.xp), xpLow: xpFloor(levelOf(p.xp)), xpNext: xpFloor(levelOf(p.xp) + 1), quests: p.quests, boat: !!p.boat, ownsBoat: !!p.ownsBoat,
  };
}

// ---------------------------------------------------------------- cards

function shuffleShoe() {
  shoe = [];
  for (let d = 0; d < 4; d++) for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) shoe.push({ r, s });
  for (let i = shoe.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
}
function drawCard() {
  if (shoe.length < 20) shuffleShoe();
  return shoe.pop();
}
function handTotal(cards) {
  let total = 0;
  let aces = 0;
  cards.forEach((c) => {
    if (c.r === 1) { aces += 1; total += 11; } else total += Math.min(c.r, 10);
  });
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}
const isBlackjack = (cards) => cards.length === 2 && handTotal(cards) === 21;

function tableView(p) {
  if (!p.bj) return { active: false };
  const b = p.bj;
  return {
    active: true, status: b.status, bet: b.bet, result: b.result, payout: b.payout || 0,
    player: b.player, dealer: b.hide ? [b.dealer[0], null] : b.dealer,
    playerTotal: handTotal(b.player), dealerTotal: b.hide ? null : handTotal(b.dealer),
    canDouble: b.status === 'play' && b.player.length === 2 && p.cash >= b.bet,
  };
}
function sendTable(socket, p) { socket.emit('table', tableView(p)); }

function finishHand(p, result, payout) {
  p.cash += payout;
  Object.assign(p.bj, { status: 'done', result, hide: false, payout });
}

function dealBlackjack(p, bet) {
  p.cash -= bet;
  const player = [drawCard(), drawCard()];
  const dealer = [drawCard(), drawCard()];
  p.bj = { bet, player, dealer, status: 'play', hide: true, result: null };
  const pBJ = isBlackjack(player);
  const dBJ = isBlackjack(dealer);
  if (pBJ || dBJ) {
    if (pBJ && dBJ) finishHand(p, 'push', bet);
    else if (pBJ) finishHand(p, 'blackjack', Math.round(bet * 2.5));
    else finishHand(p, 'lose', 0);
    if (p.bj.result === 'blackjack') feed(`${p.name} hit blackjack`, 'shack');
  }
}

function standBlackjack(p) {
  p.bj.hide = false;
  while (handTotal(p.bj.dealer) < 17) p.bj.dealer.push(drawCard());
  const pv = handTotal(p.bj.player);
  const dv = handTotal(p.bj.dealer);
  if (dv > 21 || pv > dv) finishHand(p, 'win', p.bj.bet * 2);
  else if (pv === dv) finishHand(p, 'push', p.bj.bet);
  else finishHand(p, 'lose', 0);
}

function pickSlot() {
  let r = Math.random() * SLOT_WEIGHT;
  for (const s of SLOT_SYMBOLS) if ((r -= s.w) <= 0) return s.id;
  return SLOT_SYMBOLS[0].id;
}
function slotMult(reels) {
  const counts = {};
  reels.forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
  let best = 0;
  let sym = null;
  Object.keys(counts).forEach((k) => { if (counts[k] > best) { best = counts[k]; sym = k; } });
  if (best === 3) return SLOT_SYMBOLS.find((s) => s.id === sym).triple;
  if (best === 2) return 1;
  return 0;
}
shuffleShoe();

// ---------------------------------------------------------------- debug

function debugCommand(p, socket, text) {
  const [cmd, ...args] = text.slice(1).split(/\s+/);
  const say = (msg) => socket.emit('feed', { text: msg, kind: 'mine' });
  const spots = { moss: WORLD.camp.dealer, shack: WORLD.camp.shack, camp: WORLD.camp.fire, dock: { x: 0, z: 24 } };
  if (cmd === 'cash') { p.cash += Number(args[0]) || 500; return say('Cash added.'); }
  if (cmd === 'tp') {
    const s = spots[args[0]] || { x: Number(args[0]), z: Number(args[1]) };
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z) || !onLand(s.x, s.z)) return say('Try /tp moss, shack, camp, dock, or x z on land.');
    resetLine(p);
    p.boat = false;
    p.x = s.x; p.z = s.z + (spots[args[0]] && args[0] !== 'dock' ? -2 : 0);
    socket.emit('respawn', { x: p.x, z: p.z, rot: p.rot, hp: p.hp });
    return say('Moved.');
  }
  if (cmd === 'hour') { setHour(Number(args[0]) || 12); return say('Clock set.'); }
  if (cmd === 'frenzy') {
    if (args[0] === 'boss') { if (!frenzy.active) startFrenzy(); frenzy.endsAt = nowMs() + FRENZY.length - FRENZY.bossAt; return say('The boss is coming.'); }
    if (frenzy.active) frenzy.endsAt = nowMs(); else frenzy.nextAt = nowMs();
    return say('Frenzy toggled.');
  }
  if (cmd === 'derby') { if (derby.active) derby.endsAt = nowMs(); else derby.nextAt = nowMs(); return say('Derby toggled.'); }
  if (cmd === 'gear') { p.rod = WORLD.rods.length - 1; p.bait = WORLD.baits.length - 1; GUN_IDS.forEach((g) => { p.guns[g] = true; Object.keys(WORLD.attachments).forEach((k) => { p.att[g][k] = !WORLD.attachments[k].only || WORLD.attachments[k].only.includes(g); }); p.mag[g] = effGun(p, g).mag; }); GUN_IDS.forEach((g) => { p.glvl[g] = WORLD.gunLevels.names.length - 1; }); p.ammo += 200; p.boatTier = WORLD.boats.length - 1; p.ownsBoat = true; return say('Maxed out.'); }
  if (cmd === 'boattier') { p.boatTier = Math.max(0, Math.min(WORLD.boats.length - 1, Number(args[0]) || 0)); p.ownsBoat = true; return say(`Boat tier ${p.boatTier}.`); }
  if (cmd === 'boat') { p.ownsBoat = true; p.boatTier = Math.max(p.boatTier, 0); return say('You own a boat.'); }
  if (cmd === 'sea' || cmd === 'channel') {
    resetLine(p);
    Object.assign(p, { ownsBoat: true, boat: true, x: cmd === 'sea' ? 6 : 0, z: cmd === 'sea' ? -132 : -70, rot: Math.PI, budget: 2 });
    socket.emit('respawn', { x: p.x, z: p.z, rot: p.rot, hp: p.hp });
    return say('Out on the water.');
  }
  if (cmd === 'fish') {
    const n = Math.max(1, Math.min(80, Number(args[0]) || 10));
    for (let i = 0; i < n; i++) {
      const sp = SPECIES.filter((x) => x.base > 0)[Math.floor(Math.random() * SPECIES.filter((x) => x.base > 0).length)];
      const lbs = Math.round(rand(sp.lbs[0], sp.lbs[1]) * 10) / 10;
      giveFish(p, sp.name, lbs, Math.round(sp.base * (0.8 + Math.random() * 0.6)));
    }
    return say(`${n} fish in the bag.`);
  }
  if (cmd === 'boss') { p.forceBoss = BOSSES[args[0]] ? args[0] : 'snapjaw'; p.fastBite = true; return say(`Your next bite is ${BOSSES[p.forceBoss].name}.`); }
  if (cmd === 'fast') { p.fastBite = !p.fastBite; return say(p.fastBite ? 'Fast bites on.' : 'Fast bites off.'); }
  return say('Commands: /cash N, /tp moss|shack|camp|dock, /hour H, /derby, /gear, /fast, /fish N, /boss ID, /frenzy, /boat, /sea, /channel');
}

// ---------------------------------------------------------------- sockets

const cleanName = (raw) => String(raw ?? '').replace(/[^\w .'-]/g, '').trim().slice(0, 16);
const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t);

io.on('connection', (socket) => {
  let p = null;
  socket.emit('world', WORLD);

  socket.on('peek', (token, ack) => {
    const reply = replyFn(ack);
    const prof = validToken(token) ? profiles[token] : null;
    reply(prof ? { name: prof.name, cash: prof.cash, color: prof.color, look: prof.look || 0, skin: prof.skin || 0, caught: prof.caught || 0 } : null);
  });

  socket.on('join', (body, ack) => {
    const reply = replyFn(ack);
    if (p) return reply({ ok: false });
    const opts = body && typeof body === 'object' ? body : { name: body };
    const name = cleanName(opts.name) || 'Angler';
    let token = validToken(opts.token) ? opts.token : null;
    const taken = token && [...players.values()].some((o) => o.token === token);
    const guest = !token || taken;
    if (guest) token = 'guest-' + socket.id;
    const prof = !guest && profiles[token] ? profiles[token] : null;
    const color = COLORS.includes(opts.color) ? opts.color : (prof && prof.color) || COLORS[players.size % COLORS.length];
    const s = campSpawn();
    const pick = (v, n, fallback) => (Number.isInteger(v) && v >= 0 && v < n ? v : fallback);
    const look = pick(opts.look, 5, (prof && prof.look) || 0);
    const skin = pick(opts.skin, 6, (prof && prof.skin) || 0);
    p = {
      id: socket.id, token, guest, name, color, look, skin,
      x: s.x, z: s.z, rot: s.rot, aim: s.rot,
      state: 'idle', bobber: null, fish: null,
      lastMove: nowMs(), budget: 2, lastChat: 0,
      cash: COMBAT.stake, hp: COMBAT.hp, alive: true, guns: freshGuns(), mag: freshMag(), att: freshAtt(), glvl: freshLvl(), reloadGun: null, reloadUntil: 0, boatTier: -1, swim: false, ammo: 0, rod: 0, bait: 0, held: 'rod',
      pocket: freshPocket(), bag: [], high: { weed: 0, whiskey: 0, crank: 0 },
      journal: {}, caught: 0, earned: 0, derbyWins: 0, best: null, xp: 0, quests: [], jy: 0,
      nextShot: 0, respawnAt: 0, bj: null, safeUntil: nowMs() + COMBAT.spawnSafe,
    };
    if (prof) {
      Object.assign(p, {
        cash: prof.cash ?? COMBAT.stake, ammo: prof.ammo || 0,
        guns: { ...freshGuns(), ...(prof.guns || {}), rifle: !!(prof.rifle || (prof.guns && prof.guns.rifle)) },
        mag: { ...freshMag(), ...(prof.mag || {}) },
        glvl: Object.fromEntries(GUN_IDS.map((g) => [g, Math.max(0, Math.min(WORLD.gunLevels.names.length - 1, Number((prof.glvl || {})[g]) || 0))])),
        att: Object.fromEntries(GUN_IDS.map((g) => [g, { laser: false, drum: false, switch: false, ...((prof.att || {})[g] || {}) }])),
        boatTier: Number.isInteger(prof.boatTier) ? Math.min(prof.boatTier, WORLD.boats.length - 1) : prof.ownsBoat ? 0 : -1,
        rod: Math.min(prof.rod || 0, WORLD.rods.length - 1), bait: Math.min(prof.bait || 0, WORLD.baits.length - 1),
        pocket: { ...freshPocket(), ...(prof.pocket || {}) }, bag: Array.isArray(prof.bag) ? prof.bag : [],
        bagTier: Math.max(0, Math.min(WORLD.bags.length - 1, Number(prof.bagTier) || 0)),
        journal: prof.journal || {}, caught: prof.caught || 0, earned: prof.earned || 0,
        derbyWins: prof.derbyWins || 0, best: prof.best || null, ownsBoat: !!prof.ownsBoat,
        xp: Math.max(0, Number(prof.xp) || 0), quests: prof.quests,
      });
    }
    ensureQuests(p);
    GUN_IDS.forEach((g) => { p.mag[g] = Math.min(p.mag[g] || 0, effGun(p, g).mag); });
    players.set(socket.id, p);
    storeProfile(p);
    const payload = { id: socket.id, you: { x: p.x, z: p.z, rot: p.rot }, guest, returning: !!prof, cash: p.cash, journal: p.journal, caught: p.caught, color: p.color };
    socket.emit('welcome', payload);
    reply({ ok: true });
    feed(prof ? `${name} is back at the lake` : `${name} joined the lake`, 'join');
  });

  socket.on('move', (m) => {
    if (!p || !p.alive || !m) return;
    const now = nowMs();
    const dt = Math.min((now - p.lastMove) / 1000, 0.5);
    p.lastMove = now;
    const walk = moveMul(p) * WORLD.sprint;
    const mul = walk * (p.boat ? 1.6 : WORLD.bhop);
    const speed = p.boat ? boatSpeed(p) : WORLD.moveSpeed;
    // the budget refills fast enough for any hop speed, but its ceiling stays small so nobody can bank up a teleport
    p.budget = Math.min(p.budget + speed * mul * dt * 1.3, Math.max(2.5 * walk * (p.boat ? 1.6 : 1), speed * mul * 0.12));
    if (Number.isFinite(m.rot)) p.rot = m.rot;
    if (Number.isFinite(m.aim)) p.aim = m.aim;
    if (typeof m.held === 'string' && HOLDABLE.has(m.held) && ownsHold(p, m.held)) p.held = m.held;
    if (p.reloadGun && p.held !== p.reloadGun) p.reloadGun = null;
    p.jy = Number.isFinite(m.jy) ? Math.min(Math.max(m.jy, 0), 2.5) : 0;
    if (p.state !== 'idle') return;
    const x = Number(m.x);
    const z = Number(m.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const step = Math.hypot(x - p.x, z - p.z);
    if (step > p.budget + 0.05 || !(p.boat ? inWater(x, z) : footOk(x, z))) {
      socket.emit('correct', { x: p.x, z: p.z });
      return;
    }
    p.budget -= step;
    // how fast they're moving, smoothed: NPCs have a harder time hitting a fast target
    p.speed = (p.speed || 0) * 0.7 + (dt > 0 ? step / Math.max(dt, 0.03) : 0) * 0.3;
    p.x = x;
    p.z = z;
    p.swim = !p.boat && inWater(x, z);
  });

  socket.on('cast', (c, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive || p.state !== 'idle' || !c) return reply({ ok: false });
    if (p.swim) return reply({ ok: false, msg: 'Get out of the water to fish.' });
    const power = Math.max(0, Math.min(1, Number(c.power) || 0));
    if (Number.isFinite(c.rot)) p.rot = c.rot;
    const rod = WORLD.rods[p.rod];
    const dist = WORLD.castMin + power * (rod.castMax - WORLD.castMin);
    const bx = p.x + Math.sin(p.rot) * dist;
    const bz = p.z + Math.cos(p.rot) * dist;
    if (!inWater(bx, bz)) return reply({ ok: false, msg: 'That landed on shore. Face the water and cast again.', bobber: { x: bx, z: bz } });
    p.bobber = { x: bx, z: bz };
    scheduleBite(p, socket);
    reply({ ok: true, bobber: p.bobber, hot: !!hotspotAt(bx, bz) });
  });

  socket.on('hook', (_, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive) return reply({ result: 'none' });
    if (p.state === 'bite' && nowMs() - p.biteAt <= (p.biteWindow || TIMING.biteWindow) + 200) {
      clearTimers(p);
      p.state = 'reeling';
      p.reelStart = nowMs();
      if (p.fish && p.fish.bossDef) startBossFight(p, p.fish.bossDef);
      return reply({ result: 'hooked', ...reelPayload(p) });
    }
    if (p.state === 'waiting') {
      scheduleBite(p, socket);
      return reply({ result: 'spooked' });
    }
    reply({ result: 'none' });
  });

  socket.on('land', (_, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive || p.state !== 'reeling' || !p.fish) return reply({ ok: false });
    const f = p.fish;
    const minReel = 1100 + f.difficulty * 1400;
    if (nowMs() - p.reelStart < minReel) {
      resetLine(p);
      return reply({ ok: false, msg: 'It slipped off the hook.' });
    }
    const s = f.species;
    const where = p.bobber ? { ...p.bobber } : { x: p.x, z: p.z };
    let bossInfo = null;
    if (p.boss) {
      const b = p.boss;
      if (b.hp > b.maxHp * b.def.landAt) { resetLine(p); return reply({ ok: false, msg: 'It was still too strong and shook the hook.' }); }
      bossInfo = { def: b.def, hitBy: b.hitBy };
    }
    const rec = recordCatch(p, s, f.lbs, f.value, { hot: f.hot, rod: true, xpBonus: bossInfo ? 80 * bossInfo.def.tier : 0 });
    if (bossInfo) {
      // everyone who shot it shares in the take, by damage done
      const total = [...bossInfo.hitBy.values()].reduce((x, y) => x + y, 0) || 1;
      for (const [id, d] of bossInfo.hitBy) {
        const q = players.get(id);
        if (!q || q === p) continue;
        const share = Math.round(f.value * 0.5 * (d / total));
        q.cash += share;
        q.earned += share;
        q.xp += 30 * bossInfo.def.tier;
        const sock = sockOf(id);
        if (sock) sock.emit('bossShare', { share, pct: Math.round((d / total) * 100) });
      }
      io.emit('bossDown', { pid: p.id, kind: bossInfo.def.id, x: where.x, z: where.z });
      for (let i = 0; i < 2 + bossInfo.def.tier; i++) spawnPickup(i % 2 ? 'heal' : 'ammo', i % 2 ? 30 : 24 + bossInfo.def.tier * 6, where.x + rand(-2, 2), where.z + rand(-2, 2));
    }
    io.emit('caught', { id: p.id, sid: s.id, name: s.name, lbs: f.lbs, rarity: s.rarity, x: where.x, z: where.z });
    resetLine(p);
    storeProfile(p);
    reply({ ok: true, id: s.id, name: s.name, rarity: s.rarity, lbs: f.lbs, journal: p.journal, boss: !!bossInfo, ...rec });
  });

  // holding the line steady wears a boss down a little, but only so far: past its wear cap it takes real firepower
  socket.on('bossWear', () => {
    const b = p && p.boss;
    if (!b || p.state !== 'reeling') return;
    const now = nowMs();
    if (now - b.lastWear < 800) return;
    b.lastWear = now;
    if (b.hp > b.maxHp * b.def.wearCap) { b.hp -= b.maxHp * 0.014; bossState(p); }
  });

  socket.on('lost', () => { if (p && p.state === 'reeling') resetLine(p); });
  socket.on('reelIn', () => { if (p && (p.state === 'waiting' || p.state === 'bite')) resetLine(p); });

  socket.on('buy', (item, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive || p.state !== 'idle') return reply({ ok: false, msg: 'Reel in first.' });
    if (!atDealer(p)) return reply({ ok: false, msg: 'Walk up to Moss.' });
    const shop = WORLD.shop;
    const pay = (price) => {
      if (p.cash < price) return false;
      p.cash -= price;
      return true;
    };
    if (item === 'rod' || item === 'bait') {
      const list = item === 'rod' ? WORLD.rods : WORLD.baits;
      const next = p[item] + 1;
      if (next >= list.length) return reply({ ok: false, msg: 'You already have the best there is.' });
      if (!pay(list[next].price)) return reply({ ok: false, msg: `${list[next].name} costs $${list[next].price}.` });
      p[item] = next;
      feed(`${p.name} picked up ${list[next].name.toLowerCase()}`, 'shop');
      storeProfile(p);
      return reply({ ok: true, msg: `${list[next].name} is yours.`, gear: true });
    }
    if (item === 'bagup') {
      const next = (p.bagTier || 0) + 1;
      if (next >= WORLD.bags.length) return reply({ ok: false, msg: 'You already have the biggest bag there is.' });
      const b = WORLD.bags[next];
      if (!pay(b.price)) return reply({ ok: false, msg: `The ${b.name.toLowerCase()} is $${b.price}.` });
      p.bagTier = next;
      feed(`${p.name} bought a ${b.name.toLowerCase()}`, 'shop');
      storeProfile(p);
      return reply({ ok: true, msg: `The ${b.name.toLowerCase()} holds ${b.cap} fish.` });
    }
    if (item === 'boat') {
      const next = p.boatTier + 1;
      if (next >= WORLD.boats.length) return reply({ ok: false, msg: 'You already have the best boat there is.' });
      const boat = WORLD.boats[next];
      if (!pay(boat.price)) return reply({ ok: false, msg: `The ${boat.name.toLowerCase()} is $${boat.price}.` });
      p.boatTier = next;
      p.ownsBoat = true;
      feed(`${p.name} bought a ${boat.name.toLowerCase()}`, 'shop');
      storeProfile(p);
      return reply({ ok: true, msg: `The ${boat.name.toLowerCase()} is yours. Launch it from any shore with E, or from your phone.` });
    }
    if (WORLD.guns[item]) {
      const g = WORLD.guns[item];
      if (p.guns[item]) return reply({ ok: false, msg: `You already have the ${g.name.toLowerCase()}.` });
      if (!pay(g.price)) return reply({ ok: false, msg: `The ${g.name.toLowerCase()} is $${g.price}.` });
      p.guns[item] = true;
      p.mag[item] = effGun(p, item).mag;
      p.ammo += g.start;
      feed(`${p.name} bought a ${g.name.toLowerCase()}`, 'shop');
      storeProfile(p);
      return reply({ ok: true, msg: `${g.name} bought, loaded, with ${g.start} spare rounds.` });
    }
    if (typeof item === 'string' && item.startsWith('lvl:')) {
      const gunId = item.slice(4);
      if (!WORLD.guns[gunId] || !p.guns[gunId]) return reply({ ok: false, msg: 'You do not own that gun.' });
      const L = WORLD.gunLevels;
      const next = p.glvl[gunId] + 1;
      if (next >= L.names.length) return reply({ ok: false, msg: 'That gun is fully upgraded.' });
      const cost = Math.max(60, Math.round(WORLD.guns[gunId].price * L.price[next]));
      if (!pay(cost)) return reply({ ok: false, msg: `The ${L.names[next]} upgrade is $${cost}.` });
      p.glvl[gunId] = next;
      storeProfile(p);
      return reply({ ok: true, msg: `${WORLD.guns[gunId].name} is now ${L.names[next]}: ${Math.round((L.mul[next] - 1) * 100)}% more damage.` });
    }
    if (typeof item === 'string' && item.startsWith('att:')) {
      const [, gunId, key] = item.split(':');
      const at = WORLD.attachments[key];
      if (!WORLD.guns[gunId] || !at) return reply({ ok: false, msg: 'Moss does not sell that.' });
      if (!p.guns[gunId]) return reply({ ok: false, msg: `You do not own the ${WORLD.guns[gunId].name.toLowerCase()}.` });
      if (at.only && !at.only.includes(gunId)) return reply({ ok: false, msg: `That will not fit the ${WORLD.guns[gunId].name.toLowerCase()}.` });
      if (p.att[gunId][key]) return reply({ ok: false, msg: 'Already on there.' });
      if (!pay(at.price)) return reply({ ok: false, msg: `${at.name} is $${at.price}.` });
      p.att[gunId][key] = true;
      storeProfile(p);
      return reply({ ok: true, msg: `${at.name} fitted to the ${WORLD.guns[gunId].name.toLowerCase()}.` });
    }
    if (item === 'ammo') {
      if (!hasAnyGun(p)) return reply({ ok: false, msg: 'Buy a gun first.' });
      if (!pay(shop.ammo)) return reply({ ok: false, msg: `Ammo is $${shop.ammo}.` });
      p.ammo += shop.ammoCount;
      return reply({ ok: true, msg: `+${shop.ammoCount} rounds.` });
    }
    if (!DRUGS.includes(item)) return reply({ ok: false, msg: 'Moss does not sell that.' });
    if (!pay(shop[item])) return reply({ ok: false, msg: `${item} is $${shop[item]}.` });
    p.pocket[item] += 1;
    return reply({ ok: true, msg: `Bought ${item}.` });
  });

  socket.on('boat', (b, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive) return reply({ ok: false });
    if (p.state !== 'idle') return reply({ ok: false, msg: 'Reel in first.' });
    const action = b && b.action;
    if (action === 'launch') {
      if (p.boat) return reply({ ok: false });
      const spot = nearWater(p.x, p.z);
      if (!spot) return reply({ ok: false, msg: 'Get right up to the water to launch.' });
      if (!p.ownsBoat) {
        if (!b.rent) return reply({ ok: false, needBoat: true, msg: `No boat yet. Rent one for $${WORLD.boat.rent}, or buy one from Moss for $${WORLD.boat.buy}.` });
        if (p.cash < WORLD.boat.rent) return reply({ ok: false, msg: `Renting a boat is $${WORLD.boat.rent}.` });
        p.cash -= WORLD.boat.rent;
      }
      Object.assign(p, { boat: true, x: spot.x, z: spot.z, rot: spot.rot, budget: 2 });
      return reply({ ok: true, x: p.x, z: p.z, rot: p.rot });
    }
    if (action === 'land') {
      if (!p.boat) return reply({ ok: false });
      const spot = nearLand(p.x, p.z);
      if (!spot) return reply({ ok: false, msg: 'Pull up closer to shore or the dock.' });
      Object.assign(p, { boat: false, x: spot.x, z: spot.z, budget: 2 });
      return reply({ ok: true, x: p.x, z: p.z });
    }
    reply({ ok: false });
  });

  // the phone's fish buyer comes to you, and takes a cut
  socket.on('sellRemote', (_, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive) return reply({ ok: false, msg: 'Not right now.' });
    if (!p.bag.length) return reply({ ok: false, msg: 'Your bag is empty.' });
    const full = p.bag.reduce((sum, fish) => sum + fish.value, 0);
    const total = Math.floor(full * WORLD.market.remote);
    const count = p.bag.length;
    p.cash += total;
    p.earned += total;
    p.bag = [];
    p.bagRev = (p.bagRev || 0) + 1;
    storeProfile(p);
    reply({ ok: true, total, count, msg: `Sold ${count} fish to the buyer for $${total}.` });
  });

  socket.on('sell', (_, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive || p.state !== 'idle') return reply({ ok: false, msg: 'Reel in first.' });
    if (!atDealer(p)) return reply({ ok: false, msg: 'Walk up to Moss to sell.' });
    if (!p.bag.length) return reply({ ok: false, msg: 'Your bag is empty.' });
    const total = p.bag.reduce((s, fish) => s + fish.value, 0);
    const count = p.bag.length;
    p.cash += total;
    p.earned += total;
    p.bag = [];
    p.bagRev = (p.bagRev || 0) + 1;
    feed(`${p.name} sold ${count} fish for $${total}`, 'shop');
    storeProfile(p);
    reply({ ok: true, msg: `Sold ${count} fish for $${total}.`, total });
  });

  // inventory: the full bag list, and single-fish actions
  socket.on('bagList', (_, ack) => {
    const reply = replyFn(ack);
    if (!p) return reply({ ok: false });
    reply({ ok: true, items: p.bag, cap: bagCap(p), atMoss: atDealer(p), rate: WORLD.market.remote });
  });
  socket.on('bagSell', (body, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive) return reply({ ok: false, msg: 'Not right now.' });
    const ids = new Set(Array.isArray(body && body.ids) ? body.ids.map(String) : []);
    const picked = p.bag.filter((f) => ids.has(String(f.id)));
    if (!picked.length) return reply({ ok: false, msg: 'Pick some fish first.' });
    // full price at Moss, the phone buyer's cut anywhere else
    const rate = atDealer(p) && p.state === 'idle' ? 1 : WORLD.market.remote;
    const total = Math.floor(picked.reduce((sum, f) => sum + f.value, 0) * rate);
    p.bag = p.bag.filter((f) => !ids.has(String(f.id)));
    p.bagRev = (p.bagRev || 0) + 1;
    p.cash += total;
    p.earned += total;
    storeProfile(p);
    reply({ ok: true, total, count: picked.length, items: p.bag, msg: `Sold ${picked.length} fish for $${total}${rate < 1 ? ' (the buyer kept 30%)' : ''}.` });
  });
  socket.on('bagRelease', (body, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive) return reply({ ok: false });
    const ids = new Set(Array.isArray(body && body.ids) ? body.ids.map(String) : []);
    const before = p.bag.length;
    p.bag = p.bag.filter((f) => !ids.has(String(f.id)));
    p.bagRev = (p.bagRev || 0) + 1;
    storeProfile(p);
    reply({ ok: true, count: before - p.bag.length, items: p.bag });
  });

  socket.on('useDrug', (name, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive) return reply({ ok: false, msg: 'Not now.' });
    if (!DRUGS.includes(name)) return reply({ ok: false });
    if (p.pocket[name] <= 0) return reply({ ok: false, msg: `You are out of ${name}.` });
    p.pocket[name] -= 1;
    p.high[name] = nowMs() + DRUG_MS;
    feed(`${p.name} ${DRUG_USE[name]}`, 'info');
    reply({ ok: true });
  });

  socket.on('punch', (body, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive) return reply({ ok: false });
    if (p.state !== 'idle') return reply({ ok: false, msg: 'Reel in first.' });
    const t = nowMs();
    if (t < (p.nextPunch || 0)) return reply({ ok: false });
    const knife = !!(body && body.knife);
    p.combo = !knife && t - (p.lastPunch || 0) < PUNCH.comboWindow ? ((p.combo || 0) % 3) + 1 : 1;
    p.lastPunch = t;
    const heavy = !knife && p.combo === 3;
    p.nextPunch = t + (knife ? KNIFE.cooldown : heavy ? PUNCH.cooldown * 1.7 : PUNCH.cooldown);
    const reach = knife ? KNIFE.range : PUNCH.range;
    const cone = knife ? KNIFE.cone : PUNCH.cone;
    let rot = Number(body && body.rot);
    if (!Number.isFinite(rot)) rot = p.rot;
    p.rot = rot;
    let best = null;
    const consider = (kind, o) => {
      if (!o.alive || o === p) return;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d > reach) return;
      if (d > 0.4 && Math.abs(angleDiff(Math.atan2(o.x - p.x, o.z - p.z), rot)) > cone) return;
      if (!best || d < best.d) best = { kind, o, d };
    };
    players.forEach((o) => consider('player', o));
    npcs.forEach((n) => consider('npc', n));
    mutants.forEach((m) => { m.alive = true; consider('mutant', m); });
    const out = { ok: true, hit: null, heavy, combo: p.combo, knife };
    if (best) {
      const o = best.o;
      // from behind: the target is facing the same way the attacker is swinging
      const backstab = knife && Math.abs(angleDiff(o.rot || 0, rot)) < 0.9;
      const dmg = knife ? (backstab ? KNIFE.backstab : KNIFE.damage) : heavy ? PUNCH.heavy : PUNCH.damage;
      const knock = knife ? KNIFE.knock : heavy ? PUNCH.heavyKnock : PUNCH.knock;
      out.backstab = backstab;
      out.dmg = dmg;
      const kx = Math.sin(rot) * knock;
      const kz = Math.cos(rot) * knock;
      if (best.kind === 'mutant') {
        const res = hitMutant(o, knife ? KNIFE.damage : dmg, p, knife);
        Object.assign(out, { hit: 'mutant', killed: res.killed, glory: res.glory, stagger: res.stagger, bounty: res.bounty, dmg: res.dmg });
      } else if (best.kind === 'player') {
        const res = hurtPlayer(o, dmg, p, knife ? 'stabbed' : 'knocked out');
        if (res === 'safe') out.hit = 'safe';
        else {
          out.hit = 'player';
          out.killed = res === 'kill';
          if (res === 'hit') {
            const nx = onLand(o.x + kx, o.z + kz) ? o.x + kx : o.x;
            const nz = onLand(nx, o.z + kz) ? o.z + kz : o.z;
            o.x = nx; o.z = nz;
            const os = sockOf(o.id);
            if (os) os.emit('knock', { x: o.x, z: o.z, heavy });
          }
        }
      } else {
        o.hp -= dmg;
        o.lastHurt = t;
        provoke(o, p, 'Hey!');
        if (onLand(o.x + kx, o.z + kz)) { o.x += kx; o.z += kz; }
        out.hit = 'npc';
        out.killed = o.hp <= 0;
        if (out.killed) killNpc(o, p.name, knife ? 'stabbed' : 'knocked out', p);
      }
      out.x = o.x;
      out.z = o.z;
    }
    io.emit('punch', { id: p.id, rot, heavy, knife, backstab: !!out.backstab, side: knife || heavy || p.combo === 1 ? 'r' : 'l', hit: out.hit === 'player' || out.hit === 'npc' || out.hit === 'mutant', x: out.x, z: out.z });
    reply(out);
  });

  socket.on('shoot', (body, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive) return reply({ ok: false, msg: 'You cannot shoot right now.' });
    if (p.state !== 'idle' && !p.boss) return reply({ ok: false, msg: 'Reel in before you shoot.' });
    const gunId = body && WORLD.guns[body.gun] ? body.gun : GUN_IDS.includes(p.held) ? p.held : null;
    if (!gunId || !p.guns[gunId]) return reply({ ok: false, msg: 'Buy a gun from Moss.' });
    const g = effGun(p, gunId);
    tickReload(p);
    if (p.reloadGun) return reply({ ok: false, reloading: true });
    if (p.mag[gunId] <= 0) {
      if (p.ammo <= 0) return reply({ ok: false, msg: 'Out of ammo. Moss sells more.' });
      startReload(p, gunId);
      return reply({ ok: false, reloading: true });
    }
    const t = nowMs();
    if (t < p.nextShot) return reply({ ok: false });
    p.mag[gunId] -= 1;
    p.nextShot = t + g.cooldown;
    let rot = Number(body && body.rot);
    if (!Number.isFinite(rot)) rot = p.rot;
    reply({ ok: true, gun: gunId, mag: p.mag[gunId], ...playerFire(p, rot, !!(body && body.aiming), g, Number(body && body.dist)) });
  });

  socket.on('reload', (body, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.alive || p.state !== 'idle') return reply({ ok: false });
    const gunId = body && WORLD.guns[body.gun] ? body.gun : null;
    if (!gunId || !p.guns[gunId]) return reply({ ok: false });
    if (p.ammo <= 0) return reply({ ok: false, msg: 'No spare rounds. Moss sells more.' });
    reply({ ok: startReload(p, gunId), ms: effGun(p, gunId).reload });
  });

  const shackGuard = () => {
    if (!p || !p.alive || p.state !== 'idle') return 'Reel in first.';
    if (!atShack(p)) return 'Walk up to the shack.';
    return null;
  };

  socket.on('bet', (amount, ack) => {
    const reply = replyFn(ack);
    const bad = shackGuard();
    if (bad) return reply({ ok: false, msg: bad });
    if (p.bj && p.bj.status === 'play') return reply({ ok: false, msg: 'Finish the hand.' });
    const bet = Math.floor(Number(amount));
    if (![10, 25, 50, 100].includes(bet)) return reply({ ok: false, msg: 'Bet 10, 25, 50, or 100.' });
    if (p.cash < bet) return reply({ ok: false, msg: 'Not enough cash.' });
    dealBlackjack(p, bet);
    sendTable(socket, p);
    reply({ ok: true, result: p.bj.result });
  });

  socket.on('hit', (_, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.bj || p.bj.status !== 'play') return reply({ ok: false });
    p.bj.player.push(drawCard());
    if (handTotal(p.bj.player) > 21) finishHand(p, 'bust', 0);
    else if (handTotal(p.bj.player) === 21) standBlackjack(p);
    sendTable(socket, p);
    reply({ ok: true, result: p.bj.result });
  });

  socket.on('double', (_, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.bj || p.bj.status !== 'play' || p.bj.player.length !== 2) return reply({ ok: false });
    if (p.cash < p.bj.bet) return reply({ ok: false, msg: 'Not enough cash to double.' });
    p.cash -= p.bj.bet;
    p.bj.bet *= 2;
    p.bj.player.push(drawCard());
    if (handTotal(p.bj.player) > 21) finishHand(p, 'bust', 0);
    else standBlackjack(p);
    sendTable(socket, p);
    reply({ ok: true, result: p.bj.result });
  });

  socket.on('stand', (_, ack) => {
    const reply = replyFn(ack);
    if (!p || !p.bj || p.bj.status !== 'play') return reply({ ok: false });
    standBlackjack(p);
    sendTable(socket, p);
    if (p.bj.result === 'win') feed(`${p.name} won $${p.bj.bet} at the shack`, 'shack');
    reply({ ok: true, result: p.bj.result });
  });

  socket.on('spin', (_, ack) => {
    const reply = replyFn(ack);
    const bad = shackGuard();
    if (bad) return reply({ ok: false, msg: bad });
    if (p.bj && p.bj.status === 'play') return reply({ ok: false, msg: 'Finish the hand.' });
    const bet = 10;
    if (p.cash < bet) return reply({ ok: false, msg: 'Slots are $10.' });
    p.cash -= bet;
    const reels = [pickSlot(), pickSlot(), pickSlot()];
    const mult = slotMult(reels);
    const payout = bet * mult;
    p.cash += payout;
    if (mult >= 8) feed(`${p.name} hit ${reels[0]} on the slots for $${payout}`, 'shack');
    reply({ ok: true, reels, payout, mult });
  });

  socket.on('chat', (raw) => {
    if (!p) return;
    const now = nowMs();
    if (now - p.lastChat < 700) return;
    p.lastChat = now;
    const text = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 140);
    if (!text) return;
    if (text.startsWith('/')) {
      if (DEBUG) debugCommand(p, socket, text);
      else socket.emit('feed', { text: 'Commands are off. Start the server with LOON_DEBUG=1 to use them.', kind: 'mine' });
      return;
    }
    io.emit('chat', { id: p.id, name: p.name, color: p.color, text });
  });

  socket.on('disconnect', () => {
    if (!p) return;
    clearTimers(p);
    storeProfile(p);
    players.delete(socket.id);
    feed(`${p.name} left`, 'join');
  });
});

let lastTick = nowMs();
setInterval(() => {
  const t = nowMs();
  const dt = Math.min((t - lastTick) / 1000, 0.1);
  lastTick = t;
  tickFish(dt);
  tickHotspots();
  tickDerby();
  tickFrenzy(dt);
  tickBosses();
  npcs.forEach((n) => tickNpc(n, dt));
  tickRespawns();
  collectPickups();
  const snap = snapshot();
  const allFish = snap.fish;
  for (const sock of io.sockets.sockets.values()) {
    // each connection only hears about the fish it could plausibly see (the join screen looks at the lake)
    const at = players.get(sock.id) || { x: 0, z: 0 };
    sock.emit('state', { ...snap, fish: allFish.filter((f) => Math.abs(f.x - at.x) < 110 && Math.abs(f.z - at.z) < 110) });
  }
  for (const p of players.values()) {
    const sock = sockOf(p.id);
    if (sock) sock.emit('me', privateState(p));
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`Loon Lake running at http://localhost:${PORT}${DEBUG ? ' (debug commands on)' : ''}`);
});

// exposed so the catch odds can be tested without a running lake
module.exports = { SPECIES, pickSpecies, rollCatch, levelOf };
