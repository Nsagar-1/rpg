import {
    AmmoPhysicsWorld,
    AnimComponentSystem,
    AppBase,
    AppOptions,
    Asset,
    CameraComponentSystem,
    CollisionComponentSystem,
    Color,
    ContainerHandler,
    Entity,
    FILLMODE_FILL_WINDOW,
    FOG_LINEAR,
    GamePads,
    Keyboard,
    LightComponentSystem,
    Mouse,
    RESOLUTION_AUTO,
    RenderComponentSystem,
    RigidBodyComponentSystem,
    ScriptComponentSystem,
    ScriptHandler,
    StandardMaterial,
    TextureHandler,
    TouchDevice,
    Vec3,
    WasmModule,
    createGraphicsDevice
} from '../build/playcanvas';

import { setMuted, unlockAudio } from './audio.mjs';
import { createDebugPanel } from './debug-panel.mjs';
import { createHud } from './hud.mjs';
import { InputState } from './input/input-state.mjs';
import { createDesktopControls } from './input/desktop-controls.mjs';
import { createTouchControls } from './input/touch-controls.mjs';
import { createPickupSystem } from './pickups.mjs';
import { createLoginFlow } from './auth/login.mjs';
import { createSoldierRig } from './player-model.mjs';
import { BotController } from './scripts/bot-controller.mjs';
import { DamageTarget } from './scripts/damage-target.mjs';
import { HitBox } from './scripts/hit-box.mjs';
import { PlayerController } from './scripts/player-controller.mjs';
import { WeaponController } from './scripts/weapon-controller.mjs';
import { resolvePlayerAssetUrl } from './character-assets.mjs';
import { createGunAssets } from './weapons/gun-assets.mjs';
import { loadFactoryMap } from './map/factory-map.mjs';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('application-canvas'));
const loginScreen = /** @type {HTMLElement} */ (document.getElementById('login-screen'));
const lobbyScreen = /** @type {HTMLElement} */ (document.getElementById('lobby-screen'));
const touchOpt = /** @type {HTMLInputElement} */ (document.getElementById('opt-touch'));

const SPAWN = new Vec3(0, 2, 10);
const BASE_FOV = 68;

/** @type {{ minX: number, maxX: number, minZ: number, maxZ: number }} */
let ARENA = { minX: -21, maxX: 21, minZ: -27, maxZ: 15 };
let mapFloorY = 0;

WasmModule.setConfig('Ammo', {
    glueUrl: '/assets/wasm/ammo/ammo.wasm.js',
    wasmUrl: '/assets/wasm/ammo/ammo.wasm.wasm',
    fallbackUrl: '/assets/wasm/ammo/ammo.js'
});

await new Promise((resolve) => {
    WasmModule.getInstance('Ammo', () => resolve(true));
});

const device = await createGraphicsDevice(canvas, {
    deviceTypes: ['webgl2', 'webgpu']
});
device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

const createOptions = new AppOptions();
createOptions.graphicsDevice = device;
createOptions.mouse = new Mouse(canvas);
createOptions.touch = new TouchDevice(canvas);
createOptions.gamepads = new GamePads();
createOptions.keyboard = new Keyboard(window);
createOptions.componentSystems = [
    RenderComponentSystem,
    CameraComponentSystem,
    LightComponentSystem,
    AnimComponentSystem,
    ScriptComponentSystem,
    CollisionComponentSystem,
    RigidBodyComponentSystem
];
createOptions.resourceHandlers = [ScriptHandler, TextureHandler, ContainerHandler];

// Install the physics backend up front. Left to auto-detection it only appears at app.start(),
// and every collider built before that would silently end up with no shape and no rigid body.
createOptions.physicsWorld = new AmmoPhysicsWorld();

const app = new AppBase(canvas);
app.init(createOptions);
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);

const resize = () => app.resizeCanvas();
window.addEventListener('resize', resize);
app.on('destroy', () => window.removeEventListener('resize', resize));

