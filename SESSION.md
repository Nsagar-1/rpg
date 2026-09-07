# Session — battleground (PlayCanvas prototype)

Last updated: 2026-09-07 (America/Chicago)

## Goal

Build a **web-first game prototype** in PlayCanvas: walk, shoot, damage numbers, training dummies, weapon pickups, bots — same slice as the Unity `battlefield_prod` project, but in the browser. Document the process and codebase here; when the feel is right, reuse **GLB assets** in Unity for the full Fable-scale build.

Reference feel: small-map **Free Fire / TDM training range** — one arena, guns, dummies, host/play later.

## Project

- **Engine repo:** `/Users/sagarneupane/web-engine/engine`
- **Prototype app:** `/Users/sagarneupane/web-engine/engine/prototypes/battleground`
- **Unity counterpart:** `/Users/sagarneupane/Desktop/Khelmela-BG/battlefild_prod`
- **Stack:** PlayCanvas Engine (local build), Vite, Ammo.js physics, ES modules

## This session (2026-09-07)

> Overwrite this block at the end of each working session. One-liners from here can be copied into **Log** below when the session closes.

### What we set out to do

- Put **X Bot** in the match (not Long Gorn) with Mixamo locomotion, then fix the Desert Eagle grip, per-gun holds, fists-only, and a normal unarmed rest.

### Shipped this session

| Area | What landed |
|------|-------------|
| Default player | `DEFAULT_PLAYER_ID = x-bot-jump-backward`. `?player=` writes `localStorage` (`battleground.playerId`) |
| In-game loco | `XBOT_LOCO_URLS` — rifle idle / walk / turn / firing-walk run + `jump-backward.glb`. Loaded in `main.mjs`, merged in `createSoldierRig` |
| Mixamo bones | `player-model.mjs` prefers `mixamorig:*`; pins `mixamorig:Hips`. Walk unless `speed > 36`, then run |
| Per-gun grip | `modelHand` on each weapon in `weapon-data.mjs`. `gun-assets` `hand` mode. Recoil stays on the view root |
| Fists | **3** / ✊ holsters (inventory kept). **G** drops the held gun, including the last. **G** again on fists dumps the rest. `fistMult` 1.35 when unarmed |
| Unarmed pose | Same loco clips; arms overwritten to a side hang (Mixamo T-pose roll). Capoeira / strafe / ring-jog fist clips removed — they looked like a dance |

### What broke / felt wrong

| Symptom | Cause (root) |
|---------|----------------|
| Long Gorn still spawned without `?player=` | `localStorage` still had `long-gorn` and beat the new default |
| Desert Eagle at the hip / stomach | Shared CC gun socket. Mixamo `+Z` is out the back of the hand (into the body). Pickup `modelWorld` is not a palm grip |
| Fists still in a rifle hold | Loco clips are all rifle. Holster hid the mesh but not the arm pose |
| Capoeira “rest” looked funny | `fist-stand` was Capoeira Idle, plus a pitch-down arm hang from T-pose |

### Fixes this session

| Fix | Where |
|-----|--------|
| Mixamo palm socket `(-90, 90, 90)` + `modelHand` per gun | `player-model.mjs`, `weapon-data.mjs`, `gun-assets.mjs`, `weapon-controller.mjs` |
| `holstered`; `dropActive` returns an array; HUD ✊ slot | `weapon-controller.mjs`, `pickups.mjs`, `hud.mjs`, `desktop-controls.mjs` |
| Unarmed: hide `gun-anchor`, hang arms at the sides, swing only while moving | `player-model.mjs` (`state.unarmed` from `main.mjs`) |
| Ground speed 52 → 64 (file may now read 80 if tweaked in the editor) | `player-controller.mjs` |

### Left open / not done this session

- Mixamo clips are **not** bound to Long Horn (CC vs `mixamorig`). Retarget later if we want them in-game.
- No dedicated unarmed idle / jog clip — rest is rifle-idle legs + procedural arms. A real Mixamo standing idle would read better.
- Gun `modelHand` values are first-pass; Desert Eagle / rifles still need eye-tuning in the palm.
- Run clip is “firing while walking”, not a true sprint.
- Real scout drone / backpack inventory UI.
- Multiplayer squad filling slots 2–4.


## How to run

