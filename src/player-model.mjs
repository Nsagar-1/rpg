import { BoundingBox, Entity, Quat } from '../build/playcanvas';

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
    hip: ['CC_Base_Hip', 'CC_Base_Pelvis', 'CC_Base_Waist'],
    spine01: ['CC_Base_Spine01'],
    spine02: ['CC_Base_Spine02'],
    head: ['CC_Base_Head'],
    uarmL: ['CC_Base_L_Upperarm'],
    uarmR: ['CC_Base_R_Upperarm'],
    farmL: ['CC_Base_L_Forearm_'],
    farmR: ['CC_Base_R_Forearm_'],
    handL: ['CC_Base_L_Hand'],
    handR: ['CC_Base_R_Hand'],
    thighL: ['CC_Base_L_Thigh_'],
    thighR: ['CC_Base_R_Thigh_'],
    calfL: ['CC_Base_L_Calf_'],
    calfR: ['CC_Base_R_Calf_'],
    footL: ['CC_Base_L_Foot'],
    footR: ['CC_Base_R_Foot']
};

const deltaQ = new Quat();
const baseQ = new Quat();
const outQ = new Quat();

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

    // Normalize to capsule height and put the feet on the wrapper origin. Mesh AABBs are world
    // space, but nothing has moved the model yet, so min/max Y are directly usable.
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
    const s = HEIGHT / (aabb.halfExtents.y * 2);
    visual.setLocalScale(s, s, s);
    visual.setLocalPosition(0, -0.9 - aabb.getMin().y * s, 0);

    // Collect joints and remember their bind rotations so procedural deltas compose cleanly.
    const bones = /** @type {Record<string, Entity>} */ ({});
    for (const [role, fragments] of Object.entries(BONE_FRAGMENTS)) {
        for (const fragment of fragments) {
            const bone = visual.findByName(fragment)?.[0];
            if (bone) {
                bones[role] = bone;
                break;
            }
        }
    }
    const base = new Map();
    for (const bone of Object.values(bones)) {
        base.set(bone, bone.getLocalRotation().clone());
    }
    if (!bones.uarmR || !bones.thighL) {
        return null;
    }

    // Gun socket hangs off the right hand; the weapon controller parents its model here.
    const gunAnchor = new Entity('gun-anchor');
    bones.handR.addChild(gunAnchor);
    gunAnchor.setLocalPosition(0.02, 0.12, 0.04);
    gunAnchor.setLocalEulerAngles(-90, 0, 90);

    let phase = 0;
    let clock = 0;

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

        // Wrapper height: stance offsets plus a run-cycle bounce. The controller owns X/Z and yaw.
        const bob = state.grounded ? Math.abs(Math.sin(phase)) * 0.05 : 0;
        const sink = state.crouch ? 0.34 : 0;
        visual.setLocalPosition(0, -0.9 - aabb.getMin().y * s - sink + bob, 0);

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
 * @property {boolean} crouch - Crouch stance.
 * @property {boolean} prone - Prone stance.
 * @property {number} aimAmount - 0..1 weapon-ready blend.
 * @property {boolean} grounded - On the floor.
 */

/** Extra runtime flag: when true the player controller must not touch the wrapper transform. */

    return { visual, gunAnchor, pose };
}
