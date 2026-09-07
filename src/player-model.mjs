import { ANIM_LAYER_OVERWRITE, BoundingBox, Entity, Quat, Vec3 } from '../build/playcanvas';

/** @import { AppBase, Asset } from '../build/playcanvas' */

/** Target standing height in world units (the player capsule is 1.8 tall). */
const HEIGHT = 1.8;

/**
 * Joint lookup by bone-name fragment. The Character Creator rig suffixes are stable, so
 * substring matches are enough and survive the `_034` style numeric suffixes.
 *
 * @type {Record<string, string[]>} role -> candidate name fragments, first match wins.
 */
const BONE_FRAGMENTS = {
    hip: ['mixamorig:Hips', 'CC_Base_Hip', 'CC_Base_Pelvis', 'CC_Base_Waist', 'Hip'],
    spine00: ['mixamorig:Spine', 'CC_Base_Spine00', 'Spine00'],
    spine01: ['mixamorig:Spine1', 'CC_Base_Spine01', 'Spine01'],
    spine02: ['mixamorig:Spine2', 'CC_Base_Spine02', 'Spine02'],
    head: ['mixamorig:Head', 'CC_Base_Head', 'Head'],
    uarmL: ['mixamorig:LeftArm', 'CC_Base_L_Upperarm', 'L_Upperarm'],
    uarmR: ['mixamorig:RightArm', 'CC_Base_R_Upperarm', 'R_Upperarm'],
    farmL: ['mixamorig:LeftForeArm', 'CC_Base_L_Forearm_', 'L_Forearm'],
    farmR: ['mixamorig:RightForeArm', 'CC_Base_R_Forearm_', 'R_Forearm'],
    handL: ['mixamorig:LeftHand', 'CC_Base_L_Hand', 'L_Hand'],
    handR: ['mixamorig:RightHand', 'CC_Base_R_Hand', 'R_Hand'],
    thighL: ['mixamorig:LeftUpLeg', 'CC_Base_L_Thigh_', 'L_Thigh'],
    thighR: ['mixamorig:RightUpLeg', 'CC_Base_R_Thigh_', 'R_Thigh'],
    calfL: ['mixamorig:LeftLeg', 'CC_Base_L_Calf_', 'L_Calf'],
    calfR: ['mixamorig:RightLeg', 'CC_Base_R_Calf_', 'R_Calf'],
    footL: ['mixamorig:LeftFoot', 'CC_Base_L_Foot', 'L_Foot'],
    footR: ['mixamorig:RightFoot', 'CC_Base_R_Foot', 'R_Foot']
};

/**
 * Cross-fade duration per destination clip, in seconds. Weight shifts are stance changes, so the
 * grounded blends are long enough to read; air states are short because they need to land on the
 * frame the ground check flips.
 *
 * @type {Record<string, number>}
 */
const BLEND = {
    idle: 0.26,
    aim: 0.18,
    run: 0.18,
    walk: 0.18,
    walkBack: 0.18,
    strafeL: 0.16,
    strafeR: 0.16,
    turn: 0.2,
    crouchIdle: 0.22,
    crouchWalk: 0.18,
    crouchTurn: 0.2,
    proneIdle: 0.3,
    proneTurnL: 0.2,
    proneTurnR: 0.2,
    sit: 0.35,
    jump: 0.1,
    fall: 0.14,
    dive: 0.12,
    death: 0.12
};

/** Clips that should hold their last frame instead of looping. @type {Record<string, boolean>} */
const ONE_SHOT = { jump: true, dive: true, death: true };

/**
 * Poses held from frame 0 of a clip that has no dedicated idle in the pack: the state is assigned
 * at speed 0 so the layer freezes on the first key instead of walking / turning out of the stance.
 *
 * @type {Record<string, boolean>}
 */
const FROZEN = { crouchIdle: true, proneIdle: true };

/**
 * Upper-body clips. These play on a masked overlay layer so a reload or a shot reads while the
 * legs keep running, and they never fight the stance the base layer is holding.
 *
 * @type {string[]}
 */