app.scene.ambientLight = new Color(0.62, 0.64, 0.68);
app.scene.exposure = 1.35;
app.scene.fog.type = FOG_LINEAR;
app.scene.fog.color.set(0.42, 0.45, 0.5);
app.scene.fog.start = 55;
app.scene.fog.end = 220;

const gunAssets = createGunAssets(app);
await gunAssets.load();
console.info('[Battleground] Gun models loaded');

// Skinned soldier used as the third-person body; primitives stay as the fallback body.
const playerModelUrl = resolvePlayerAssetUrl();
const soldierAsset = new Asset('player-soldier', 'container', { url: playerModelUrl });
console.info('[Battleground] Player model:', playerModelUrl);
app.assets.add(soldierAsset);
await new Promise((resolve) => {
    soldierAsset.once('load', resolve);
    app.assets.load(soldierAsset);
});

const factoryMap = await loadFactoryMap(app);
SPAWN.copy(factoryMap.spawn);
ARENA = factoryMap.arena;
mapFloorY = factoryMap.floorY;

/**
 * @param {number} fx - Normalized X inside the map bounds (0..1).
 * @param {number} fz - Normalized Z inside the map bounds (0..1).
 * @param {number} [yOffset] - Height above the map floor.
 * @returns {number[]} World position [x, y, z].
 */
function mapPosition(fx, fz, yOffset = 0) {
    return [
        ARENA.minX + (ARENA.maxX - ARENA.minX) * fx,
        mapFloorY + yOffset,
        ARENA.minZ + (ARENA.maxZ - ARENA.minZ) * fz
    ];
}

app.systems.rigidbody?.gravity.set(0, -18, 0);

// --- Materials --------------------------------------------------------------

/**
 * @param {number} r - Red.
 * @param {number} g - Green.
 * @param {number} b - Blue.
 * @param {number} [gloss] - Specular gloss.
 * @returns {StandardMaterial} A ready-to-use material.
 */
function createMaterial(r, g, b, gloss = 0.2) {
    const material = new StandardMaterial();
    material.diffuse = new Color(r, g, b);
    material.gloss = gloss;
    material.update();
    return material;
}

const dummyBodyMat = () => createMaterial(0.85, 0.35, 0.25);
const botBodyMat = () => createMaterial(0.82, 0.28, 0.32);
const headMat = createMaterial(0.92, 0.72, 0.58);
const hoodieMat = createMaterial(0.48, 0.5, 0.54);
const shirtMat = createMaterial(0.78, 0.16, 0.14);
const pantsMat = createMaterial(0.4, 0.3, 0.2);
const capMat = createMaterial(0.08, 0.08, 0.09);
const shoeMat = createMaterial(0.1, 0.1, 0.1);

/**
 * @param {string} name - Entity name.
 * @param {Entity} parent - Parent entity.
 * @param {StandardMaterial} material - Mesh material.
 * @param {number[]} pos - Local position.
 * @param {number[]} scale - Local scale.
 * @param {string} [type] - Primitive type.
 * @returns {Entity} The mesh entity.
 */
function addPrim(name, parent, material, pos, scale, type = 'box') {
    const e = new Entity(name);
    parent.addChild(e);
    e.addComponent('render', { type, material });
    e.setLocalPosition(pos[0], pos[1], pos[2]);
    e.setLocalScale(scale[0], scale[1], scale[2]);
    return e;
}

/**
 * Visible third-person body. Uses the soldier GLB with a procedural walk rig when the model
 * loads; falls back to primitive boxes otherwise.
 *
 * @param {Entity} playerEntity - Physics root.
 * @param {Asset|null} soldierAsset - Loaded soldier container asset.
 * @returns {{ visual: Entity, gunAnchor: Entity, pose?: (dt: number, state: any) => void }} Visual, weapon hand, per-frame poser.
 */
