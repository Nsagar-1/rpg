import { Color, Entity, StandardMaterial, Vec3 } from '../build/playcanvas';

import { sfx } from './audio.mjs';
import { getWeapon } from './weapons/weapon-data.mjs';

/** @import { AppBase } from '../build/playcanvas' */
/** @import { InputState } from './input/input-state.mjs' */
/** @import { WeaponController } from './scripts/weapon-controller.mjs' */
/** @import { PlayerController } from './scripts/player-controller.mjs' */
/** @import { GunAssets } from './weapons/gun-assets.mjs' */

/**
 * @typedef {object} Pickup
 * @property {Entity} entity - Scene node holding the visual.
 * @property {'weapon'|'ammo'|'health'} kind - What taking it does.
 * @property {string} label - Text shown in the prompt.
 * @property {string} [weaponId] - Weapon to grant.
 * @property {number} amount - Spare ammo, or health restored.
 * @property {number} respawn - Seconds until it comes back; 0 means it is gone for good.
 * @property {number} timer - Countdown while taken.
 * @property {boolean} taken - Currently hidden.
 * @property {number} phase - Bob/spin offset so a field of pickups isn't in lockstep.
 */

/**
 * @typedef {object} PickupOptions
 * @property {AppBase} app - Application.
 * @property {Entity} player - Player entity.
 * @property {InputState} input - Shared input state.
 * @property {() => WeaponController|null} getWeapon - Accessor for the weapon controller.
 * @property {() => PlayerController|null} getPlayer - Accessor for the player controller.
 * @property {GunAssets|null} [gunAssets] - Loaded GLB gun models.
 */

const PICKUP_RANGE = 2.6;
const playerPos = new Vec3();

/**
 * @param {number[]} rgb - Diffuse colour.
 * @param {number} [emissive] - Emissive intensity.
 * @returns {StandardMaterial} A ready-to-use material.
 */
function material(rgb, emissive = 0) {
    const mat = new StandardMaterial();
    mat.diffuse = new Color(rgb[0], rgb[1], rgb[2]);
    if (emissive > 0) {
        mat.emissive = new Color(rgb[0], rgb[1], rgb[2]);
        mat.emissiveIntensity = emissive;
    }
    mat.update();
    return mat;
}

/**
 * Ground pickups: weapons, ammo boxes and medkits. Owns proximity detection, the on-screen prompt
 * and applying the effect, so both the desktop key and the touch button route through one path.
 *
 * @param {PickupOptions} options - Application, player and gameplay accessors.
 * @returns {{ spawnWeapon: Function, spawnHealth: Function, spawnAmmo: Function, dropHeld: Function, pickups: Pickup[] }}
 * Spawners plus the live pickup list.
 */
