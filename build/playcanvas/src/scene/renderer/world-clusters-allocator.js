import { WorldClusters } from "../lighting/world-clusters.js";
import { FramePassMultiView } from "./frame-pass-multi-view.js";
const tempClusterArray = [];
class WorldClustersAllocator {
	_empty = null;
	_allocated = [];
	_clusters = /* @__PURE__ */ new Map();
	constructor(graphicsDevice) {
		this.device = graphicsDevice;
	}
	destroy() {
		if (this._empty) {
			this._empty.destroy();
			this._empty = null;
		}
		this._allocated.forEach((cluster) => {
			cluster.destroy();
		});
		this._allocated.length = 0;
	}
	get count() {
		return this._allocated.length;
	}
	// returns an empty light cluster object to be used when no lights are used
	get empty() {
		if (!this._empty) {
			const empty = new WorldClusters(this.device);
			empty.name = "ClusterEmpty";
			empty.update([]);
			this._empty = empty;
		}
		return this._empty;
	}
	_assignClustersForPass(renderPass) {
		const layerRenderSteps = renderPass.layerRenderSteps;
		if (!layerRenderSteps) {
			return;
		}
		const count = layerRenderSteps.length;
		for (let i = 0; i < count; i++) {
			const step = layerRenderSteps[i];
			step.lightClusters = null;
			const layer = step.layer;
			if (layer.hasClusteredLights && layer.meshInstances.length) {
				const hash = layer.getLightIdHash();
				const existingStep = this._clusters.get(hash);
				let clusters = existingStep?.lightClusters;
				if (!clusters) {
					clusters = tempClusterArray.pop() ?? new WorldClusters(this.device);
					this._allocated.push(clusters);
					this._clusters.set(hash, step);
				}
				step.lightClusters = clusters;
			}
			if (!step.lightClusters) {
				step.lightClusters = this.empty;
			}
		}
	}
	// assign light clusters to layer render steps that need it
	assign(renderPasses) {
		tempClusterArray.push(...this._allocated);
		this._allocated.length = 0;
		this._clusters.clear();
		const passCount = renderPasses.length;
		for (let p = 0; p < passCount; p++) {
			const pass = renderPasses[p];
			if (pass instanceof FramePassMultiView) {
				const children = pass.children;
				for (let c = 0; c < children.length; c++) {
					this._assignClustersForPass(children[c]);
				}
			} else {
				this._assignClustersForPass(pass);
			}
		}
		tempClusterArray.forEach((item) => item.destroy());
		tempClusterArray.length = 0;
	}
	update(renderPasses, lighting) {
		this.assign(renderPasses);
		this._clusters.forEach((step) => {
			const layer = step.layer;
			const cluster = step.lightClusters;
			cluster.update(layer.clusteredLightsSet, lighting);
		});
	}
}
export {
	WorldClustersAllocator
};
