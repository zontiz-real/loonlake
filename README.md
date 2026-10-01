# Loon Lake

A multiplayer fishing camp in the browser. Node + Socket.IO server, three.js client, no build step.

Fish for cash, climb through better rods and bait, fill out your journal, and win the derby. Moss sells tackle, a rifle, and some things under the counter. The shack has blackjack and slots. Your progress saves.

## The idea

**The rod makes you money. The gun keeps you alive.**

Fishing is how you find the big money, and guns are how you collect it. Any fish you shoot is a real catch (journal, XP, quests, bag), but shots cost value: extra hits and overkill spoil the fish, so a clean single shot pays nearly full price and a shotgun blast pays little. Only the rod counts in tournaments and earns the first-catch-on-a-rod star. And now and then something huge takes your hook: a **boss**. You can't just reel it in. You shoot it to break its armor and wear it down while you keep tension on the line, then land it for the biggest payouts in the game.

Every seven minutes the lake boils. During a **frenzy** mutant fish leap out of the water and hunt anyone near it, and near the end a boss, The Old One, surfaces. It's also the richest time to fish: bites come almost at once and every catch is worth two and a half times as much. The best money in the game is reeling in fish while something is trying to eat you, so fish with a friend who guards you, or do both yourself.

## Run

    npm install
    npm start          # http://localhost:3000

`npm install` is required. three.js is now served from `node_modules` instead of a CDN, so the game works on a LAN or offline. Open two browser windows to see multiplayer. A second tab in the same browser joins as a guest so it can't overwrite your save.

## What's in it

- **Fishing.** Hold left click to charge a cast, and a ring on the water shows where it will land (gold means a hot spot, red means it will hit land). Tap when the bobber dunks, then reel: hold left click, ease off before the red line, and press A or D against the direction the fish is pulling.
- **Levels and quests.** Every catch earns XP (more for rare fish, first catches and personal bests). Level up for a cash bonus. Three rolling quests (catch fish, catch uncommon or better, catch on a hot spot) pay cash and XP, then get replaced with a fresh one that scales with your level. Both save with your profile.
- **120 species** across common, uncommon, rare, epic, and legendary, plus junk and treasure: about 60 in the lake and canal and about 60 out in the big water, from bluegill to sturgeon to great white sharks. The ocean and canal have schools of fish you can see swimming. Walleye bite at dawn and dusk. Catfish and eelpout only come out at night. Sturgeon live in the deep middle, so you need a rod that casts far. Press J for the journal.
- **Gear.** Seven rods (longer casts, more line strength, faster reel) and four baits (rarer fish), bought in order from Moss. Three boats (a rowboat, an aluminum skiff, and a sport cruiser), using the Kenney Watercraft models.
- **Guns.** Revolver, Glock 19, Desert Eagle, hunting rifle, shotgun, double-barrel, SMG, AR pistol, Draco, M4, M249, crossbow and sniper rifle, each with its own magazine, reload, damage, spread and range. Moss sells attachments: a laser beam (tighter groups and a visible red beam), a drum mag (2.5x the rounds, slower reload), and an auto switch for the Glock and revolver (full auto, fast, sloppy). Shots you aim at the water splash where you aimed instead of flying off into the distance. Damage fades with range, some shots are critical hits, and Moss upgrades each gun from Mk I to Mk V (up to +60% damage). Kills throw the body with force that depends on the gun; casings bounce out and sink in the water; getting shot shoves you.
- **Seeing fish.** About 40 fish swim the lake and 16 the canal, just under the surface. Each one casts a dark shape on the water, and uncommon, rare, epic and legendary fish have a pulsing ring in their rarity color. Dropped loot has a column of light over it (gold for cash, blue for fish, green for drugs).
- **The frenzy.** About every seven minutes, for almost two minutes. Leapers (fast, weak), snappers and gulpers (big, slow, hit hard) come out of the water near players, leap ashore and flop after you; they won't go near the campfire. They drop ammo and health, so the fight pays for itself. Hurt one badly and it staggers belly up, glowing orange: finish it with the knife to **gut it** for double bounty, double loot and 25 health. Kills close together call out DOUBLE KILL, TRIPLE KILL and up. Seventy seconds in, **The Old One** surfaces in the middle of the lake and hurls itself at whoever is on the shore; everyone who hurt it shares a $1,200 bounty by damage done. The top three scorers (kills and catches) get $400, $200 and $100. If a mutant kills you, you keep your cash but it eats half your bag.
- **Shooting fish.** A shot fish goes into your bag as a normal catch: journal entry, XP, quests, streak. It sells for its weight-based value minus spoilage: each extra hit costs 12% and overkill up to 30%, and floating numbers show the damage and the lost dollars. Gunfire slows bites within about 24 m for 15 seconds outside a frenzy, so shooting is for when you want fish now and fishing is for when you want the best fish.
- **Boss hunts.** Every bite has a chance (more with better bait, hot spots, night and frenzy) to be a boss instead of a fish. Bosses need your rod *and* your gun: shoot to break armor stages (at 66% and 33% health the boss staggers for four seconds), and steady reeling wears it down too. When it is low enough, land it. Everyone who hurt it shares the loot by damage. Each one telegraphs its attacks with a red warning ring before it hits.
  - **Snapjaw** (any rod): a snapping turtle. Lunges and thrashes. About $220.
  - **Piranha Storm** (any rod): a swarm that thins as you shoot it, then the king. About $190.
  - **Gator King** (fiberglass+): death rolls and tail whips, goes under for slack. About $700.
  - **Voltaic Eel** (graphite+): glowing, discharges into everyone nearby. About $650.
  - **Leviathan Sturgeon** (Lunker stick+): armor plates you shoot off row by row; dives, breaches, rams. About $1,500.
  - **The Kraken** (carbon pro, ocean only): tentacle slams, blots the screen with ink. About $4,000.
