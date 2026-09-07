import { math } from "../../core/math/math.js";
import { Mat4 } from "../../core/math/mat4.js";
import { Vec2 } from "../../core/math/vec2.js";
import { Vec3 } from "../../core/math/vec3.js";
import { BoundingBox } from "../../core/shape/bounding-box.js";
import { Color } from "../../core/math/color.js";
import { GSplatPlacement } from "./gsplat-placement.js";
import { GsplatAllocId } from "./gsplat-alloc-id.js";
import { GSPLAT_DEBUG_NODE_AABBS, GSPLAT_LODMODE_DISTANCE, PROJECTION_ORTHOGRAPHIC } from "../constants.js";
const _invWorldMat = new Mat4();
const _localCameraPos = new Vec3();
const _localCameraFwd = new Vec3();
const _tempCompletedUrls = [];
const _tempDebugAabb = new BoundingBox();
const REF_TAN_HALF_FOV = Math.tan(22.5 * math.DEG_TO_RAD);
const _lodColors = [
	new Color(1, 0, 0),
	new Color(0, 1, 0),
	new Color(0, 0, 1),
	new Color(1, 1, 0),
	new Color(1, 0, 1)
];
class NodeInfo {
	currentLod = -1;
	optimalLod = -1;
	worldDistance = 0;
	lodCoverage = 0;
	colorAccumulatedTranslation = 0;
	inst = null;
	allocId = GsplatAllocId.get();
	resetLod() {
		this.currentLod = -1;
		this.optimalLod = -1;
	}
}
class GSplatOctreeInstance {
	octree;
	placement;
	activePlacements = /* @__PURE__ */ new Set();
	dirtyModifiedPlacements = false;
	dirtyPlacementSetChanged = false;
	device;
	nodeInfos;
	filePlacements;
	pending = /* @__PURE__ */ new Set();
	pendingDecrements = /* @__PURE__ */ new Map();
	removedCandidates = /* @__PURE__ */ new Set();
	rangeMin = 0;
	rangeMax = 0;
	lodTable = null;
	previousPosition = new Vec3();
	needsLodUpdate = false;
	prefetchPending = /* @__PURE__ */ new Set();
	pendingVisibleAdds = /* @__PURE__ */ new Map();
	get pendingLoadCount() {
		let count = this.pending.size + this.prefetchPending.size;
		if (this.octree.environmentUrl && !this.environmentPlacement) {
			count++;
		}
		return count;
	}
	environmentPlacement = null;
	_deviceLostEvent = null;
	constructor(device, octree, placement) {
		this.device = device;
		this.octree = octree;
		this.placement = placement;
		this.nodeInfos = new Array(octree.nodes.length);
		for (let i = 0; i < octree.nodes.length; i++) {
			const nodeInfo = new NodeInfo();
			nodeInfo.inst = this;
			this.nodeInfos[i] = nodeInfo;
		}
		const numFiles = octree.files.length;
		this.filePlacements = new Array(numFiles).fill(null);
		if (octree.environmentUrl) {
			octree.incEnvironmentRefCount();
			octree.ensureEnvironmentResource();
		}
		this._deviceLostEvent = device.on("devicelost", this._onDeviceLost, this);
	}
	destroy(skipRefCounting = false) {
		if (this.octree && !this.octree.destroyed) {
			this.octree.releaseLodTable(this.lodTable);
		}
		this.lodTable = null;
		if (!skipRefCounting && this.octree && !this.octree.destroyed) {
			const filesToDecRef = this.getFileDecrements();
			for (const fileIndex of filesToDecRef) {
				this.octree.decRefCount(fileIndex, 0);
			}
			for (const fileIndex of this.pending) {
				if (!this.filePlacements[fileIndex]) {
					this.octree.unloadResource(fileIndex);
				}
			}
			for (const fileIndex of this.prefetchPending) {
				if (!this.filePlacements[fileIndex]) {
					this.octree.unloadResource(fileIndex);
				}
			}
			if (this.environmentPlacement) {
				this.octree.decEnvironmentRefCount();
			}
		}
		this.pending.clear();
		this.pendingDecrements.clear();
		this.filePlacements.length = 0;
		if (this.environmentPlacement) {
			this.activePlacements.delete(this.environmentPlacement);
			this.environmentPlacement = null;
		}
		this._deviceLostEvent?.off();
		this._deviceLostEvent = null;
	}
	_onDeviceLost() {
		for (let i = 0; i < this.filePlacements.length; i++) {
			if (this.filePlacements[i]) {
				this.octree.decRefCount(i, 0);
			}
		}
		this.filePlacements.fill(null);
		this.activePlacements.clear();
		this.pending.clear();
		this.pendingDecrements.clear();
		this.removedCandidates.clear();
		this.prefetchPending.clear();
		this.pendingVisibleAdds.clear();
		for (const nodeInfo of this.nodeInfos) {
			nodeInfo.resetLod();
		}
		if (this.environmentPlacement) {
			this.activePlacements.delete(this.environmentPlacement);
			this.environmentPlacement = null;
			this.octree.unloadEnvironmentResource();
		}
		this.dirtyModifiedPlacements = true;
		this.dirtyPlacementSetChanged = true;
		this.needsLodUpdate = true;
	}
	getFileDecrements() {
		const toRelease = [];
		for (let i = 0; i < this.filePlacements.length; i++) {
			if (this.filePlacements[i]) {
				toRelease.push(i);
			}
		}
		return toRelease;
	}
	selectDesiredLodIndex(nodeIndex, optimalLodIndex, lodUnderfillLimit) {
		if (lodUnderfillLimit > 0 && optimalLodIndex >= 0) {
			const table = this.lodTable;
			const node = this.octree.nodes[nodeIndex];
			const loaded = table.findCoarserAccepted(nodeIndex, optimalLodIndex, lodUnderfillLimit, (lod2) => {
				const fi = node.lods[lod2].fileIndex;
				return fi !== -1 && !!this.octree.getFileResource(fi);
			});
			if (loaded >= 0) return loaded;
			let coarsest = -1;
			let lod = optimalLodIndex;
			for (let step = 0; step <= lodUnderfillLimit && lod >= 0; step++) {
				if (node.lods[lod].fileIndex !== -1) coarsest = lod;
				lod = table.coarserOnChain(nodeIndex, lod);
			}
			if (coarsest >= 0) return coarsest;
		}
		return optimalLodIndex;
	}
	prefetchNextLod(nodeIndex, desiredLodIndex, optimalLodIndex) {
		if (desiredLodIndex === -1 || optimalLodIndex === -1) return;
		const node = this.octree.nodes[nodeIndex];
		if (desiredLodIndex === optimalLodIndex) {
			const fi2 = node.lods[optimalLodIndex].fileIndex;
			if (fi2 !== -1) {
				this.octree.ensureFileResource(fi2);
				if (!this.octree.getFileResource(fi2)) {
					this.prefetchPending.add(fi2);
				}
			}
			return;
		}
		const targetLod = this.lodTable.finerOnChain(nodeIndex, desiredLodIndex);
		if (targetLod < 0) return;
		const fi = node.lods[targetLod].fileIndex;
		if (fi !== -1) {
			this.octree.ensureFileResource(fi);
			if (!this.octree.getFileResource(fi)) {
				this.prefetchPending.add(fi);
			}
		}
	}
	resolveLodRange(lodMode) {
		const maxLod = this.octree.lodLevels - 1;
		const { lodRangeMin, lodRangeMax } = this.placement;
		const rangeMin = Math.max(0, Math.min(lodRangeMin ?? 0, maxLod));
		const rangeMax = Math.max(rangeMin, Math.min(lodRangeMax ?? maxLod, maxLod));
		this.rangeMin = rangeMin;
		this.rangeMax = rangeMax;
		const table = this.lodTable;
		if (!table || table.rangeMin !== rangeMin || table.rangeMax !== rangeMax || table.lodMode !== lodMode) {
			this.lodTable = this.octree.acquireLodTable(rangeMin, rangeMax, lodMode);
			this.octree.releaseLodTable(table);
		}
	}
	evaluateNodeCoverage(cameraNode, params) {
		const { lodBehindPenalty } = params;
		const distanceMode = this.lodTable.lodMode === GSPLAT_LODMODE_DISTANCE;
		const uniformScale = this.placement.node.getWorldTransform().getScale().x;
		const camera = cameraNode.camera;
		const ortho = camera.projection === PROJECTION_ORTHOGRAPHIC;
		let fovScale = 1;
		if (!ortho) {
			let tanHalfVFov = Math.tan(camera.fov * 0.5 * math.DEG_TO_RAD);
			if (camera.horizontalFov) {
				tanHalfVFov /= camera.aspectRatio;
			}
			const tanHalfHFov = tanHalfVFov * camera.aspectRatio;
			fovScale = Math.min(tanHalfVFov, tanHalfHFov) / REF_TAN_HALF_FOV;
		}
		const invOrthoHeight = ortho ? uniformScale / Math.max(camera.orthoHeight, 1e-12) : 0;
		const worldCameraPosition = cameraNode.getPosition();
		const octreeWorldTransform = this.placement.node.getWorldTransform();
		_invWorldMat.copy(octreeWorldTransform).invert();
		const localCameraPosition = _invWorldMat.transformPoint(worldCameraPosition, _localCameraPos);
		const worldCameraForward = cameraNode.forward;
		const localCameraForward = _invWorldMat.transformVector(worldCameraForward, _localCameraFwd).normalize();
		const nodes = this.octree.nodes;
		const nodeInfos = this.nodeInfos;
		const boundsFlat = this.octree.nodeBoundsMinMax;
		const px = localCameraPosition.x;
		const py = localCameraPosition.y;
		const pz = localCameraPosition.z;
		const fwx = localCameraForward.x;
		const fwy = localCameraForward.y;
		const fwz = localCameraForward.z;
		for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
			const nodeInfo = nodeInfos[nodeIndex];
			const b = nodeIndex * 6;
			let qx = px;
			const minX = boundsFlat[b];
			const maxX = boundsFlat[b + 3];
			if (qx < minX) qx = minX;
			else if (qx > maxX) qx = maxX;
			let qy = py;
			const minY = boundsFlat[b + 1];
			const maxY = boundsFlat[b + 4];
			if (qy < minY) qy = minY;
			else if (qy > maxY) qy = maxY;
			let qz = pz;
			const minZ = boundsFlat[b + 2];
			const maxZ = boundsFlat[b + 5];
			if (qz < minZ) qz = minZ;
			else if (qz > maxZ) qz = maxZ;
			const dx = qx - px;
			const dy = qy - py;
			const dz = qz - pz;
			const actualDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
			let penaltyFactor = 1;
			if (lodBehindPenalty > 1 && actualDistance > 0.01) {
				const dotOverDistance = (fwx * dx + fwy * dy + fwz * dz) / actualDistance;
				if (dotOverDistance < 0) {
					const t = -dotOverDistance;
					penaltyFactor = 1 + t * (lodBehindPenalty - 1);
				}
			}
			const fovAdjustedDistance = actualDistance * penaltyFactor * fovScale;
			nodeInfo.worldDistance = fovAdjustedDistance * uniformScale;
			const radius = nodes[nodeIndex].boundingSphere.w;
			let coverage;
			if (distanceMode) {
				const worldDist = Math.max(fovAdjustedDistance * uniformScale, 1e-6);
				coverage = 1 / (worldDist * worldDist);
			} else if (ortho) {
				const projectedRadius = Math.min(radius * invOrthoHeight, 1);
				coverage = projectedRadius * projectedRadius / (penaltyFactor * penaltyFactor);
			} else {
				const projectedRadius = radius / Math.max(radius + fovAdjustedDistance, 1e-12);
				coverage = projectedRadius * projectedRadius;
			}
			nodeInfo.lodCoverage = Math.max(coverage, 1e-12);
		}
	}
	applyLodChanges(params) {
		const nodes = this.octree.nodes;
		const { lodUnderfillLimit = 0 } = params;
		for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
			const node = nodes[nodeIndex];
			const nodeInfo = this.nodeInfos[nodeIndex];
			const optimalLodIndex = nodeInfo.optimalLod;
			const currentLodIndex = nodeInfo.currentLod;
			const desiredLodIndex = this.selectDesiredLodIndex(nodeIndex, optimalLodIndex, lodUnderfillLimit);
			if (desiredLodIndex !== currentLodIndex) {
				const currentFileIndex = currentLodIndex >= 0 ? node.lods[currentLodIndex].fileIndex : -1;
				const desiredFileIndex = desiredLodIndex >= 0 ? node.lods[desiredLodIndex].fileIndex : -1;
				const wasVisible = currentFileIndex !== -1;
				const willBeVisible = desiredFileIndex !== -1;
				const pendingEntry = this.pendingDecrements.get(nodeIndex);
				if (pendingEntry) {
					if (pendingEntry.newFileIndex !== desiredFileIndex) {
						const prevPendingPlacement = this.filePlacements[pendingEntry.newFileIndex];
						if (prevPendingPlacement) {
							this.decrementFileRef(pendingEntry.newFileIndex, nodeIndex);
						}
						if (wasVisible && willBeVisible) {
							this.pendingDecrements.set(nodeIndex, { oldFileIndex: pendingEntry.oldFileIndex, newFileIndex: desiredFileIndex });
						} else {
							this.pendingDecrements.delete(nodeIndex);
						}
					}
				}
				if (!wasVisible && willBeVisible) {
					const prevPendingFi = this.pendingVisibleAdds.get(nodeIndex);
					if (prevPendingFi !== void 0 && prevPendingFi !== desiredFileIndex) {
						this.decrementFileRef(prevPendingFi, nodeIndex);
						this.pendingVisibleAdds.delete(nodeIndex);
					}
					this.incrementFileRef(desiredFileIndex, nodeIndex, desiredLodIndex);
					const newPlacement = this.filePlacements[desiredFileIndex];
					if (newPlacement?.resource) {
						nodeInfo.currentLod = desiredLodIndex;
						this.pendingVisibleAdds.delete(nodeIndex);
					} else {
						this.pendingVisibleAdds.set(nodeIndex, desiredFileIndex);
					}
				} else if (wasVisible && !willBeVisible) {
					const pendingEntry2 = this.pendingDecrements.get(nodeIndex);
					if (pendingEntry2) {
						this.decrementFileRef(pendingEntry2.newFileIndex, nodeIndex);
						this.pendingDecrements.delete(nodeIndex);
					}
					this.decrementFileRef(currentFileIndex, nodeIndex);
					nodeInfo.currentLod = -1;
					this.pendingVisibleAdds.delete(nodeIndex);
				} else if (wasVisible && willBeVisible) {
					this.incrementFileRef(desiredFileIndex, nodeIndex, desiredLodIndex);
					const newPlacement = this.filePlacements[desiredFileIndex];
					if (newPlacement?.resource) {
						this.decrementFileRef(currentFileIndex, nodeIndex);
						this.pendingDecrements.delete(nodeIndex);
						nodeInfo.currentLod = desiredLodIndex;
						this.pendingVisibleAdds.delete(nodeIndex);
					} else {
						this.pendingDecrements.set(nodeIndex, { oldFileIndex: currentFileIndex, newFileIndex: desiredFileIndex });
						this.pendingVisibleAdds.delete(nodeIndex);
					}
				}
			}
			this.prefetchNextLod(nodeIndex, desiredLodIndex, optimalLodIndex);
		}
	}
	incrementFileRef(fileIndex, nodeIndex, lodIndex) {
		if (fileIndex === -1) return;
		let placement = this.filePlacements[fileIndex];
		if (!placement) {
			placement = new GSplatPlacement(null, this.placement.node, lodIndex, null, this.placement);
			this.filePlacements[fileIndex] = placement;
			const removeScheduled = this.removedCandidates.delete(fileIndex);
			if (!removeScheduled) {
				this.octree.incRefCount(fileIndex);
			}
			if (!this.addFilePlacement(fileIndex)) {
				this.octree.ensureFileResource(fileIndex);
				this.pending.add(fileIndex);
			}
		}
		const nodes = this.octree.nodes;
		const node = nodes[nodeIndex];
		const lod = node.lods[lodIndex];
		const interval = new Vec2(lod.offset, lod.offset + lod.count - 1);
		placement.intervals.set(nodeIndex, interval);
		this.dirtyModifiedPlacements = true;
	}
	decrementFileRef(fileIndex, nodeIndex) {
		if (fileIndex === -1) return;
		const placement = this.filePlacements[fileIndex];
		if (!placement) {
			return;
		}
		if (placement) {
			placement.intervals.delete(nodeIndex);
			this.dirtyModifiedPlacements = true;
			if (placement.intervals.size === 0) {
				if (placement.resource) {
					this.activePlacements.delete(placement);
					if (this.activePlacements.size === 0) {
						this.dirtyPlacementSetChanged = true;
					}
				}
				this.removedCandidates.add(fileIndex);
				this.filePlacements[fileIndex] = null;
				this.pending.delete(fileIndex);
			}
		}
	}
	addFilePlacement(fileIndex) {
		const res = this.octree.getFileResource(fileIndex);
		if (res) {
			const placement = this.filePlacements[fileIndex];
			if (placement) {
				placement.resource = res;
				if (this.activePlacements.size === 0) {
					this.dirtyPlacementSetChanged = true;
				}
				this.activePlacements.add(placement);
				this.dirtyModifiedPlacements = true;
				this.removedCandidates.delete(fileIndex);
				return true;
			}
		}
		return false;
	}
	testMoved(threshold) {
		const position = this.placement.node.getPosition();
		const length = position.distance(this.previousPosition);
		if (length > threshold) {
			return true;
		}
		return false;
	}
	updateMoved() {
		this.previousPosition.copy(this.placement.node.getPosition());
	}
	update() {
		if (this.placement.lodDirty) {
			this.placement.lodDirty = false;
			this.needsLodUpdate = true;
		}
		if (this.pending.size) {
			for (const fileIndex of this.pending) {
				this.octree.ensureFileResource(fileIndex);
				if (this.addFilePlacement(fileIndex)) {
					_tempCompletedUrls.push(fileIndex);
					for (const [nodeIndex, { oldFileIndex, newFileIndex }] of this.pendingDecrements) {
						if (newFileIndex === fileIndex) {
							this.decrementFileRef(oldFileIndex, nodeIndex);
							this.pendingDecrements.delete(nodeIndex);
							let newLodIndex = 0;
							const nodeLods = this.octree.nodes[nodeIndex].lods;
							for (let li = 0; li < nodeLods.length; li++) {
								if (nodeLods[li].fileIndex === newFileIndex) {
									newLodIndex = li;
									break;
								}
							}
							this.nodeInfos[nodeIndex].currentLod = newLodIndex;
						}
					}
				}
			}
			if (_tempCompletedUrls.length > 0) {
				this.needsLodUpdate = true;
			}
			for (const fileIndex of _tempCompletedUrls) {
				this.pending.delete(fileIndex);
			}
			_tempCompletedUrls.length = 0;
		}
		this.pollPrefetchCompletions();
		if (this.octree.environmentUrl && !this.environmentPlacement) {
			this.octree.ensureEnvironmentResource();
			const envResource = this.octree.environmentResource;
			if (envResource) {
				this.environmentPlacement = new GSplatPlacement(envResource, this.placement.node, 0, null, this.placement);
				this.environmentPlacement.aabb.copy(envResource.aabb);
				this.activePlacements.add(this.environmentPlacement);
				this.dirtyModifiedPlacements = true;
				this.dirtyPlacementSetChanged = true;
				envResource.releaseTextureSources?.();
			}
		}
		const dirty = this.dirtyModifiedPlacements;
		this.dirtyModifiedPlacements = false;
		return dirty;
	}
	consumePlacementSetChanged() {
		const changed = this.dirtyPlacementSetChanged;
		this.dirtyPlacementSetChanged = false;
		return changed;
	}
	// debug render world space bounds for octree nodes based on current LOD selection
	debugRender(scene) {
	}
	consumeNeedsLodUpdate() {
		const v = this.needsLodUpdate;
		this.needsLodUpdate = false;
		return v;
	}
	pollPrefetchCompletions() {
		if (this.prefetchPending.size) {
			for (const fileIndex of this.prefetchPending) {
				this.octree.ensureFileResource(fileIndex);
				if (this.octree.getFileResource(fileIndex)) {
					_tempCompletedUrls.push(fileIndex);
				}
			}
			if (_tempCompletedUrls.length > 0) {
				this.needsLodUpdate = true;
			}
			for (const fileIndex of _tempCompletedUrls) {
				this.prefetchPending.delete(fileIndex);
			}
			_tempCompletedUrls.length = 0;
		}
	}
}
export {
	GSplatOctreeInstance,
	NodeInfo
};
