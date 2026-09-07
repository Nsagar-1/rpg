import {
    AppBase,
    AppOptions,
    Asset,
    BoundingBox,
    AnimComponentSystem,
    CameraComponentSystem,
    Color,
    ContainerHandler,
    Entity,
    FILLMODE_FILL_WINDOW,
    Keyboard,
    LightComponentSystem,
    Mouse,
    RESOLUTION_AUTO,
    RenderComponentSystem,
    StandardMaterial,
    TextureHandler,
    TouchDevice,
    Vec3,
    createGraphicsDevice
} from '../build/playcanvas';

import { CHARACTER_ASSETS, MOTION_CLIPS, clipName, pickDefaultClip, savePlayerChoice } from './character-assets.mjs';
import { GUN_MODEL_FILES } from './weapons/gun-assets.mjs';

/** @typedef {{ id: string, name: string, url: string, group: string, playable?: boolean, hostUrl?: string }} CatalogItem */

/** Groups that carry clips, so they get the motion toolbar and a per-row Motion button. */
const ANIMATED_GROUPS = new Set(['Characters', 'Clips']);

/** @type {CatalogItem[]} */
const CATALOG = [
    ...Object.entries(GUN_MODEL_FILES).map(([id, url]) => ({
        id,
        name: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        url,
        group: 'Guns'
    })),
    ...CHARACTER_ASSETS.map((item) => ({
        id: item.id,
        name: item.name,
        url: item.url,
        group: 'Characters',
        playable: item.playable
    })),
    ...MOTION_CLIPS.map((item) => ({
        id: `clip-${item.id}`,
        name: item.name,
        url: item.url,
        hostUrl: item.hostUrl,
        group: 'Clips'
    })),
    { id: 'factory', name: 'Factory map', url: '/assets/maps/factory.glb', group: 'Maps' }
];

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('application-canvas'));
const listEl = /** @type {HTMLElement} */ (document.getElementById('asset-list'));
const searchEl = /** @type {HTMLInputElement} */ (document.getElementById('asset-search'));
const nameEl = /** @type {HTMLElement} */ (document.getElementById('asset-name'));
const pathEl = /** @type {HTMLElement} */ (document.getElementById('asset-path'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const motionPanel = /** @type {HTMLElement} */ (document.getElementById('motion-controls'));
const clipSelect = /** @type {HTMLSelectElement} */ (document.getElementById('clip-select'));
const playBtn = /** @type {HTMLButtonElement} */ (document.getElementById('motion-play'));
const replayBtn = /** @type {HTMLButtonElement} */ (document.getElementById('motion-replay'));
const useGameBtn = /** @type {HTMLButtonElement} */ (document.getElementById('use-in-game'));

const device = await createGraphicsDevice(canvas, { deviceTypes: ['webgl2', 'webgpu'] });
device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);

const options = new AppOptions();
options.graphicsDevice = device;
options.mouse = new Mouse(canvas);
options.touch = new TouchDevice(canvas);
options.keyboard = new Keyboard(window);
options.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem, AnimComponentSystem];
options.resourceHandlers = [TextureHandler, ContainerHandler];

const app = new AppBase(canvas);
app.init(options);
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);
window.addEventListener('resize', () => app.resizeCanvas());

app.scene.ambientLight = new Color(0.45, 0.47, 0.52);
app.scene.exposure = 1.2;

const camera = new Entity('inspect-cam');
app.root.addChild(camera);
camera.addComponent('camera', {
    clearColor: new Color(0.08, 0.09, 0.12),
    nearClip: 0.02,
    farClip: 400,
    fov: 50
});

const key = new Entity('key');
app.root.addChild(key);
key.setLocalEulerAngles(35, -40, 0);
key.addComponent('light', {
    type: 'directional',
    color: new Color(1, 0.96, 0.9),
    intensity: 1.15,
    castShadows: true,
    shadowDistance: 20
});

const fill = new Entity('fill');
app.root.addChild(fill);
fill.setLocalEulerAngles(20, 140, 0);
fill.addComponent('light', { type: 'directional', color: new Color(0.55, 0.65, 0.85), intensity: 0.45 });

const gridMat = new StandardMaterial();
gridMat.diffuse.set(0.16, 0.18, 0.22);
gridMat.metalness = 0;
gridMat.gloss = 0.08;
gridMat.useMetalness = true;
gridMat.update();

