import { math, Quat, Script, Vec3 } from '../../build/playcanvas';

import { sfx } from '../audio.mjs';

/** @import { Entity, RigidBodyComponent, RigidBodyComponentSystem } from '../../build/playcanvas' */
/** @import { InputState } from '../input/input-state.mjs' */

const v = new Vec3();
const forward = new Vec3();
const right = new Vec3();
const offset = new Vec3();
const rotation = new Quat();
const rayEnd = new Vec3();
const look = { x: 0, y: 0 };

/**
 * Exponential damping helper — frame-rate independent lerp factor.
 *
 * @param {number} damping - Per-millisecond retention.
 * @param {number} dt - Delta time in seconds.
 * @returns {number} Lerp alpha.
 */
const damp = (damping, dt) => 1 - Math.pow(damping, dt * 1000);

/**
 * Physics-driven third-person player. Reads a shared {@link InputState} rather than binding
 * devices itself, so keyboard, touch and gamepad all drive the same code path.
 *
 * Owns look angles (including weapon recoil), stance, health and respawn.
 */
export class PlayerController extends Script {
    static scriptName = 'playerController';

    /** @type {Entity} */
    camera;

    /** @type {Entity|null} */
    visual = null;

    /** @type {InputState} */
    // @ts-ignore assigned via script properties
    input;

    /** @attribute @title Look Sensitivity @type {number} */
    lookSens = 0.12;

    /** @attribute @title Ground Speed @type {number} */
    speedGround = 80;

    /** @attribute @title Air Speed @type {number} */
    speedAir = 6;

    /** @attribute @title Sprint Multiplier @type {number} */
    sprintMult = 1.5;

    /** @attribute @title Crouch Multiplier @type {number} */
    crouchMult = 0.5;

    /** @attribute @title Aim Multiplier @type {number} */
    aimMult = 0.65;

    /** @attribute @title Fist Speed Multiplier @type {number} */
    fistMult = 1.35;

    /** @attribute @title Jump Force @type {number} */
    jumpForce = 850;

    /** @attribute @title Max Health @type {number} */
    maxHealth = 100;

    /** @attribute @title Respawn Delay (s) @type {number} */
    respawnDelay = 3;

    /** @type {Vec3} */
    spawnPoint = new Vec3(0, 2, 4);

    /** @type {number} */
    medkits = 2;

    /** @type {RigidBodyComponent} */
    // @ts-ignore assigned in initialize
    _rigidbody;

    /** @type {Vec3} Pitch/yaw the camera is actually rendered with. */
    _angles = new Vec3();

    /** @type {number} Recoil already folded into `_angles`, pulled back over time. */
    _recoilDebt = 0;

    /** @type {boolean} */
    _grounded = false;

    /** @type {boolean} */
    _jumping = false;

    /** @type {number} */
    _health = 100;

    /** @type {boolean} */
    _dead = false;

    /** @type {number} */
    _respawnTimer = 0;

    /** @type {number} */
    _regenTimer = 0;

    /** @type {number} */
    kills = 0;

    /** @type {number} */
    deaths = 0;

    /** @type {number|null} XZ lock while no move input, so physics cannot slide the body back. */
    _holdX = null;

    /** @type {number|null} */
    _holdZ = null;

    initialize() {
        if (!this.camera) {
            throw new Error('PlayerController: camera entity is required');
        }

        this._rigidbody = /** @type {RigidBodyComponent} */ (this.entity.rigidbody);
        this._health = this.maxHealth;
        this._angles.set(-6, this.entity.getEulerAngles().y, 0);
        this._updateCamera();
    }

    /** @returns {number} Camera yaw in degrees. */
    get yaw() {
        return this._angles.y;
    }

    /** @returns {number} Camera pitch in degrees, positive looking up. */
    get pitch() {
        return this._angles.x;
    }

    /**
     * @returns {number} Current health.
     */
    get health() {
        return this._health;
    }

    /**
     * @returns {boolean} True while awaiting respawn.
     */
    get dead() {
        return this._dead;
    }

    /**
     * @returns {boolean} True while standing on something solid.
     */
    get grounded() {
        return this._grounded;
    }

    /**
     * @returns {boolean} True while crouched on the ground.
     */
    get crouching() {
        return this.input?.crouch && !this.input?.prone && this._grounded;
    }

    /** @returns {boolean} True while prone on the ground. */
    get proning() {
        return this.input?.prone && this._grounded;
    }

    /** @returns {boolean} True while seated on the ground. */
    get sitting() {
        return this.input?.sit && this._grounded;
    }

    /** @returns {boolean} True while moving fast enough to widen weapon spread. */
    get moving() {
        const vel = this._rigidbody.linearVelocity;
        return Math.hypot(vel.x, vel.z) > 1.5;
    }

    /**
     * Kick the view. Positive pitch looks up; the debt is recovered automatically.
     *
     * @param {number} pitch - Degrees of upward kick.
     * @param {number} yaw - Degrees of horizontal kick.
     */
    addRecoil(pitch, yaw) {
        this._angles.x = math.clamp(this._angles.x + pitch, -55, 40);
        this._angles.y += yaw;
        this._recoilDebt += pitch;
    }

