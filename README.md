# Loon Lake

A multiplayer fishing camp in the browser. Node + Socket.IO server, three.js client, no build step.

Fish for cash, climb through better rods and bait, fill out your journal, and win the derby. Moss sells tackle, a rifle, and some things under the counter. The shack has blackjack and slots. Your progress saves.

## Run

    npm install
    npm start          # http://localhost:3000

`npm install` is required. three.js is now served from `node_modules` instead of a CDN, so the game works on a LAN or offline. Open two browser windows to see multiplayer. A second tab in the same browser joins as a guest so it can't overwrite your save.

## What's in it

- **Fishing.** Hold left click to charge a cast, and a ring on the water shows where it will land (gold means a hot spot, red means it will hit land). Tap when the bobber dunks, then reel: hold left click, ease off before the red line, and press A or D against the direction the fish is pulling.
- **Levels and quests.** Every catch earns XP (more for rare fish, first catches and personal bests). Level up for a cash bonus. Three rolling quests (catch fish, catch uncommon or better, catch on a hot spot) pay cash and XP, then get replaced with a fresh one that scales with your level. Both save with your profile.
- **120 species** across common, uncommon, rare, epic, and legendary, plus junk and treasure: about 60 in the lake and canal and about 60 out in the big water, from bluegill to sturgeon to great white sharks. The ocean and canal have schools of fish you can see swimming. Walleye bite at dawn and dusk. Catfish and eelpout only come out at night. Sturgeon live in the deep middle, so you need a rod that casts far. Press J for the journal.
- **Gear.** Seven rods (longer casts, more line strength, faster reel) and four baits (rarer fish), bought in order from Moss. Three boats (a rowboat, an aluminum skiff, and a sport cruiser), using the Kenney Watercraft models.
- **Guns.** Revolver, Glock 19, hunting rifle, shotgun, SMG, AR pistol, Draco and sniper rifle, each with its own magazine, reload, damage, spread and range. Moss sells attachments: a laser beam (tighter groups and a visible red beam), a drum mag (2.5x the rounds, slower reload), and an auto switch for the Glock and revolver (full auto, fast, sloppy). Shots you aim at the water splash where you aimed instead of flying off into the distance. Damage fades with range, some shots are critical hits, and Moss upgrades each gun from Mk I to Mk V (up to +60% damage). Kills throw the body with force that depends on the gun; casings bounce out and sink in the water; getting shot shoves you.
- **Hot spots.** Bubbling patches that drift around the lake. They bite faster and hold bigger fish. They show as gold rings on the minimap.
- **Day and night.** A full day takes 12 minutes.
- **Derbies.** Every 6 minutes a derby runs for 2.5 minutes. The heaviest fish takes the pot, which grows with each player who weighs in. If you log off, you still get paid.
- **Selling.** Walk up to Moss and press E; the prompt shows what your bag is worth. Tapping the bag slot near Moss sells in one tap. Anywhere else, press P and use the Market app on your phone: a buyer comes to you and keeps 30%.
- **Your phone (P).** Market, a map of the whole area, your boat, messages, a camera that saves a clean screenshot, the journal, and settings.
- **Boats.** Buy one from Moss ($180) or rent for $15 a trip at the end of the dock. Press E at any shoreline to launch, and E near land to step ashore. You can fish and shoot from the boat.
- **The big water.** A channel runs south from the lake past a lighthouse out to open water with real swells. Out there you'll find cisco, whitefish, coho salmon, lake trout, a shipwreck bell, and, if the old-timers are right, Pressie.
- **Fists.** Slot 1, or press F anywhere to throw a punch. Punches alternate hands, and every third punch in a quick combo is a haymaker that does double damage and shoves the target back. Anglers you punch fight back.
- **Combat.** The rifle hits fish, NPC anglers, and players. Lake fish take two rounds; a wounded one bolts and trails blood. Hits spray blood, bodies ragdoll when they drop, and blood pools where they fall. Turn blood off under Help (H). Hold right click to aim over the shoulder for a tighter shot. Camp is a no-shooting zone for players, and you get 5 seconds of protection after spawning. NPCs only fight back when they're shot at.
- **Saves.** Cash, gear, bag, ammo, pocket, and journal save per browser (a token in localStorage) to `data/players.json`.
- **Chat.** Press Enter. Messages also show as speech bubbles.
- **Phones.** Use the left thumb stick to move and drag on the right side to look. A Punch or Shoot button appears for whatever you're holding, with light aim assist. Tapping Cast switches to your rod automatically. Phones vibrate on bites and hits (Android). Tap Full screen on Android, or on iPhone use Share, then Add to Home Screen, to play without the browser bars. The layout works in portrait and landscape.
- **Characters.** Real rigged, animated people that idle, walk, run, punch, and fall down. On the license you pick one of four looks, a skin tone, and a shirt color, and your choices save.
- **Graphics.** Hills around the lake, wind-blown grass, birches, maples with some fall color, bushes, low-poly rocks, a red barn for the shack, rowboats at the dock, a well and fence at camp, animated fish, drifting clouds, and glow on firelight, lanterns, and sun glints. Help (H) has a Graphics setting. Auto picks High on computers and Low on phones.
- **Settings.** Press H for controls, look speed, volume, invert Y, and camera shake.

## Controls

WASD to walk, Shift to run. Click the game to lock the mouse, Esc to release it.

- **Left click** uses whatever is in your hands: cast and reel with the rod, fire a gun (hold for full auto on the SMG), punch with fists, or take a drug.
- **Right click** (hold) zooms. With a gun out it aims down the sights, and you can still shoot while zoomed.
- **Space** jumps. Hold it to bunny hop. Movement is velocity-based like Half-Life: ground friction, capped air acceleration, and a 1.7x speed cap on takeoff, so turning your view while strafing (A or D plus a mouse turn) in the air builds speed.
- **R** reloads. Guns have magazines and share a pool of spare rounds.
- **1-0, -, =** or the **scroll wheel** switch hotbar items: fists, rod, bait, then whichever guns you own, then the drugs and your bag. Ctrl + wheel moves the camera.
- **Q** reels your line in. **E** talks to Moss, sits at the shack, or launches/leaves your boat. **F** throws a punch.
- Walk into the water to swim. You can't fish while swimming. Players are solid, so you can't walk through each other.
- **P** phone, **J** journal, **H** help, **Enter** chat.

## Debug commands

Start with `npm run debug` (works in any terminal; or set `LOON_DEBUG=1` yourself) and type these into chat:

- `/cash 500` adds cash.
- `/tp moss`, `/tp shack`, `/tp camp`, `/tp dock`, or `/tp x z` moves you.
- `/hour 22` sets the clock.
- `/derby` starts or ends a derby now.
- `/gear` maxes your rod, bait, and rifle.
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
