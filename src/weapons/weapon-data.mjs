/**
 * Weapon tuning table. These are the "feel constants" meant to be ported to the Unity build —
 * keep this file the single place they live.
 *
 * @typedef {object} ViewModelPart
 * @property {number[]} scale - Local scale [x, y, z].
 * @property {number[]} position - Local position [x, y, z].
 * @property {number[]} [color] - Diffuse colour [r, g, b], defaults to the weapon body colour.
 *
 * @typedef {object} WeaponDef
 * @property {string} id - Lookup key.
 * @property {string} name - Display name.
 * @property {string} kind - Category shown in the HUD.
 * @property {number} damage - Damage per bullet at the body.
 * @property {number} headshotMult - Multiplier applied to head hits.
 * @property {number} fireRate - Seconds between shots.
 * @property {boolean} auto - Hold to keep firing.
 * @property {number} pellets - Bullets per trigger pull (shotguns fire many).
 * @property {number} magazine - Rounds per magazine.
 * @property {number} reserve - Spare rounds granted on pickup.
 * @property {number} maxReserve - Reserve cap.
 * @property {number} reloadTime - Seconds to reload.
 * @property {number} spread - Hip-fire cone half-angle in degrees.
 * @property {number} adsSpread - Aimed cone half-angle in degrees.
 * @property {number} recoil - Vertical camera kick in degrees per shot.
 * @property {number} range - Hitscan range in metres.
 * @property {number} adsFov - Camera FOV while aiming.
 * @property {boolean} scope - Show the sniper scope overlay while aiming.
 * @property {number[]} bodyColor - Diffuse colour of the view model.
 * @property {ViewModelPart[]} parts - Boxes the view model is built from.
 * @property {number} shotFreq - Base frequency of the synthesised gunshot.
 * @property {string} [model] - GLB model id from gun-assets (converted from FBX).
 * @property {{ scale?: number, position?: number[], rotation?: number[] }} [modelView] - FPS offsets.
 * @property {{ scale?: number, position?: number[], rotation?: number[] }} [modelWorld] - Pickup offsets.
 */

