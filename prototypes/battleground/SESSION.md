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

- Switch the prototype to a **third-person** camera and match Free Fire-style controls + HUD.

### Shipped this session

| Area | What landed |
|------|-------------|
| Camera | Over-the-shoulder follow cam, ADS zoom, wall clip |
| Avatar | Primitive hoodie / cap body; gun in the right hand |
| HUD | Minimap, squad strip, match timer, gold, stacked weapons, bottom HP |
| Touch | Sprint, prone, medkit, backpack, scout — layout `v2` |

### What broke / felt wrong

| Symptom | Cause (root) |
|---------|----------------|
| FPS camera hid the character and used a viewmodel glued to the lens | Camera was a child at eye height; no body mesh |

### Fixes this session

| Fix | Where |
|-----|--------|
| Orbit camera from look-at + shoulder offset | `player-controller.mjs` |
| Render-only avatar + `gunAnchor` | `main.mjs`, `weapon-controller.mjs` |
| FF HUD + extra touch buttons | `index.html`, `hud.mjs`, `touch-*.mjs` |

### Left open / not done this session

- Character GLB (hoodie is boxes).
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

Open **http://localhost:5560/** (port set in `vite.config.mjs`).

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
- [x] **PlayerController** — physics FPS walk, jump, crouch, sprint, ADS, health, respawn, recoil recovery
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

## Weapons (feel constants)

Single source of truth: `src/weapons/weapon-data.mjs` — intended to port tuning values to Unity.

| Id | Name | Notes |
|----|------|-------|
| `pistol` | P92 Pistol | Sidearm at spawn |
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
- [ ] Character body GLB (boxes for now)
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
