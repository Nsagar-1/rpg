/**
 * Single source of truth for player intent. Desktop (keyboard + mouse) and touch controls both
 * write into one instance of this; gameplay scripts only ever read from it, so adding a new input
 * device never touches gameplay code.
 *
 * Held inputs are plain booleans. One-shot inputs are queued and drained with `take*()` so a tap
 * is never missed or processed twice, regardless of frame rate.
 */
export class InputState {
    /** Strafe (-1 left, +1 right). */
    moveX = 0;

    /** Forward (-1 back, +1 forward). */
    moveY = 0;

    /** Accumulated look delta in "pixels", drained every frame by the player controller. */
    lookX = 0;

    lookY = 0;

    fire = false;

    aim = false;

    sprint = false;

    crouch = false;

    prone = false;

    /** @type {boolean} */
    _fireTap = false;

    /** @type {boolean} */
    _jump = false;

    /** @type {boolean} */
    _reload = false;

    /** @type {boolean} */
    _pickup = false;

    /** @type {boolean} */
    _drop = false;

    /** @type {boolean} */
    _medkit = false;

    /** @type {boolean} */
    _scout = false;

    /** @type {number} -1 when nothing queued, otherwise the requested slot index. */
    _switchSlot = -1;

    /** True while the game is running with touch controls visible. */
    touchMode = false;

    /** Fire automatically while an enemy is under the crosshair (mobile aim assist). */
    autoFire = false;

    /**
     * Guarantees one shot per trigger pull. Without it, a tap that starts and ends inside a single
     * frame would never be seen by the weapon, which is exactly what a touch tap looks like.
     */
    queueFire() {
        this._fireTap = true;
    }

    queueJump() {
        this._jump = true;
    }

    queueReload() {
        this._reload = true;
    }

    queuePickup() {
        this._pickup = true;
    }

    queueDrop() {
        this._drop = true;
    }

    queueMedkit() {
        this._medkit = true;
    }

    queueScout() {
        this._scout = true;
    }

    /**
     * @param {number} slot - Weapon slot index to select.
     */
    queueSwitch(slot) {
        this._switchSlot = slot;
    }

    /**
     * @returns {boolean} True if a trigger pull was queued since the last call.
     */
    takeFire() {
        const v = this._fireTap;
        this._fireTap = false;
        return v;
    }

    /**
     * @returns {boolean} True if a jump was queued since the last call.
     */
    takeJump() {
        const v = this._jump;
        this._jump = false;
        return v;
    }

    /**
     * @returns {boolean} True if a reload was queued since the last call.
     */
    takeReload() {
        const v = this._reload;
        this._reload = false;
        return v;
    }

    /**
     * @returns {boolean} True if a pickup was queued since the last call.
     */
    takePickup() {
        const v = this._pickup;
        this._pickup = false;
        return v;
    }

    /**
     * @returns {boolean} True if a drop was queued since the last call.
     */
    takeDrop() {
        const v = this._drop;
        this._drop = false;
        return v;
    }

    takeMedkit() {
        const v = this._medkit;
        this._medkit = false;
        return v;
    }

    takeScout() {
        const v = this._scout;
        this._scout = false;
        return v;
    }

    /** @returns {number} Slot index, or -1 if no switch was requested. */
    takeSwitch() {
        const v = this._switchSlot;
        this._switchSlot = -1;
        return v;
    }

    /**
     * Drain the accumulated look delta.
     *
     * @param {{ x: number, y: number }} out - Receives the delta.
     */
    takeLook(out) {
        out.x = this.lookX;
        out.y = this.lookY;
        this.lookX = 0;
        this.lookY = 0;
    }

    /** Zero everything — used on death and when focus is lost so inputs don't stick. */
    reset() {
        this.moveX = 0;
        this.moveY = 0;
        this.lookX = 0;
        this.lookY = 0;
        this.fire = false;
        this.aim = false;
        this.sprint = false;
        this.crouch = false;
        this.prone = false;
        this._fireTap = false;
        this._jump = false;
        this._reload = false;
        this._pickup = false;
        this._drop = false;
        this._medkit = false;
        this._scout = false;
        this._switchSlot = -1;
    }
}