```bash
# Once per engine clone (if build/ missing)
cd /Users/sagarneupane/web-engine/engine
npm install && npm run build

# Prototype dev server
cd prototypes/battleground
npm install
npx vite
```

Open **http://localhost:5560/** (port set in `vite.config.mjs`). If that port is taken, Vite uses **5561**. Inspect: `/inspect.html?asset=long-gorn` or `/inspect.html?asset=x-bot-jump-backward` (X Bot + Mixamo clip dropdown). Mixamo HTML filter: `/mixamo-filter.html`.

Optional URL flags:

- `?touch=1` — force on-screen controls on the start screen
- `?touch=0` — force keyboard + mouse

### Asset pipeline (guns)

Source FBX files live under `asset/LowPolyGunAssets/GunAssets/`. Convert to GLB once (or after adding new guns):

```bash
npm run convert-guns
```

Output: `public/assets/models/guns/*.glb`

### Asset pipeline (Mixamo motions)

Clips are Mixamo **without skin**, retargeted to the Mixamo character used at export (`character_id` in the download script). They play on **X Bot** in inspect (`mixamorig:*` bones). Long Horn is a different rig — do not assign these clips to it without retargeting.

```bash
# Token from Mixamo (DevTools → export request → Authorization: Bearer …). Do not commit it.
export MIXAMO_TOKEN='…'
node scripts/download-mixamo-motions.mjs
node scripts/convert-mixamo-motions.mjs
```

Add new ids to `src/mixamo-catalog.mjs`, then re-run download + convert. Paste Mixamo grid HTML into `/mixamo-filter.html` to pull ids.

Output: `public/assets/charcter/motion/<id>-<slug>.fbx` and `.glb`

## Controls

### Desktop (keyboard + mouse)

| Input | Action |
|-------|--------|
| Tap **TAP TO PLAY** | Start match |
| Click canvas | Pointer lock + look |
| WASD / arrows | Move |
| Mouse | Look |
| LMB / F | Fire |
| RMB | Aim down sights |
| R | Reload |
| E | Pick up nearby item |
| G | Drop held weapon (last gun too). On fists: dump every remaining gun |
| Q / scroll wheel | Cycle weapon (then fists) |
| 1 / 2 | Select weapon slot |
| 3 / ✊ slot | Fists — holster guns, faster run |
| Space | Jump |
| Shift | Sprint |
| C / Ctrl | Crouch (toggle) |
| `` ` `` / F3 | **Dev panel** |

### Mobile / touch

Enable **On-screen controls** on the start screen (auto-checked on coarse-pointer devices).

| Input | Action |
|-------|--------|
| Left zone / joystick | Move (fixed anchor; drag direction = walk) |
| Swipe anywhere else | Camera look |
| Fire button | Shoot; drag while held to aim |
| ADS | Toggle aim |
| Jump / Crouch / Reload / Swap / AUTO | Action buttons |
| ⚙ | **Layout editor** — drag and resize controls; saved to `localStorage` (`battleground.touchLayout.v1`) |

Pinch-zoom and double-tap zoom are blocked while touch mode is active.

## What works now

- [x] **Abandoned factory map** — `factory.glb` with mesh static colliders (`src/map/factory-map.mjs`, 50× scale)
- [x] **Unified input** — `InputState` shared by desktop + touch (`src/input/`)
- [x] **PlayerController** — physics third-person walk, jump, crouch, sprint, ADS, health, respawn, recoil recovery; XZ lock on release
- [x] **X Bot player** — default body (`x-bot-jump-backward.glb` + Mixamo loco). Long Horn still playable via inspect **Use in game**
- [x] **Fists** — holster (3) or drop (G); unarmed rest = arms at sides; `fistMult` 1.35
- [x] **Per-gun third-person grip** — `modelHand` (pistol / SMG / rifle / shotgun / sniper)
- [x] **Weapon system** — 5 weapons (pistol, SMG, rifle, shotgun, sniper), hitscan, spread, ADS FOV, scope overlay, synth gun audio
- [x] **Low-poly gun GLBs** — FBX → GLB pipeline; view models + world pickup meshes
- [x] **Pickups** — weapons, ammo, medkits on the factory floor (`src/pickups.mjs`)
- [x] **Head/body hitboxes** — `HitBox` multiplier for headshots
- [x] **5 static training dummies** — health, floating damage numbers, respawn
- [x] **3 kinematic bots** — chase, strafe, line-of-sight; **shooting disabled** for now
- [x] **HUD** — health, ammo, weapon slots, crosshair, hitmarker, kill feed, score, pickup prompt, death screen
- [x] **Touch controls** — fixed joystick, swipe-to-look, customizable layout
- [x] **Dev panel** — live stats, event log, teleport, sliders (spawn, gravity, speed, damage)
- [x] **Fall rescue** if player drops far below the map floor (toggle in dev panel)

## Scene layout

| Piece | Notes |
|-------|--------|
| Map | `public/assets/maps/factory.glb` (from `asset/maps/abandoned-factory/source/`) |
| Scale | 50× — authored model is miniature; bounds drive spawn and arena |
| Spawn | Map centre, `floorY + 2` (derived in `factory-map.mjs`) |
| Dummies | 5 static capsule targets at normalized map positions |
| Bots | 3 kinematic humanoids inside arena bounds |
| Pickups | Rifle, SMG, shotgun, sniper + health + ammo scattered on the floor |
| Player start | X Bot + Desert Eagle; **3** holsters to fists. Ground weapons must be picked up |

**Important:** Static colliders must be **positioned before** `rigidbody` is added (Ammo bakes static transforms). Physics backend (`AmmoPhysicsWorld`) is installed **before** entities are built. `app.start()` runs after the full scene; player uses `respawn()` + `teleport()` so the dynamic body wakes on frame one.

**Camera note:** Yaw and pitch both live on the **camera** entity, not the player root. A dynamic rigid body with `angularFactor: Vec3.ZERO` syncs rotation from physics every step and would zero out horizontal look if yaw were applied to the root (matches PlayCanvas `FirstPersonController` pattern).

## Input architecture

```
desktop-controls.mjs ──┐
                       ├──► InputState ──► PlayerController