function createPlayerAvatar(playerEntity, soldierAsset) {
    const rig = createSoldierRig(app, playerEntity, soldierAsset ?? null);
    if (rig) {
        console.info('[Battleground] Player model active');
        return rig;
    }
    console.warn('[Battleground] Soldier model unavailable — using placeholder boxes');

    const visual = new Entity('visual');
    playerEntity.addChild(visual);
    visual.setLocalPosition(0, -0.9, 0);

    addPrim('hips', visual, pantsMat, [0, 0.78, 0], [0.34, 0.22, 0.2]);
    addPrim('torso', visual, hoodieMat, [0, 1.18, 0], [0.42, 0.52, 0.26]);
    addPrim('shirt', visual, shirtMat, [0, 1.02, 0.04], [0.3, 0.16, 0.22]);
    addPrim('leg-l', visual, pantsMat, [-0.1, 0.4, 0], [0.14, 0.72, 0.16]);
    addPrim('leg-r', visual, pantsMat, [0.1, 0.4, 0], [0.14, 0.72, 0.16]);
    addPrim('shoe-l', visual, shoeMat, [-0.1, 0.06, 0.04], [0.14, 0.1, 0.22]);
    addPrim('shoe-r', visual, shoeMat, [0.1, 0.06, 0.04], [0.14, 0.1, 0.22]);
    addPrim('arm-l', visual, hoodieMat, [-0.3, 1.12, 0], [0.12, 0.48, 0.12]);
    addPrim('arm-r', visual, hoodieMat, [0.3, 1.1, -0.08], [0.12, 0.22, 0.12]);
    addPrim('forearm-r', visual, hoodieMat, [0.34, 0.98, -0.22], [0.11, 0.12, 0.32]);
    addPrim('head', visual, headMat, [0, 1.58, 0], [0.28, 0.28, 0.28], 'sphere');
    addPrim('cap', visual, capMat, [0, 1.7, 0.02], [0.3, 0.1, 0.32], 'sphere');

    const gunAnchor = new Entity('gun-anchor');
    visual.addChild(gunAnchor);
    gunAnchor.setLocalPosition(0.34, 1.18, -0.28);
    gunAnchor.setLocalEulerAngles(-6, 0, 0);

    return { visual, gunAnchor };
}

/** @type {DamageTarget[]} */
const targets = [];

/** @type {Entity[]} */
const botEntities = [];

/**
 * Build a shootable humanoid: capsule body with the health script, plus a head hitbox that scores
 * headshots. Both colliders need a rigid body to show up in raycasts.
 *
 * @param {object} config - Humanoid setup.
 * @param {string} config.label - Display name.
 * @param {number[]} config.position - World position [x, y, z].
 * @param {boolean} [config.mobile] - Kinematic (bot) instead of static (dummy).
 * @param {number} [config.health] - Max health.
 * @param {number} [config.respawnDelay] - Seconds before it comes back.
 * @returns {{ root: Entity, body: Entity }} The root node and the body that carries the health script.
 */
function createHumanoid({ label, position, mobile = false, health = 100, respawnDelay = 4 }) {
    const bodyType = mobile ? 'kinematic' : 'static';

    const root = new Entity(label);
    app.root.addChild(root);
    root.setLocalPosition(position[0], position[1], position[2]);

    const body = new Entity('body');
    root.addChild(body);
    body.setLocalPosition(0, 0.9, 0);
    body.addComponent('render', { type: 'capsule', material: mobile ? botBodyMat() : dummyBodyMat() });
    body.addComponent('collision', { type: 'capsule', radius: 0.42, height: 1.7 });
    body.addComponent('rigidbody', { type: bodyType });
    body.addComponent('script');

    const damage = body.script.create(DamageTarget, {
        properties: { label, maxHealth: health, respawnDelay, scoreValue: mobile ? 150 : 100 }
    });
    targets.push(damage);

    const head = new Entity('head');
    root.addChild(head);
    head.setLocalPosition(0, 1.78, 0);
    head.setLocalScale(0.36, 0.36, 0.36);
    head.addComponent('render', { type: 'sphere', material: headMat });
    // Slightly generous versus the 0.18 m visual radius so headshots stay achievable.
    head.addComponent('collision', { type: 'sphere', radius: 0.22 });
    head.addComponent('rigidbody', { type: bodyType });
    head.addComponent('script');
    head.script.create(HitBox, { properties: { owner: body, zone: 'head', multiplier: 2 } });

    return { root, body };
}

