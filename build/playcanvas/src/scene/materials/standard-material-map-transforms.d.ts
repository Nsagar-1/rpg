/**
 * Maintains texture transform groups for a StandardMaterial.
 *
 * @ignore
 */
export class StandardMaterialMapTransforms {
    /**
     * True when transform properties might have changed.
     *
     * @type {boolean}
     * @private
     */
    private _dirty;
    /**
     * True after mutable transform properties have been exposed to user code. Their values must
     * continue to be checked to support mutation through a cached reference.
     *
     * @type {boolean}
     * @private
     */
    private _mutable;
    /**
     * Transform group assigned to each texture map.
     *
     * @type {Map<string, number>}
     * @private
     */
    private _ids;
    /**
     * Last processed transform properties for each texture map.
     *
     * @type {Map<string, Float64Array>}
     * @private
     */
    private _states;
    reset(): void;
    /**
     * Marks transform properties as potentially changed.
     */
    markDirty(): void;
    /**
     * Marks mutable transform properties as exposed to user code.
     */
    markMutable(): void;
    /**
     * Updates texture transform groups when any transform property has changed.
     *
     * @param {StandardMaterial} material - The material to update transform groups for.
     * @returns {boolean} Whether the transform group topology changed.
     */
    update(material: StandardMaterial): boolean;
    /**
     * Rebuilds texture transform group IDs.
     *
     * @param {StandardMaterial} material - The material to rebuild transform group IDs for.
     * @returns {boolean} Whether the transform group topology changed.
     * @private
     */
    private _updateIds;
    /**
     * Returns the transform group assigned to a texture map.
     *
     * @param {string} name - Texture map base name.
     * @returns {number} The transform group, or zero when no transform is needed.
     */
    getId(name: string): number;
}
import type { StandardMaterial } from './standard-material.js';
