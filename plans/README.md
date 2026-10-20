# RÉPUBLIQUE: build plan and checklist

The game is a small CoD-style wave shooter that runs in the browser. It's set on a fictional Place de la République in Paris, in daytime, against a masked crew. It's for internal fun only. The goal is a **playable build in about 2.5–3 hours**: one map, one loop, and enough polish to be fun for 5 minutes. It is not a full game, and it isn't meant to be graphics-heavy.

This file is the source of truth. After every phase, tick the boxes, add a line to the progress log (§9) and commit. If the session runs out of context or hits a usage limit, a new session should read only this file and carry on from the first unticked box.

## 0. Rules for whoever builds this

1. **Higgsfield: ask Aman before ANY call**, including cost checks, and only propose one when it clearly makes the game better. The build path below needs none. Candidate upgrades are listed in §4.3.
2. **Use existing assets first:** MIT or CC0 models from the repos below, Poly Haven CC0 textures, and our own Blender scripts. We don't hand-paint art.
3. **Keep tokens low.**
   - Never read a large upstream file whole. Use curl with `grep -n` or `sed -n` to read only the line ranges listed in §2.
   - Keep each of our files under about 250 lines, so edits stay local.
   - Write each file once, then use Edit for changes. Don't re-read a file you just wrote.
   - Run Blender headless from Python scripts (`blender -b --python`), not through the GUI or an MCP. Scripts are cheaper and repeatable.
   - Take one `/browse` screenshot per phase.
   - Use one subagent only, for the Blender kit (B1), so it runs alongside P1.
4. **Content:** enemies are human protester-style characters, an imitation of the masked black-clad protesters in the footage, not zombies. Their look comes from the Higgsfield character sheets in `reference/characters/` (runner, heavy, thrower). There's no blood.
5. **Git:** commit after each phase. Do **not** add Claude or Anthropic attribution lines to commits.
6. **Publishing** anywhere (Artifact link, GitHub Pages or Emergent) needs Aman's OK at gate G2.

## 1. Scope

**In:**
- One map: a République-style plaza of about 90 × 90 m, plus one side street you unlock.
- First-person movement: walk, sprint, jump and crouch.
- A rifle to start, a shotgun bought off the wall, and a melee hit.
- Waves of 3 enemy types (runner, heavy, thrower) that rush you and get harder each wave.
- Points per hit and kill. Points buy the shotgun and open the side street.
- Health regenerates. Game over shows a screen with your wave and score and a restart button.
- Heads-up display: wave number, points, ammo, crosshair, hitmarker and damage vignette.
- Synthesised sound.
- Desktop Chrome or Edge with mouse and keyboard.

**Out:** multiplayer, mobile, a campaign, settings beyond mouse sensitivity, saved progress, perks, the mystery box, grenades and ragdoll physics.

## 2. Mechanics: which GitHub repo each piece is copied from

Line numbers were checked on 2026-10-20 against the versions noted.