export function createPickupSystem({ app, player, input, getWeapon: weaponAccessor, getPlayer, gunAssets = null }) {
    /** @type {Pickup[]} */
    const pickups = [];

    /** @type {Pickup|null} */
    let nearest = null;

    const glowMat = material([0.35, 0.75, 1], 1.4);
    const healthMat = material([0.25, 0.9, 0.45], 1.2);
    const ammoMat = material([0.95, 0.75, 0.2], 0.9);

    /**
     * @param {Entity} root - Pickup root.
     * @param {StandardMaterial} ringMat - Colour of the marker disc.
     */
    const addMarker = (root, ringMat) => {
        const ring = new Entity('marker');
        ring.addComponent('render', { type: 'cylinder', material: ringMat });
        ring.setLocalScale(0.9, 0.02, 0.9);
        ring.setLocalPosition(0, -0.35, 0);
        root.addChild(ring);
    };

    /**
     * @param {string} weaponId - Weapon to represent.
     * @returns {Entity} A spinnable weapon visual.
     */
    const buildWeaponVisual = (weaponId) => {
        const def = getWeapon(weaponId);
        const root = new Entity(`pickup-${def.id}`);
        const modelRoot = new Entity('model');
        root.addChild(modelRoot);

        const glb = gunAssets?.instantiate(def, 'world');
        if (glb) {
            modelRoot.addChild(glb);
        } else {
            modelRoot.setLocalScale(1.5, 1.5, 1.5);
            for (const part of def.parts) {
                const c = part.color ?? def.bodyColor;
                const piece = new Entity('part');
                piece.addComponent('render', { type: 'box', material: material(c) });
                piece.setLocalScale(part.scale[0], part.scale[1], part.scale[2]);
                piece.setLocalPosition(part.position[0], part.position[1], part.position[2]);
                modelRoot.addChild(piece);
            }
        }

        addMarker(root, glowMat);
        return root;
    };

    /**
     * @param {Pickup} pickup - Entry to add.
     * @returns {Pickup} The same entry, for chaining.
     */
    const register = (pickup) => {
        app.root.addChild(pickup.entity);
        pickups.push(pickup);
        return pickup;
    };

    /**
     * @param {string} weaponId - Weapon id.
     * @param {number} x - World X.
     * @param {number} z - World Z.
     * @param {object} [opts] - Placement and contents.
     * @param {number} [opts.ammo] - Spare ammo carried by the pickup.
     * @param {number} [opts.respawn] - Respawn delay; 0 for a one-off (player drops).
     * @param {number} [opts.y] - World Y.
     * @returns {Pickup} The registered pickup.
     */
    const spawnWeapon = (weaponId, x, z, opts = {}) => {
        const def = getWeapon(weaponId);
        const entity = buildWeaponVisual(weaponId);
        entity.setLocalPosition(x, opts.y ?? 0.85, z);
        return register({
            entity,
            kind: 'weapon',
            label: def.name,
            weaponId: def.id,
            amount: opts.ammo ?? def.reserve,
            respawn: opts.respawn ?? 18,
            timer: 0,
            taken: false,
            phase: Math.random() * Math.PI * 2
        });
    };

    /**
     * @param {number} x - World X.
     * @param {number} z - World Z.
     * @param {number} [amount] - Health restored.
     * @returns {Pickup} The registered pickup.
     */
    const spawnHealth = (x, z, amount = 50) => {
        const entity = new Entity('pickup-medkit');
        const box = new Entity('model');
        box.addComponent('render', { type: 'box', material: healthMat });
        box.setLocalScale(0.45, 0.3, 0.45);
        entity.addChild(box);
        addMarker(entity, healthMat);
        entity.setLocalPosition(x, 0.6, z);
        return register({
            entity,
            kind: 'health',
            label: `Medkit +${amount}`,
            amount,
            respawn: 22,
            timer: 0,
            taken: false,
            phase: Math.random() * Math.PI * 2
        });
    };

    /**
     * @param {number} x - World X.
     * @param {number} z - World Z.
     * @param {number} [amount] - Rounds granted.
     * @returns {Pickup} The registered pickup.
     */
    const spawnAmmo = (x, z, amount = 60) => {
        const entity = new Entity('pickup-ammo');
        const box = new Entity('model');
        box.addComponent('render', { type: 'box', material: ammoMat });
        box.setLocalScale(0.5, 0.28, 0.34);
        entity.addChild(box);
        addMarker(entity, ammoMat);
        entity.setLocalPosition(x, 0.6, z);
        return register({
            entity,
            kind: 'ammo',
            label: `Ammo +${amount}`,
            amount,
            respawn: 16,
            timer: 0,
            taken: false,
            phase: Math.random() * Math.PI * 2
        });
    };

    /**
     * @param {Pickup} pickup - Entry the player is standing on.
     * @returns {string|null} Feedback message, or null when nothing was taken.
     */
    const collect = (pickup) => {
        const weapon = weaponAccessor();
        const playerScript = getPlayer();

        if (pickup.kind === 'health') {
            if (!playerScript?.addMedkit()) {
                return null;
            }
            sfx.heal();
            return `Picked up ${pickup.label}`;
        }

        if (pickup.kind === 'ammo') {
            if (!weapon?.addAmmo(pickup.amount)) {
                return null;
            }
            sfx.pickup();
            return `Picked up ${pickup.label}`;
        }

        if (!weapon || !pickup.weaponId) {
            return null;
        }

        const outcome = weapon.pickUp(pickup.weaponId, pickup.amount);
        if (outcome.result === 'full') {
            return null;
        }

        sfx.pickup();

        // A swap drops the old gun where the player stands, with the ammo it still had.
        if (outcome.dropped) {
            const pos = player.getPosition();
            const dropped = outcome.dropped;
            spawnWeapon(dropped.def.id, pos.x + 0.8, pos.z, {
                ammo: dropped.reserve + dropped.ammo,
                respawn: 0
            });
        }

        if (outcome.result === 'ammo') {
            return `${outcome.name} ammo topped up`;
        }
        return `Equipped ${outcome.name}`;
    };

    /**
     * Drop the held weapon on the ground in front of the player.
     *
     * @returns {string|null} Feedback message.
     */
    const dropHeld = () => {
        const weapon = weaponAccessor();
        const dropped = weapon?.dropActive();
        if (!dropped?.length) {
            return null;
        }

        const pos = player.getPosition();
        const fwd = player.forward;
        dropped.forEach((slot, i) => {
            const side = i - (dropped.length - 1) * 0.5;
            spawnWeapon(slot.def.id, pos.x + fwd.x * 1.2 + side * 0.55, pos.z + fwd.z * 1.2, {
                ammo: slot.reserve + slot.ammo,
                respawn: 0
            });
        });
        return dropped.length === 1
            ? `Dropped ${dropped[0].def.name}`
            : `Dropped ${dropped.length} weapons`;
    };

    app.on('update', (/** @type {number} */ dt) => {
        playerPos.copy(player.getPosition());

        /** @type {Pickup|null} */
        let closest = null;
        let closestDist = PICKUP_RANGE;

        for (const pickup of pickups) {
            if (pickup.taken) {
                pickup.timer -= dt;
                if (pickup.respawn > 0 && pickup.timer <= 0) {
                    pickup.taken = false;
                    pickup.entity.enabled = true;
                }
                continue;
            }

            pickup.phase += dt;
            const model = pickup.entity.children[0];
            model.setLocalEulerAngles(0, pickup.phase * 62, 0);
            model.setLocalPosition(0, Math.sin(pickup.phase * 2) * 0.07, 0);

            const dx = pickup.entity.getPosition().x - playerPos.x;
            const dz = pickup.entity.getPosition().z - playerPos.z;
            const dy = pickup.entity.getPosition().y - playerPos.y;
            const dist = Math.sqrt(dx * dx + dz * dz + dy * dy * 0.25);
            if (dist < closestDist) {
                closestDist = dist;
                closest = pickup;
            }
        }

        if (closest !== nearest) {
            nearest = closest;
            app.fire('pickup:prompt', nearest ? { label: nearest.label, kind: nearest.kind } : null);
        }

        if (input.takePickup() && nearest && !getPlayer()?.dead) {
            const message = collect(nearest);
            if (message) {
                app.fire('feed:message', message);
                nearest.taken = true;
                nearest.timer = nearest.respawn;
                nearest.entity.enabled = false;
                if (nearest.respawn === 0) {
                    nearest.entity.destroy();
                    pickups.splice(pickups.indexOf(nearest), 1);
                }
                nearest = null;
                app.fire('pickup:prompt', null);
            }
        }

        if (input.takeDrop() && !getPlayer()?.dead) {
            const message = dropHeld();
            if (message) {
                app.fire('feed:message', message);
            }
        }
    });

    return { spawnWeapon, spawnHealth, spawnAmmo, dropHeld, pickups };
}
