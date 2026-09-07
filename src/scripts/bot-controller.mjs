import { Color, math, Script, Vec3 } from '../../build/playcanvas';

/** @import { Entity } from '../../build/playcanvas' */
/** @import { PlayerController } from './player-controller.mjs' */

const toPlayer = new Vec3();
const move = new Vec3();
const strafe = new Vec3();
const muzzle = new Vec3();
const aimPoint = new Vec3();
const tmp = new Vec3();
const shotColor = new Color(1, 0.35, 0.25);

const STATE_IDLE = 'idle';
const STATE_CHASE = 'chase';
const STATE_FIGHT = 'fight';

/**
 * Enemy AI: patrols its post, closes on the player when it has line of sight, then strafes.
 * Health lives on the sibling `damageTarget`, so the same hit registration the training dummies
 * use applies here too.
 */
export class BotController extends Script {
    static scriptName = 'botController';

    /** @type {Entity} */
    // @ts-ignore assigned via script properties
    player;

    /** @type {Entity} */
    // @ts-ignore assigned via script properties
    body;

    /** @attribute @title Move Speed @type {number} */
    speed = 3.4;

    /** @attribute @title Detect Range @type {number} */
    detectRange = 42;

    /** @attribute @title Preferred Range @type {number} */
    preferredRange = 12;

    /** @attribute @title Damage @type {number} */
    damage = 9;

    /** @attribute @title Fire Interval (s) @type {number} */
    fireInterval = 0.9;

    /** @attribute @title Accuracy @type {number} 0..1, chance a shot is on target. */
    accuracy = 0.55;

    /** @attribute @title Arena Min X @type {number} */
    arenaMinX = -16;

    /** @attribute @title Arena Max X @type {number} */
    arenaMaxX = 16;

    /** @attribute @title Arena Min Z @type {number} */
    arenaMinZ = -20;

    /** @attribute @title Arena Max Z @type {number} */
    arenaMaxZ = 6;

    /** @type {Vec3} */
    home = new Vec3();

    /** @type {string} */
    _state = STATE_IDLE;

    /** @type {number} */
    _fireTimer = 0;

    /** @type {number} */
    _strafeDir = 1;

    /** @type {number} */
    _strafeTimer = 0;

    /** @type {boolean} */
    _alive = true;

    /** @type {Array<{ start: Vec3, end: Vec3, ttl: number }>} */
    _tracers = [];

    initialize() {
        this.home.copy(this.entity.getPosition());
        this._fireTimer = Math.random() * this.fireInterval;
        this._strafeDir = Math.random() < 0.5 ? -1 : 1;

        this.body?.on('died', () => {
            this._alive = false;
            this._state = STATE_IDLE;
        });
        this.body?.on('respawned', () => {
            this._alive = true;
            this.entity.setPosition(this.home);
        });
    }

    /**
     * @returns {string} Current AI state: idle, chase or fight.
     */
    get state() {
        return this._state;
    }

    /**
     * @returns {boolean} True when nothing solid sits between the bot's muzzle and the player.
     * @private
     */
    _hasLineOfSight() {
        this._muzzlePosition(muzzle);
        aimPoint.copy(this.player.getPosition());
        aimPoint.y += 0.5;

        const result = this.app.systems.rigidbody?.raycastFirst(muzzle, aimPoint, {
            filterCallback: (/** @type {Entity} */ e) => e !== this.body && e.parent !== this.entity
        });
        return !!result && result.entity === this.player;
    }

    /**
     * @param {Vec3} out - Receives the muzzle world position.
     * @private
     */
    _muzzlePosition(out) {
        out.copy(this.entity.getPosition());
        out.y += 1.5;
        out.add(tmp.copy(this.entity.forward).mulScalar(0.5));
    }

    /** @private */
    _shoot() {
        const playerScript = /** @type {PlayerController|undefined} */ (this.player.script?.playerController);
        if (!playerScript || playerScript.dead) {
            return;
        }

        this._muzzlePosition(muzzle);
        aimPoint.copy(this.player.getPosition());
        aimPoint.y += 0.4;

        const onTarget = Math.random() < this.accuracy;
        if (!onTarget) {
            aimPoint.x += (Math.random() - 0.5) * 3;
            aimPoint.y += (Math.random() - 0.5) * 2.4;
            aimPoint.z += (Math.random() - 0.5) * 3;
        }

        this._tracers.push({ start: muzzle.clone(), end: aimPoint.clone(), ttl: 0.06 });

        if (onTarget) {
            playerScript.applyDamage(this.damage, this.body?.script?.damageTarget?.label ?? 'Enemy');
        }
    }

    /**
     * @param {number} dt - Delta time.
     */
    update(dt) {
        for (let i = this._tracers.length - 1; i >= 0; i--) {
            const tracer = this._tracers[i];
            tracer.ttl -= dt;
            if (tracer.ttl <= 0) {
                this._tracers.splice(i, 1);
            } else {
                this.app.drawLine(tracer.start, tracer.end, shotColor, false);
            }
        }

        if (!this._alive || !this.player) {
            return;
        }

        const playerScript = /** @type {PlayerController|undefined} */ (this.player.script?.playerController);
        const pos = this.entity.getPosition();
        toPlayer.copy(this.player.getPosition()).sub(pos);
        toPlayer.y = 0;
        const distance = toPlayer.length();

        const canSee = !playerScript?.dead &&
            distance < this.detectRange &&
            this._hasLineOfSight();

        if (canSee) {
            this._state = distance > this.preferredRange ? STATE_CHASE : STATE_FIGHT;
        } else if (this._state !== STATE_IDLE && distance > this.detectRange) {
            this._state = STATE_IDLE;
        }

        // Always face the player once engaged so the tracers read as aimed fire.
        if (this._state !== STATE_IDLE && distance > 0.01) {
            const yaw = Math.atan2(toPlayer.x, toPlayer.z) * math.RAD_TO_DEG;
            this.entity.setEulerAngles(0, yaw, 0);
        }

        move.set(0, 0, 0);

        if (this._state === STATE_CHASE) {
            move.copy(toPlayer).normalize().mulScalar(this.speed * dt);
        } else if (this._state === STATE_FIGHT) {
            this._strafeTimer -= dt;
            if (this._strafeTimer <= 0) {
                this._strafeTimer = 0.8 + Math.random() * 1.4;
                this._strafeDir *= -1;
            }
            strafe.set(toPlayer.z, 0, -toPlayer.x).normalize().mulScalar(this._strafeDir);
            // Back off if the player closes right in, otherwise circle.
            if (distance < this.preferredRange * 0.55) {
                strafe.sub(tmp.copy(toPlayer).normalize().mulScalar(0.8));
            }
            move.copy(strafe).mulScalar(this.speed * 0.75 * dt);
        } else {
            // Drift back to the post it spawned at.
            move.copy(this.home).sub(pos);
            move.y = 0;
            if (move.length() > 0.6) {
                move.normalize().mulScalar(this.speed * 0.5 * dt);
            } else {
                move.set(0, 0, 0);
            }
        }

        if (move.lengthSq() > 0) {
            const x = math.clamp(pos.x + move.x, this.arenaMinX, this.arenaMaxX);
            const z = math.clamp(pos.z + move.z, this.arenaMinZ, this.arenaMaxZ);
            this.entity.setPosition(x, this.home.y, z);
        }
    }
}
