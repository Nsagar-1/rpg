import { BoundingBox, Entity, Quat } from '../build/playcanvas';

/** @import { AppBase, Asset, Vec3 } from '../build/playcanvas' */

/** Target standing height in world units (the player capsule is 1.8 tall). */
const HEIGHT = 1.8;

/**
 * Joint lookup by bone-name fragment. The Character Creator rig suffixes are stable, so
 * substring matches are enough and survive the `_034` style numeric suffixes.
 *
 * @type {Record<string, string[]>} role -> candidate name fragments, first match wins.
 */
const BONE_FRAGMENTS = {
    hip: ['CC_Base_Hip', 'CC_Base_Pelvis', 'CC_Base_Waist', 'Hip'],
    spine01: ['CC_Base_Spine01', 'Spine01'],
    spine02: ['CC_Base_Spine02', 'Spine02'],
    head: ['CC_Base_Head', 'Head'],
    uarmL: ['CC_Base_L_Upperarm', 'L_Upperarm'],
    uarmR: ['CC_Base_R_Upperarm', 'R_Upperarm'],
    farmL: ['CC_Base_L_Forearm_', 'L_Forearm'],
    farmR: ['CC_Base_R_Forearm_', 'R_Forearm'],
    handL: ['CC_Base_L_Hand', 'L_Hand'],
    handR: ['CC_Base_R_Hand', 'R_Hand'],
    thighL: ['CC_Base_L_Thigh_', 'L_Thigh'],
    thighR: ['CC_Base_R_Thigh_', 'R_Thigh'],
    calfL: ['CC_Base_L_Calf_', 'L_Calf'],
    calfR: ['CC_Base_R_Calf_', 'R_Calf'],
    footL: ['CC_Base_L_Foot', 'L_Foot'],
    footR: ['CC_Base_R_Foot', 'R_Foot']
};

/**
 * Cross-fade duration per destination clip, in seconds. Weight shifts are stance changes, so the
 * grounded blends are long enough to read; air states are short because they need to land on the
 * frame the ground check flips.
 *
 * @type {Record<string, number>}
 */
const BLEND = {
    stand: 0.26,
    run: 0.18,
    walk: 0.18,
    turn: 0.2,
    jump: 0.1,
    fall: 0.14,
    dive: 0.12
};

/** Clips that should hold their last frame instead of looping. @type {Record<string, boolean>} */
const ONE_SHOT = { jump: true, dive: true };

/** Minimum seconds in a state before a grounded clip change is allowed. */
const MIN_DWELL = 0.12;

const deltaQ = new Quat();
const baseQ = new Quat();
const outQ = new Quat();
const snapBox = new BoundingBox();

/**
 * @param {string} name - glTF animation name (e.g. preset:biped:run).
 * @returns {string|null} Locomotion key, or null when unused.
 */
function classifyClip(name) {
    const n = name.toLowerCase();
    if (n.includes('idle') || n.includes('wait') || n.includes('standing')) {
        return 'idle';
    }
    if (n.includes('walk')) {
        return 'walk';
    }
    if (n.includes('turn') || n.includes('rotate') || n.includes('spin')) {
        return 'turn';
    }
    if (n.includes('run') || n.includes('jog')) {
        return 'run';
    }
    if (n.includes('fall')) {
        return 'fall';
    }
    if (n.includes('dive') || n.includes('prone')) {
        return 'dive';
    }
    if (n.includes('jump')) {
        return 'jump';
    }
    return null;
}

/**
 * Shift the visual so the mesh soles sit on the capsule feet. Run clips lift the hips;
 * without this the body floats.
 *
 * @param {Entity} visual - Skinned wrapper.
 * @param {Entity} playerEntity - Physics capsule root.
 * @param {number} sink - Extra crouch drop.
 */
function plantFeet(visual, playerEntity, sink) {
    let first = true;
    visual.forEach((e) => {
        let n = e;
        while (n && n !== visual) {
            if (n.name === 'gun-anchor' || n.name.startsWith('view-')) {
                return;
            }
            n = n.parent;
        }
        for (const mi of e.render?.meshInstances ?? []) {
            if (first) {
                snapBox.copy(mi.aabb);
                first = false;
            } else {
                snapBox.add(mi.aabb);
            }
        }
    });
    if (first) {
        return;
    }
    const feetY = playerEntity.getPosition().y - 0.9 - sink;
    const dy = feetY - snapBox.getMin().y;
    if (Math.abs(dy) > 0.002) {
        const lp = visual.getLocalPosition();
        visual.setLocalPosition(lp.x, lp.y + dy, lp.z);
    }
}

