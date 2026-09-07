import { GSplatOctreeNode } from "./gsplat-octree-node.js";
import { GSplatLodTable } from "./gsplat-lod-table.js";
import { GSPLAT_LODMODE_ERROR } from "../constants.js";
import { path } from "../../core/path.js";
import { Tracing } from "../../core/tracing.js";
import { TRACEID_OCTREE_RESOURCES } from "../../core/constants.js";
const _toDelete = [];
class GSplatOctree {
	nodes;
	nodeBoundsMinMax;
	files;
	lodLevels;
	lodErrorSource = "derived";
	_lodTables = /* @__PURE__ */ new Map();
	assetFileUrl;
	fileResources = /* @__PURE__ */ new Map();
	fileRefCounts;
	cooldowns = /* @__PURE__ */ new Map();
	environmentUrl = null;
	environmentResource = null;
	environmentRefCount = 0;
	assetLoader = null;
	destroyed = false;
	cooldownTicks = 100;
	constructor(assetFileUrl, data) {
		this.lodLevels = data.lodLevels;
		this.assetFileUrl = assetFileUrl;
		const baseDir = path.getDirectory(assetFileUrl);
		this.files = data.filenames.map((url) => ({
			url: path.isRelativePath(url) ? path.join(baseDir, url) : url,
			lodLevel: -1
		}));
		this.fileRefCounts = new Int32Array(this.files.length);
		if (data.environment) {
			this.environmentUrl = path.isRelativePath(data.environment) ? path.join(baseDir, data.environment) : data.environment;
		}
		const leafNodes = [];
		this._extractLeafNodes(data.tree, leafNodes);
		let fileErrors = data.lodErrors === true;
		this.nodes = leafNodes.map((nodeData) => {
			const lods = [];
			for (let i = 0; i < this.lodLevels; i++) {
				const lodData = nodeData.lods[i.toString()];
				const error = nodeData.errors?.[i];
				if (lodData) {
					lods.push({
						file: this.files[lodData.file].url || "",
						fileIndex: lodData.file,
						offset: lodData.offset || 0,
						count: lodData.count || 0,
						error: 0
					});
					this.files[lodData.file].lodLevel = i;
				} else {
					lods.push({
						file: "",
						fileIndex: -1,
						offset: 0,
						count: 0,
						error: 0
					});
				}
				if (fileErrors) {
					if (lods[i].count > 0 && !(Number.isFinite(error) && error >= 0)) {
						fileErrors = false;
					} else {
						lods[i].error = error ?? 0;
					}
				}
			}
			return new GSplatOctreeNode(lods, nodeData.bound);
		});
		this.lodErrorSource = fileErrors ? "file" : "derived";
		if (data.lodErrors === true && !fileErrors) {
		}
		if (!fileErrors) {
			this._deriveLodErrors();
		}
		const nodeCount = this.nodes.length;
		const boundsFlat = new Float32Array(nodeCount * 6);
		for (let i = 0; i < nodeCount; i++) {
			const bounds = this.nodes[i].bounds;
			const mn = bounds.getMin();
			const mx = bounds.getMax();
			const b = i * 6;
			boundsFlat[b + 0] = mn.x;
			boundsFlat[b + 1] = mn.y;
			boundsFlat[b + 2] = mn.z;
			boundsFlat[b + 3] = mx.x;
			boundsFlat[b + 4] = mx.y;
			boundsFlat[b + 5] = mx.z;
		}
		this.nodeBoundsMinMax = boundsFlat;
	}
	destroy() {
		this.destroyed = true;
		this._lodTables.clear();
		this.fileResources.clear();
		this.cooldowns.clear();
		this.assetLoader?.destroy();
		this.assetLoader = null;
		this.environmentResource = null;
	}
	_traceLodCounts() {
	}
	_deriveLodErrors() {
		const levels = this.lodLevels;
		const nodes = this.nodes;
		for (let n = 0; n < nodes.length; n++) {
			const lods = nodes[n].lods;
			let refCount = 0;
			for (let i = 0; i < levels; i++) {
				if (lods[i].count > 0) {
					refCount = lods[i].count;
					break;
				}
			}
			if (refCount === 0) continue;
			let previous = 0;
			for (let i = 0; i < levels; i++) {
				const count = lods[i].count;
				const error = count > 0 ? Math.log(refCount / count) : 0;
				previous = Math.max(previous, error);
				lods[i].error = previous;
			}
		}
	}
	acquireLodTable(rangeMin, rangeMax, lodMode = GSPLAT_LODMODE_ERROR) {
		const key = `${rangeMin},${rangeMax},${lodMode}`;
		let table = this._lodTables.get(key);
		if (!table) {
			table = new GSplatLodTable(this, rangeMin, rangeMax, lodMode);
			this._lodTables.set(key, table);
		}
		table.refCount++;
		return table;
	}
	releaseLodTable(table) {
		if (!table) return;
		if (--table.refCount <= 0) {
			this._lodTables.delete(`${table.rangeMin},${table.rangeMax},${table.lodMode}`);
		}
	}
	_extractLeafNodes(node, leafNodes) {
		if (node.lods) {
			leafNodes.push({
				lods: node.lods,
				bound: node.bound,
				errors: node.errors
			});
		} else if (node.children) {
			for (const child of node.children) {
				this._extractLeafNodes(child, leafNodes);
			}
		}
	}
	getFileResource(fileIndex) {
		return this.fileResources.get(fileIndex);
	}
	incRefCount(fileIndex) {
		const count = this.fileRefCounts[fileIndex] + 1;
		this.fileRefCounts[fileIndex] = count;
		this.cooldowns.delete(fileIndex);
	}
	decRefCount(fileIndex, cooldownTicks) {
		const count = this.fileRefCounts[fileIndex] - 1;
		this.fileRefCounts[fileIndex] = count;
		if (count === 0) {
			if (cooldownTicks === 0) {
				this.unloadResource(fileIndex);
			} else {
				this.cooldowns.set(fileIndex, cooldownTicks);
			}
		}
	}
	unloadResource(fileIndex) {
		if (!this.assetLoader) {
			return;
		}
		const fullUrl = this.files[fileIndex].url;
		this.assetLoader.unload(fullUrl);
		if (this.fileResources.has(fileIndex)) {
			this.fileResources.delete(fileIndex);
			this._traceLodCounts();
		}
	}
	updateCooldownTick(cooldownTicks) {
		this.cooldownTicks = cooldownTicks;
		if (this.cooldowns.size > 0) {
			this.cooldowns.forEach((remaining, fileIndex) => {
				if (remaining <= 1) {
					if (this.fileRefCounts[fileIndex] === 0) {
						this.unloadResource(fileIndex);
					}
					_toDelete.push(fileIndex);
				} else {
					this.cooldowns.set(fileIndex, remaining - 1);
				}
			});
			_toDelete.forEach((idx) => this.cooldowns.delete(idx));
			_toDelete.length = 0;
		}
	}
	ensureFileResource(fileIndex) {
		if (!this.assetLoader) {
			return;
		}
		if (this.fileResources.has(fileIndex)) {
			return;
		}
		const fullUrl = this.files[fileIndex].url;
		const res = this.assetLoader?.getResource(fullUrl);
		if (res) {
			this.fileResources.set(fileIndex, res);
			res.releaseTextureSources?.();
			if (this.fileRefCounts[fileIndex] === 0) {
				this.cooldowns.set(fileIndex, this.cooldownTicks);
			}
			this._traceLodCounts();
			return;
		}
		this.assetLoader?.load(fullUrl);
	}
	incEnvironmentRefCount() {
		this.environmentRefCount++;
	}
	decEnvironmentRefCount() {
		this.environmentRefCount--;
		if (this.environmentRefCount === 0) {
			this.unloadEnvironmentResource();
		}
	}
	ensureEnvironmentResource() {
		if (!this.assetLoader) {
			return;
		}
		if (!this.environmentUrl) {
			return;
		}
		if (this.environmentResource) {
			return;
		}
		const res = this.assetLoader.getResource(this.environmentUrl);
		if (res) {
			this.environmentResource = res;
			if (this.environmentRefCount === 0) {
				this.unloadEnvironmentResource();
			}
			return;
		}
		this.assetLoader.load(this.environmentUrl);
	}
	unloadEnvironmentResource() {
		if (!this.assetLoader) {
			return;
		}
		if (this.environmentResource && this.environmentUrl) {
			this.assetLoader.unload(this.environmentUrl);
			this.environmentResource = null;
		}
	}
}
export {
	GSplatOctree
};
