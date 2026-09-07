import { Color, Entity, math, Quat, Script, StandardMaterial, Vec3 } from '../../build/playcanvas';

import { sfx } from '../audio.mjs';
import { getWeapon } from '../weapons/weapon-data.mjs';

/** @import { CameraComponent } from '../../build/playcanvas' */
/** @import { WeaponDef } from '../weapons/weapon-data.mjs' */
/** @import { InputState } from '../input/input-state.mjs' */
/** @import { PlayerController } from './player-controller.mjs' */
/** @import { GunAssets } from '../weapons/gun-assets.mjs' */

/**
 * @typedef {object} WeaponSlot
 * @property {WeaponDef} def - Weapon definition.
 * @property {number} ammo - Rounds in the magazine.
 * @property {number} reserve - Spare rounds.
 */

const origin = new Vec3();
const direction = new Vec3();
const end = new Vec3();
const spreadRot = new Quat();
const camRot = new Quat();
const tracerColor = new Color(1, 0.85, 0.45);

// Far enough out that a long barrel never crosses the near clip plane and swallows the screen.
const HIP_POS = new Vec3(0.17, -0.15, -0.52);
const ADS_POS = new Vec3(0, -0.075, -0.46);
const EQUIP_TIME = 0.35;

/**
 * Hitscan weapon handling: two-slot inventory, hip/ADS accuracy, recoil, reloads from a reserve,
 * tracers and impact decals. Reads the shared {@link InputState}; the {@link PlayerController}
 * owns the camera angles that recoil is pushed into.
 */
export class WeaponController extends Script {
    static scriptName = 'weaponController';

    /** @type {Entity} */
    camera;

    /** @type {InputState} */
    // @ts-ignore assigned via script properties
    input;

    /** @type {PlayerController} */
    // @ts-ignore assigned via script properties
    player;

    /** @type {GunAssets|null} */
    // @ts-ignore assigned via script properties
    gunAssets = null;

    /** @type {Entity|null} */
    gunAnchor = null;

    /** @attribute @title Base FOV @type {number} */
    baseFov = 75;

    /** @attribute @title Damage Multiplier @type {number} */
    damageMult = 1;

    /** @type {Array<WeaponSlot|null>} */
    slots = [null, null];

    /** @type {number} */
    activeSlot = 0;

    /** True while guns stay in inventory but the hands are empty. */
    holstered = false;

    /** @type {number} */
    _cooldown = 0;

    /** @type {number} */
    _equipTimer = 0;

    /** @type {boolean} */
    _reloading = false;

    /** @type {number} */
    _reloadTimer = 0;

    /** @type {boolean} */
    _firePrev = false;

    /** @type {Entity|null} */
    _viewModel = null;

    /** @type {Vec3} */
    _viewPos = new Vec3().copy(HIP_POS);

    /** @type {number} */
    _viewKick = 0;

    /** @type {number} */
    _currentSpread = 0;

    /** @type {boolean} */
    _scoped = false;

    /** @type {Array<{ start: Vec3, end: Vec3, ttl: number }>} */
    _tracers = [];

    /** @type {Entity[]} */
    _impactPool = [];

    /** @type {number} */
    _impactIndex = 0;

    initialize() {
        this._buildImpactPool();
        this._emitState();
    }

    /**
     * @returns {WeaponSlot|null} The held weapon, or null when unarmed.
     */
    get active() {
        return this.holstered ? null : this.slots[this.activeSlot];
    }

    /**
     * @returns {boolean} True while a reload is in progress.
     */
    get reloading() {
        return this._reloading;
    }

    /**
     * @returns {boolean} True while aiming down sights with a weapon held.
     */
    get aiming() {
        return !!this.input?.aim && !!this.active;
    }

    /** @returns {number} Current cone half-angle, used to size the crosshair. */
    get spread() {
        return this._currentSpread;
    }

    // --- Inventory --------------------------------------------------------