| Mechanic | Repo · file | Exact part | License | Action |
|---|---|---|---|---|
| Player capsule, gravity, jump, wall collisions | [mrdoob/three.js](https://github.com/mrdoob/three.js) r180 · `examples/games_fps.html` | Constants L85–116 (`GRAVITY`, `STEPS_PER_FRAME`, `worldOctree`, `playerCollider`); `playerCollisions()` L197; `updatePlayer()` L223; `getForwardVector()`/`getSideVector()` L352–371; `controls()` L373; `teleportPlayerIfOob()` L453 | MIT | **Copy** into `player.js`; drop the sphere-throwing code (L178, L247–350) |
| Level collision mesh | same file | `worldOctree.fromGraphNode(...)` L420 | MIT | **Copy**: build the Octree from the Blender collider meshes only |
| Recoil kick and recovery | [roryford/agentofduty](https://github.com/roryford/agentofduty) · `src/weapons/WeaponsSystem.js` | Weapon defaults L126–134 (`spread 0.004`, `recoilPitch 0.018`, `recoilYaw 0.006`); recovery L477–483; kick from heat L730–733 | MIT | **Adapt** into `weapons.js` |
| Bullet spread that tightens when aiming | same file | `computeSpreadDirection()` L45; aiming tightens spread L750–752 | MIT | **Copy** |
| Aim-down-sights zoom | same file | FOV blend L585–586 (`adsFov 42`) | MIT | **Adapt** (our hip FOV 75, aimed 50) |
| Weapon bob and sway | same file | L614–621 | MIT | **Copy** |
| Muzzle flash shape | same file | `createMuzzleFlashGeometry()` L80 | MIT | **Copy** |
| Wave size and speed scaling | [Gauthambinoy20/warzone](https://github.com/Gauthambinoy20/warzone) · `src/game-logic.js` | `enemiesPerWave()` L261; `waveSpeedMult()` L266; `HEADSHOT_MULT` L256 | MIT | **Copy**, then retune (§5) |
| New enemy types appearing by wave | same file | `ENEMY_UNLOCK_WAVE` L308; `unlockedEnemyTypes()` L328 | MIT | **Copy** |
| Score per enemy type | same file | `ENEMY_PAYOUT` L337; `enemyPayout()` L350 | MIT | **Copy**, rename the types to runner, heavy, thrower |
| Damage falloff with distance | same file | `calcDamageFalloff()` L246 | MIT | **Copy** |
| Animated enemy cloning | three.js · `addons/utils/SkeletonUtils.js` | `clone()` | MIT | **Use** as-is |
| Enemy chase and attack AI | agentofduty · `src/ai/AiSystem.js` (30 KB, a cover-shooter AI) | Reference only: grep it for steering helpers | MIT | **Write our own**: chase, separation, lunge |
| Buy-off-the-wall prompts, barricade unlocks | [millZach/doom-town-zombies](https://github.com/millZach/doom-town-zombies) | Design reference only | **No license** | **Don't copy code**; reimplement the idea |

Never read `warzone/src/main.js` (178 KB) or whole AI and world files. The table above is all we need.

## 3. File layout (each file under about 250 lines)

```
paris-zombies/
  game/
    index.html     importmap (three 0.180.0 via cdn.jsdelivr.net), HUD markup and CSS, start screen
    main.js        boot, render loop, game state (menu / playing / dead)
    player.js      capsule movement and collisions (from games_fps), pointer lock, health
    weapons.js     rifle and shotgun hitscan, recoil, spread, aiming, bob, muzzle flash (from agentofduty)
    world.js       loads paris_kit.glb, places the map, builds the Octree from colliders
    enemies.js     Soldier.glb clones, 3 variants, AI, hit and death
    waves.js       spawner, scaling and payouts (from warzone), wall-buy and door purchases
    hud.js         HUD, hitmarker, damage vignette, start and game-over screens
    audio.js       Web Audio synth sound effects
    assets/        all .glb models and texture .jpg files (budget: under 12 MB in total)
  blender/
    build_paris_kit.py   headless Blender script; writes game/assets/paris_kit.glb
  plans/README.md  this file
  reference/       footage, styleboard, concepts, character sheets (not shipped)
```

## 4. Artwork plan

### 4.1 Existing assets we reuse (free)

| Asset | Source | License | Size | Use in game |
|---|---|---|---|---|
| `Soldier.glb`: rigged, 49 joints, Idle, Walk, Run and T-pose clips | three.js `examples/models/gltf/` | Ships with three.js (a royalty-free Mixamo character) | 2.2 MB | **Placeholder only.** It reads as an armoured soldier, so it won't be the final enemy |
| Mixamo | Tried first; no matching hoodie character | n/a | n/a | Dropped in favour of H3 |
| `rifle.glb` | agentofduty `public/models/` | MIT | 0.8 MB | The player's starting gun in first person |
| `car.glb` | agentofduty | MIT | 1.1 MB | Burnt car: darkened material plus ember particles |
| `dumpster.glb` | agentofduty | MIT | 0.7 MB | Cover and bins around the square |
| Paving texture: `cobblestone_floor_0X` (1K) | [Poly Haven](https://polyhaven.com) API | CC0 | ~0.5 MB | Plaza ground |
| Wall base texture: plaster or stone (1K) | Poly Haven | CC0 | ~0.5 MB | Base for the Blender facade material |
| Daytime urban sky HDRI (1K) | Poly Haven | CC0 | ~1.5 MB | Sky and lighting. Fallback: three.js `Sky.js` |

### 4.2 Made in Blender (B1, scripted, free)

Blender is installing via winget. The kit script follows the structure of agentofduty's `tools/blender/export_hero_meshes.py` (MIT): clear the scene, build meshes at real-world sizes, assign materials, export a GLB. Everything goes into one `paris_kit.glb` of named nodes, low poly, at most about 3 MB.

| Kit piece | Description | Why Blender beats code-built boxes |
|---|---|---|
| `facade_A`, `facade_B`, `facade_corner` | 6 m Haussmann module, 5 floors: window insets, stone bands, ground-floor shopfront recess | Real depth, so windows and balconies cast shadows |
| `balcony_rail` | Wrought-iron rail, built from geometry or an alpha-cut plane | Without it the buildings don't read as Paris |
| `mansard_roof` | Sloped zinc roof with 3 dormers and chimney pots | Gives the skyline its Paris silhouette |
| `monument` | Stepped base, tall plinth, stylised standing figure with a raised arm, reclining lion | The landmark at the centre of the map, and cover |
| `metro_arch` | Green iron Art Nouveau-style entrance arch with a "METRO" sign | Doubles as the spawn point |
| `lamp_post`, `plane_tree`, `pallet_stack`, `crowd_barrier`, `cafe_table`, `cafe_chair` | Street props | Fill the square and provide cover |
| `shotgun` | Simple pump shotgun | The gun bought off the wall |
| `col_*` | Invisible simple box colliders for each piece | Keeps the Octree fast |

Shop signs ("TÉLÉPHONE", "BOULANGERIE", "RUE DES CROISSANTS") and graffiti shutters are small canvas textures made in `world.js`. They're cheap and editable.

### 4.3 Higgsfield: ask Aman first, and only if it makes the game better

None of these is needed for the first build. Propose one only after P6 if the game looks clearly worse than the concept art.

| ID | Item | Would it improve the game? | Estimated cost |
|---|---|---|---|
| H1 | Facade texture atlas (stone, windows, shopfronts) | Yes, if the Blender facades look flat | ~0.25 credits |
| H2 | Title card and key art for the start screen | Small improvement; nice to have | ~0.25 credits |
| H3 | The 3 enemy models from our character sheets (4 views each, `multi_image_to_3d`, textured, rigged, RunFast clip) | **Chosen** (Aman, 2026-10-20). Mixamo had no matching character. Swing, throw and death are animated in code | **114 credits** (3 × 38), approved and generating |

## 5. Gameplay numbers (starting values; tune in P6)

**Player**
- 100 HP. Regenerates 25 HP/s after 4 s without taking damage.
- Walk 6 m/s, sprint 9.5 m/s, crouch 3 m/s. Gravity and jump as in games_fps.

**Weapons**

| Weapon | Mag / reserve | Fire | Damage | Spread | Reload |
|---|---|---|---|---|---|
| Rifle (start) | 30 / 180 | 10 rounds/s, automatic | 24 body, ×2 headshot | agentofduty base 0.004, growing with heat | 1.8 s |
| Shotgun (wall-buy, 750 pts) | 6 / 36 | 1.2 shots/s | 8 pellets × 14, with falloff | 0.06 | 0.5 s per shell |
| Melee (V) | n/a | n/a | 50 | n/a | 0.6 s cooldown |

Aiming (right mouse): FOV 75 → 50.

**Enemies**

| Type | HP | Speed | Attack | Damage | Points | Appears from |
|---|---|---|---|---|---|---|
| Runner | 60 | 7.5 m/s | Bat swing within 1.6 m, 1 s cooldown | 20 | 60 | Wave 1 |
| Thrower | 50 | 4.5 m/s | Keeps 12–18 m away; throws a bottle every 2.5 s (dodgeable) | 15 | 90 | Wave 2 |
| Heavy | 220 | 3.2 m/s | Crowbar within 1.8 m, 1.4 s cooldown; the shield blocks hits from the front ±50° | 35 | 150 | Wave 3 |

**Waves:** warzone's formula, `enemiesPerWave = floor(4 + 2 × wave)`, with at most 14 alive at once. Speed is `1 + 0.05 × wave`, capped at 1.4. 6 s break between waves.

**Points:** +10 per hit, plus the kill payout. Opening the side street costs 1000.

## 6. Phases and checklist

Times are wall-clock targets. Token figures are rough ceilings for that phase.

### P0: Setup (10 min, ~10k tokens)
- [x] Repo, `.gitignore` (excludes `reference/footage/`)
- [x] Blender 5.2.2 installed
- [x] Copy `Soldier.glb`, `rifle.glb`, `car.glb` and `dumpster.glb` into `game/assets/` (already downloaded to scratch)
- [x] Download the Poly Haven paving and plaster textures and the HDRI at 1K
- [x] `index.html` with the importmap; blank scene; start overlay; served locally with `npx serve game`
- [x] Commit "P0 scaffold"

### B1: Blender Paris kit (45 min, subagent, runs alongside P1, ~40k tokens)
- [ ] `blender/build_paris_kit.py` builds every piece in §4.2 with named nodes plus `col_*` colliders
- [ ] Exports `game/assets/paris_kit.glb` at 3 MB or less; renders a preview PNG for a quick look
- [ ] Commit "B1 Paris kit"

### P1: Player and gun (30 min, ~35k tokens)
- [x] `player.js` from games_fps (§2 rows 1–2) on a test floor
- [x] `weapons.js` with `rifle.glb` attached to the camera; hitscan; recoil, spread, aiming and bob from agentofduty (§2 rows 3–7)
- [x] `hud.js`: crosshair, ammo, hitmarker. `audio.js`: shot, hit and reload synths
- [x] Commit "P1 player + rifle"

### P2: République map (30 min, ~35k tokens)
- [ ] `world.js` places kit pieces: a ring of buildings with 4 street gaps, the monument in the centre, 2 tree rows, 2 metro arches, barricades, cars, dumpsters, café tables, and the side-street block behind pallets
- [ ] Poly Haven paving and HDRI; sun with shadows; light fog; 3 smoke columns; canvas shop signs and graffiti shutters
- [ ] Octree built from `col_*` only; check you can't walk through walls; draw calls under 150
- [ ] Screenshot compared with concept 05; commit "P2 map"

### P3: Enemies (35 min, ~40k tokens)
- [ ] Soldier.glb clones in black with a hood; runner with a bat, heavy with a shield (1.15× size), thrower with a bottle
- [ ] Chase, separation, lunge and swing tween; thrower kites and throws; shield blocks from the front
- [ ] Body and head hitboxes; hit puff; death tween; reuse dead enemies from a pool
- [ ] Commit "P3 enemies"

### P4: Waves, points, screens (20 min, ~25k tokens)
- [ ] `waves.js` using warzone's formulas (§2); spawn points at the metro arches and street gaps, never within 15 m of the player
- [ ] Points; shotgun on the wall (F to buy); side-street unlock (F, removes its collider)
- [ ] Damage, regeneration, vignette; game over and restart; start screen
- [ ] Commit "P4 loop" (**this is the minimum playable game**)

### P5: Feel and sound (15 min, ~15k tokens)
- [ ] Headshot sound, points pop-ups, footsteps, wave-start sound, heartbeat at low health
- [ ] Commit "P5 juice"

### P6: Test, tune and ship (20 min, ~25k tokens)
- [ ] `/browse` QA: start a game, survive 2 waves with scripted input, no console errors, 60 fps with 14 enemies
- [ ] Tune §5: wave 1 easy, wave 5 tense
- [ ] **Gate G2: ask Aman before publishing.** Then publish as a private Artifact link, with the JS and assets as published files, and test the link
- [ ] Commit "P6 ship"; update `project_paris_shooter.md` in memory with the link

**Total: about 2 h 40 min of wall-clock time** (B1 runs alongside P1), **and about 230k tokens.** Each phase ends in a runnable commit, so a cut-off loses at most one phase.

## 7. Risks and fallbacks

| Risk | Fallback |
|---|---|
| Blender install fails or takes too long | Build the kit pieces from three.js shapes in `world.js` (plainer, but it works) |
| Tinted Soldier.glb still reads as a soldier | Hide the visor mesh; a hood from a sphere segment on the head bone; ask about H3 only if it still looks wrong |
| Soldier has no attack or death clips | Swing and fall are code tweens (already the plan) |
| An Artifact can't serve `.glb` files | Embed the models as base64 in a `.js` file, or fall back to GitHub Pages (ask first) |
| Running out of time | Cut in this order: thrower, side street, shotgun, P5 |
| Context or usage limit hit mid-build | Resume from the first unticked box; the last commit always runs |

## 8. Cost ledger

| Date | Item | Cost |
|---|---|---|
| 2026-10-19 | Apify: 16 footage clips | ~$0.17 |
| 2026-10-19/20 | Higgsfield: 6 concept frames + 3 character sheets | ~2.25 credits |
| 2026-10-20 | Higgsfield: 3 enemy 3D models (H3, approved) | 114 credits |
| | **Total so far** | **~116.25 credits + $0.17** |

## 9. Progress log

- 2026-10-20: Plan v2. Each mechanic is mapped to a repo, file and line range, and reused assets are identified (Soldier, rifle, car, dumpster, Poly Haven). The Blender kit is added and the Blender install has started.
- 2026-10-20: P0 and P1 are done. The P2–P4 code is written as well: `world.js` (falls back to boxes until `paris_kit.glb` exists), `enemies.js` (loads `crew.glb`, falling back to Soldier), `waves.js` and the HUD screens. Headless test: boots with no errors, wave 1 spawns, the rifle fires and hits register. Headless runs at about 6 fps (no GPU), so it needs a real-browser test. Waiting on the B1 kit (subagent) and Aman's Mixamo files.