// Static practice dummies scattered through the factory floor.
const dummySpots = [[0.28, 0.42], [0.42, 0.36], [0.58, 0.42], [0.34, 0.28], [0.66, 0.28]];
dummySpots.forEach(([fx, fz], i) => {
    createHumanoid({ label: `Dummy ${String.fromCharCode(65 + i)}`, position: mapPosition(fx, fz) });
});

// --- Player -----------------------------------------------------------------

const cameraEntity = new Entity('camera');
cameraEntity.addComponent('camera', {
    clearColor: new Color(0.45, 0.48, 0.52),
    farClip: 400,
    fov: BASE_FOV,
    nearClip: 0.12
});

const player = new Entity('player');
app.root.addChild(player);
player.setPosition(SPAWN);
player.addComponent('collision', { type: 'capsule', radius: 0.58, height: 1.8 });
player.addComponent('rigidbody', {
    type: 'dynamic',
    mass: 100,
    linearDamping: 0,
    angularDamping: 0,
    linearFactor: Vec3.ONE,
    angularFactor: Vec3.ZERO,
    friction: 0.85,
    restitution: 0
});
const ammoBody = player.rigidbody.body;
ammoBody?.setCcdMotionThreshold?.(0.02);
ammoBody?.setCcdSweptSphereRadius?.(0.5);
player.addComponent('script');
app.root.addChild(cameraEntity);

const { visual: playerVisual, gunAnchor, pose: poseRig } = createPlayerAvatar(player, soldierAsset);

// `skinned` marks the GLB rig so the camera controller leaves its wrapper to the poser.
playerVisual.skinned = !!poseRig;

const input = new InputState();

const playerScript = /** @type {PlayerController} */ (player.script.create(PlayerController, {
    properties: { camera: cameraEntity, visual: playerVisual, input, jumpForce: 850, lookSens: 0.14 }
}));
playerScript.spawnPoint.copy(SPAWN);

const weaponScript = /** @type {WeaponController} */ (player.script.create(WeaponController, {
    properties: {
        camera: cameraEntity,
        input,
        player: playerScript,
        baseFov: BASE_FOV,
        gunAssets,
        gunAnchor
    }
}));

// --- Bots -------------------------------------------------------------------

const botSpots = [[0.22, 0.58], [0.78, 0.58], [0.5, 0.5]];
botSpots.forEach(([fx, fz], i) => {
    const { root, body } = createHumanoid({
        label: `Bot ${i + 1}`,
        position: mapPosition(fx, fz),
        mobile: true,
        health: 120,
        respawnDelay: 8
    });
    root.addComponent('script');
    root.script.create(BotController, {
        properties: {
            player,
            body,
            damage: 8,
            accuracy: 0.45,
            fireInterval: 1,
            arenaMinX: ARENA.minX + 1.5,
            arenaMaxX: ARENA.maxX - 1.5,
            arenaMinZ: ARENA.minZ + 1.5,
            arenaMaxZ: ARENA.maxZ - 1.5
        }
    });
    botEntities.push(root);
});

// --- Lighting ---------------------------------------------------------------

const sun = new Entity('sun');
sun.addComponent('light', {
    type: 'directional',
    castShadows: true,
    shadowBias: 0.04,
    normalOffsetBias: 0.1,
    shadowDistance: 120,
    shadowResolution: 2048,
    numCascades: 3,
    intensity: 1.45
});
app.root.addChild(sun);
sun.setEulerAngles(42, 30, 0);

