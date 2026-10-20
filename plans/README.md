# RÉPUBLIQUE: build plan and checklist

The game is a small CoD-style wave shooter that runs in the browser. It's set on a fictional Place de la République in Paris, in daytime, against a masked crew. It's for internal fun only. The goal is a **playable build in about 2.5 hours**: one map, one loop, and enough polish to be fun for 5 minutes. It is not a full game.

This file is the source of truth. After every phase, tick the boxes, add a line to the progress log at the bottom and commit. If the session runs out of context or hits a usage limit, a new session should read only this file and carry on from the first unticked box.

## 0. Rules for whoever builds this

1. **Higgsfield: ask Aman before ANY call**, including cost checks. The default path below uses no Higgsfield at all. The optional upgrades are listed in §4 with estimated costs.
2. **Use free sources first:** procedural or canvas textures, the three.js example models (MIT), and CC0 assets. Blender is not installed. Install it only if Aman asks (§4).
3. **Keep tokens low.**
   - Never read a large upstream file whole. Use curl with `grep -n` or `sed -n` to read only the lines you need.
   - Keep each source file under about 250 lines, so edits stay local and we never need to re-read big files.
   - Write each file once, then use Edit for changes. Don't re-read a file you just wrote.
   - Take one headless screenshot per phase with `/browse`, not a video, and don't take screenshots to check every small change.
   - Use no subagents for code; the code is tightly coupled, so one thread is cheaper. Use a subagent only for a big independent search.