    /**
     * Add a weapon to the inventory. Duplicates top up the reserve; a full inventory swaps out the
     * currently held gun and reports it so the caller can drop it on the ground.
     *
     * @param {string} id - Weapon id.
     * @param {number} [reserve] - Spare ammo carried by the pickup.
     * @returns {{ result: 'ammo'|'equipped'|'swapped'|'full', dropped: WeaponSlot|null, name: string }}
     * What happened, and the weapon that was displaced if the inventory was full.
     */
    pickUp(id, reserve) {
        const def = getWeapon(id);
        const spare = reserve ?? def.reserve;

        const existing = this.slots.find(s => s?.def.id === def.id);
        if (existing) {
            if (existing.reserve >= def.maxReserve) {
                return { result: 'full', dropped: null, name: def.name };
            }
            existing.reserve = Math.min(def.maxReserve, existing.reserve + Math.round(spare * 0.5));
            this._emitState();
            return { result: 'ammo', dropped: null, name: def.name };
        }

        /** @type {WeaponSlot} */
        const slot = { def, ammo: def.magazine, reserve: spare };

        const empty = this.slots.indexOf(null);
        if (empty !== -1) {
            this.slots[empty] = slot;
            // Force the select: picking into the slot you already have highlighted still has to
            // build the view model, which a no-op switch would skip.
            this.selectSlot(empty, true);
            return { result: 'equipped', dropped: null, name: def.name };
        }

        const dropped = this.slots[this.activeSlot];
        this.slots[this.activeSlot] = slot;
        this.selectSlot(this.activeSlot, true);
        return { result: 'swapped', dropped, name: def.name };
    }

    /**
     * @param {number} index - Slot index, -1 for fists, or -2 to cycle (guns then fists).
     * @param {boolean} [force] - Rebuild the view model even if the slot did not change.
     */
    selectSlot(index, force = false) {
        if (index === -1) {
            this.holster(force);
            return;
        }

        let target = index;
        if (index === -2) {
            if (this.holstered) {
                target = this.slots.findIndex(s => !!s);
            } else {
                const next = (this.activeSlot + 1) % this.slots.length;
                target = this.slots[next] ? next : -1;
            }
            if (target === -1) {
                this.holster();
                return;
            }
        }

        if (target < 0 || target >= this.slots.length || !this.slots[target]) {
            this.holster();
            return;
        }
        if (!this.holstered && target === this.activeSlot && !force) {
            return;
        }

        this.holstered = false;
        this.activeSlot = target;
        this._reloading = false;
        this._equipTimer = EQUIP_TIME;
        this._buildViewModel();
        this._emitState();
    }

    /**
     * Put every gun away and fight with fists. Inventory is unchanged.
     *
     * @param {boolean} [force] - Rebuild even if already unarmed.
     */
    holster(force = false) {
        if (this.holstered && !force) {
            return;
        }
        this.holstered = true;
        this._reloading = false;
        this._equipTimer = 0;
        this._buildViewModel();
        this._emitState();
    }

    /**
     * Drop the held weapon. Already on fists: dump every remaining gun.
     *
     * @returns {WeaponSlot[]|null} Dropped weapons, or null when there was nothing to drop.
     */
    dropActive() {
        if (this.holstered || !this.active) {
            const dumped = /** @type {WeaponSlot[]} */ (this.slots.filter(s => !!s));
            if (!dumped.length) {
                return null;
            }
            this.slots.fill(null);
            this.holster(true);
            return dumped;
        }

        const dropped = this.slots[this.activeSlot];
        this.slots[this.activeSlot] = null;
        const next = this.slots.findIndex(s => !!s);
        if (next === -1) {
            this.holster(true);
        } else {
            this.selectSlot(next, true);
        }
        return dropped ? [dropped] : null;
    }

    /**
     * @param {number} amount - Rounds to add to the held weapon's reserve.
     * @returns {boolean} True if any ammo was taken.
     */
    addAmmo(amount) {
        const slot = this.active;
        if (!slot || slot.reserve >= slot.def.maxReserve) {
            return false;
        }
        slot.reserve = Math.min(slot.def.maxReserve, slot.reserve + amount);
        this._emitState();
        return true;
    }

    // --- Firing -----------------------------------------------------------