const grid = new Entity('grid');
app.root.addChild(grid);
grid.addComponent('render', { type: 'plane', material: gridMat });
grid.setLocalScale(8, 1, 8);

/** @type {Entity|null} */
let modelRoot = null;
/** @type {Entity|null} */
let animModel = null;
/** @type {number} Increments per load request so a slow load cannot overwrite a newer one. */
let loadToken = 0;
/** @type {CatalogItem|null} */
let activeItem = null;
/** @type {object[]} */
let activeClips = [];
/** @type {string|null} */
let activeClipName = null;
/** @type {boolean} */
let motionPlaying = false;

const orbit = {
    yaw: 35,
    pitch: 18,
    distance: 2.4,
    target: new Vec3(0, 0.4, 0)
};

const applyOrbit = () => {
    const pitch = Math.max(-89, Math.min(89, orbit.pitch)) * Math.PI / 180;
    const yaw = orbit.yaw * Math.PI / 180;
    const d = Math.max(0.08, orbit.distance);
    camera.setPosition(
        orbit.target.x + d * Math.cos(pitch) * Math.sin(yaw),
        orbit.target.y + d * Math.sin(pitch),
        orbit.target.z + d * Math.cos(pitch) * Math.cos(yaw)
    );
    camera.lookAt(orbit.target);
};

/**
 * @param {string} text - Status line.
 * @param {'ok'|'err'|''} [kind] - Colour class.
 */
const setStatus = (text, kind = '') => {
    statusEl.textContent = text;
    statusEl.className = kind;
};

/**
 * @param {boolean} playing - Whether motion is running.
 */
const syncPlayButton = (playing) => {
    motionPlaying = playing;
    playBtn.textContent = playing ? 'Pause' : 'Play';
};

/**
 * Every Mixamo single-clip export is named `mixamo.com`, which is useless in the dropdown. Show the
 * catalog name for standalone clip files instead — this is also the anim state name, so the loop
 * heuristic in {@link assignClip} gets something meaningful to match against.
 *
 * @param {object} clip - Container animation asset.
 * @returns {string} Display and state name.
 */
const clipLabel = (clip) => {
    const raw = clipName(clip);
    return activeItem?.group === 'Clips' && /^mixamo\.com$/i.test(raw) ? activeItem.name : raw;
};

/**
 * Show / hide motion toolbar for the active catalog item.
 */
const refreshMotionPanel = () => {
    const show = ANIMATED_GROUPS.has(activeItem?.group ?? '') && activeClips.length > 0;
    motionPanel.hidden = !show;
    useGameBtn.hidden = !activeItem?.playable;
    clipSelect.disabled = !show;
    playBtn.disabled = !show;
    replayBtn.disabled = !show;
    useGameBtn.disabled = !activeItem?.playable;
};

/**
 * @param {object[]} clips - Loaded container clips.
 */
const populateClipSelect = (clips) => {
    clipSelect.replaceChildren();
    for (const clip of clips) {
        const name = clipLabel(clip);
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        clipSelect.appendChild(opt);
    }
    if (activeClipName) {
        clipSelect.value = activeClipName;
    }
};

/**
 * @param {Entity} model - Skinned model entity.
 * @param {string} name - Clip state name.
 * @param {object} clip - Animation asset.
 * @param {{ loop?: boolean, play?: boolean }} [opts] - Playback options.
 */
const assignClip = (model, name, clip, opts = {}) => {
    const loop = opts.loop ?? !/jump|dive|attack|hit|die|fall/i.test(name);
    model.anim.assignAnimation(name, clip.resource, undefined, 1, loop);
    model.anim.baseLayer.play(name);
    if (opts.play === false) {
        model.anim.speed = 0;
        syncPlayButton(false);
    } else {
        model.anim.speed = 1;
        syncPlayButton(true);
    }
    activeClipName = name;
    clipSelect.value = name;
};

/**
 * @param {boolean} [play=true] - Start playback immediately.
 */
const playSelectedClip = (play = true) => {
    if (!animModel?.anim) {
        return;
    }
    const name = clipSelect.value || activeClipName;
    const clip = activeClips.find((c) => clipLabel(c) === name) ?? pickDefaultClip(activeClips);
    if (!clip) {
        return;
    }
    assignClip(animModel, clipLabel(clip), clip, { play });
    setStatus(`Playing ${clipLabel(clip)}`, 'ok');
};

