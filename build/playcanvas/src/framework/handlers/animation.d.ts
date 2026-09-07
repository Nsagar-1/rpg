/**
 * @import { AppBase } from '../app-base.js'
 */
/**
 * Resource handler used for loading {@link Animation} resources.
 *
 * @category Animation
 */
export class AnimationHandler extends ResourceHandler {
    /**
     * @param {AppBase} app - The running {@link AppBase}.
     * @ignore
     */
    constructor(app: AppBase);
    device: import("../../index.js").GraphicsDevice;
    assets: import("../asset/asset-registry.js").AssetRegistry;
}
import { ResourceHandler } from './handler.js';
import type { AppBase } from '../app-base.js';