    startReload() {
        const slot = this.active;
        if (!slot || this._reloading || this._equipTimer > 0) {
            return;
        }
        if (slot.ammo >= slot.def.magazine || slot.reserve <= 0) {
            return;
        }

        this._reloading = true;
        this._reloadTimer = slot.def.reloadTime;
        sfx.reload();
        this._emitState();
    }

    tryFire() {
        const slot = this.active;
        if (!slot || this._reloading || this._cooldown > 0 || this._equipTimer > 0) {
            return;
        }
        if (this.player?.dead) {
            return;
        }

        if (slot.ammo <= 0) {
            sfx.empty();
            this._cooldown = 0.25;
            this.startReload();
            return;
        }

        slot.ammo--;
        this._cooldown = slot.def.fireRate;
        this._viewKick = 1;
        sfx.shot(slot.def.shotFreq);
        this._emitState();

        const cone = this._computeSpread(slot.def);
        for (let i = 0; i < slot.def.pellets; i++) {
            this._fireRay(slot.def, cone);
        }

        const kick = slot.def.recoil * (this.aiming ? 0.65 : 1);
        this.player?.addRecoil(kick, (Math.random() - 0.5) * kick * 0.6);
        this.app.fire('weapon:fired', slot.def.id);
    }

    /**
     * @param {WeaponDef} def - Held weapon.
     * @returns {number} Cone half-angle in degrees for this shot.
     * @private
     */
    _computeSpread(def) {
        let cone = this.aiming ? def.adsSpread : def.spread;
        if (this.player?.moving) {
            cone *= 1.6;
        }
        if (!this.player?.grounded) {
            cone *= 2.2;
        }
        if (this.player?.crouching) {
            cone *= 0.6;
        }
        this._currentSpread = cone;
        return cone;
    }

    /**
     * @param {WeaponDef} def - Held weapon.
     * @param {number} cone - Cone half-angle in degrees.
     * @private
     */
    _fireRay(def, cone) {
        const cam = /** @type {CameraComponent} */ (this.camera.camera);
        origin.copy(cam.entity.getPosition());

        camRot.copy(cam.entity.getRotation());
        if (cone > 0) {
            spreadRot.setFromEulerAngles(
                (Math.random() - 0.5) * 2 * cone,
                (Math.random() - 0.5) * 2 * cone,
                0
            );
            camRot.mul(spreadRot);
        }
        camRot.transformVector(Vec3.FORWARD, direction);
        end.copy(direction).mulScalar(def.range).add(origin);

        const result = this.app.systems.rigidbody?.raycastFirst(origin, end, {
            filterCallback: (/** @type {Entity} */ e) => e !== this.entity
        });

        this._spawnTracer(origin, result ? result.point : end);

        if (!result?.entity) {
            this.app.fire('debug:shot', { hit: false, entity: null, point: null });
            return;
        }

        this._spawnImpact(result.point, result.normal);

        const hitBox = result.entity.script?.hitBox;
        const target = hitBox ? hitBox.owner?.script?.damageTarget : result.entity.script?.damageTarget;

        this.app.fire('debug:shot', {
            hit: true,
            entity: target?.label ?? result.entity.name,
            point: `${result.point.x.toFixed(2)}, ${result.point.y.toFixed(2)}, ${result.point.z.toFixed(2)}`,
            hasDamageScript: !!target
        });

        if (!target) {
            return;
        }

        const isHead = hitBox?.zone === 'head';
        const zoneMult = isHead ? def.headshotMult : (hitBox?.multiplier ?? 1);
        const amount = Math.round(def.damage * zoneMult * this.damageMult);
        const killed = target.applyDamage(amount, result.point.clone(), isHead, 'You');

        if (isHead) {
            sfx.headshot();
        } else {
            sfx.hit();
        }

        this.app.fire('weapon:hitmarker', isHead, killed);
        if (killed) {
            sfx.kill();
            if (this.player) {
                this.player.kills++;
            }
            this.app.fire('score:kill', target.label, def.name, isHead);
        }
    }

    // --- Presentation -----------------------------------------------------