touch-controls.mjs ──┘              └──► WeaponController
                                      └──► pickups (E / proximity)
```

One-shot actions (fire tap, jump, reload, pickup, weapon switch) use `queue*()` / `take*()` so fast taps are never missed.

## Player animation — how to keep transitions smooth

All of this lives in `src/player-model.mjs`. The rig is clip-driven (`anim` component on the GLB
model node) with a procedural fallback further down the same file for when no clips load.

### The two rules that matter most

**1. Cancel baked root motion.** Every clip in the Tripo pack bakes its travel into the **`Hip`
translation channel** — the run clip walks the hip ~2.8 units along its local Y while the bind value
is `0`. The capsule owns world position, so that travel has nowhere to go: the hip snaps back to the
start of the curve every time the clip wraps, and the player visibly "comes back". Fix is to pin the
root joints to their bind translation every frame, which makes locomotion in-place:

```js
for (const p of pinned) {
    p.bone.setLocalPosition(p.bind);
}
```

`pinned` holds `Root` and the hip bone with their bind local positions captured at load. `Root`
alone is not enough — it is static in this pack (2 keys, no motion), so pinning only `Root` looks
like a fix and changes nothing.

**2. Never scrub the playhead if you want blending.** The anim layer advances by
`dt * anim.speed`, so `anim.speed = 0` also freezes the **transition timer** — no cross-fade can
ever progress and every clip change pops. Play continuously and set the rate instead:

```js
const rate = Math.min(1.8, Math.max(1.4, state.speed / 14) * strideSpan);
model.anim.speed = running && !model.anim.baseLayer.transitioning ? rate : 1;
```

Force `1` while `transitioning` or a slow run rate drags the blend out with it. The run clip is
**two identical strides** (first-vs-mid pose quaternion dot = 0.998), so continuous looping is
seamless and needs no step quantization.

### Blend, don't cut

Use `baseLayer.transition(name, seconds)`, never `baseLayer.play(name)` — `play()` is an instant cut.

| Constant | What it does |
|----------|--------------|
| `BLEND` | Cross-fade seconds per destination clip. Grounded blends are long enough to read (`stand` 0.26, `run` 0.18); air states are short (`jump` 0.1) so they land on the frame the ground check flips |
| `ONE_SHOT` | Clips that hold their last frame instead of looping (`jump`, `dive`) |
| `MIN_DWELL` | 0.12 s minimum in a state before another grounded change is allowed, so jittery input can't restart a blend every frame. Airborne bypasses it — take-off and landing must read immediately |

### There is no idle clip — synthesise one

The pack ships no idle. The `stand` state is the **turn-in-place clip assigned at speed 0**, so it
holds frame 0: a genuine neutral stand with the hip at bind. Stopping cross-fades into it instead of
freezing mid-stride.

```js
model.anim.assignAnimation('stand', standTrack, undefined, 0, true);
```

**Assign `stand` first.** The first `assignAnimation` call builds the default state graph and its
node becomes `defaultState`, which is what makes the player start standing rather than mid-run.

X Bot extra tracks (`XBOT_LOCO_URLS`) overwrite those keys. Mixamo hips are pinned as
`mixamorig:Hips`. On fists (`state.unarmed`), the same clips keep playing for the legs; arm bones
are then set from bind to a side hang (T-pose **roll**, not pitch) so the rifle pose does not stick.

### Anti-jitter details

- **Hysteresis on the move threshold** — enter running at speed `1.8`, leave at `0.9`. A single
  threshold flickers the run/stand blend while capsule velocity hovers around it.
- **One easing law for facing** — `faceYaw += yawErr * (1 - Math.exp(-rate * dt))`, rate 7 while
  turning and 13 otherwise. Swapping to a clamped linear rate when the turn clip engaged put a kink
  in the heading on every state flip.
- **Do not re-snap the feet per frame.** The old per-frame mesh-AABB snap tracked whichever foot was
  lowest and bobbed the whole body each stride. With the hips pinned, the constant `plantY` measured
  from the bind pose is already correct.
- **Keep the capsule hold tolerance loose** — `player-controller.mjs` holds XZ while there is no
  move input; at millimetre tolerance the `teleport()` fought the solver every frame and read as a
  twitch. 3 cm is well above solver noise.

### Checklist when adding a clip

1. Add a keyword to `classifyClip()` so the GLB track maps to a state name.
2. Add a `BLEND` entry (falls back to 0.18) and an `ONE_SHOT` entry if it should not loop.
3. Inspect the new clip's translation channels before trusting it — anything monotonic on `Root`,
   `Hip` or `Pelvis` is baked travel and needs pinning:

```bash
cd public/assets/charcter
node -e 'const fs=require("fs");const b=fs.readFileSync("long_horn_motion_glb.glb");
const n=b.readUInt32LE(12);const j=JSON.parse(b.slice(20,20+n).toString("utf8"));
for(const a of j.animations){const t=new Set();
for(const c of a.channels) if(c.target.path==="translation") t.add(j.nodes[c.target.node].name);
console.log(a.name, [...t].slice(0,4).join(", "));}'
```

### Verify in the browser

`window.battleground` exposes `app`, `player`, `playerScript`, `input`. Confirm the graph built, the
state settles, and the hip never drifts:

```js
let a = null, hip = null;
battleground.player.forEach(e => { if (e.anim) a = e; if (e.name === 'Hip') hip = e; });
console.log(a.anim.baseLayer.states, a.anim.baseLayer.activeState, hip.getLocalPosition().toString());
// ['START','stand','jump','fall','turn','run','dive']  'stand'  [0, 0, 0.5398]
```

`hip.getLocalPosition()` must stay at the bind value `[0, 0, 0.5398]` on every frame, running or
standing. If it moves, root motion is leaking back in.

## Weapons (feel constants)

Single source of truth: `src/weapons/weapon-data.mjs` — intended to port tuning values to Unity.

| Id | Name | Notes |
|----|------|-------|
| `pistol` | Desert Eagle | Sidearm at spawn (`desert-eagle.glb`) |
| `smg` | MP40 SMG | Full auto |
| `rifle` | AR70 Rifle | Default pickup GLB: `ar70` |
| `shotgun` | M870 Shotgun | Multi-pellet |
| `sniper` | AWM Sniper | Scope overlay when aiming |

## Dev panel (` or F3)

