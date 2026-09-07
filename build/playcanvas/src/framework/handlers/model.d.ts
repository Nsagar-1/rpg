/**
 * @import { AppBase } from '../app-base.js'
 */
/**
 * Resource handler used for loading {@link Model} resources.
 *
 * @category Graphics
 */
export class ModelHandler extends ResourceHandler {
    /**
     * Create a new ModelHandler instance.
     *
     * @param {AppBase} app - The running {@link AppBase}.
     * @ignore
     */
    constructor(app: AppBase);
    device: import("../../index.js").GraphicsDevice;
    assets: import("../asset/asset-registry.js").AssetRegistry;
    defaultMaterial: import("../../index.js").StandardMaterial;
    patch(asset: any, assets: any): void;
}
import { ResourceHandler } from './handler.js';
import type { AppBase } from '../app-base.js';
