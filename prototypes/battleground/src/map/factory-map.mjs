import { Asset, AssetListLoader, BoundingBox, Entity, Vec3 } from 'playcanvas';

/** @import { AppBase } from 'playcanvas' */

/** @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number }} ArenaBounds */

/**
 * @typedef {object} FactoryMapConfig
 * @property {string} url - GLB URL under /public.
 * @property {number} scale - Uniform scale applied to the authored miniature model.
 * @property {number[]} position - World position offset [x, y, z].
 * @property {number[]} rotation - Euler rotation in degrees [x, y, z].
 */

/** @type {FactoryMapConfig} */
export const FACTORY_MAP_CONFIG = {
    url: '/assets/maps/factory.glb',
    scale: 50,
    position: [0, 0, 0],
    rotation: [0, 0, 0]
};

const worldBounds = new BoundingBox();

/**
 * @param {Entity} root - Map root entity.
 * @returns {BoundingBox} Axis-aligned bounds in world space.
 */
function measureBounds(root) {
    worldBounds.center.set(0, 0, 0);
    worldBounds.halfExtents.set(0, 0, 0);

    const renders = root.findComponents('render');
    for (const render of renders) {
        for (const meshInstance of render.meshInstances) {
            worldBounds.add(meshInstance.aabb);
        }
    }

    return worldBounds;
}

/**
 * @param {BoundingBox} bounds - World-space map bounds.
 * @returns {{ arena: ArenaBounds, spawn: Vec3, floorY: number }} Gameplay anchors derived from the mesh.
 */
function deriveGameplay(bounds) {
    const minX = bounds.center.x - bounds.halfExtents.x;
    const maxX = bounds.center.x + bounds.halfExtents.x;
    const minZ = bounds.center.z - bounds.halfExtents.z;
    const maxZ = bounds.center.z + bounds.halfExtents.z;
    const floorY = bounds.center.y - bounds.halfExtents.y;

    const spawn = new Vec3(
        bounds.center.x,
        floorY + 2,
        bounds.center.z
    );

    return {
        arena: { minX, maxX, minZ, maxZ },
        spawn,
        floorY
    };
}

/**
 * gltfpack omitted metallicFactor, so PlayCanvas uses the glTF default of 1 (full metal).
 * These mats are albedo-only dielectrics — without an IBL probe they render black in shadow.
 *
 * @param {Entity} root - Map root entity.
 */
function fixFactoryMaterials(root) {
    const seen = new Set();
    for (const render of root.findComponents('render')) {
        for (const meshInstance of render.meshInstances) {
            const material = meshInstance.material;
            if (!material || seen.has(material)) {
                continue;
            }
            seen.add(material);
            if (!material.metalnessMap) {
                material.metalness = 0;
            }
            // Dark asphalt/metal albedos crush to black under directional lights with no IBL.
            if (material.diffuseMap) {
                material.emissiveMap = material.diffuseMap;
                material.emissive.set(1, 1, 1);
                material.emissiveIntensity = 0.4;
            }
            material.update();
        }
    }
}

/**
 * Adds static mesh colliders so the player and bots walk on the factory geometry.
 *
 * @param {Entity} root - Map root entity.
 */
function addMeshColliders(root) {
    for (const render of root.findComponents('render')) {
        const entity = render.entity;
        if (entity.rigidbody || entity.collision) {
            continue;
        }

        entity.addComponent('rigidbody', {
            type: 'static',
            friction: 0.65,
            restitution: 0
        });
        entity.addComponent('collision', {
            type: 'mesh',
            renderAsset: render.asset
        });
    }
}

/**
 * Loads the abandoned factory GLB and returns gameplay anchors for the rest of the scene.
 *
 * @param {AppBase} app - Running application.
 * @param {Partial<FactoryMapConfig>} [overrides] - Optional placement overrides.
 * @returns {Promise<{ root: Entity, arena: ArenaBounds, spawn: Vec3, floorY: number }>} Loaded map data.
 */
export async function loadFactoryMap(app, overrides = {}) {
    const config = { ...FACTORY_MAP_CONFIG, ...overrides };

    const asset = new Asset('factory-map', 'container', { url: config.url });
    app.assets.add(asset);

    await new Promise((resolve) => {
        new AssetListLoader([asset], app.assets).load(resolve);
    });

    if (!asset.resource) {
        throw new Error(`Failed to load map: ${config.url}`);
    }

    const root = new Entity('factory-map');
    app.root.addChild(root);

    const model = asset.resource.instantiateRenderEntity({});
    root.addChild(model);
    root.setLocalPosition(config.position[0], config.position[1], config.position[2]);
    root.setLocalEulerAngles(config.rotation[0], config.rotation[1], config.rotation[2]);
    root.setLocalScale(config.scale, config.scale, config.scale);

    // CAD edge overlay: black LINES mesh with a solid-black material.
    model.findByName('Edge')?.destroy();
    fixFactoryMaterials(root);
    addMeshColliders(root);

    const bounds = measureBounds(root);
    const gameplay = deriveGameplay(bounds);

    console.info('[Battleground] Factory map loaded', {
        scale: config.scale,
        size: {
            x: +(bounds.halfExtents.x * 2).toFixed(1),
            y: +(bounds.halfExtents.y * 2).toFixed(1),
            z: +(bounds.halfExtents.z * 2).toFixed(1)
        },
        spawn: gameplay.spawn.toString()
    });

    return { root, ...gameplay };
}