const fill = new Entity('fill-light');
fill.addComponent('light', {
    type: 'directional',
    castShadows: false,
    intensity: 0.75,
    color: new Color(0.72, 0.78, 0.95)
});
app.root.addChild(fill);
fill.setEulerAngles(65, -140, 0);

// --- Systems ----------------------------------------------------------------

const pickupSystem = createPickupSystem({
    app,
    player,
    input,
    getWeapon: () => weaponScript,
    getPlayer: () => playerScript,
    gunAssets
});

const riflePos = mapPosition(0.38, 0.72);
const smgPos = mapPosition(0.62, 0.72);
const shotgunPos = mapPosition(0.18, 0.34);
const sniperPos = mapPosition(0.5, 0.24, 1.2);
const healthA = mapPosition(0.72, 0.34);
const healthB = mapPosition(0.3, 0.18);
const ammoA = mapPosition(0.7, 0.18);
const ammoB = mapPosition(0.22, 0.62);

pickupSystem.spawnWeapon('rifle', riflePos[0], riflePos[2]);
pickupSystem.spawnWeapon('smg', smgPos[0], smgPos[2]);
pickupSystem.spawnWeapon('shotgun', shotgunPos[0], shotgunPos[2]);
pickupSystem.spawnWeapon('sniper', sniperPos[0], sniperPos[2], { y: sniperPos[1] });
pickupSystem.spawnHealth(healthA[0], healthA[2]);
pickupSystem.spawnHealth(healthB[0], healthB[2]);
pickupSystem.spawnAmmo(ammoA[0], ammoA[2]);
pickupSystem.spawnAmmo(ammoB[0], ammoB[2]);

createHud({
    app,
    camera: cameraEntity,
    input,
    getWeapon: () => weaponScript,
    getPlayer: () => playerScript,
    getTargets: () => targets,
    getArena: () => ARENA
});

const touchControls = createTouchControls({ input });
document.getElementById('hud-gear')?.addEventListener('click', () => {
    if (touchOpt.checked) {
        touchControls.openLayoutEditor();
    }
});

// --- Login → lobby → play (before desktop controls — isBlocked reads loginFlow) ---

const prefersTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const forcedTouch = new URLSearchParams(window.location.search).get('touch');
touchOpt.checked = forcedTouch !== null ? forcedTouch !== '0' : prefersTouch;

/**
 * @param {boolean} on - Show the on-screen controls.
 */
function setTouchMode(on) {
    touchControls.setVisible(on);
    document.body.classList.toggle('touch', on);
    /** @type {HTMLElement} */ (document.getElementById('pickup-key')).textContent = on ? 'TAP' : 'E';
}

touchOpt.addEventListener('change', () => {
    if (!loginFlow.isPreGame()) {
        setTouchMode(touchOpt.checked);
    }
});

/** @type {import('./auth/login.mjs').AuthUser|null} */
let signedInUser = null;

/** @type {(() => void)|null} */
let lockDesktopOnPlay = null;

const loginFlow = createLoginFlow({
    loginScreen,
    lobbyScreen,
    googleBtnHost: /** @type {HTMLElement} */ (document.getElementById('google-signin-btn')),
    guestBtn: /** @type {HTMLButtonElement} */ (document.getElementById('guest-btn')),
    playBtn: /** @type {HTMLButtonElement} */ (document.getElementById('play-btn')),
    signOutBtn: /** @type {HTMLButtonElement} */ (document.getElementById('lobby-signout')),
    authError: /** @type {HTMLElement} */ (document.getElementById('auth-error')),
    authSetupHint: /** @type {HTMLElement} */ (document.getElementById('auth-setup-hint')),
    userAvatar: /** @type {HTMLImageElement} */ (document.getElementById('lobby-avatar')),
    userName: /** @type {HTMLElement} */ (document.getElementById('lobby-name')),
    userEmail: /** @type {HTMLElement} */ (document.getElementById('lobby-email')),
    userBadge: /** @type {HTMLElement} */ (document.getElementById('lobby-badge')),
    onUserChange: (user) => {
        signedInUser = user;
        const squadName = document.querySelector('#squad .squad-row span');
        if (squadName) {
            squadName.textContent = user?.displayName ?? 'You';
        }
    },
    onStartGame: () => {
        unlockAudio();
        setTouchMode(touchOpt.checked);
        lockDesktopOnPlay?.();
    }
});