    /** @private */
    _buildImpactPool() {
        const mat = new StandardMaterial();
        mat.diffuse = new Color(0.05, 0.05, 0.05);
        mat.emissive = new Color(1, 0.7, 0.3);
        mat.emissiveIntensity = 2;
        mat.update();

        for (let i = 0; i < 24; i++) {
            const e = new Entity(`impact-${i}`);
            e.addComponent('render', { type: 'sphere', material: mat });
            e.setLocalScale(0, 0, 0);
            e.enabled = false;
            this.app.root.addChild(e);
            this._impactPool.push(e);
        }
    }

    /**
     * @param {Vec3} point - World hit point.
     * @param {Vec3} normal - Surface normal.
     * @private
     */
    _spawnImpact(point, normal) {
        const e = this._impactPool[this._impactIndex];
        this._impactIndex = (this._impactIndex + 1) % this._impactPool.length;

        e.enabled = true;
        e.setPosition(point.x + normal.x * 0.02, point.y + normal.y * 0.02, point.z + normal.z * 0.02);
        e.setLocalScale(0.08, 0.08, 0.08);

        const start = performance.now();
        const fade = () => {
            const t = (performance.now() - start) / 220;
            if (t >= 1) {
                e.enabled = false;
                return;
            }
            const s = 0.08 * (1 - t);
            e.setLocalScale(s, s, s);
            requestAnimationFrame(fade);
        };
        requestAnimationFrame(fade);
    }

    /**
     * @param {Vec3} from - Muzzle position.
     * @param {Vec3} to - Impact position.
     * @private
     */
    _spawnTracer(from, to) {
        this._tracers.push({ start: from.clone(), end: to.clone(), ttl: 0.05 });
    }

    /** @private */
    _buildViewModel() {
        this._viewModel?.destroy();
        this._viewModel = null;

        const slot = this.active;
        if (!slot) {
            return;
        }

        const root = new Entity(`view-${slot.def.id}`);
        const model = this.gunAssets?.instantiate(slot.def, this.gunAnchor ? 'hand' : 'view');

        if (model) {
            root.addChild(model);
        } else {
            const grip = new Entity('grip');
            root.addChild(grip);
            for (const part of slot.def.parts) {
                const mat = new StandardMaterial();
                const c = part.color ?? slot.def.bodyColor;
                mat.diffuse = new Color(c[0], c[1], c[2]);
                mat.metalness = 0.7;
                mat.gloss = 0.45;
                mat.update();

                const piece = new Entity('part');
                piece.addComponent('render', { type: 'box', material: mat });
                piece.setLocalScale(part.scale[0], part.scale[1], part.scale[2]);
                piece.setLocalPosition(part.position[0], part.position[1], part.position[2]);
                grip.addChild(piece);
            }

            const hand = this.gunAnchor ? slot.def.modelHand : null;
            const s = hand?.scale ?? (this.gunAnchor ? 0.9 : 0.55);
            grip.setLocalScale(s, s, s);
            if (hand?.position) {
                grip.setLocalPosition(hand.position[0], hand.position[1], hand.position[2]);
            }
            if (hand?.rotation) {
                grip.setLocalEulerAngles(hand.rotation[0], hand.rotation[1], hand.rotation[2]);
            }
        }

        const parent = this.gunAnchor ?? this.camera;
        parent.addChild(root);
        this._viewModel = root;
        this._viewPos.copy(this.gunAnchor ? Vec3.ZERO : HIP_POS);
        root.setLocalPosition(this._viewPos);
    }

