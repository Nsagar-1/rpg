/**
 * Resource handler used for loading 2D and 3D {@link Texture} resources.
 *
 * @category Graphics
 */
export class TextureHandler extends ResourceHandler {
    /**
     * Create a new TextureHandler instance.
     *
     * @param {AppBase} app - The running {@link AppBase}.
     * @ignore
     */
    constructor(app: AppBase);
    _device: import("../../index.js").GraphicsDevice;
    imgParser: ImgParser;
    set crossOrigin(value: string);
    get crossOrigin(): string;
    _getTextureOptions(asset: any): {
        profilerHint: number;
    };
    open(url: any, data: any, asset: any): any;
    patch(asset: any, assets: any): void;
}
import { ResourceHandler } from './handler.js';
import { ImgParser } from '../parsers/texture/img.js';
import type { AppBase } from '../app-base.js';