- **Hot spots.** Bubbling patches that drift around the lake. They bite faster and hold bigger fish. They show as gold rings on the minimap.
- **Day and night.** A full day takes 12 minutes.
- **Weather.** Clear spells, clouds, rain and thunderstorms roll through on their own. Rain streaks down and dimples the water, the sky greys and the fog closes in, storms bring forked lightning bolts (with thunder that arrives after the flash, later the farther away it struck), and fish bite sooner in the wet. The clock line shows the weather. Debug: `/weather clear|cloudy|rain|storm`.
- **Tournaments.** Every 6 minutes a 2.5 minute tournament runs, and the goal rotates: heaviest single fish, most fish, most total weight, or rarest catch. The pot grows with each player who weighs in and is split 60/25/15 between the top three (plus bonus XP). A live board shows the top three and your own rank, and you still get paid if you log off. Junk and treasure don't count.
- **Inventory.** Press I or Tab (or click the bag slot). The Bag tab shows every fish as its own card with rarity, weight and value: sort them, lock the ones you want to keep, sell or release them one at a time, or sell everything unlocked at once. The Gear tab shows your rod, bait, bag, boat and every gun with its level and attachments, and lets you pick one up. The Items tab holds your pocket items and spare ammo. Moss sells bigger bags (16, 24, 36, then 50 fish).
- **Selling.** Walk up to Moss and press E, or sell from the inventory; at Moss you get full price. Anywhere else, use the inventory or the Market app on your phone (P): a buyer comes to you and keeps 30%. Locked fish are never sold in bulk.
- **Bags.** You start with a wicker creel that holds 16 fish. Moss sells a tackle backpack (24, $150), a cooler (36, $450), a live well (50, $1,100) and an ice chest (75, $2,400).
- **Catch streaks.** Land fish back to back, each within 90 seconds of the last, and every fish sells for 10% more per catch in the streak, up to double. The streak and its timer show under your bag.
- **Your phone (P).** Market, a map of the whole area, your boat, messages, a camera that saves a clean screenshot, the journal, and settings.
- **Boats.** Buy one from Moss ($180) or rent for $15 a trip at the end of the dock. Press E at any shoreline to launch, and E near land to step ashore. You can fish and shoot from the boat.
- **The big water.** A channel runs south from the lake past a lighthouse out to open water with real swells. Out there you'll find cisco, whitefish, coho salmon, lake trout, a shipwreck bell, and, if the old-timers are right, Pressie.
- **Knife.** Slot 2, free for everyone. Left click slashes (the swings alternate sides), right click is a slow heavy stab, and hitting someone from behind is a backstab that does more than double damage. It draws with a CS:GO-style flip, and **Y** plays a long inspect twirl.
- **Animations.** Reloads are per gun: the glock and rifles drop the magazine and rack the slide, the revolver opens its cylinder, the shotgun loads shells and pumps, the bolt guns cycle the bolt. Guns and the knife have draw animations and recoil kick, and **Y** inspects your gun. Other players see all of it. The body animates too: swim strokes, rowing, cranking the reel, holding up a catch, drinking or smoking, flinching when hurt, a falling death, and a sprint lean.
- **Fists.** Slot 1, or press F anywhere to throw a punch. Punches alternate hands, and every third punch in a quick combo is a haymaker that does double damage and shoves the target back. Anglers you punch fight back.
- **Knife.** Everyone carries a hunting knife in slot 2. A slash does 38 damage; stab someone from behind and it's 95.
- **More guns.** Besides the revolver, Glock, AR pistol, SMG, Draco, shotgun, hunting rifle and sniper, Moss sells a Desert Eagle (52 a shot), a double-barrel (two shells of 10 pellets), an M4 carbine (accurate full auto, takes a drum and laser), an M249 LMG (a 100-round belt, long reload), and a crossbow (75 a bolt, one at a time, and silent: nobody hears it).
- **Smarter NPCs.** Anglers hear gunshots within about 45 m, stop fishing and walk over to look; if they catch you near it with a gun out they tell you to drop it and open fire. Shoot one and nearby anglers come to help. In a fight they keep 8–20 m away and strafe, fire in bursts, reload, and pull a knife if you get close. Their aim is good against someone standing still and poor against someone moving fast, and improves the longer they track you. Badly hurt, they run for it once, then come back. They search where they last saw you, head home when they give up, and heal slowly once it's quiet.
- **Combat.** The rifle hits fish, NPC anglers, and players. Lake fish take two rounds; a wounded one bolts and trails blood. Hits spray blood and a fine mist, droplets leave splats where they land, badly hurt people drip a trail, bodies ragdoll when they drop, and blood pools where they fall. In first person, getting hit or cutting someone up close puts blood on your screen. Turn blood off under Help (H). Hold right click to aim over the shoulder for a tighter shot. Camp is a no-shooting zone for players, and you get 5 seconds of protection after spawning. NPCs fight back when they're shot at, when they catch you with a gun near gunfire, or when you hurt someone in front of them.
- **Saves.** Cash, gear, bag, ammo, pocket, and journal save per browser (a token in localStorage) to `data/players.json`.
- **Chat.** Press Enter. Messages also show as speech bubbles.
- **Friends.** The Friends app on your phone (P) lists everyone on the lake with their level, catches and distance. Whisper them a private message, or gift $25 (guests can't trade).
- **Emotes.** Z wave, X dance, C cheer, V sit, B point, N laugh. Other players see them and get a speech bubble. Moving, jumping, fishing or fighting ends an emote.
- **Phones.** Use the left thumb stick to move and drag on the right side to look. A Punch or Shoot button appears for whatever you're holding, with light aim assist. Tapping Cast switches to your rod automatically. Phones vibrate on bites and hits (Android). Tap Full screen on Android, or on iPhone use Share, then Add to Home Screen, to play without the browser bars. The layout works in portrait and landscape.
- **Characters.** Pick one of four realistic rigged people (the default), with smooth-shaded skin and hair, glossy eyes and a soft sky-colored rim light, or the Roblox-style Blocky avatar (rounded blocks, hair and a smiley face, with a jump pose and a landing squash). Choose a skin tone and shirt color too. Your choices save.
- **Graphics.** Hills around the lake, wind-blown grass, birches, maples with some fall color, bushes, low-poly rocks, a red barn for the shack, rowboats at the dock, a well and fence at camp, animated fish, sunlit cumulus clouds with high cirrus above them, and glow on firelight, lanterns, and sun glints. Help (H) has a Graphics setting. Auto picks High on computers and Low on phones.
- **Settings.** Press H for controls, look speed, volume, brightness, field of view, invert Y, and camera shake.

## Controls

WASD to walk, Shift to run. Click the game to lock the mouse, Esc to release it. You play in first person; **V** switches to third person and back. You can walk out past the lake and up into the hills, about 200 m in any direction.

- **Left click** uses whatever is in your hands: cast and reel with the rod, fire a gun (hold for full auto on the SMG), punch with fists, or take a drug.
- **Right click** (hold) zooms. With a gun out it aims down the sights, and you can still shoot while zoomed.
- **Space** jumps (about 1.5 m, hold it longer for a higher hop). Jumping is real: hop onto rocks, the fire benches, barrels, the beached boat, and the crate staircase behind Moss's stand (0.6 m, 1.1 m, then 1.6 m). Low things you can step onto; taller ones you have to jump. Walk off an edge and you fall. Movement is Roblox-style: you reach full speed almost instantly, stop just as fast, and steer freely in the air. Hold Space to keep hopping, and each hop you land right into adds speed (up to +35%) until you stop.
- **R** reloads. Guns have magazines and share a pool of spare rounds.
- **1-0, -, =** or the **scroll wheel** switch hotbar items: fists, knife, rod, bait, then whichever guns you own, then the drugs and your bag. Ctrl + wheel moves the camera.
- **Q** reels your line in. **E** talks to Moss, sits at the shack, or launches/leaves your boat. **F** throws a punch.
- Walk into the water to swim. You can't fish while swimming. Players are solid, so you can't walk through each other.
- **P** phone, **J** journal, **I** or **Tab** inventory, **H** help, **V** first/third person, **Enter** chat.

## Debug commands

Start with `npm run debug` (works in any terminal; or set `LOON_DEBUG=1` yourself) and type these into chat:

- `/cash 500` adds cash.
- `/tp moss`, `/tp shack`, `/tp camp`, `/tp dock`, or `/tp x z` moves you.
- `/hour 22` sets the clock.
- `/derby` starts or ends a tournament now, and `/tmode 1-4` picks the next one (heaviest, most fish, total weight, rarest).
- `/gear` maxes your rod, bait, and rifle.
- `/fish 20` puts 20 random fish in your bag.
- `/boss snapjaw` (or `piranha`, `gator`, `eel`, `leviathan`, `kraken`) makes your next bite that boss.
- `/frenzy` starts or ends a frenzy now; `/frenzy boss` skips to the boss.
- `/fast` makes bites come quickly.
- `/boat` gives you a boat. `/channel` and `/sea` put you in it out on the water.

They're off by default, so players can't cheat on a public server.

## Deploying

Use any host that runs Node and allows WebSockets (Render, Railway, Fly.io, a VPS). Static hosts like Netlify won't work.

Saves go to `./data`, or to `DATA_DIR` if you set it. Free tiers on Render and Railway wipe the disk on every deploy, so attach a persistent disk and point `DATA_DIR` at it if you want saves to survive.

## Credits

The 3D models in `public/models` are by [Quaternius](https://quaternius.com), released as CC0 (public domain). They were converted to GLB and are recolored in code. See `public/models/CREDITS.txt` for the packs used.

## Files

- `server.js` runs everything that matters: movement checks, bites, species rolls, hot spots, derbies, the clock, NPCs, shots, the shop, cards, slots, and saves.
- `public/client.js` holds the camera, input, fishing and reeling, combat, and all of the HUD.
- `public/world.js` builds the sky and day cycle, the water shader, the camp, the forest, and the loons.
- `public/models.js` loads the models, tints characters and fish, and sets up animations and instancing. Fish come in a few model families (sharks, rays, pike, catfish, deep-bodied fish, banded fish, and the two plain fish) and each species picks one.
- `public/fx.js` has particles, ripples, floating numbers, and tracers.
- `public/sfx.js` synthesizes all audio, so there are no sound files.
- `public/touch.js` handles phone controls.
- `public/index.html` and `public/style.css` are the page and the HUD.

## Known limits

- The reel minigame runs on the client, so the server trusts the result (it only enforces a minimum reel time). That's fine for friends. For a public leaderboard, move the tension sim to the server.
- Players pass through each other.
- There is one lake. Socket.IO rooms would make it easy to add more.