    /**
     * @param {number} dt - Delta time.
     * @private
     */
    _updateViewModel(dt) {
        const cam = /** @type {CameraComponent} */ (this.camera.camera);
        const slot = this.active;
        const aiming = this.aiming;

        const targetFov = aiming && slot ? slot.def.adsFov : this.baseFov;
        cam.fov = math.lerp(cam.fov, targetFov, Math.min(1, dt * 14));

        const scoped = !!(aiming && slot?.def.scope && Math.abs(cam.fov - targetFov) < 8);
        if (scoped !== this._scoped) {
            this._scoped = scoped;
            this.app.fire('weapon:scope', scoped);
        }

        if (!this._viewModel) {
            return;
        }

        this._viewModel.enabled = !scoped;
        this._viewKick = Math.max(0, this._viewKick - dt * 7);
        const equipDip = this._equipTimer > 0 ? (this._equipTimer / EQUIP_TIME) * 0.25 : 0;
        const reloadDip = this._reloading ? 0.12 : 0;

        if (this.gunAnchor) {
            this._viewModel.setLocalPosition(0, -equipDip * 0.15, this._viewKick * 0.04);
            this._viewModel.setLocalEulerAngles(this._viewKick * -8 - reloadDip * 25, 0, 0);
            return;
        }

        const target = aiming ? ADS_POS : HIP_POS;
        const t = Math.min(1, dt * 14);
        this._viewPos.lerp(this._viewPos, target, t);

        this._viewModel.setLocalPosition(
            this._viewPos.x,
            this._viewPos.y - equipDip - reloadDip,
            this._viewPos.z + this._viewKick * 0.05
        );
        this._viewModel.setLocalEulerAngles(
            this._viewKick * -6 - equipDip * 60 - reloadDip * 90,
            0,
            0
        );
    }

    /** @private */
    _emitState() {
        const slot = this.active;
        this.app.fire('weapon:state', {
            name: slot?.def.name ?? 'Fists',
            kind: slot?.def.kind ?? 'Melee',
            ammo: slot?.ammo ?? 0,
            magazine: slot?.def.magazine ?? 0,
            reserve: slot?.reserve ?? 0,
            reloading: this._reloading,
            activeSlot: this.holstered ? -1 : this.activeSlot,
            slots: this.slots.map(s => (s ? { id: s.def.id, name: s.def.name, ammo: s.ammo, reserve: s.reserve } : null))
        });
    }

    /**
     * Used by mobile auto-fire.
     *
     * @returns {boolean} True when the crosshair is currently over a live enemy.
     * @private
     */
    _enemyUnderCrosshair() {
        const slot = this.active;
        if (!slot) {
            return false;
        }

        const cam = /** @type {CameraComponent} */ (this.camera.camera);
        origin.copy(cam.entity.getPosition());
        cam.entity.forward.clone(direction);
        end.copy(direction).mulScalar(slot.def.range).add(origin);

        const result = this.app.systems.rigidbody?.raycastFirst(origin, end, {
            filterCallback: (/** @type {Entity} */ e) => e !== this.entity
        });
        if (!result?.entity) {
            return false;
        }

        const hitBox = result.entity.script?.hitBox;
        const target = hitBox ? hitBox.owner?.script?.damageTarget : result.entity.script?.damageTarget;
        return !!target && target.alive;
    }

    /**
     * @param {number} dt - Delta time.
     */
    update(dt) {
        this._cooldown = Math.max(0, this._cooldown - dt);
        this._equipTimer = Math.max(0, this._equipTimer - dt);

        if (this._reloading) {
            this._reloadTimer -= dt;
            if (this._reloadTimer <= 0) {
                const slot = this.active;
                if (slot) {
                    const needed = slot.def.magazine - slot.ammo;
                    const taken = Math.min(needed, slot.reserve);
                    slot.ammo += taken;
                    slot.reserve -= taken;
                }
                this._reloading = false;
                this._emitState();
            }
        }

        if (this.input && !this.player?.dead) {
            const slotRequest = this.input.takeSwitch();
            if (slotRequest !== -1) {
                this.selectSlot(slotRequest);
            }

            if (this.input.takeReload()) {
                this.startReload();
            }

            const def = this.active?.def;
            const tapped = this.input.takeFire();
            const wantFire = this.input.fire ||
                (this.input.autoFire && this._enemyUnderCrosshair());

            if (def) {
                const pressed = tapped || (wantFire && !this._firePrev);
                if (def.auto ? (wantFire || tapped) : pressed) {
                    this.tryFire();
                }
            }
            this._firePrev = wantFire;
        }

        this._updateViewModel(dt);

        for (let i = this._tracers.length - 1; i >= 0; i--) {
            const tracer = this._tracers[i];
            tracer.ttl -= dt;
            if (tracer.ttl <= 0) {
                this._tracers.splice(i, 1);
                continue;
            }
            this.app.drawLine(tracer.start, tracer.end, tracerColor, false);
        }
    }
}