/** @type {Record<string, WeaponDef>} */
export const WEAPONS = {
    pistol: {
        id: 'pistol',
        name: 'P92 Pistol',
        kind: 'Sidearm',
        damage: 26,
        headshotMult: 2,
        fireRate: 0.17,
        auto: false,
        pellets: 1,
        magazine: 12,
        reserve: 60,
        maxReserve: 120,
        reloadTime: 1.1,
        spread: 1.1,
        adsSpread: 0.25,
        recoil: 1.1,
        range: 70,
        adsFov: 58,
        scope: false,
        bodyColor: [0.18, 0.19, 0.22],
        parts: [
            { scale: [0.07, 0.1, 0.26], position: [0, 0, -0.06] },
            { scale: [0.05, 0.16, 0.07], position: [0, -0.11, 0.04] },
            { scale: [0.04, 0.04, 0.1], position: [0, 0.01, -0.2], color: [0.3, 0.31, 0.34] }
        ],
        shotFreq: 320,
        model: 'ar15',
        modelView: { scale: 0.028, position: [0.14, -0.08, -0.18], rotation: [0, 90, 0] },
        modelWorld: { scale: 0.035, position: [0, 0.05, 0], rotation: [0, 90, 0] }
    },

    smg: {
        id: 'smg',
        name: 'MP40 SMG',
        kind: 'SMG',
        damage: 17,
        headshotMult: 1.8,
        fireRate: 0.072,
        auto: true,
        pellets: 1,
        magazine: 32,
        reserve: 128,
        maxReserve: 224,
        reloadTime: 1.6,
        spread: 2.3,
        adsSpread: 0.9,
        recoil: 0.62,
        range: 90,
        adsFov: 58,
        scope: false,
        bodyColor: [0.16, 0.17, 0.2],
        parts: [
            { scale: [0.08, 0.11, 0.42], position: [0, 0, -0.1] },
            { scale: [0.06, 0.22, 0.08], position: [0, -0.14, 0.02] },
            { scale: [0.05, 0.05, 0.22], position: [0, 0.01, -0.36], color: [0.32, 0.33, 0.36] },
            { scale: [0.05, 0.09, 0.16], position: [0, 0.08, 0.06], color: [0.25, 0.2, 0.16] }
        ],
        shotFreq: 260,
        model: 'fammas',
        modelView: { scale: 0.03, position: [0.14, -0.08, -0.22], rotation: [0, 90, 0] },
        modelWorld: { scale: 0.038, position: [0, 0.05, 0], rotation: [0, 90, 0] }
    },

    rifle: {
        id: 'rifle',
        name: 'AR70 Rifle',
        kind: 'Assault Rifle',
        damage: 29,
        headshotMult: 2,
        fireRate: 0.1,
        auto: true,
        pellets: 1,
        magazine: 30,
        reserve: 120,
        maxReserve: 210,
        reloadTime: 2,
        spread: 1.8,
        adsSpread: 0.5,
        recoil: 1.15,
        range: 130,
        adsFov: 52,
        scope: false,
        bodyColor: [0.22, 0.16, 0.11],
        parts: [
            { scale: [0.08, 0.12, 0.55], position: [0, 0, -0.14] },
            { scale: [0.06, 0.26, 0.1], position: [0, -0.16, 0.0] },
            { scale: [0.05, 0.05, 0.3], position: [0, 0.02, -0.48], color: [0.13, 0.13, 0.15] },
            { scale: [0.06, 0.1, 0.2], position: [0, 0.07, 0.12], color: [0.3, 0.2, 0.12] }
        ],
        shotFreq: 190,
        model: 'ar70',
        modelView: { scale: 0.03, position: [0.14, -0.08, -0.28], rotation: [0, 90, 0] },
        modelWorld: { scale: 0.038, position: [0, 0.05, 0], rotation: [0, 90, 0] }
    },

    shotgun: {
        id: 'shotgun',
        name: 'M1014 Shotgun',
        kind: 'Shotgun',
        damage: 13,
        headshotMult: 1.5,
        fireRate: 0.82,
        auto: false,
        pellets: 8,
        magazine: 6,
        reserve: 30,
        maxReserve: 48,
        reloadTime: 2.4,
        spread: 5.2,
        adsSpread: 3.4,
        recoil: 2.6,
        range: 38,
        adsFov: 62,
        scope: false,
        bodyColor: [0.29, 0.18, 0.1],
        parts: [
            { scale: [0.09, 0.12, 0.62], position: [0, 0, -0.16] },
            { scale: [0.07, 0.2, 0.12], position: [0, -0.13, 0.06] },
            { scale: [0.06, 0.06, 0.34], position: [0, 0.01, -0.54], color: [0.14, 0.14, 0.16] }
        ],
        shotFreq: 130
    },

    sniper: {
        id: 'sniper',
        name: 'AWM Sniper',
        kind: 'Sniper',
        damage: 95,
        headshotMult: 2.5,
        fireRate: 1.25,
        auto: false,
        pellets: 1,
        magazine: 5,
        reserve: 25,
        maxReserve: 40,
        reloadTime: 2.9,
        spread: 2.6,
        adsSpread: 0.04,
        recoil: 3.4,
        range: 300,
        adsFov: 20,
        scope: true,
        bodyColor: [0.14, 0.2, 0.16],
        parts: [
            { scale: [0.08, 0.12, 0.78], position: [0, 0, -0.2] },
            { scale: [0.06, 0.24, 0.1], position: [0, -0.15, 0.06] },
            { scale: [0.05, 0.05, 0.44], position: [0, 0.02, -0.66], color: [0.1, 0.1, 0.12] },
            { scale: [0.05, 0.07, 0.26], position: [0, 0.1, -0.1], color: [0.08, 0.08, 0.1] }
        ],
        shotFreq: 110,
        model: 'fn-f2000',
        modelView: { scale: 0.028, position: [0.12, -0.07, -0.34], rotation: [0, 90, 0] },
        modelWorld: { scale: 0.036, position: [0, 0.05, 0], rotation: [0, 90, 0] }
    }
};

/**
 * @param {string} id - Weapon id.
 * @returns {WeaponDef} The definition, falling back to the pistol for unknown ids.
 */
export function getWeapon(id) {
    return WEAPONS[id] ?? WEAPONS.pistol;
}
