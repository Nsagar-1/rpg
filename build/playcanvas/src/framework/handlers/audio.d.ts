/**
 * @import { AppBase } from '../app-base.js'
 */
/**
 * Resource handler used for loading {@link Sound} resources.
 *
 * @category Sound
 */
export class AudioHandler extends ResourceHandler {
    /**
     * Create a new AudioHandler instance.
     *
     * @param {AppBase} app - The running {@link AppBase}.
     * @ignore
     */
    constructor(app: AppBase);
    manager: import("../../index.js").SoundManager;
}
import { ResourceHandler } from './handler.js';
import type { AppBase } from '../app-base.js';