/** @param {number} a - Degrees. @returns {number} Wrapped to [-180, 180]. */
function wrapDeg(a) {
    let d = a % 360;
    if (d > 180) {
        d -= 360;
    }
    if (d < -180) {
        d += 360;
    }
    return d;
}

/**
 * Adds the soldier model to the player and returns a rig that poses its skeleton every frame.
 * The GLB ships only an idle clip, so all locomotion (walk / run / crouch / aim / airborne) is
 * driven procedurally from movement state — no animation assets needed.
 *
 * @param {AppBase} app - Running application (unused today, kept for symmetry with other loaders).
 * @param {Entity} playerEntity - Physics root the visual attaches to.
 * @param {Asset|null} asset - Loaded 'container' asset for soldier.glb, null when unavailable.
 * @returns {{ visual: Entity, gunAnchor: Entity, pose: (dt: number, state: RigState) => void } | null}
 *   The rig, or null when the model could not be instantiated (caller falls back to primitives).
 */
export function createSoldierRig(app, playerEntity, asset) {
    if (!asset?.resource) {
        return null;
    }

    const visual = new Entity('visual');
    playerEntity.addChild(visual);
    visual.addChild(asset.resource.instantiateRenderEntity({}));

    // Mesh AABBs are world-space and the player is already at spawn, so convert min Y into
    // visual-local before scaling. Otherwise spawn height gets baked in and the feet go underground.
    const aabb = new BoundingBox();
    let first = true;
    visual.forEach((e) => {
        for (const mi of e.render?.meshInstances ?? []) {
            if (first) {
                aabb.copy(mi.aabb);
                first = false;
            } else {
                aabb.add(mi.aabb);
            }
        }
    });
    if (first || aabb.halfExtents.y <= 0) {
        return null;
    }
    const visualWorldY = visual.getPosition().y;
    const s = HEIGHT / (aabb.halfExtents.y * 2);
    const localMinY = aabb.getMin().y - visualWorldY;
    const plantY = -0.9 - localMinY * s;
    visual.setLocalScale(s, s, s);
    visual.setLocalPosition(0, plantY, 0);

    // Collect joints and remember their bind rotations so procedural deltas compose cleanly.
    // Names carry numeric suffixes (CC_Base_L_Upperarm_050), so match by substring — one
    // traversal instead of a findByName per role.
    const nameIndex = /** @type {Map<string, Entity>} */ (new Map());
    visual.forEach((e) => {
        if (e.name) {
            nameIndex.set(e.name, e);
        }
    });
    const bones = /** @type {Record<string, Entity>} */ ({});
    for (const [role, fragments] of Object.entries(BONE_FRAGMENTS)) {
        for (const fragment of fragments) {
            if (nameIndex.has(fragment)) {
                bones[role] = nameIndex.get(fragment);
                break;
            }
            for (const [name, entity] of nameIndex) {
                if (name.includes(fragment) && !name.includes('Twist')) {
                    bones[role] = entity;
                    break;
                }
            }
            if (bones[role]) {
                break;
            }
        }
    }
    const base = new Map();
    for (const bone of Object.values(bones)) {
        base.set(bone, bone.getLocalRotation().clone());
    }
    if (!bones.handR && !bones.uarmR) {
        return null;
    }

    // Every clip bakes its travel into the Hip translation channel — the run clip walks the hip
    // ~2.8 units along its local Y (bind value 0) and snaps back when the clip wraps. The capsule
    // owns world position, so nothing here consumes root motion: pin the two root joints to their
    // bind translation each frame and the locomotion becomes in-place.
    const pinned = /** @type {{ bone: Entity, bind: Vec3 }[]} */ ([]);
    for (const bone of [nameIndex.get('Root'), bones.hip]) {
        if (bone && !pinned.some(p => p.bone === bone)) {
            pinned.push({ bone, bind: bone.getLocalPosition().clone() });
        }
    }

    // Gun socket hangs off the right hand. Tripo FBX bones are centimetre-scaled (~100),
    // so a child would inherit that and explode. Counter the inherited world scale and
    // express the grip offset in metres.
    const gunAnchor = new Entity('gun-anchor');
    const hand = bones.handR ?? visual;
    hand.addChild(gunAnchor);
    const handWorld = hand.getWorldTransform().data;
    const inherited = Math.hypot(handWorld[0], handWorld[1], handWorld[2]) || 1;
    const cs = 1 / inherited;
    gunAnchor.setLocalScale(cs, cs, cs);
    gunAnchor.setLocalPosition(0.03 * cs, 0.04 * cs, 0.02 * cs);
    gunAnchor.setLocalEulerAngles(-90, 0, 90);

    const model = visual.children[0] ?? visual;
    const tracks = asset.resource.animations ?? [];
    /** @type {Record<string, boolean>} */
    const clips = {};
    let runDuration = 1.292;
    if (tracks.length && model.addComponent) {
        model.addComponent('anim', { activate: true });

        /** @type {Record<string, any>} */
        const trackByKey = {};
        for (const animAsset of tracks) {
            const raw = animAsset.resource?.name || animAsset.name || '';
            const key = classifyClip(raw);
            if (key && !trackByKey[key] && animAsset.resource) {
                trackByKey[key] = animAsset.resource;
            }
        }

        // The motion pack has no idle clip, so hold frame 0 of the turn-in-place clip as a
        // zero-speed state: a genuine standing pose (its hip sits at bind) that stopping can blend
        // into. Assigned first so it becomes the default state and the player starts standing.
        const standTrack = trackByKey.idle ?? trackByKey.turn ?? trackByKey.walk;
        if (standTrack) {
            model.anim.assignAnimation('stand', standTrack, undefined, 0, true);
            clips.stand = true;
        }
        for (const [key, track] of Object.entries(trackByKey)) {
            model.anim.assignAnimation(key, track, undefined, 1, !ONE_SHOT[key]);
            clips[key] = true;
            if (key === 'run') {
                runDuration = track.duration || runDuration;
            }
        }
        console.info('[Battleground] Player clips:', Object.keys(clips).join(', ') || 'none');
    }

    /**
     * @param {...string} keys - Clip names in priority order.
     * @returns {string|undefined} The first one the motion pack actually shipped.
     */
    const firstClip = (...keys) => keys.find(k => clips[k]);

    // The clip is two identical strides, so a stride is half its duration.
    const strideSpan = runDuration * 0.5;
    let phase = 0;
    let clock = 0;
    let currentClip = clips.stand ? 'stand' : '';
    let dwell = 0;
    let airborne = 0;
    let faceYaw = 0;
    let faced = false;
    let moving = false;

    /**
     * @param {Entity|null} bone - Joint to rotate (no-op when missing).
     * @param {number} x - Pitch delta, radians.
     * @param {number} [y] - Yaw delta.
     * @param {number} [z] - Roll delta.
     */
    const rotate = (bone, x, y = 0, z = 0) => {
        if (!bone) {
            return;
        }
        baseQ.copy(/** @type {Quat} */ (base.get(bone)));
        deltaQ.setFromEulerAngles(x * 180 / Math.PI, y * 180 / Math.PI, z * 180 / Math.PI);
        outQ.mul2(baseQ, deltaQ);
        bone.setLocalRotation(outQ);
    };

    /**
     * Advance the procedural pose one frame.
     *
     * @param {number} dt - Delta time.
     * @param {RigState} state - Movement state read from the player controller.
     */
    const pose = (dt, state) => {
        clock += dt;

        if (model.anim && Object.keys(clips).length) {
            airborne = state.grounded ? 0 : airborne + dt;

            // Face the run vector (PlayCanvas forward is -Z). Hold last heading when stopped.
            if (!faced) {
                faceYaw = state.lookYaw ?? 0;
                faced = true;
            }
            // Hysteresis: a single threshold flickers the run/stand blend while the capsule
            // velocity hovers around it.
            moving = state.speed > (moving ? 0.9 : 1.8);
            let targetYaw = faceYaw;
            if (moving) {
                targetYaw = Math.atan2(-(state.vx ?? 0), -(state.vz ?? 0)) * 180 / Math.PI;
            } else if ((state.aimAmount ?? 0) > 0.5) {
                targetYaw = state.lookYaw ?? faceYaw;
            }
            const yawErr = wrapDeg(targetYaw - faceYaw);
            const turning = moving && Math.abs(yawErr) > 45 && !!clips.turn;
            // One exponential for both cases. Swapping to a clamped linear rate while the turn
            // clip played put a kink in the heading every time that state flipped.
            faceYaw = wrapDeg(faceYaw + yawErr * (1 - Math.exp(-(turning ? 7 : 13) * dt)));

            const urgent = airborne > 0.18;
            let next = firstClip('stand', 'run', 'walk') ?? '';
            if (urgent) {
                next = firstClip('jump', 'fall', 'dive') ?? next;
            } else if (state.prone) {
                next = firstClip('dive', 'fall') ?? next;
            } else if (turning) {
                next = 'turn';
            } else if (moving) {
                next = firstClip('run', 'walk') ?? next;
            }

            // Cross-fade instead of a hard `play()`, and hold each state briefly so a jittery
            // input cannot restart a blend every frame. Airborne skips the dwell — landing and
            // take-off have to read immediately.
            dwell += dt;
            if (next && next !== currentClip && (dwell > MIN_DWELL || urgent)) {
                model.anim.baseLayer.transition(next, BLEND[next] ?? 0.18);
                currentClip = next;
                dwell = 0;
            }

            // Continuous playback with the rate matched to ground speed. Scrubbing the playhead
            // needed `anim.speed = 0`, which also froze the transition timer (the layer advances
            // by `dt * anim.speed`), so no clip change could ever blend.
            const running = currentClip === 'run' || currentClip === 'walk';
            const rate = Math.min(1.8, Math.max(1.4, state.speed / 14) * strideSpan);
            model.anim.speed = running && !model.anim.baseLayer.transitioning ? rate : 1;

            const sink = state.crouch ? 0.34 : 0;
            visual.setLocalPosition(0, plantY - sink, 0);
            // Mesh binds facing +Z; PlayCanvas move/look yaw 0 is −Z.
            visual.setLocalEulerAngles(0, faceYaw + 180, 0);
            // Cancel baked root motion. With the hips pinned the soles stay on the capsule bottom
            // at the `plantY` measured from the bind pose, so no per-frame AABB snap is needed —
            // that snap tracked whichever foot was lowest and bobbed the whole body each stride.
            for (const p of pinned) {
                p.bone.setLocalPosition(p.bind);
            }
            return;
        }

        // Wrapper height: stance offsets plus a run-cycle bounce. The controller owns X/Z and yaw.
        const bob = state.grounded ? Math.abs(Math.sin(phase)) * 0.05 : 0;
        const sink = state.crouch ? 0.34 : 0;
        visual.setLocalPosition(0, plantY - sink + bob, 0);
        plantFeet(visual, playerEntity, sink);

        if (!state.grounded || state.prone) {
            // Airborne / lying: freeze the cycle in a tucked pose.
            phase += dt * 2;
        } else {
            // Stride frequency from speed: ~40 world units per step at this map scale.
            phase += state.speed * 0.085 * dt + (state.speed > 0.5 ? 0 : 0);
        }
        const swing = Math.sin(phase);
        const swing2 = Math.sin(phase + Math.PI);
        const run = Math.min(1, state.speed / 40);
        const amp = state.grounded ? 0.35 + run * 0.55 : 0.5;
        const aim = state.aimAmount;

        // Legs: thighs swing opposite, calves trail the swing and flex with stride.
        rotate(bones.thighL, swing * amp - state.crouch * 1.1);
        rotate(bones.thighR, swing2 * amp - state.crouch * 1.1);
        rotate(bones.calfL, Math.max(0, -swing2) * amp * 1.5 + state.crouch * 1.4 + (state.grounded ? 0 : 0.5));
        rotate(bones.calfR, Math.max(0, -swing) * amp * 1.5 + state.crouch * 1.4 + (state.grounded ? 0 : 0.5));
        rotate(bones.footL, -swing * amp * 0.4);
        rotate(bones.footR, -swing2 * amp * 0.4);

        // Torso: lean into speed, breathe when idle, hunch over while crouching.
        rotate(bones.hip, -run * 0.12 - state.crouch * 0.25);
        rotate(bones.spine01, run * 0.14 + state.crouch * 0.3 + Math.sin(clock * 1.7) * 0.02);
        rotate(bones.spine02, Math.sin(clock * 1.7 + 0.8) * 0.02 - aim * 0.05);
        rotate(bones.head, -run * 0.06 - state.crouch * 0.35 + (state.prone ? 0.9 : 0));

        // Arms: pump with the stride, overridden by the weapon-ready blend while aiming.
        rotate(bones.uarmL, swing2 * amp * 0.6 * (1 - aim) - 0.35 - run * 0.25 - aim * 0.9, aim * 0.55, aim * 0.25);
        rotate(bones.farmL, -0.45 - run * 0.35 - aim * 0.75);
        rotate(bones.uarmR, swing * amp * 0.6 * (1 - aim) - 0.35 - run * 0.25 - aim * 1.05, -aim * 0.2, -aim * 0.35);
        rotate(bones.farmR, -0.5 - run * 0.3 - aim * 0.35);
        rotate(bones.handL, 0, 0, aim * 0.4);
    };

/**
 * @typedef {object} RigState
 * @property {number} speed - Horizontal speed in world units.
 * @property {number} [vx] - World-space velocity X (for facing).
 * @property {number} [vz] - World-space velocity Z (for facing).
 * @property {number} [lookYaw] - Camera yaw in degrees.
 * @property {boolean} crouch - Crouch stance.
 * @property {boolean} prone - Prone stance.
 * @property {number} aimAmount - 0..1 weapon-ready blend.
 * @property {boolean} grounded - On the floor.
 */

/** Extra runtime flag: when true the player controller must not touch the wrapper transform. */

    return { visual, gunAnchor, pose };
}
