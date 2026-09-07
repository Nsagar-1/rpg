/**
 * A class managing instances of world clusters used by the renderer for layers with
 * unique sets of clustered lights.
 *
 * @ignore
 */
export class WorldClustersAllocator {
    /**
     * Create a new instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device.
     */
    constructor(graphicsDevice: GraphicsDevice);
    /**
     * Empty cluster with no lights.
     *
     * @type {WorldClusters|null}
     */
    _empty: WorldClusters | null;
    /**
     * All allocated clusters
     *
     * @type {WorldClusters[]}
     */
    _allocated: WorldClusters[];
    /**
     * Layer render steps with all unique light clusters. The key is the hash of lights on a layer,
     * the value is a layer render step with unique light clusters.
     *
     * @type {Map<number, LayerRenderStep>}
     */
    _clusters: Map<number, LayerRenderStep>;
    device: GraphicsDevice;
    destroy(): void;
    get count(): number;
    get empty(): WorldClusters;
    /**
     * Assign clusters for one frame pass that owns {@link RenderPassForward#layerRenderSteps}.
     * No-op when the pass has no layer render steps.
     *
     * @param {import('../../platform/graphics/frame-pass.js').FramePass} renderPass - Render pass
     * (not a {@link FramePassMultiView} wrapper; those are unwrapped in {@link WorldClustersAllocator#assign}).
     * @private
     */
    private _assignClustersForPass;
    assign(renderPasses: any): void;
    update(renderPasses: any, lighting: any): void;
}
import { WorldClusters } from '../lighting/world-clusters.js';
import type { LayerRenderStep } from './layer-render-step.js';
import type { GraphicsDevice } from '../../platform/graphics/graphics-device.js';
