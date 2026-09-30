// 100 more species for Loon Lake: 45 for the lake and its rivers, 55 for the big water.
// Each row: id, name, water, rarity, [min lbs, max lbs], color, long-bodied (1) or round (0), options
//   options: when ('night'), golden (dawn/dusk boost), deep, prop [width, height, length], belly, fin, pattern, hint
const R = {
  common: { w: 26, diff: 0.24, rf: 5, cap: 90 },
  uncommon: { w: 10, diff: 0.52, rf: 12, cap: 200 },
  rare: { w: 4.5, diff: 0.7, rf: 26, cap: 420 },
  epic: { w: 1.4, diff: 0.88, rf: 60, cap: 1200 },
  legendary: { w: 0.2, diff: 0.93, rf: 180, cap: 4000 },
};

const ROWS = [
  // ---------------------------------------------------------------- lake, common
  ['rockbass', 'Rock bass', 'lake', 'common', [0.3, 1.4], '#7A6A3A', 0, {}],
  ['pumpkinseed', 'Pumpkinseed', 'lake', 'common', [0.2, 1], '#E08A2A', 0, { belly: '#F2B24A', pattern: 'spots' }],
  ['greensunfish', 'Green sunfish', 'lake', 'common', [0.2, 0.9], '#5E8A4A', 0, {}],
  ['redear', 'Redear sunfish', 'lake', 'common', [0.4, 2.2], '#C9B04A', 0, {}],
  ['warmouth', 'Warmouth', 'lake', 'common', [0.3, 1.3], '#6A5A3A', 0, { pattern: 'bars' }],
  ['whiteperch', 'White perch', 'lake', 'common', [0.3, 1.5], '#B8C0B8', 0, {}],
  ['bullhead', 'Brown bullhead', 'lake', 'common', [0.4, 2.6], '#5A4A38', 1, { prop: [1.2, 0.9, 1] }],
  ['yellowbullhead', 'Yellow bullhead', 'lake', 'common', [0.4, 2.4], '#B89A48', 1, { prop: [1.2, 0.9, 1] }],
  ['sucker', 'White sucker', 'lake', 'common', [0.6, 4], '#9A8A78', 1, {}],
  ['shiner', 'Golden shiner', 'lake', 'common', [0.05, 0.4], '#D8B848', 1, {}],
  ['fallfish', 'Fallfish', 'lake', 'common', [0.3, 2], '#A8B0B0', 1, {}],
  ['creekchub', 'Creek chub', 'lake', 'common', [0.1, 0.8], '#8A8A6A', 1, {}],
  ['spottail', 'Spottail shiner', 'lake', 'common', [0.05, 0.3], '#C0C8C8', 1, {}],
  ['killifish', 'Banded killifish', 'lake', 'common', [0.02, 0.15], '#A8B888', 1, { pattern: 'bars' }],
  ['smelt', 'Rainbow smelt', 'lake', 'common', [0.05, 0.4], '#D0D8D8', 1, {}],
  // ---------------------------------------------------------------- lake, uncommon
  ['largemouth', 'Largemouth bass', 'lake', 'uncommon', [1, 10], '#5E7A3A', 1, { pattern: 'stripe', hint: 'Leeches and minnows.' }],
  ['whitecrappie', 'White crappie', 'lake', 'uncommon', [0.5, 3], '#D0D4C0', 0, { pattern: 'bars' }],
  ['rainbow', 'Rainbow trout', 'lake', 'uncommon', [0.6, 9], '#C8A0A0', 1, { golden: 1.8, pattern: 'spots', hint: 'Best at dawn and dusk.' }],
  ['browntrout', 'Brown trout', 'lake', 'uncommon', [0.8, 14], '#8A6A3A', 1, { golden: 1.8, pattern: 'spots', hint: 'Best at dawn and dusk.' }],
  ['brooktrout', 'Brook trout', 'lake', 'uncommon', [0.4, 5], '#6A7A4A', 1, { golden: 1.8, pattern: 'spots', fin: '#E0642A', hint: 'Best at dawn and dusk.' }],
  ['carp', 'Common carp', 'lake', 'uncommon', [2, 30], '#B89A4A', 1, { prop: [1.15, 1.1, 1.05] }],
  ['sauger', 'Sauger', 'lake', 'uncommon', [0.8, 6], '#A89A6A', 1, { golden: 2, pattern: 'bars', hint: 'Best at dawn and dusk.' }],
  ['drum', 'Freshwater drum', 'lake', 'uncommon', [1, 25], '#A8A8A0', 0, {}],
  ['gar', 'Longnose gar', 'lake', 'uncommon', [3, 20], '#7A8A5A', 1, { prop: [0.7, 0.7, 1.5] }],
  ['bowfin', 'Bowfin', 'lake', 'uncommon', [2, 14], '#5A6A3A', 1, {}],
  ['roundwhitefish', 'Round whitefish', 'lake', 'uncommon', [0.6, 4], '#C8C4B0', 1, {}],
  ['eel', 'American eel', 'lake', 'uncommon', [1, 8], '#4A5A3A', 1, { when: 'night', prop: [0.55, 0.6, 1.9], hint: 'Only after dark.' }],
  ['mooneye', 'Mooneye', 'lake', 'uncommon', [0.4, 2], '#C8D0D8', 0, {}],
  // ---------------------------------------------------------------- lake, rare
  ['tigermuskie', 'Tiger muskie', 'lake', 'rare', [8, 40], '#4E7C4A', 1, { pattern: 'bars', hint: 'Minnows and patience.' }],
  ['cutthroat', 'Cutthroat trout', 'lake', 'rare', [1, 12], '#A08A5A', 1, { pattern: 'spots', fin: '#C03A2A' }],
  ['grayling', 'Arctic grayling', 'lake', 'rare', [0.5, 4], '#8A90A8', 1, { fin: '#6A5AA0' }],
  ['steelhead', 'Steelhead', 'lake', 'rare', [4, 20], '#9AA8B0', 1, { golden: 1.6, hint: 'Best at dawn and dusk.' }],
  ['king', 'Chinook salmon', 'lake', 'rare', [10, 45], '#6A7A88', 1, { golden: 1.6, hint: 'Best at dawn and dusk.' }],
  ['atlantic', 'Atlantic salmon', 'lake', 'rare', [5, 25], '#8A98A8', 1, { golden: 1.6, hint: 'Best at dawn and dusk.' }],
  ['flathead', 'Flathead catfish', 'lake', 'rare', [8, 70], '#7A6A3A', 1, { when: 'night', prop: [1.3, 0.85, 1.15], hint: 'Only after dark.' }],
  ['paddlefish', 'Paddlefish', 'lake', 'rare', [20, 80], '#7A8090', 1, { deep: true, prop: [0.8, 0.8, 1.5], hint: 'Lives in the deep middle.' }],
  ['buffalo', 'Smallmouth buffalo', 'lake', 'rare', [5, 30], '#8A8272', 1, { prop: [1.1, 1.15, 1] }],
  // ---------------------------------------------------------------- lake, epic
  ['bluecat', 'Blue catfish', 'lake', 'epic', [20, 100], '#6A7A8A', 1, { when: 'night', prop: [1.3, 0.9, 1.2], hint: 'Only after dark.' }],
  ['alligatorgar', 'Alligator gar', 'lake', 'epic', [30, 200], '#5A6A3A', 1, { deep: true, prop: [0.85, 0.85, 1.6], hint: 'Deep water, heavy tackle.' }],
  ['whitesturgeon', 'White sturgeon', 'lake', 'epic', [50, 300], '#7E7A6E', 1, { deep: true, prop: [0.95, 0.75, 1.5], hint: 'A dinosaur in the deep middle.' }],
  ['taimen', 'Siberian taimen', 'lake', 'epic', [20, 90], '#8A6A4A', 1, { fin: '#C0402A' }],
  ['beluga', 'Beluga sturgeon', 'lake', 'epic', [100, 400], '#5A5A60', 1, { deep: true, prop: [1, 0.8, 1.6], hint: 'Almost never seen.' }],
  // ---------------------------------------------------------------- lake, legendary
  ['albinocat', 'Albino catfish', 'lake', 'legendary', [20, 60], '#F0E8E0', 1, { when: 'night', prop: [1.3, 0.9, 1.15], hint: 'Pale as a ghost, after dark.' }],
  ['goldenkoi', 'Golden koi', 'lake', 'legendary', [5, 20], '#F2A21A', 1, { golden: 2, hint: 'Golden hour, golden spoon.' }],
  ['ghostpike', 'Ghost pike', 'lake', 'legendary', [15, 45], '#B8D0D8', 1, { when: 'night', prop: [0.8, 0.8, 1.35], hint: 'Seen only on moonlit water.' }],
  // ---------------------------------------------------------------- ocean, common
  ['atlcod', 'Atlantic cod', 'ocean', 'common', [2, 40], '#8A7A5A', 1, {}],
  ['haddock', 'Haddock', 'ocean', 'common', [1, 14], '#9A9088', 1, {}],
  ['pollock', 'Pollock', 'ocean', 'common', [2, 20], '#5A6A58', 1, {}],
  ['atlherring', 'Atlantic herring', 'ocean', 'common', [0.2, 1.5], '#A8B8C8', 1, {}],
  ['mackerel', 'Atlantic mackerel', 'ocean', 'common', [0.5, 4], '#4A7A88', 1, { pattern: 'bars' }],
  ['sardine', 'Sardine', 'ocean', 'common', [0.1, 0.6], '#B8C4D0', 1, {}],
  ['anchovy', 'Anchovy', 'ocean', 'common', [0.02, 0.2], '#A0B0B8', 1, {}],
  ['capelin', 'Capelin', 'ocean', 'common', [0.05, 0.4], '#C0CCC4', 1, {}],
  ['sandlance', 'Sand lance', 'ocean', 'common', [0.05, 0.4], '#C8C8A8', 1, { prop: [0.6, 0.6, 1.4] }],
  ['winterflounder', 'Winter flounder', 'ocean', 'common', [0.5, 5], '#7A6A50', 0, { prop: [1.5, 0.45, 1] }],
  ['fluke', 'Summer flounder', 'ocean', 'common', [1, 15], '#8A7A5A', 0, { prop: [1.5, 0.45, 1.1] }],
  ['sole', 'Lemon sole', 'ocean', 'common', [0.6, 4], '#B8A078', 0, { prop: [1.5, 0.45, 1] }],
  ['scup', 'Scup', 'ocean', 'common', [0.5, 4], '#8A8E98', 0, {}],
  ['tautog', 'Tautog', 'ocean', 'common', [1, 15], '#4A4A4E', 0, { prop: [1.1, 1, 1] }],
  ['seabass', 'Black sea bass', 'ocean', 'common', [0.8, 8], '#3A3A42', 0, {}],
  ['hake', 'Silver hake', 'ocean', 'common', [0.5, 4], '#B0B8C0', 1, {}],
  ['searobin', 'Northern sea robin', 'ocean', 'common', [0.5, 3], '#B86A4A', 0, { fin: '#3A6AA0' }],
  // ---------------------------------------------------------------- ocean, uncommon
  ['stripedbass', 'Striped bass', 'ocean', 'uncommon', [5, 50], '#7A8A98', 1, { pattern: 'stripe', golden: 1.8, hint: 'Best at dawn and dusk.' }],
  ['bluefish', 'Bluefish', 'ocean', 'uncommon', [2, 20], '#4A6A88', 1, {}],
  ['weakfish', 'Weakfish', 'ocean', 'uncommon', [1, 12], '#9AA0B0', 1, {}],
  ['reddrum', 'Red drum', 'ocean', 'uncommon', [5, 45], '#B8603A', 1, {}],
  ['blackdrum', 'Black drum', 'ocean', 'uncommon', [5, 70], '#4A4A50', 0, { prop: [1.15, 1.1, 1] }],
  ['sheepshead', 'Sheepshead', 'ocean', 'uncommon', [2, 20], '#8A8A88', 0, { pattern: 'bars' }],
  ['kingmackerel', 'King mackerel', 'ocean', 'uncommon', [5, 50], '#8098A8', 1, {}],
  ['spanish', 'Spanish mackerel', 'ocean', 'uncommon', [1, 10], '#88A0B0', 1, { pattern: 'spots' }],
  ['pompano', 'Pompano', 'ocean', 'uncommon', [1, 6], '#C8D0D8', 0, {}],
  ['amberjack', 'Greater amberjack', 'ocean', 'uncommon', [8, 80], '#8A8A6A', 1, {}],
  ['cobia', 'Cobia', 'ocean', 'uncommon', [10, 100], '#5A5048', 1, { prop: [1.15, 0.85, 1.2] }],
  ['snapper', 'Red snapper', 'ocean', 'uncommon', [2, 30], '#C8483A', 0, {}],
  ['grouper', 'Black grouper', 'ocean', 'uncommon', [5, 90], '#6A5A48', 0, { prop: [1.2, 1.1, 1.1] }],
  ['mahi', 'Mahi-mahi', 'ocean', 'uncommon', [5, 40], '#3AA88A', 1, { fin: '#E8C83A', prop: [0.8, 1.15, 1.1] }],
  ['lionfish', 'Lionfish', 'ocean', 'uncommon', [0.5, 2], '#B8503A', 0, { pattern: 'bars' }],
  // ---------------------------------------------------------------- ocean, rare
  ['wahoo', 'Wahoo', 'ocean', 'rare', [15, 90], '#3A6A98', 1, { pattern: 'bars', prop: [0.75, 0.8, 1.4] }],
  ['yellowfin', 'Yellowfin tuna', 'ocean', 'rare', [20, 200], '#3A5A80', 1, { fin: '#E8C83A', prop: [1.1, 1.05, 1.2] }],
  ['albacore', 'Albacore tuna', 'ocean', 'rare', [15, 60], '#5A7A98', 1, { prop: [1.05, 1, 1.15] }],
  ['skipjack', 'Skipjack tuna', 'ocean', 'rare', [5, 30], '#4A6A90', 1, { pattern: 'stripe' }],
  ['barracuda', 'Great barracuda', 'ocean', 'rare', [5, 60], '#8A98A0', 1, { prop: [0.7, 0.75, 1.45] }],
  ['tarpon', 'Tarpon', 'ocean', 'rare', [30, 200], '#B8C8D0', 1, { prop: [0.8, 1.2, 1.3] }],
  ['permit', 'Permit', 'ocean', 'rare', [5, 40], '#C0C8D0', 0, {}],
  ['halibut', 'Atlantic halibut', 'ocean', 'rare', [20, 200], '#6A6250', 0, { prop: [1.7, 0.5, 1.2], deep: true }],
  ['monkfish', 'Monkfish', 'ocean', 'rare', [10, 60], '#5A4A3A', 0, { prop: [1.6, 0.7, 1.1], deep: true }],
  ['moray', 'Moray eel', 'ocean', 'rare', [5, 30], '#6A6A3A', 1, { when: 'night', prop: [0.55, 0.65, 1.9], hint: 'Only after dark.' }],
  ['bonefish', 'Bonefish', 'ocean', 'rare', [3, 15], '#C8D0D0', 1, {}],
  ['dogfish', 'Spiny dogfish', 'ocean', 'rare', [3, 15], '#7A8088', 1, { prop: [0.85, 0.85, 1.4] }],
  // ---------------------------------------------------------------- ocean, epic
  ['mako', 'Shortfin mako', 'ocean', 'epic', [100, 600], '#3A5A8A', 1, { prop: [1.1, 1.15, 1.7], hint: 'Fast, fierce, and far out.' }],
  ['thresher', 'Thresher shark', 'ocean', 'epic', [150, 800], '#5A6070', 1, { prop: [0.9, 1, 1.9] }],
  ['hammerhead', 'Hammerhead shark', 'ocean', 'epic', [150, 900], '#7A8088', 1, { prop: [1.25, 1.1, 1.7] }],
  ['tigershark', 'Tiger shark', 'ocean', 'epic', [300, 1200], '#6A7078', 1, { pattern: 'bars', prop: [1.3, 1.2, 1.8] }],
  ['bluefin', 'Bluefin tuna', 'ocean', 'epic', [100, 900], '#2A4A7A', 1, { prop: [1.2, 1.15, 1.3] }],
  ['swordfish', 'Swordfish', 'ocean', 'epic', [100, 600], '#5A6878', 1, { prop: [0.85, 0.95, 1.7] }],
  ['bluemarlin', 'Blue marlin', 'ocean', 'epic', [200, 1000], '#2A5A9A', 1, { prop: [0.8, 1, 1.9], fin: '#1A3A6A' }],
  // ---------------------------------------------------------------- ocean, legendary
  ['greatwhite', 'Great white shark', 'ocean', 'legendary', [500, 2000], '#7A8898', 1, { belly: '#F4F4F0', prop: [1.35, 1.3, 1.9], hint: 'The one everyone whispers about.' }],
  ['whaleshark', 'Whale shark', 'ocean', 'legendary', [3000, 9000], '#3A5A7A', 1, { pattern: 'spots', prop: [1.5, 1.1, 2], hint: 'Gentle, and bigger than the boat.' }],
  ['oarfish', 'Oarfish', 'ocean', 'legendary', [100, 500], '#C8D0D8', 1, { deep: true, fin: '#D03A3A', prop: [0.35, 0.9, 2.6], hint: 'The sea serpent from the old stories.' }],
  ['coelacanth', 'Coelacanth', 'ocean', 'legendary', [50, 200], '#3A3A58', 0, { deep: true, hint: 'Supposed to be extinct.' }],
];

module.exports = ROWS.map(([id, name, where, rarity, lbs, color, long, o]) => {
  const r = R[rarity];
  const avg = (lbs[0] + lbs[1]) / 2;
  const base = Math.min(r.cap, Math.max(2, Math.round(r.rf * Math.pow(avg + 1, 0.62))));
  const diff = Math.min(0.98, r.diff + Math.min(0.06, Math.log10(avg + 1) * 0.03));
  const hint = o.hint || (where === 'ocean' ? 'Big water only.' : 'Somewhere in the lake.');
  return { id, name, where, rarity, w: r.w, lbs, diff, base, color, long: !!long, hint, ...o };
});
