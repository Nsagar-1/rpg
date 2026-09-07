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

- Drop in the **Long Gorn / Long Horn** Tripo player and drive it with the motion GLB (run, turn, jump). Face the run direction; stop cleanly; stay on the floor and out of walls.

### Shipped this session

| Area | What landed |
|------|-------------|
| Player mesh | `long_horn_motion_glb.glb` (Tripo biped + clips). Source FBX: `public/assets/charcter/long_gorn/*.fbx`. Older `long-gorn.glb` / `soldier.glb` still on disk |
| Inspect | `inspect.html` — orbit viewer; catalog includes Long Gorn, X Bot jump, guns, factory |
| Sidearm | Desert Eagle GLB as starting pistol (`weapon-data.mjs` / `gun-assets.mjs`) |
| Facing | Body faces **move velocity**, not camera. Mesh bind is +Z; PlayCanvas forward is −Z (`faceYaw + 180`) |
| Run clip | Continuous playback, rate tied to ground speed. Clip is two identical strides, so it loops seamlessly (replaced the scrubbed `anim.speed = 0` playhead) |
| Blending | `baseLayer.transition()` cross-fades with per-clip `BLEND` times; `MIN_DWELL` + move-threshold hysteresis stop state flicker |
| Stop | Blends into a `stand` state — the turn clip at speed 0, holding a neutral frame. Capsule XZ locked while no WASD |
| Root motion | `Root` + `Hip` translation pinned to bind every frame, so locomotion is in-place |
| Collision | Capsule radius **0.58**, Ammo CCD, wall probe. Feet snapped to capsule bottom each frame |

### What broke / felt wrong

| Symptom | Cause (root) |
|---------|----------------|
| Ran the opposite way | glTF mesh +Z vs PlayCanvas −Z |
| Floated / clipped buildings | World AABB used spawn height; capsule too small; high speed tunneled walls |
| Froze mid-stride, then punched when idle | Pause without idle; `box_01` was wrongly mapped as idle |
| Player kept "coming back" each stride | Clips bake travel into the **`Hip`** translation channel (run: ~2.8 units along local Y, bind `0`), so the hip snapped back on every wrap. Only `Root` was pinned, and `Root` is static in this pack |
| Every clip change popped | Scrubbing needed `anim.speed = 0`, which also froze the transition timer — the layer advances by `dt * anim.speed`, so no cross-fade could progress |
| Body bobbed while running | Per-frame foot snap took the mesh AABB min, which tracked whichever foot was lowest |

### Fixes this session

| Fix | Where |
|-----|--------|
| Player asset → motion GLB | `main.mjs` |
| Move-facing + 180° mesh offset + foot plant | `src/player-model.mjs` |
| Root-motion pin, cross-faded transitions, `stand` state, facing/threshold smoothing | `src/player-model.mjs` — see **Player animation** below |
| XZ hold on release (3 cm tolerance), wider capsule, wall probe | `player-controller.mjs`, `main.mjs` |
| Inspect catalog | `src/inspect.mjs` |

### Left open / not done this session

- Still no true idle / walk clip in the motion pack. `stand` fakes one from frame 0 of the turn clip
  at speed 0, which reads as neutral but has no breathing motion — a real idle would be better.
- Gun grip on `R_Hand` still approximate (FBX bones are ~100×).
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

Open **http://localhost:5560/** (port set in `vite.config.mjs`). If that port is taken, Vite uses **5561**. Inspect: `/inspect.html?asset=long-gorn` or `/inspect.html?asset=x-bot-jump-backward`.

Optional URL flags:

- `?touch=1` — force on-screen controls on the start screen
- `?touch=0` — force keyboard + mouse

### Asset pipeline (guns)

Source FBX files live under `asset/LowPolyGunAssets/GunAssets/`. Convert to GLB once (or after adding new guns):

```bash
npm run convert-guns
```

Output: `public/assets/models/guns/*.glb`

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
| G | Drop held weapon |
| Q / scroll wheel | Cycle weapon |
| 1 / 2 | Select weapon slot |
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
- [x] **Long Horn player** — motion GLB, step-quantized run, face move dir, foot plant, gun on `R_Hand`
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
| Player start | Sidearm equipped; ground weapons must be picked up |

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
| X Bot jump (inspect) | `public/assets/charcter/X Bot@Jump Backward.fbx` → `x-bot-jump-backward.glb` | Mixamo jump clip; inspect catalog |
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
- [x] Character body GLB — Long Horn motion GLB, step-quantized run (`src/player-model.mjs`)
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