    /**
     * @param {number} amount - Damage to apply.
     * @param {string} [source] - Name shown in the kill feed.
     * @returns {boolean} True if this hit killed the player.
     */
    applyDamage(amount, source = 'Enemy') {
        if (this._dead) {
            return false;
        }

        this._health = Math.max(0, this._health - amount);
        this._regenTimer = 0;
        this.app.fire('player:health', this._health, this.maxHealth);
        this.app.fire('player:hurt', amount, source);

        if (this._health <= 0) {
            this._die(source);
            return true;
        }
        return false;
    }

    /**
     * @param {number} amount - Health to restore.
     * @returns {boolean} True if any health was actually restored.
     */
    heal(amount) {
        if (this._dead || this._health >= this.maxHealth) {
            return false;
        }

        this._health = Math.min(this.maxHealth, this._health + amount);
        this.app.fire('player:health', this._health, this.maxHealth);
        return true;
    }

    /**
     * @returns {boolean} True if a charge was stored.
     */
    addMedkit() {
        if (this.medkits >= 5) {
            return false;
        }
        this.medkits++;
        this.app.fire('player:medkits', this.medkits);
        return true;
    }

    /**
     * @returns {boolean} True if a charge was spent.
     */
    useMedkit() {
        if (this._dead || this.medkits <= 0 || this._health >= this.maxHealth) {
            return false;
        }
        this.medkits--;
        this.heal(50);
        sfx.heal();
        this.app.fire('player:medkits', this.medkits);
        return true;
    }

    /**
     * @param {string} source - Killer name for the feed.
     * @private
     */
    _die(source) {
        this._dead = true;
        this.deaths++;
        this._respawnTimer = this.respawnDelay;
        this.input?.reset();
        this.app.fire('player:died', source, this.respawnDelay);
    }

    respawn() {
        this._dead = false;
        this._health = this.maxHealth;
        this._recoilDebt = 0;
        this._angles.x = -6;
        this.medkits = 2;
        this.app.fire('player:medkits', this.medkits);
        // teleport(), not setPosition() — a dynamic body does not follow the entity transform.
        // The activate() matters too: a body that was created before the first physics step can
        // come up asleep and then hang in mid-air until something wakes it.
        this._rigidbody.teleport(this.spawnPoint);
        this._rigidbody.linearVelocity = Vec3.ZERO;
        this._rigidbody.angularVelocity = Vec3.ZERO;
        this._rigidbody.activate();
        this.app.fire('player:health', this._health, this.maxHealth);
        this.app.fire('player:respawn');
    }

    /**
     * @param {number} dt - Delta time.
     * @private
     */
    _updateLook(dt) {
        this.input.takeLook(look);

        const sens = this.lookSens * (this.input.aim ? this.aimMult : 1);
        const dx = look.x * sens;
        const dy = look.y * sens;

        // Pulling down while recoil is pending cancels it instead of double-counting, which is
        // what makes spray control feel learnable rather than random.
        if (this._recoilDebt > 0 && dy > 0) {
            this._recoilDebt = Math.max(0, this._recoilDebt - dy);
        }

        this._angles.y -= dx;
        this._angles.x = math.clamp(this._angles.x - dy, -55, 40);

        if (this._recoilDebt > 0) {
            const recover = Math.min(this._recoilDebt, 9 * dt);
            this._recoilDebt -= recover;
            this._angles.x = math.clamp(this._angles.x - recover, -55, 40);
        }
    }

    /**
     * @param {number} dt - Delta time.
     * @private
     */
    _updateCamera() {
        const aiming = !!this.input?.aim;
        const prone = !!this.input?.prone;
        const sit = !!this.input?.sit && !prone;
        const crouch = !!this.input?.crouch && !prone && !sit;
        const dist = aiming ? 2.6 : (prone ? 3.2 : 4.8);
        const height = prone ? 0.38 : ((crouch || sit) ? 1.05 : 1.55);
        const shoulder = aiming ? 0.58 : 0.7;

        rotation.setFromEulerAngles(this._angles.x, this._angles.y, 0);
        rotation.transformVector(Vec3.FORWARD, forward);
        rotation.transformVector(Vec3.RIGHT, right);

        const origin = this.entity.getPosition();
        rayEnd.set(origin.x, origin.y + height * 0.25, origin.z);

        offset.set(origin.x, origin.y + height, origin.z);
        offset.sub(v.copy(forward).mulScalar(dist));
        offset.add(v.copy(right).mulScalar(shoulder));

        const system = /** @type {RigidBodyComponentSystem} */ (this._rigidbody.system);
        if (system?.raycastFirst) {
            v.copy(offset).sub(rayEnd);
            const span = v.length() || 1;
            v.mulScalar(0.55 / span).add(rayEnd);
            const hit = system.raycastFirst(v, offset, {
                filterCallback: (/** @type {Entity} */ e) => e !== this.entity
            });
            // Ignore contacts still inside the capsule / floor so the camera does not collapse
            // onto the look-at point and hide the body.
            if (hit && hit.point.distance(rayEnd) > 1.2) {
                offset.copy(hit.point);
                offset.add(v.copy(hit.normal).mulScalar(0.22));
            }
        }

        this.camera.setPosition(offset);
        this.camera.setEulerAngles(this._angles.x, this._angles.y, 0);

        // Primitive fallback owns stance + look-yaw. Skinned wrappers face move dir in pose().
        if (this.visual && !this.visual.skinned) {
            this.visual.enabled = offset.distance(origin) > 1.15;
            this.visual.setLocalPosition(0, prone ? 0.15 : (crouch ? -0.25 : -0.9), 0);
            this.visual.setLocalEulerAngles(prone ? 78 : 0, this._angles.y, 0);
        }
    }