/**
 * Frame the current model AABB and plant the grid under its feet.
 *
 * @param {Entity} root - Instantiated container.
 */
const frameModel = (root) => {
    const aabb = new BoundingBox();
    let first = true;
    root.forEach((e) => {
        for (const mi of e.render?.meshInstances ?? []) {
            if (first) {
                aabb.copy(mi.aabb);
                first = false;
            } else {
                aabb.add(mi.aabb);
            }
        }
    });
    if (first) {
        return;
    }
    const size = Math.max(aabb.halfExtents.x, aabb.halfExtents.y, aabb.halfExtents.z) * 2;
    orbit.target.copy(aabb.center);
    orbit.distance = Math.max(0.35, size * 1.8);
    orbit.yaw = 35;
    orbit.pitch = 18;
    const span = Math.max(2, size * 4);
    grid.setLocalScale(span, 1, span);
    grid.setLocalPosition(aabb.center.x, aabb.getMin().y, aabb.center.z);
    applyOrbit();
};

/**
 * @param {string} url - GLB URL.
 * @param {string} tag - Suffix for the asset name, for debugging.
 * @returns {Promise<Asset>} The loaded container asset.
 */
const loadContainer = (url, tag) => new Promise((resolve, reject) => {
    const asset = new Asset(`inspect-${tag}-${Date.now()}`, 'container', { url });
    app.assets.add(asset);
    asset.once('load', () => resolve(asset));
    asset.once('error', (err) => reject(new Error(String(err ?? `Failed to load ${url}`))));
    app.assets.load(asset);
});

/**
 * @param {CatalogItem} item - Asset to load.
 * @param {{ motion?: boolean }} [opts] - When true, auto-play the default clip.
 */
const loadItem = async (item, opts = {}) => {
    const withMotion = opts.motion ?? false;
    const token = ++loadToken;
    activeItem = item;
    nameEl.textContent = item.name;
    pathEl.textContent = item.url;
    setStatus('Loading…');
    document.querySelectorAll('.asset-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-id') === item.id);
    });
    history.replaceState(null, '', `?asset=${encodeURIComponent(item.id)}`);

    // Only the toolbar hides up front. Tearing the model down before the awaits would blank the
    // viewport for the whole load, so the old one stays until the replacement is ready.
    motionPanel.hidden = true;

    try {
        // Animation-only entries render `hostUrl` as the body and pull clips from `url`; everything
        // else is a single container that supplies both.
        const bodyAsset = await loadContainer(item.hostUrl ?? item.url, item.id);
        if (token !== loadToken) {
            return;
        }
        const clipAsset = item.hostUrl ? await loadContainer(item.url, `${item.id}-clip`) : bodyAsset;
        if (token !== loadToken) {
            return;
        }

        modelRoot?.destroy();
        activeClipName = null;

        const root = new Entity(item.id);
        app.root.addChild(root);
        const model = bodyAsset.resource.instantiateRenderEntity({});
        root.addChild(model);
        modelRoot = root;
        animModel = model;

        const clips = clipAsset.resource.animations ?? [];
        activeClips = clips;
        populateClipSelect(clips);

        if (clips.length) {
            model.addComponent('anim', { activate: true });
            const play = pickDefaultClip(clips);
            const playName = clipLabel(play);
            if (withMotion || !ANIMATED_GROUPS.has(item.group)) {
                assignClip(model, playName, play, { play: true });
                setStatus(`Loaded — ${clips.length} clip${clips.length === 1 ? '' : 's'} (playing ${playName})`, 'ok');
            } else {
                assignClip(model, playName, play, { play: false });
                setStatus(`Loaded — ${clips.length} clip${clips.length === 1 ? '' : 's'}. Press Motion or Play.`, 'ok');
            }
        } else {
            setStatus('Loaded — no clips (static mesh)', 'ok');
            syncPlayButton(false);
        }

        refreshMotionPanel();
        frameModel(root);
    } catch (err) {
        if (token === loadToken) {
            setStatus(err instanceof Error ? err.message : String(err), 'err');
        }
    }
};