const desktopControls = createDesktopControls({
    canvas,
    input,
    isBlocked: () => loginFlow.isPreGame()
});
lockDesktopOnPlay = () => {
    if (!touchOpt.checked) {
        desktopControls.lock();
    }
};

// Rescue the player if physics ever drops them out of the world.
let fallRescueEnabled = true;
app.on('update', () => {
    if (!fallRescueEnabled || !player.rigidbody || playerScript.dead) {
        return;
    }
    if (player.getPosition().y < mapFloorY - 8) {
        playerScript.respawn();
        app.fire('debug:log', 'warn', 'Fall rescue → spawn');
    }
});

app.start();

// Place the player through the same path a respawn uses, so the body is awake and synced with the
// entity from frame one rather than depending on how the first physics step happened to land.
playerScript.respawn();

// Everyone starts with a sidearm; the good guns are on the ground.
weaponScript.pickUp('pistol');

// Drive the procedural locomotion rig from the same state the camera reads.
if (poseRig) {
    app.on('update', (/** @type {number} */ dt) => {
        const velocity = player.rigidbody?.linearVelocity;
        const speed = velocity ? Math.hypot(velocity.x, velocity.z) : 0;
        poseRig(dt, {
            speed,
            vx: velocity?.x ?? 0,
            vz: velocity?.z ?? 0,
            lookYaw: playerScript.yaw,
            crouch: !!input.crouch && !input.prone,
            prone: !!input.prone,
            aimAmount: weaponScript.aiming ? 1 : 0,
            grounded: playerScript.grounded
        });
    });
}

// Clicking back into the canvas re-captures the mouse after Esc.
canvas.addEventListener('click', () => {
    if (!touchOpt.checked && !loginFlow.isPreGame()) {
        desktopControls.lock();
    }
});

// --- Dev panel + error reporting -------------------------------------------

createDebugPanel({
    app,
    player,
    cameraEntity,
    spawn: SPAWN,
    canvas,
    input,
    getWeapon: () => weaponScript,
    getPlayer: () => playerScript,
    getTargets: () => targets,
    getBots: () => botEntities.map(e => e.script?.botController).filter(Boolean),
    setFallRescue: (enabled) => {
        fallRescueEnabled = enabled;
    },
    setTouchMode: (enabled) => {
        touchOpt.checked = enabled;
        setTouchMode(enabled);
    },
    setMuted,
    givePickup: (id) => {
        const pos = player.getPosition();
        const fwd = player.forward;
        pickupSystem.spawnWeapon(id, pos.x + fwd.x * 2, pos.z + fwd.z * 2, { respawn: 0 });
    }
});

// Console handle for poking at the running game: `battleground.player`, `.weapon`, `.app`, etc.
window.battleground = {
    app,
    player,
    camera: cameraEntity,
    playerScript,
    weaponScript,
    targets,
    botEntities,
    pickupSystem,
    input,
    touchControls
};

window.addEventListener('error', (event) => {
    app.fire('debug:log', 'error', event.message ?? 'Unknown error');
});
window.addEventListener('unhandledrejection', (event) => {
    app.fire('debug:log', 'error', String(event.reason));
});

console.info('[Battleground] Ready — WASD/joystick to move, pick up weapons, clear the bots.');
