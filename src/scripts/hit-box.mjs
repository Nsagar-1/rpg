import { Script } from '../../build/playcanvas';

/** @import { Entity } from '../../build/playcanvas' */

/**
 * Marks a collider as a damage zone belonging to another entity. Lets a head sphere or limb take a
 * hit and forward it to the {@link DamageTarget} living on the body.
 */
export class HitBox extends Script {
    static scriptName = 'hitBox';

    /**
     * Entity carrying the `damageTarget` script that should receive the damage.
     *
     * @type {Entity}
     */
    // @ts-ignore assigned via script properties
    owner;

    /** @attribute @title Zone @type {string} */
    zone = 'body';

    /** @attribute @title Damage Multiplier @type {number} */
    multiplier = 1;
}