    /**
     * @param {number} dt - Delta time.
     * @private
     */
    _updateMove(dt) {
        const start = this.entity.getPosition();
        rayEnd.copy(start);
        rayEnd.y -= 1.05;
        const system = /** @type {RigidBodyComponentSystem} */ (this._rigidbody.system);
        this._grounded = !!system.raycastFirst(start, rayEnd, {
            filterCallback: (/** @type {Entity} */ e) => e !== this.entity
        });

        if (this._rigidbody.linearVelocity.y < 0) {
            this._jumping = false;
        }

        if (this.input.takeJump() && this._grounded && !this._jumping && !this.input.crouch && !this.input.prone) {
            this._jumping = true;
            this._rigidbody.applyImpulse(0, this.jumpForce, 0);
        }

        let speed = this._grounded ? this.speedGround : this.speedAir;
        if (this.input.prone) {
            speed *= 0.28;
        } else if (this.input.crouch) {
            speed *= this.crouchMult;
        } else if (this.input.sprint && this.input.moveY > 0 && !this.input.aim) {
            speed *= this.sprintMult;
        } else if (this.input.aim) {
            speed *= this.aimMult;
        }
        if (!this.entity.script?.weaponController?.active && !this.input.prone && !this.input.crouch) {
            speed *= this.fistMult;
        }

        v.set(this.input.moveX, 0, this.input.moveY);
        if (v.length() > 1) {
            v.normalize();
        }
        v.mulScalar(speed * dt);

        rotation.setFromEulerAngles(0, this._angles.y, 0);
        rotation.transformVector(Vec3.FORWARD, forward);
        rotation.transformVector(Vec3.RIGHT, right);
        offset.set(0, 0, 0);
        offset.add(forward.mulScalar(v.z));
        offset.add(right.mulScalar(v.x));

        const velocity = this._rigidbody.linearVelocity.add(offset);
        if (this.input.moveX === 0 && this.input.moveY === 0) {
            velocity.x = 0;
            velocity.z = 0;
            const p = this.entity.getPosition();
            if (this._holdX === null) {
                this._holdX = p.x;
                this._holdZ = p.z;
                // Tolerance is well above solver noise: yanking the body back at millimetre
                // drift fought physics every frame and read as a twitch while standing still.
            } else if (Math.hypot(p.x - this._holdX, p.z - this._holdZ) > 0.03) {
                this._rigidbody.teleport(this._holdX, p.y, this._holdZ);
            }
        } else {
            this._holdX = null;
            this._holdZ = null;
            const alpha = damp(this._grounded ? 0.99 : 0.99925, dt);
            velocity.x = math.lerp(velocity.x, 0, alpha);
            velocity.z = math.lerp(velocity.z, 0, alpha);
        }

        // Probe ahead so high speed cannot tunnel the capsule through thin factory walls.
        if (offset.x !== 0 || offset.z !== 0) {
            rayEnd.set(start.x + offset.x * 14, start.y, start.z + offset.z * 14);
            const wall = system.raycastFirst(start, rayEnd, {
                filterCallback: (/** @type {Entity} */ e) => e !== this.entity
            });
            if (wall && wall.point.distance(start) < 0.95) {
                const nx = wall.normal.x;
                const nz = wall.normal.z;
                const into = velocity.x * nx + velocity.z * nz;
                if (into < 0) {
                    velocity.x -= nx * into;
                    velocity.z -= nz * into;
                }
            }
        }

        this._rigidbody.linearVelocity = velocity;
    }

    /**
     * @param {number} dt - Delta time.
     */
    update(dt) {
        if (this._dead) {
            this._respawnTimer -= dt;
            if (this._respawnTimer <= 0) {
                this.respawn();
            } else {
                this._updateCamera();
            }
            return;
        }

        if (!this.input) {
            return;
        }

        if (this.input.takeMedkit()) {
            this.useMedkit();
        }
        if (this.input.takeScout()) {
            this.app.fire('scout:pulse');
        }

        this._updateLook(dt);
        this._updateMove(dt);
        this._updateCamera();

        // Out-of-combat regeneration keeps solo sessions going without a medkit hunt.
        this._regenTimer += dt;
        if (this._regenTimer > 6 && this._health < this.maxHealth) {
            this._health = Math.min(this.maxHealth, this._health + 12 * dt);
            this.app.fire('player:health', this._health, this.maxHealth);
        }
    }
}