4. **Content:** enemies are ordinary people in black hoodies, balaclavas and ski masks. They carry no signs, flags, slogans, symbols, visible faces or blood.
5. **Git:** commit after each phase. Do **not** add Claude or Anthropic attribution lines to commits (Aman's rule).
6. **Publishing** anywhere (Artifact link, GitHub Pages or Emergent) needs Aman's OK at gate G2.

## 1. Scope

**In:**
- One map: a République-style plaza of about 90 × 90 m, plus one side street you unlock.
- First-person movement: walk, sprint, jump and crouch. A submachine gun to start, a shotgun bought off the wall, and a melee hit.
- Waves of 3 enemy types that rush you and get harder each wave. Points per hit and kill; points buy the shotgun and open the side street.
- Health regenerates. Game over shows a screen with your wave and score and a restart button.
- Heads-up display: wave number, points, ammo, crosshair, hitmarker and damage vignette.
- Synthesised sound for gunshots, hits, footsteps and wave start.
- Desktop Chrome or Edge with mouse and keyboard.

**Out:** multiplayer, mobile, a campaign, menus beyond Start, settings beyond mouse sensitivity, saved progress, perks, the mystery box, grenades and ragdoll physics.

## 2. Tech stack and where each piece comes from

| Piece | Source | License | How we use it |
|---|---|---|---|
| Rendering | three.js r180 from `cdn.jsdelivr.net/npm/three@0.180.0` via an importmap | MIT | No build step, no npm |
| Movement and collisions | three.js `examples/games_fps.html` (495 lines): Octree + Capsule player | MIT | Copy its player and physics block into `player.js`; drop the sphere-throwing part |
| Sky | `three/addons/objects/Sky.js` | MIT | Daytime sky with a low autumn sun |
| Enemy model | three.js `examples/models/gltf/Soldier.glb`, a rigged Mixamo character with Idle, Walk and Run clips (~2 MB) | Ships in the three.js repo; Mixamo characters are royalty-free | Tinted all black; a black head material makes the mask; bat, shield and bottle are attached to the hand bones |
| Wave and economy formulas | `Gauthambinoy20/warzone` `src/game-logic.js` (25 KB, plain functions) | MIT | Grep for the wave-scaling and cash functions only; adapt about 40 lines. Never read its `main.js` (178 KB) |
| Weapon feel reference | `roryford/agentofduty` | MIT | Optional: grep its recoil/ADS constants if our values feel off |
| Enemy chasing | Our own: steer toward the player, push apart from neighbours, and use the Octree for wall sliding | n/a | A navmesh isn't needed on an open plaza |
| Textures | Drawn on canvas at load time: limestone facade with a window grid and balcony lines, zinc roof, paving, graffiti shutters, shop signs | n/a | Zero download size, no credit cost |
| Sound | Our own Web Audio synths: noise burst + filter for gunshots, click for the hitmarker, thumps for footsteps | n/a | No files |
| Hosting | Claude Artifact, a private claude.ai link for internal sharing. Fallback: GitHub Pages | n/a | Static `index.html` + `Soldier.glb` as a published file |

Reference art for matching the look: `../reference/styleboard/` (concepts 05 and 06 are the current direction) and `../reference/characters/` (runner, heavy and thrower sheets).

## 3. File layout (each file under about 250 lines)

```
paris-zombies/
  game/
    index.html     importmap, HUD markup and CSS, start screen
    main.js        boot, render loop, game state (menu / playing / dead)
    player.js      capsule movement, pointer lock, camera bob, health
    weapons.js     SMG and shotgun hitscan, recoil, reload, muzzle flash, procedural gun meshes
    world.js       plaza, buildings, monument, props, colliders into the Octree
    textures.js    canvas texture generators
    enemies.js     Soldier.glb loading and cloning, 3 variants, AI, hit and death
    waves.js       wave spawner, points, wall-buy and door purchases
    hud.js         HUD updates, hitmarker, damage vignette, game-over screen
    audio.js       Web Audio synth sound effects
    assets/Soldier.glb
  plans/README.md  this file
  reference/       footage, styleboard, concepts, character sheets (not shipped)
```

## 4. Artwork plan

**Default path: free, no approval needed.**

| Asset | How we make it | Phase |
|---|---|---|
| Haussmann buildings ring the plaza | Boxes about 18 m tall with a canvas facade texture: cream stone, a 5-floor window grid, a balcony line on floors 2 and 5, shopfront strip at the bottom. A dark-grey sloped mansard roof box on top with dormer bumps and chimney pots | P2 |
| Monument | A stepped cylinder base, a tall plinth, a bronze-coloured stylised figure with a raised arm (capsules), and a lion approximated with boxes. Sits in the centre as cover | P2 |
| Plane trees | A trunk cylinder plus 3 clustered icosahedrons in autumn yellow, instanced (~24) | P2 |
| Metro entrance | A green iron arch from tube geometry, plus a "METRO" sign drawn on canvas | P2 |
| Barricades | Instanced pallet boxes and crowd-barrier frames | P2 |
| Burnt van and car | Dark box bodies, plus additive flame sprites and smoke particles | P2 |
| Smoke columns | 3 billboard particle columns rising behind the rooftops | P2 |
| Shopfronts and shutters | Canvas: yellow "TÉLÉPHONE", red "BOULANGERIE" awning, grey shutters with random-colour graffiti blobs, blue "RUE DES CROISSANTS" street plaque | P2 |
| Ground | Canvas paving texture with damp patches; leaf decals scattered | P2 |
| Guns | Procedural box-and-cylinder SMG and shotgun in matte black and wood | P1 |
| Wall-buy | A glowing chalk outline of a shotgun on the wall (canvas, additive blend), with the price | P4 |
| Enemies | Soldier.glb in black; scaled and given props per variant (runner: bat; heavy: 1.15× size and a corrugated shield plane; thrower: bottle in hand, throws bottles) | P3 |
| Muzzle flash, hit puffs | Sprites drawn on canvas | P1 / P5 |
| Title and game-over screens | HTML/CSS over the canvas: big serif "RÉPUBLIQUE" title, red chalk-style wave number | P4 |

**Optional upgrades: Higgsfield, ask Aman first (gate G1).** Only consider these after P6 is shipped.

| ID | Item | Model | Estimated cost |
|---|---|---|---|
| H1 | Facade texture atlas (stone, windows, shopfronts), 1 image | gpt_image_2_5 | ~0.25 credits |
| H2 | Key art and title card, 1 image | gpt_image_2_5 | ~0.25 credits |
| H3 | 3 enemy 3D models from the character sheets, rigged with a run clip | image_to_3d (Meshy) | **Unknown.** Needs approval just to run the cost check. Each sheet first needs a front-view crop |

**Blender (optional):** not installed. `winget install BlenderFoundation.Blender` is about 400 MB. Only worth it if we want proper modular buildings after the first release.

## 5. Gameplay spec (starting numbers; tune in P6)

**Player**
- 100 HP. Regenerates 25 HP/s after 4 s without taking damage.
- Walk 6 m/s, sprint 9.5 m/s, crouch 3 m/s. Jump as in games_fps.

**Weapons**

| Weapon | Mag / reserve | Fire | Damage | Spread | Reload |
|---|---|---|---|---|---|
| SMG (start) | 30 / 180 | 11 rounds/s, automatic | 22 body, ×2 headshot | Small; grows while firing | 1.8 s |
| Shotgun (wall-buy, 750 pts) | 6 / 36 | 1.2 shots/s | 8 pellets × 14 | Wide | 0.5 s per shell |
| Melee (V) | n/a | n/a | 50 | n/a | 0.6 s cooldown |

- Aiming down sights (right mouse): FOV 75 → 55, spread × 0.4.
- Recoil kicks the camera 0.6–1.2° upward and settles back. Each shot has a screen shake of 0.02.

**Enemies**

| Type | HP | Speed | Attack | Damage | Points | Spawn weight |
|---|---|---|---|---|---|---|
| Runner | 60 | 7.5 m/s | Bat swing within 1.6 m, 1 s cooldown | 20 | 60 | 60% |
| Heavy | 220 | 3.2 m/s | Crowbar within 1.8 m, 1.4 s cooldown; the shield blocks hits from the front ±50° | 35 | 150 | 20% from wave 3 |
| Thrower | 50 | 4.5 m/s | Keeps 12–18 m away and throws a bottle every 2.5 s (a projectile you can dodge) | 15 | 90 | 20% from wave 2 |

- Head hitbox is a sphere at the head bone; headshots do double damage and play a different sound.
- **Waves:** enemy count = 6 + 3 × wave, with at most 14 alive at once. Speed +4% per wave, up to +40%. 6 s break between waves.
- **Spawns:** at the 4 metro entrances and street mouths, never within 15 m of the player and never in view if possible.

**Economy**
- +10 points per hit, +the kill reward per kill, +30 for a headshot kill.
- Opening the side-street barricade costs 1000 and adds 2 more spawn points and more cover.

**Death:** game-over screen showing "Wave N · Score S" and a restart button.

## 6. Phases and checklist

Times are wall-clock targets. Token figures are rough ceilings for that phase.

### P0: Setup (10 min, ~10k tokens)
- [ ] `git init paris-zombies`, add a `.gitignore` that excludes `reference/footage/`
- [ ] Download `Soldier.glb` to `game/assets/`
- [ ] Fetch `games_fps.html` once and save it to scratch; copy only the player and Octree block
- [ ] `index.html` with the importmap (three 0.180.0 + addons), a full-screen canvas, the HUD skeleton and a "Click to play" overlay
- [ ] Serve locally: `npx serve game` or `python -m http.server`. A blank scene renders with no console errors
- [ ] Commit "P0 scaffold"

### P1: Player and gun (30 min, ~35k tokens)
- [ ] `player.js`: pointer lock, WASD, sprint, crouch, jump, Capsule-vs-Octree collision on a test floor
- [ ] `weapons.js`: procedural SMG model fixed to the camera; hitscan raycast; automatic fire; spread; recoil; aiming down sights; reload; muzzle flash sprite
- [ ] `hud.js`: crosshair, ammo, hitmarker (shown on a hit against a test target)
- [ ] `audio.js`: SMG shot, hitmarker click, reload sound
- [ ] Screenshot check; commit "P1 player + SMG"

### P2: République map (35 min, ~40k tokens)
- [ ] `textures.js`: facade, roof, paving, shutter graffiti, shop signs, street plaque
- [ ] `world.js` layout: an 18 m building ring with 4 street gaps; monument in the centre; 2 tree rows; 2 metro entrances; 6 barricade clusters; burnt van and car; smoke columns; the side-street block behind a pallet barricade
- [ ] Daytime Sky + hemisphere light + sun with shadows on a 2048 map; light fog to hide the map edges
- [ ] All solid meshes added to the Octree; check you can't walk through walls
- [ ] Draw calls under 150 (repeated props instanced); screenshot compared with concept 05
- [ ] Commit "P2 map"

### P3: Enemies (35 min, ~40k tokens)
- [ ] `enemies.js`: load the GLB once; clone with `SkeletonUtils.clone`; black material swap; AnimationMixer for Run and Walk
- [ ] 3 variants with props on hand bones (bat, shield, bottle); variant scales
- [ ] AI: chase plus separation; melee attack with telegraphed lunge and swing tween; thrower keeps its distance and throws bottle projectiles that hit the player capsule
- [ ] Damage: hitboxes for body (capsule) and head (sphere); shield blocks from the front; death tween (fall over and sink, then pooled for reuse)
- [ ] Hit puff sprite and a short knockback when shot
- [ ] Commit "P3 enemies"

### P4: Waves, economy, screens (20 min, ~25k tokens)
- [ ] `waves.js`: spawn points, wave scaling, a cap on enemies alive at once, the break timer with a "WAVE N" chalk banner
- [ ] Points; chalk shotgun on the wall, press F to buy; side-street barricade, press F to open (removed from the Octree)
- [ ] Player damage, regeneration, damage vignette, death leading to the game-over screen and restart
- [ ] Start screen: title, controls and a Play button
- [ ] Commit "P4 loop"

### P5: Feel and sound (15 min, ~15k tokens)
- [ ] Separate headshot sound and a bigger hitmarker; "+10 / +60" points pop-ups
- [ ] Footsteps, enemy shouts as filtered noise bursts, wave-start sound, a low heartbeat when below 30 HP
- [ ] View-model sway and bob; field-of-view kick while sprinting
- [ ] Commit "P5 juice"

### P6: Test, tune and ship (20 min, ~25k tokens)
- [ ] `/browse` QA: load the page, start a game, play 2 waves through scripted input, screenshot the HUD; no console errors
- [ ] Performance: steady 60 fps on this laptop with 14 enemies (check with an F3 frame counter)
- [ ] Tune the §5 numbers: wave 1 should be easy, and wave 5 should get tense
- [ ] **Gate G2: ask Aman before publishing.** Then publish `game/index.html` as an Artifact, with the `.js` files and `assets/Soldier.glb` as published files. Test the published link
- [ ] Commit "P6 ship"; update the memory file `project_paris_shooter.md` with the link

**Total: about 2 h 45 min and roughly 190k tokens.** That's within one session. Each phase is a separate commit, so a cut-off loses at most one phase.

## 7. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Soldier.glb has no attack or death clips | Swing and fall animated with tweens in code (already the plan) |
| Black-tinted Soldier looks too much like a soldier | A hood made from a sphere segment attached to the head bone; remove the helmet mesh if it's separate |
| An Artifact can't serve `.glb` | Embed the GLB as base64 inside a `.js` file (~2.7 MB), or fall back to GitHub Pages |
| Octree build is slow with many meshes | Build it only from simplified collider boxes, not the visual meshes |
| Running out of time | Cut in this order: thrower variant, side-street unlock, shotgun, P5 polish. P1 to P4 are the minimum playable game |
| Context or usage limit hit mid-build | Resume from this file's first unticked box; the last commit is always runnable |

## 8. Cost ledger

| Date | Item | Cost |
|---|---|---|
| 2026-10-19 | Apify: 16 footage clips | ~$0.17 |
| 2026-10-19 | Higgsfield: concepts 01–02 (night) | ~0.5 credits |
| 2026-10-20 | Higgsfield: concepts 03–04 (undead horde, day) | ~0.5 credits |
| 2026-10-20 | Higgsfield: concepts 05–06 (masked crew, day) | ~0.5 credits |
| 2026-10-20 | Higgsfield: 3 enemy character sheets | ~0.75 credits |
| | **Build (default path)** | **0** |

## 9. Progress log

- 2026-10-20: Plan written. References, styleboard, concepts and character sheets are done. The build hasn't started.
