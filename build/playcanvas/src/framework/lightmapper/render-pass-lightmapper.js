import { RenderPass } from "../../platform/graphics/render-pass.js";
import { SHADER_FORWARD } from "../../scene/constants.js";
class RenderPassLightmapper extends RenderPass {
	constructor(device, renderer, camera, worldClusters, receivers, lightArray) {
		super(device);
		this.renderer = renderer;
		this.camera = camera;
		this.worldClusters = worldClusters;
		this.receivers = receivers;
		this.lightArray = lightArray;
	}
	execute() {
		const device = this.device;
		const { renderer, camera, receivers, renderTarget, worldClusters, lightArray } = this;
		renderer.renderForwardLayer(camera, renderTarget, null, void 0, SHADER_FORWARD, {
			meshInstances: receivers,
			splitLights: lightArray,
			lightClusters: worldClusters
		});
	}
}
export {
	RenderPassLightmapper
};
