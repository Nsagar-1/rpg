import { Color, Script, StandardMaterial } from '../../build/playcanvas';

/** @import { Vec3 } from '../../build/playcanvas' */

/**
 * Anything the player can shoot: training dummies and enemy bots. Tracks health, flashes on hit,
 * and reports its state so the HUD can draw a floating health bar and the kill feed.
 */
export class DamageTarget extends Script {
    static scriptName = 'damageTarget';

    /** @attribute @title Max Health @type {number} */
    maxHealth = 100;

    /** @attribute @title Label @type {string} */
    label = 'Dummy';

    /** @attribute @title Respawn Delay (s) @type {number} */
    respawnDelay = 4;

    /** @attribute @title Score Value @type {number} */
    scoreValue = 100;

    /** @type {number} */
    _health = 100;

    /** @type {StandardMaterial|null} */
    _material = null;

    /** @type {Color} */
    _baseColor = new Color(0.85, 0.35, 0.25);

    /** @type {number} */
    _flashTimer = 0;

    /** @type {number} */
    _respawnTimer = 0;

    /** @type {boolean} */
    _alive = true;

    initialize() {
        this._health = this.maxHealth;
        this._cacheMaterial();
        this._syncColor();
        this.app.fire('target:register', this.entity.getGuid(), this.label, this._health, this.maxHealth);
    }

    /**
     * @returns {boolean} True until health reaches zero.
     */
    get alive() {
        return this._alive;
    }

    /**
     * @returns {number} Current health.
     */
    get health() {
        return this._health;
    }

    /** @private */
    _cacheMaterial() {
        const render = this.entity.render;
        if (!render?.meshInstances?.length) {
            return;
        }

        const mat = render.meshInstances[0].material;
        if (mat instanceof StandardMaterial) {
            this._material = mat;
            this._baseColor.copy(mat.diffuse);
        }
    }

    /**
     * @param {number} amount - Damage to apply.
     * @param {Vec3} hitPoint - World point for the floating number.
     * @param {boolean} [isHead] - True for headshots.
     * @param {string} [attacker] - Name shown in the kill feed.
     * @returns {boolean} True if this hit killed the target.
     */
    applyDamage(amount, hitPoint, isHead = false, attacker = 'You') {
        if (!this._alive) {
            return false;
        }

        this._health = Math.max(0, this._health - amount);
        this.app.fire('damage:show', hitPoint, amount, isHead);
        this.app.fire('target:health', this.entity.getGuid(), this._health, this.maxHealth);

        this._flash(isHead ? new Color(1, 0.85, 0.2) : new Color(1, 0.3, 0.1));
        this._syncColor();
        this.entity.fire('damaged', amount, attacker);

        if (this._health <= 0) {
            this._onDeath(attacker);
            return true;
        }
        return false;
    }

    resetHealth() {
        this._health = this.maxHealth;
        this._alive = true;
        this.entity.enabled = true;
        this.entity.setLocalScale(1, 1, 1);
        this._syncColor();
        this.app.fire('target:health', this.entity.getGuid(), this._health, this.maxHealth);
        this.entity.fire('respawned');
    }

    /**
     * @param {Color} color - Flash colour.
     * @private
     */
    _flash(color) {
        if (!this._material) {
            return;
        }
        this._material.emissive = color;
        this._material.emissiveIntensity = 2.5;
        this._material.update();
        this._flashTimer = 0.09;
    }

    /** @private */
    _syncColor() {
        if (!this._material) {
            return;
        }

        const t = this._health / this.maxHealth;
        this._material.diffuse.set(
            this._baseColor.r * (0.35 + 0.65 * t),
            this._baseColor.g * t,
            this._baseColor.b * t
        );
        this._material.update();
    }

    /**
     * @param {string} attacker - Killer name.
     * @private
     */
    _onDeath(attacker) {
        this._alive = false;
        this._respawnTimer = this.respawnDelay;
        this.entity.setLocalScale(1, 0.12, 1);
        this.app.fire('target:died', this.label, attacker, this.scoreValue);
        this.entity.fire('died', attacker);
    }

    /**
     * @param {number} dt - Delta time.
     */
    update(dt) {
        if (this._flashTimer > 0) {
            this._flashTimer -= dt;
            if (this._flashTimer <= 0 && this._material) {
                this._material.emissive = Color.BLACK;
                this._material.emissiveIntensity = 0;
                this._material.update();
            }
        }

        if (!this._alive && this.respawnDelay > 0) {
            this._respawnTimer -= dt;
            if (this._respawnTimer <= 0) {
                this.resetHealth();
            }
        }
    }
}
