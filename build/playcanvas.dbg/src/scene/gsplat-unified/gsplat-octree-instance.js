var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { Debug } from "../../core/debug.js";
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
  constructor() {
    /**
     * Current LOD index being rendered. -1 indicates node is not visible.
     */
    __publicField(this, "currentLod", -1);
    /**
     * LOD index the budget allocator chose for this node, before underfill. -1 when the node has
     * nothing renderable in its LOD range.
     */
    __publicField(this, "optimalLod", -1);
    /**
     * World-space distance from camera to this node.
     * Used for non-linear bucket mapping in budget enforcement.
     */
    __publicField(this, "worldDistance", 0);
    /**
     * Approximate projected screen coverage: the square of the node's projected radius, including
     * the FOV scale and the behind-camera penalty already folded into the distance. This is the
     * view-dependent half of an upgrade's value in the budget allocator, and the only way distance
     * influences LOD selection.
     */
    __publicField(this, "lodCoverage", 0);
    /**
     * Accumulated camera translation for SH color update threshold tracking.
     */
    __publicField(this, "colorAccumulatedTranslation", 0);
    /**
     * Back-reference to owning GSplatOctreeInstance.
     *
     * @type {GSplatOctreeInstance|null}
     */
    __publicField(this, "inst", null);
    /**
     * Unique allocation identifier for persistent work buffer allocation tracking.
     *
     * @type {number}
     */
    __publicField(this, "allocId", GsplatAllocId.get());
  }
  /**
   * Resets all LOD values to -1 (invisible/uninitialized).
   */
  resetLod() {
    this.currentLod = -1;
    this.optimalLod = -1;
  }
}
class GSplatOctreeInstance {
  /**
   * @param {GraphicsDevice} device - The graphics device.
   * @param {GSplatOctree} octree - The octree.
   * @param {GSplatPlacement} placement - The placement.
   */
  constructor(device, octree, placement) {
    /** @type {GSplatOctree} */
    __publicField(this, "octree");
    /** @type {GSplatPlacement} */
    __publicField(this, "placement");
    /** @type {Set<GSplatPlacement>} */
    __publicField(this, "activePlacements", /* @__PURE__ */ new Set());
    /** @type {boolean} */
    __publicField(this, "dirtyModifiedPlacements", false);
    /**
     * Set to true when placements are added or removed, signaling that the manager needs to
     * create a new world state and trigger a full work buffer rebuild.
     */
    __publicField(this, "dirtyPlacementSetChanged", false);
    /** @type {GraphicsDevice} */
    __publicField(this, "device");
    /**
     * Array of NodeInfo instances, one per octree node.
     *
     * @type {NodeInfo[]}
     */
    __publicField(this, "nodeInfos");
    /**
     * Array of current placements per file. Index is fileIndex, value is GSplatPlacement or null.
     * Value null indicates file is not used / no placement.
     *
     * @type {(GSplatPlacement|null)[]}
     */
    __publicField(this, "filePlacements");
    /**
     * Set of pending file loads (file indices).
     *
     * @type {Set<number>}
     */
    __publicField(this, "pending", /* @__PURE__ */ new Set());
    /**
     * Map of nodeIndex -> { oldFileIndex, newFileIndex } that needs to be decremented when the
     * new LOD resource loads. This ensures we decrement even if the node switches LOD again
     * before the new resource arrives.
     *
     * @type {Map<number, { oldFileIndex: number, newFileIndex: number }>}
     */
    __publicField(this, "pendingDecrements", /* @__PURE__ */ new Map());
    /**
     * Files that became unused by this instance this update. Each entry represents a single decRef.
     *
     * @type {Set<number>}
     */
    __publicField(this, "removedCandidates", /* @__PURE__ */ new Set());
    /**
     * Minimum allowed LOD index for this instance, clamped to valid octree bounds.
     */
    __publicField(this, "rangeMin", 0);
    /**
     * Maximum allowed LOD index for this instance, clamped to valid octree bounds.
     */
    __publicField(this, "rangeMax", 0);
    /**
     * Selection table for this instance's current LOD range, refreshed by
     * {@link GSplatOctreeInstance#resolveLodRange}. Read by the budget balancer rather than having
     * it resolve the range a second time.
     *
     * @type {import('./gsplat-lod-table.js').GSplatLodTable|null}
     */
    __publicField(this, "lodTable", null);
    /**
     * Previous node position at which LOD was last updated. This is used to determine if LOD needs
     * to be updated as the octree splat moves.
     */
    __publicField(this, "previousPosition", new Vec3());
    /**
     * Set when a resource has completed loading and LOD should be re-evaluated.
     */
    __publicField(this, "needsLodUpdate", false);
    /**
     * Tracks prefetched file indices that are being loaded without active placements.
     * When any completes, we trigger LOD re-evaluation to allow promotion.
     *
     * @type {Set<number>}
     */
    __publicField(this, "prefetchPending", /* @__PURE__ */ new Set());
    /**
     * Tracks invisible->visible pending adds per node: nodeIndex -> fileIndex.
     * Ensures only a single pending placement exists for a node while it's not yet displayed.
     *
     * @type {Map<number, number>}
     */
    __publicField(this, "pendingVisibleAdds", /* @__PURE__ */ new Map());
    /**
     * Environment placement.
     *
     * @type {GSplatPlacement|null}
     */
    __publicField(this, "environmentPlacement", null);
    /**
     * Event handle for device lost event.
     *
     * @type {EventHandle|null}
     * @private
     */
    __publicField(this, "_deviceLostEvent", null);
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
  /**
   * Returns the count of resources pending load or prefetch, including environment if loading.
   *
   * @type {number}
   */
  get pendingLoadCount() {
    let count = this.pending.size + this.prefetchPending.size;
    if (this.octree.environmentUrl && !this.environmentPlacement) {
      count++;
    }
    return count;
  }
  /**
   * Destroys this octree instance and clears internal references.
   *
   * @param {boolean} [skipRefCounting] - When true, skip decrementing file ref counts
   * on the octree. Used when the caller handles ref counting externally via pendingReleases
   * (e.g. during world state updates where decrements must be deferred).
   */
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
  /**
   * Handles device lost event by releasing all loaded resources.
   *
   * @private
   */
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
  /**
   * Returns the file indices currently referenced by this instance that should be decremented
   * when the instance is destroyed.
   *
   * @returns {number[]} Array of file indices to decRef.
   */
  getFileDecrements() {
    const toRelease = [];
    for (let i = 0; i < this.filePlacements.length; i++) {
      if (this.filePlacements[i]) {
        toRelease.push(i);
      }
    }
    return toRelease;
  }
  /**
   * Selects the LOD index to display for a node, applying the underfill strategy. When underfill
   * is enabled it prefers the finest already-loaded level within `lodUnderfillLimit` steps
   * coarser than the target, so a node shows something rather than nothing while its target
   * streams in. If none are loaded it takes the coarsest level in that window.
   *
   * Steps are taken along the node's LOD chain rather than over raw LOD indices. Chain entries
   * are ordered by ascending splat count, whereas raw indices are not - nothing guarantees a
   * coarser level holds fewer splats, and real captures do contain inversions. Walking the chain
   * is what keeps a node's splat count from exceeding what the allocator budgeted for it.
   *
   * @param {number} nodeIndex - The octree node index.
   * @param {number} optimalLodIndex - LOD index the allocator chose.
   * @param {number} lodUnderfillLimit - Allowed number of coarser chain steps.
   * @returns {number} LOD index to display.
   */
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
  /**
   * Prefetch only the next-better LOD toward optimal. This stages loading in steps across all
   * nodes, avoiding intermixing requests before coarse is present. Steps follow the node's LOD
   * chain, so each step is a strict increase in splat count and can never overshoot the level
   * the allocator budgeted for.
   *
   * @param {number} nodeIndex - The octree node index.
   * @param {number} desiredLodIndex - Currently selected LOD for display (may be coarser than optimal).
   * @param {number} optimalLodIndex - Target optimal LOD.
   */
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
  /**
   * Resolves the configured LOD range against the octree and caches the selection table for it.
   * Called before {@link GSplatOctreeInstance#evaluateNodeCoverage} so both that and the budget
   * allocator see the same range.
   *
   * @param {string} lodMode - The scene's LOD selection mode, part of the table's identity.
   */
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
  /**
   * Evaluates per-node projected screen coverage and world distance from the camera. This is
   * Pass 1 of the LOD update process; results are stored in the nodeInfos array and consumed by
   * the budget allocator, which is what actually picks a LOD level.
   *
   * Coverage is the square of the node's projected radius. Under a perspective camera that
   * attenuates with distance, with FOV compensation so it is comparable across cameras; under an
   * orthographic camera a node's footprint does not depend on depth, so coverage is the radius
   * against the ortho window, mirroring Camera#getScreenSize. The behind-camera penalty applies
   * in both. Coverage is the only route by which camera position influences LOD.
   *
   * In distance LOD mode the node's size is factored out instead: coverage is the inverse square
   * of the world distance under both projections, so equal-distance nodes always rank equally and
   * the selection forms clean concentric bands, matching what that mode promises. This is also
   * what gives an orthographic camera a distance ordering at all - its footprint carries no depth
   * term to rank by.
   *
   * @param {GraphNode} cameraNode - The camera node.
   * @param {import('./gsplat-params.js').GSplatParams} params - Global gsplat parameters.
   */
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
  /**
   * Applies calculated LOD changes and manages file placements.
   * This is Pass 2 of the LOD update process. Reads the levels the budget allocator wrote into
   * the nodeInfos array.
   *
   * @param {import('./gsplat-params.js').GSplatParams} params - Global gsplat parameters.
   */
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
  /**
   * Increments reference count for a file and creates placement immediately.
   *
   * @param {number} fileIndex - The file index.
   * @param {number} nodeIndex - The octree node index.
   * @param {number} lodIndex - The LOD index for this node.
   */
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
  /**
   * Decrements reference count for a file and removes placement if needed.
   *
   * @param {number} fileIndex - The file index.
   * @param {number} nodeIndex - The octree node index.
   */
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
  /**
   * Updates existing placement with loaded resource and adds to manager.
   *
   * @param {number} fileIndex - The file index.
   * @returns {boolean} True if placement was updated and added to manager, false otherwise.
   */
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
  /**
   * Tests if the octree instance has moved by more than the provided LOD update distance.
   *
   * @param {number} threshold - Distance threshold to trigger an update.
   * @returns {boolean} True if the octree instance has moved by more than the threshold, false otherwise.
   */
  testMoved(threshold) {
    const position = this.placement.node.getPosition();
    const length = position.distance(this.previousPosition);
    if (length > threshold) {
      return true;
    }
    return false;
  }
  /**
   * Updates the previous position of the octree instance.
   */
  updateMoved() {
    this.previousPosition.copy(this.placement.node.getPosition());
  }
  /**
   * Updates the octree instance each frame.
   *
   * @returns {boolean} True if octree instance is dirty, false otherwise.
   */
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
  /**
   * Consumes and returns whether the active placement set membership changed (add/remove).
   *
   * @returns {boolean} True if placements were added or removed since last call.
   */
  consumePlacementSetChanged() {
    const changed = this.dirtyPlacementSetChanged;
    this.dirtyPlacementSetChanged = false;
    return changed;
  }
  // debug render world space bounds for octree nodes based on current LOD selection
  debugRender(scene) {
    Debug.call(() => {
      if (scene.gsplat.debug === GSPLAT_DEBUG_NODE_AABBS) {
        const modelMat = this.placement.node.getWorldTransform();
        const nodes = this.octree.nodes;
        for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
          const lodIndex = this.nodeInfos[nodeIndex].currentLod;
          if (lodIndex >= 0) {
            const color = _lodColors[Math.min(lodIndex, _lodColors.length - 1)];
            _tempDebugAabb.setFromTransformedAabb(nodes[nodeIndex].bounds, modelMat);
            scene.immediate.drawWireAlignedBox(_tempDebugAabb.getMin(), _tempDebugAabb.getMax(), color, true, scene.defaultDrawLayer);
          }
        }
      }
    });
  }
  /**
   * Returns true if this instance requests LOD re-evaluation and resets the flag.
   *
   * @returns {boolean} True if LOD should be re-evaluated.
   */
  consumeNeedsLodUpdate() {
    const v = this.needsLodUpdate;
    this.needsLodUpdate = false;
    return v;
  }
  /**
   * Polls prefetched file indices for completion and updates state.
   */
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