| Section | Use |
|---------|-----|
| Status pill | OK / warn / error (falling, no ground, low FPS) |
| Player | Position, velocity, ground raycast, input mode |
| Last shot | Hit entity, point, miss detection |
| Quick fixes | Teleport spawn, reset dummies, release mouse |
| Tweak live | Spawn XYZ, gravity, move speed, weapon damage |
| Event log | Shots, fall rescue, JS errors |

File: `src/debug-panel.mjs`

## Files

| Piece | Path |
|-------|------|
| Entry + scene | `src/main.mjs` |
| Factory map loader | `src/map/factory-map.mjs` |
| Player rig / clips | `src/player-model.mjs` |
| Asset inspect | `inspect.html`, `src/inspect.mjs` |
| Character / clip catalog | `src/character-assets.mjs` |
| Mixamo motion catalog | `src/mixamo-catalog.mjs` |
| Mixamo HTML id filter | `mixamo-filter.html` |
| Mixamo download | `scripts/download-mixamo-motions.mjs` |
| Mixamo FBX → GLB | `scripts/convert-mixamo-motions.mjs` |
| Player movement / look | `src/scripts/player-controller.mjs` |
| Weapon / raycast | `src/scripts/weapon-controller.mjs` |
| Bots | `src/scripts/bot-controller.mjs` |
| Dummy / bot health | `src/scripts/damage-target.mjs` |
| Head hit multiplier | `src/scripts/hit-box.mjs` |
| Input state | `src/input/input-state.mjs` |
| Desktop bindings | `src/input/desktop-controls.mjs` |
| Touch overlay | `src/input/touch-controls.mjs` |
| Touch layout + editor | `src/input/touch-layout.mjs`, `touch-layout-editor.mjs` |
| Weapon tuning table | `src/weapons/weapon-data.mjs` |
| Gun GLB loader | `src/weapons/gun-assets.mjs` |
| Pickups | `src/pickups.mjs` |
| HUD | `src/hud.mjs` |
| Audio synth | `src/audio.mjs` |
| Dev UI | `src/debug-panel.mjs` |
| FBX → GLB script | `scripts/convert-guns.mjs` |
| HTML / HUD CSS | `index.html` |
| Vite config | `vite.config.mjs` |
| Ammo WASM (symlink) | `public/assets/wasm` → `examples/assets/wasm` |

