/**
 * A render pass implementing rendering of mesh instance receivers for light-mapper.
 */
export class RenderPassLightmapper extends RenderPass {
    constructor(device: any, renderer: any, camera: any, worldClusters: any, receivers: any, lightArray: any);
    renderer: any;
    camera: any;
    worldClusters: any;
    receivers: any;
    lightArray: any;
}
import { RenderPass } from '../../platform/graphics/render-pass.js';