const UPPER_KEYS = ['fire', 'firePistol', 'crouchFire', 'reload', 'draw', 'pickUp', 'melee', 'hit'];

/** Seconds the overlay takes to fade in / out. */
const UPPER_FADE = 0.12;

/** Minimum seconds in a state before a grounded clip change is allowed. */
const MIN_DWELL = 0.12;

/** Degrees of camera pitch folded into the spine when aiming, as a fraction per joint. */
const AIM_SPINE_SHARE = { spine00: 0.18, spine01: 0.26, spine02: 0.3, head: 0.26 };

const deltaQ = new Quat();
const baseQ = new Quat();
const outQ = new Quat();
const aimQ = new Quat();
const aimAxis = new Vec3();
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
 * @param {Asset|null} asset - Loaded 'container' asset for the body mesh, null when unavailable.
 * @param {Record<string, object>} [extraTracks] - Extra AnimTracks keyed by locomotion state.
 * @returns {{ visual: Entity, gunAnchor: Entity, pose: (dt: number, state: RigState) => void } | null}
 *   The rig, or null when the model could not be instantiated (caller falls back to primitives).
 */
export function createSoldierRig(app, playerEntity, asset, extraTracks = {}) {
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
                if (name.includes(fragment) && !name.includes('Twist') && !name.includes('Thumb') && !name.includes('End')) {
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
    for (const bone of [nameIndex.get('Root'), nameIndex.get('mixamorig:Hips'), bones.hip]) {
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
    // Mixamo +Y is wrist → fingers; +Z points out the back of the hand (into the hip on
    // a lowered rifle idle). CC joints use a different bind, so keep the old socket there.
    if (nameIndex.has('mixamorig:RightHand')) {
        // Palm sits on +Z (back of the hand). Previous −Z floated the pistol
        // in front of the stomach. Grip along the fingers, barrel forward.
        gunAnchor.setLocalPosition(0, 0.05 * cs, 0.04 * cs);
        gunAnchor.setLocalEulerAngles(-90, 90, 90);
    } else {
        gunAnchor.setLocalPosition(0.03 * cs, 0.04 * cs, 0.02 * cs);
        gunAnchor.setLocalEulerAngles(-90, 0, 90);
    }

    const model = visual.children[0] ?? visual;
    const tracks = asset.resource.animations ?? [];
    /** @type {Record<string, boolean>} */
    const clips = {};
    /** @type {Record<string, boolean>} */
    const upperClips = {};
    /** @type {Record<string, number>} */
    const clipDuration = {};
    /** @type {import('../build/playcanvas').AnimComponentLayer|null} */
    let upperLayer = null;
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
        for (const [key, track] of Object.entries(extraTracks)) {
            if (track) {
                trackByKey[key] = track;
            }
        }

        // Assign the neutral stand first: the first `assignAnimation` builds the default state
        // graph and its node becomes `defaultState`, so the player spawns standing rather than
        // mid-stride. Packs without a real idle (Long Horn) fall back to frame 0 of the
        // turn-in-place clip, held by giving the state speed 0.
        const idleTrack = trackByKey.idle ?? trackByKey.turn ?? trackByKey.walk;
        if (idleTrack) {
            model.anim.assignAnimation('idle', idleTrack, undefined, trackByKey.idle ? 1 : 0, true);
            clips.idle = true;
            clipDuration.idle = idleTrack.duration ?? 1;
        }

        for (const [key, track] of Object.entries(trackByKey)) {
            if (key === 'idle' || UPPER_KEYS.includes(key)) {
                continue;
            }
            model.anim.assignAnimation(key, track, undefined, FROZEN[key] ? 0 : 1, !ONE_SHOT[key]);
            clips[key] = true;
            clipDuration[key] = track.duration ?? 1;
            if (key === 'run') {
                runDuration = track.duration || runDuration;
            }
        }

        // Overlay layer: everything from the first spine joint up. `children: true` on that one
        // path covers chest, neck, head and both arms, so a reload plays on the torso while the
        // base layer keeps owning the legs and the stance.
        const maskRoot = bones.spine00 ?? bones.spine01;
        const upperTracks = UPPER_KEYS.filter(key => trackByKey[key]);
        if (maskRoot && upperTracks.length) {
            const parts = [];
            for (let n = maskRoot; n && n !== model; n = n.parent) {
                parts.unshift(n.name);
            }
            // The binder resolves a curve either against the glTF root name or against the graph
            // node the component sits on, so register both spellings of the same path.
            const mask = {
                [parts.join('/')]: { children: true },
                [[model.name, ...parts].join('/')]: { children: true }
            };
            upperLayer = model.anim.addLayer('upper', 0, mask, ANIM_LAYER_OVERWRITE);
            for (const key of upperTracks) {
                const track = trackByKey[key];
                upperLayer.assignAnimation(key, track, 1, false);
                upperClips[key] = true;
                clipDuration[key] = track.duration ?? 1;
            }
        }

        console.info('[Battleground] Player clips:', Object.keys(clips).join(', ') || 'none');
        console.info('[Battleground] Upper-body clips:', Object.keys(upperClips).join(', ') || 'none');
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
    let currentClip = clips.idle ? 'idle' : '';
    let dwell = 0;
    let airborne = 0;
    let faceYaw = 0;
    let faced = false;
    let moving = false;

    /** @type {string|null} Logical one-shot requested since the last frame. */
    let pendingAction = null;

    /** @type {string|null} Overlay clip currently playing. */
    let activeUpper = null;

    /** Seconds left on the overlay clip. */
    let upperTimer = 0;

    /**
     * Queue an upper-body one-shot. Logical names (`fire`) resolve to the stance / weapon
     * variant on the frame they start, so the caller does not have to know which clips shipped.
     *
     * @param {string} name - `fire`, `melee`, `pickUp`, `hit` or a literal overlay clip key.
     */
    const playAction = (name) => {
        pendingAction = name;
    };

    /**
     * @param {string} name - Logical action name.
     * @param {RigState} state - Current movement state.
     * @returns {string|null} Overlay clip key that actually exists, or null.
     */
    const resolveAction = (name, state) => {
        if (name === 'fire') {
            if (state.crouch && upperClips.crouchFire) {
                return 'crouchFire';
            }
            if (state.weaponKind === 'Sidearm' && upperClips.firePistol) {
                return 'firePistol';
            }
            return upperClips.fire ? 'fire' : null;
        }
        return upperClips[name] ? name : null;
    };

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

            // --- Upper body: reload / draw hold for as long as the weapon says, one-shots run
            // out on their own clip length. Continuous actions outrank a stale shot.
            let wantUpper = null;
            if (state.dead) {
                wantUpper = null;
            } else if (state.reloading && upperClips.reload) {
                wantUpper = 'reload';
            } else if (state.equipping && upperClips.draw) {
                wantUpper = 'draw';
            } else {
                if (pendingAction) {
                    const resolved = resolveAction(pendingAction, state);
                    if (resolved) {
                        activeUpper = resolved;
                        // A held trigger re-triggers every shot: cap the overlay at the fire
                        // interval so the clip restarts instead of queueing up behind itself.
                        upperTimer = Math.min(clipDuration[resolved] ?? 0.4, 0.55);
                        upperLayer?.transition(resolved, UPPER_FADE);
                        if (upperLayer) {
                            upperLayer.activeStateCurrentTime = 0;
                        }
                    }
                }
                upperTimer = Math.max(0, upperTimer - dt);
                wantUpper = upperTimer > 0 ? activeUpper : null;
            }
            pendingAction = null;

            if (upperLayer) {
                if (wantUpper && wantUpper !== activeUpper) {
                    activeUpper = wantUpper;
                    upperLayer.transition(wantUpper, UPPER_FADE);
                    upperLayer.activeStateCurrentTime = 0;
                }
                const targetWeight = wantUpper ? 1 : 0;
                upperLayer.weight += (targetWeight - upperLayer.weight) *
                    Math.min(1, dt / UPPER_FADE);
            }

            // --- Facing. In combat the body holds the camera heading so the gun points where
            // the crosshair does and the legs strafe under it; otherwise it turns into the run.
            if (!faced) {
                faceYaw = state.lookYaw ?? 0;
                faced = true;
            }
            // Hysteresis: a single threshold flickers the run/idle blend while the capsule
            // velocity hovers around it.
            moving = state.speed > (moving ? 0.9 : 1.8);
            const aiming = (state.aimAmount ?? 0) > 0.5;
            const combat = aiming || !!state.reloading ||
                (!!wantUpper && wantUpper !== 'hit' && wantUpper !== 'draw');

            let targetYaw = faceYaw;
            if (combat) {
                targetYaw = state.lookYaw ?? faceYaw;
            } else if (moving) {
                targetYaw = Math.atan2(-(state.vx ?? 0), -(state.vz ?? 0)) * 180 / Math.PI;
            }
            const yawErr = wrapDeg(targetYaw - faceYaw);
            const turning = !combat && moving && Math.abs(yawErr) > 45 && !!clips.turn;
            // One exponential for both cases. Swapping to a clamped linear rate while the turn
            // clip played put a kink in the heading every time that state flipped.
            faceYaw = wrapDeg(faceYaw + yawErr * (1 - Math.exp(-(turning ? 7 : 13) * dt)));

            // Velocity resolved into the facing frame, so a strafing player gets the sideways
            // clip instead of a forward walk played sideways.
            const yawRad = faceYaw * Math.PI / 180;
            const fwdAmount = -(state.vx ?? 0) * Math.sin(yawRad) - (state.vz ?? 0) * Math.cos(yawRad);
            const sideAmount = (state.vx ?? 0) * Math.cos(yawRad) - (state.vz ?? 0) * Math.sin(yawRad);

            const urgent = airborne > 0.18;
            const fists = !!state.unarmed;
            const fast = state.speed > 36;
            let next = firstClip('idle', 'run', 'walk') ?? '';
            if (state.dead) {
                next = firstClip('death', 'dive') ?? next;
            } else if (urgent) {
                next = (state.vy ?? 0) > 0.5
                    ? (firstClip('jump', 'fall') ?? next)
                    : (firstClip('fall', 'jump') ?? next);
            } else if (state.sit) {
                next = firstClip('sit', 'crouchIdle') ?? next;
            } else if (state.prone) {
                if (Math.abs(yawErr) > 25) {
                    next = firstClip(yawErr > 0 ? 'proneTurnR' : 'proneTurnL', 'proneIdle') ?? next;
                } else {
                    next = firstClip('proneIdle', 'dive', 'fall') ?? next;
                }
            } else if (state.crouch) {
                if (moving) {
                    next = firstClip('crouchWalk', 'walk') ?? next;
                } else if (Math.abs(yawErr) > 45 && clips.crouchTurn) {
                    next = 'crouchTurn';
                } else {
                    next = firstClip('crouchIdle', 'idle') ?? next;
                }
            } else if (turning) {
                next = 'turn';
            } else if (moving && combat) {
                // Strafe / backpedal only read while the body is locked to the camera.
                if (Math.abs(sideAmount) > Math.abs(fwdAmount) * 1.2) {
                    next = firstClip(sideAmount > 0 ? 'strafeR' : 'strafeL', 'walk') ?? next;
                } else if (fwdAmount < -0.5) {
                    next = firstClip('walkBack', 'walk') ?? next;
                } else {
                    next = (fast && clips.run) ? 'run' : (firstClip('walk', 'run') ?? next);
                }
            } else if (moving) {
                next = (fast && clips.run) ? 'run' : (firstClip('walk', 'run') ?? next);
            } else if (aiming) {
                next = firstClip('aim', 'idle') ?? next;
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
            // by `dt * anim.speed`), so no clip change could ever blend. `speed` is per component,
            // not per layer, so hold it at 1 while an overlay plays or the reload sprints too.
            const strides = currentClip === 'run' || currentClip === 'walk' ||
                currentClip === 'walkBack' || currentClip === 'crouchWalk';
            const rate = Math.min(1.8, Math.max(1.4, state.speed / 14) * strideSpan);
            model.anim.speed = strides && !wantUpper && !model.anim.baseLayer.transitioning ? rate : 1;

            const sink = state.prone ? 0.72 : (state.sit ? 0.5 : (state.crouch ? 0.34 : 0));
            visual.setLocalPosition(0, plantY - sink, 0);
            // Mesh binds facing +Z; PlayCanvas move/look yaw 0 is −Z.
            visual.setLocalEulerAngles(0, faceYaw + 180, 0);
            // Cancel baked root motion. With the hips pinned the soles stay on the capsule bottom
            // at the `plantY` measured from the bind pose, so no per-frame AABB snap is needed —
            // that snap tracked whichever foot was lowest and bobbed the whole body each stride.
            for (const p of pinned) {
                p.bone.setLocalPosition(p.bind);
            }

            // Point the gun at what the camera is looking at. Clips only cover level aim, so the
            // camera pitch is folded into the spine in world space (bone local axes are not
            // aligned with the body) and shared out so the bend reads as a lean, not a break.
            const aimBlend = combat ? 1 : (state.aimAmount ?? 0);
            const pitch = (state.lookPitch ?? 0) * aimBlend;
            if (Math.abs(pitch) > 0.5) {
                aimAxis.copy(visual.right);
                for (const [role, share] of Object.entries(AIM_SPINE_SHARE)) {
                    const bone = bones[role];
                    if (!bone) {
                        continue;
                    }
                    aimQ.setFromAxisAngle(aimAxis, pitch * share);
                    outQ.mul2(aimQ, bone.getRotation());
                    bone.setRotation(outQ);
                }
            }

            // Rifle clips keep the hands on a gun. On fists, drop the arms to the
            // sides (Mixamo T-pose hangs with roll) and only swing them while moving.
            gunAnchor.enabled = !fists;
            if (fists && !wantUpper) {
                phase += (moving ? state.speed * 0.085 : 0) * dt;
                const swing = moving ? Math.sin(phase) : 0;
                const swing2 = moving ? Math.sin(phase + Math.PI) : 0;
                const run = Math.min(1, state.speed / 40);
                const drop = 1.38;
                const pump = moving ? 0.35 + run * 0.45 : 0;
                rotate(bones.uarmL, swing2 * pump, 0.03, drop);
                rotate(bones.farmL, 0.4 + run * 0.12);
                rotate(bones.uarmR, swing * pump, -0.03, -drop);
                rotate(bones.farmR, 0.4 + run * 0.12);
                rotate(bones.handL, 0.12);
                rotate(bones.handR, 0.12);
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
 * @property {number} [vy] - World-space velocity Y (rising vs falling).
 * @property {number} [lookYaw] - Camera yaw in degrees.
 * @property {number} [lookPitch] - Camera pitch in degrees, positive looking up.
 * @property {boolean} crouch - Crouch stance.
 * @property {boolean} prone - Prone stance.
 * @property {boolean} [sit] - Seated stance.
 * @property {number} aimAmount - 0..1 weapon-ready blend.
 * @property {boolean} grounded - On the floor.
 * @property {boolean} [unarmed] - Fists only: relaxed arms, no gun pose.
 * @property {boolean} [reloading] - Reload in progress.
 * @property {boolean} [equipping] - Weapon being drawn after a switch or pickup.
 * @property {boolean} [dead] - Awaiting respawn.
 * @property {string} [weaponKind] - Held weapon category, picks the pistol vs rifle fire clip.
 */

/** Extra runtime flag: when true the player controller must not touch the wrapper transform. */

    return { visual, gunAnchor, pose, playAction };
}