const renderList = (filter = '') => {
    const q = filter.trim().toLowerCase();
    const groups = new Map();
    for (const item of CATALOG) {
        if (q && !item.name.toLowerCase().includes(q) && !item.id.includes(q)) {
            continue;
        }
        if (!groups.has(item.group)) {
            groups.set(item.group, []);
        }
        groups.get(item.group).push(item);
    }
    listEl.replaceChildren();
    for (const [group, items] of groups) {
        const wrap = document.createElement('div');
        wrap.className = 'group';
        const title = document.createElement('strong');
        title.textContent = group;
        wrap.appendChild(title);
        for (const item of items) {
            const row = document.createElement('div');
            row.className = 'asset-row';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'asset-btn';
            btn.dataset.id = item.id;
            btn.textContent = item.name;
            btn.addEventListener('click', () => loadItem(item, { motion: false }));
            row.appendChild(btn);

            if (ANIMATED_GROUPS.has(group)) {
                const motionBtn = document.createElement('button');
                motionBtn.type = 'button';
                motionBtn.className = 'motion-btn';
                motionBtn.title = 'Load and play motion';
                motionBtn.textContent = 'Motion';
                motionBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    loadItem(item, { motion: true });
                });
                row.appendChild(motionBtn);
            }

            wrap.appendChild(row);
        }
        listEl.appendChild(wrap);
    }
};

playBtn.addEventListener('click', () => {
    if (!animModel?.anim) {
        return;
    }
    if (motionPlaying) {
        animModel.anim.speed = 0;
        syncPlayButton(false);
        setStatus('Paused', 'ok');
    } else {
        if (activeClipName) {
            animModel.anim.speed = 1;
            animModel.anim.baseLayer.play(activeClipName);
            syncPlayButton(true);
            setStatus(`Playing ${activeClipName}`, 'ok');
        } else {
            playSelectedClip(true);
        }
    }
});

replayBtn.addEventListener('click', () => playSelectedClip(true));

clipSelect.addEventListener('change', () => playSelectedClip(true));

useGameBtn.addEventListener('click', () => {
    if (!activeItem?.playable) {
        return;
    }
    savePlayerChoice(activeItem.id);
    window.location.href = `/?player=${encodeURIComponent(activeItem.id)}`;
});

searchEl.addEventListener('input', () => renderList(searchEl.value));
renderList();
refreshMotionPanel();

/** @type {{ x: number, y: number, mode: 'orbit'|'pan'|null, pointers: Map<number, {x: number, y: number}> }} */
const drag = { x: 0, y: 0, mode: null, pointers: new Map() };

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.mode = e.button === 2 || e.button === 1 ? 'pan' : 'orbit';
});

canvas.addEventListener('pointermove', (e) => {
    const prev = drag.pointers.get(e.pointerId);
    if (!prev) {
        return;
    }
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;

    if (drag.pointers.size === 2) {
        const pts = [...drag.pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (canvas._pinch === undefined) {
            canvas._pinch = dist;
        } else {
            orbit.distance *= canvas._pinch / Math.max(1, dist);
            canvas._pinch = dist;
        }
        applyOrbit();
        return;
    }

    if (drag.mode === 'pan') {
        const right = camera.right;
        const up = camera.up;
        const scale = orbit.distance * 0.0025;
        orbit.target.add(right.clone().mulScalar(-dx * scale));
        orbit.target.add(up.clone().mulScalar(dy * scale));
    } else if (drag.mode === 'orbit') {
        orbit.yaw -= dx * 0.35;
        orbit.pitch += dy * 0.28;
    }
    applyOrbit();
});

const endPointer = (e) => {
    drag.pointers.delete(e.pointerId);
    if (drag.pointers.size < 2) {
        canvas._pinch = undefined;
    }
    if (drag.pointers.size === 0) {
        drag.mode = null;
    }
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.distance *= e.deltaY > 0 ? 1.08 : 0.92;
    applyOrbit();
}, { passive: false });

app.on('update', () => applyOrbit());
app.start();
applyOrbit();

const wanted = new URLSearchParams(location.search).get('asset') ?? 'desert-eagle';
const start = CATALOG.find((item) => item.id === wanted) ?? CATALOG[0];
if (start) {
    loadItem(start, { motion: ANIMATED_GROUPS.has(start.group) });
}