## Assets

| Asset | Path | Purpose |
|-------|------|---------|
| Factory map | `asset/maps/abandoned-factory/source/factory.glb` → `public/assets/maps/factory.glb` | Playable level + mesh colliders |
| Gun FBX source | `asset/LowPolyGunAssets/GunAssets/*/` | Authoring; run `npm run convert-guns` |
| Gun GLBs | `public/assets/models/guns/*.glb` | View models + pickup meshes |
| Desert Eagle | `public/assets/models/guns/desert-eagle.glb` | Starting sidearm |
| Long Horn (play) | `public/assets/charcter/long_horn_motion_glb.glb` | Skinned player + run/turn/jump/fall/dive |
| X Bot (play + inspect) | `public/assets/charcter/x-bot-jump-backward.glb` | Default in-game body; Mixamo host for inspect clips |
| Mixamo motions | `public/assets/charcter/motion/*.fbx` + `*.glb` | 73 no-skin clips; inspect X Bot dropdown |
| Long Gorn FBX | `public/assets/charcter/long_gorn/*.fbx` | Authoring; convert with `fbx2gltf` if replaced |
| Soldier (unused) | `public/assets/models/player/soldier.glb` | Previous body; keep as fallback |
| Sounds | Synth in `src/audio.mjs` | Placeholder; swap for `.ogg` later |

**Export rule:** glTF 2.0 / `.glb` for PlayCanvas **and** later Unity import.

## Known bugs (fixed)

- **Fall through floor on spawn** — `app.start()` was too early; static bodies added before transform. Fixed: build scene first, fall rescue, `teleport()` on spawn.
- **Vite parse error on dev panel** — backtick inside HTML template string. Fixed: `title="Close (backtick key)"`.
- **Wasm 404** — symlink path wrong. Fixed: `public/assets/wasm` → `../../../../examples/assets/wasm`.
- **No mesh colliders / silent physics** — physics world installed too late. Fixed: `createOptions.physicsWorld = new AmmoPhysicsWorld()` before entity creation.
- **Player hung in mid-air after spawn** — dynamic body asleep. Fixed: `respawn()` with `teleport()` + `activate()` after `app.start()`.
- **Horizontal look stuck (touch + desktop)** — yaw on player entity overwritten by dynamic rigid body sync each physics step. Fixed: apply yaw on camera (`setLocalEulerAngles(pitch, yaw, 0)`).
- **Pinch / double-tap zoom during fire** — iOS Safari zoom on rapid taps. Fixed: `touch-action: none`, gesture block, `preventDefault` on overlay touchstart.

