import { Asset, AssetListLoader } from '../../build/playcanvas';

/** @import { AppBase } from '../../build/playcanvas' */
/** @import { WeaponDef } from './weapon-data.mjs' */

/** @typedef {{ scale?: number, position?: number[], rotation?: number[] }} ModelTransform */

/** Maps weapon model ids to converted GLB paths under /public. */
export const GUN_MODEL_FILES = {
    ak12: '/assets/models/guns/ak12.glb',
    ak47: '/assets/models/guns/ak47.glb',
    ar15: '/assets/models/guns/ar15.glb',
    ar70: '/assets/models/guns/ar70.glb',
    aug: '/assets/models/guns/aug.glb',
    fammas: '/assets/models/guns/fammas.glb',
    'fn-f2000': '/assets/models/guns/fn-f2000.glb',
    'fn-scar': '/assets/models/guns/fn-scar.glb',
    l85a1: '/assets/models/guns/l85a1.glb',
    m16a1: '/assets/models/guns/m16a1.glb',
    'desert-eagle': '/assets/models/guns/desert-eagle.glb'
};

/**
 * @typedef {object} GunAssets
 * @property {(modelId: string) => boolean} has - Whether a GLB finished loading.
 * @property {(def: WeaponDef, mode: 'view'|'world') => Entity|null} instantiate - Spawn a tuned copy.
 */

/**
 * Registers and loads every converted gun GLB.
 *
 * @param {AppBase} app - Running application.
 * @returns {GunAssets & { load: () => Promise<void> }} Loader handle.
 */
export function createGunAssets(app) {
    /** @type {Record<string, Asset>} */
    const assets = {};

    for (const [id, url] of Object.entries(GUN_MODEL_FILES)) {
        assets[id] = new Asset(`gun-${id}`, 'container', { url });
        app.assets.add(assets[id]);
    }

    /**
     * @param {ModelTransform|undefined} transform - Per-weapon offsets from {@link WeaponDef}.
     * @param {Entity} root - Instantiated model root.
     */
    const applyTransform = (transform, root) => {
        if (!transform) {
            return;
        }
        if (transform.scale) {
            root.setLocalScale(transform.scale, transform.scale, transform.scale);
        }
        if (transform.position) {
            root.setLocalPosition(transform.position[0], transform.position[1], transform.position[2]);
        }
        if (transform.rotation) {
            root.setLocalEulerAngles(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
        }
    };

    return {
        load: () => new Promise((resolve) => {
            new AssetListLoader(Object.values(assets), app.assets).load(resolve);
        }),

        /**
         * @param {string} modelId - Key in {@link GUN_MODEL_FILES}.
         * @returns {boolean} True when the asset is ready to instantiate.
         */
        has(modelId) {
            return !!assets[modelId]?.resource;
        },

        /**
         * @param {WeaponDef} def - Weapon definition carrying model id + transforms.
         * @param {'view'|'world'} mode - First-person view model or ground pickup.
         * @returns {Entity|null} Instantiated entity, or null when the model is unavailable.
         */
        instantiate(def, mode) {
            if (!def.model || !assets[def.model]?.resource) {
                return null;
            }

            const entity = assets[def.model].resource.instantiateRenderEntity({});
            const transform = mode === 'view' ? def.modelView : def.modelWorld;
            applyTransform(transform, entity);
            return entity;
        }
    };
}