## Not built yet

- [ ] Multiplayer (Node + Socket.io / Colyseus)
- [ ] Bot shooting (movement / strafe only today)
- [x] Third-person follow camera + placeholder body
- [x] Character body GLB — X Bot default; Long Horn still in the catalog (`src/player-model.mjs`)
- [ ] Recorded gun / footstep audio assets
- [ ] Unity asset parity doc

## Unity vs PlayCanvas (this effort)

| PlayCanvas (here) | Unity (`battlefield_prod`) |
|-------------------|----------------------------|
| `npx vite` → browser | Play → HOST in Editor |
| GLB map + guns | Prefabs + URP + Akila + Mirror |
| JS gameplay scripts | C# Battleground*.cs |
| Port **assets + feel constants** (`weapon-data.mjs`), not code | Production target for mobile |

## Log

- 2026-09-06 — Cloned/engine explored; examples browser on :5555
- 2026-09-06 — Decided: prototype in PlayCanvas, same GLB later in Unity
- 2026-09-06 — Created `prototypes/battleground` shooting range (FPS, dummies, damage)
- 2026-09-06 — Fixed spawn fall-through (scene order + static collider rules)
- 2026-09-07 — Added dev panel (`/F3), event log, live tweak sliders
- 2026-09-07 — Fixed Vite syntax error (backtick in template literal)
- 2026-09-07 — Created this SESSION.md
- 2026-09-07 — Unified input layer (`InputState`), `PlayerController`, weapon slots, pickups, HUD, bots
- 2026-09-07 — Mobile touch controls: fixed joystick, swipe look, layout editor + localStorage
- 2026-09-07 — Low-poly gun FBX → GLB pipeline; weapon view / pickup models
- 2026-09-07 — Replaced procedural arena with abandoned factory `factory.glb` + mesh colliders
- 2026-09-07 — Fixed horizontal camera look (yaw on camera, not dynamic body root)
- 2026-09-07 — Disabled bot shooting; zoom lock for touch fire button
- 2026-09-07 — Factory map black surfaces: metalness defaulted to 1 (no IBL); dielectric + emissive lift, dropped CAD Edge overlay
- 2026-09-07 — Third-person camera, Free Fire-style HUD/controls, gun in hand
- 2026-09-07 — Soldier GLB as player body (260MB → 20MB via `scripts/shrink-soldier.mjs`); procedural locomotion rig in `src/player-model.mjs` (no animation clips — bones driven from speed/stance); gun socket on `CC_Base_R_Hand`
- 2026-09-07 — Inspect viewer (`inspect.html`); Desert Eagle as spawn pistol
- 2026-09-07 — Long Horn player: FBX → `long-gorn.glb`, then swapped to `long_horn_motion_glb.glb` (run/turn/jump). Face move dir (+180 mesh). Run clip halved (2 steps / L-R quarters). Stop freezes stride + locks capsule XZ (bind restore was sliding the hips back). Capsule 0.58 + CCD + foot plant
- 2026-09-07 — Smoothed player locomotion: pinned `Root` + `Hip` translation to bind (clips bake travel into `Hip` — the "coming back"), swapped playhead scrubbing for continuous playback (`anim.speed = 0` froze the transition timer, so nothing could blend), cross-faded clip changes via `baseLayer.transition()`, added a `stand` state (turn clip at speed 0) for a real stop pose, hysteresis on the move threshold, single easing law for facing, dropped the per-frame foot snap. See **Player animation** section
- 2026-09-07 — Mixamo pack: HTML id filter, download 73 no-skin FBX (`MIXAMO_TOKEN`), convert to GLB, play on inspect **X Bot**. Fixed `mixamo.com` → null `baseLayer.play`. Long Horn not bound (CC vs Mixamo bones)
- 2026-09-07 — X Bot in the match: Mixamo idle/walk/run/turn/jump, hip pin, `?player=` persists. Per-gun `modelHand`. Fists (3 / G) + 1.35× run. Unarmed rest is arms-at-sides (dropped Capoeira idle)
