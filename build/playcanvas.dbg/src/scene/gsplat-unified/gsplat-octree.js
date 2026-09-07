var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { GSplatOctreeNode } from "./gsplat-octree-node.js";
import { GSplatLodTable } from "./gsplat-lod-table.js";
import { GSPLAT_LODMODE_ERROR } from "../constants.js";
import { path } from "../../core/path.js";
import { Debug } from "../../core/debug.js";
import { Tracing } from "../../core/tracing.js";
import { TRACEID_OCTREE_RESOURCES } from "../../core/constants.js";
const _toDelete = [];
class GSplatOctree {
  /**
   * @param {string} assetFileUrl - The file URL of the container asset.
   * @param {Object} data - The parsed JSON data containing info, filenames and tree.
   */
  constructor(assetFileUrl, data) {
    /**
     * @type {GSplatOctreeNode[]}
     */
    __publicField(this, "nodes");
    /**
     * Packed per-node axis-aligned bounds in octree local space for CPU hot paths (e.g. LOD).
     * Length is {@link GSplatOctree.nodes}.length * 6. For node index `i`, base `b = i * 6`:
     * `[minX, minY, minZ, maxX, maxY, maxZ]` matching {@link GSplatOctreeNode.bounds}.
     *
     * @type {Float32Array}
     */
    __publicField(this, "nodeBoundsMinMax");
    /**
     * @type {{ url: string, lodLevel: number }[]}
     */
    __publicField(this, "files");
    /**
     * @type {number}
     */
    __publicField(this, "lodLevels");
    /**
     * Where the per-level approximation errors in {@link GSplatOctreeNode#lods} came from.
     * `'file'` when the manifest declared `lodErrors` and every renderable level supplied a usable
     * value, `'derived'` when they were computed from splat counts instead. Errors always exist
     * either way - this is for diagnostics only, there is no separate code path.
     *
     * @type {'file'|'derived'}
     */
    __publicField(this, "lodErrorSource", "derived");
    /**
     * Precomputed LOD selection tables, keyed by the LOD range they were built for and shared by
     * every instance of this octree using that range.
     *
     * `lodRangeMin`/`lodRangeMax` are per placement, so instances of one octree may legitimately
     * differ and each live range needs its own table - holding only the most recent would rebuild
     * on every request. Entries are reference counted by the instances holding them and dropped at
     * zero, so nothing is retained for a range that has fallen out of use, and nothing still in use
     * can be evicted.
     *
     * @type {Map<string, GSplatLodTable>}
     * @private
     */
    __publicField(this, "_lodTables", /* @__PURE__ */ new Map());
    /**
     * The file URL of the container asset, used as the base for resolving relative URLs.
     *
     * @type {string}
     */
    __publicField(this, "assetFileUrl");
    /**
     * Resources of individual files, identified by their file index.
     *
     * @type {Map<number, GSplatResource>}
     */
    __publicField(this, "fileResources", /* @__PURE__ */ new Map());
    /**
     * Reference counts for each file by file index. Index is fileIndex, value is reference count.
     * When a file reaches zero references, it is scheduled for cooldown and unload.
     *
     * @type {Int32Array}
     */
    __publicField(this, "fileRefCounts");
    /**
     * Cooldown timers for files that reached zero references. Key is fileIndex, value is ticks
     * remaining.
     *
     * @type {Map<number, number>}
     */
    __publicField(this, "cooldowns", /* @__PURE__ */ new Map());
    /**
     * Optional environment asset URL.
     *
     * @type {string|null}
     */
    __publicField(this, "environmentUrl", null);
    /**
     * Loaded environment resource.
     *
     * @type {GSplatResource|null}
     */
    __publicField(this, "environmentResource", null);
    /**
     * Reference count for environment usage.
     */
    __publicField(this, "environmentRefCount", 0);
    /**
     * Asset loader used for loading/unloading resources.
     *
     * @type {GSplatAssetLoaderBase|null}
     */
    __publicField(this, "assetLoader", null);
    /**
     * Whether this octree has been destroyed.
     */
    __publicField(this, "destroyed", false);
    /**
     * Number of update ticks before unloading unused file resources. Set from GSplatParams.
     *
     * @private
     */
    __publicField(this, "cooldownTicks", 100);
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
      Debug.warn(`GSplatOctree: ${assetFileUrl} declares lodErrors but does not supply a finite, non-negative error for every renderable LOD level, deriving errors from splat counts instead.`);
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
  /**
   * Destroys the octree and clears internal state. Does not force-unload resources as they may
   * still be referenced by managers. Resources will be cleaned up when their reference counts
   * reach zero through the normal cleanup mechanisms.
   */
  destroy() {
    this.destroyed = true;
    this._lodTables.clear();
    this.fileResources.clear();
    this.cooldowns.clear();
    this.assetLoader?.destroy();
    this.assetLoader = null;
    this.environmentResource = null;
  }
  /**
   * Trace out per-LOD counts of currently loaded file resources.
   *
   * @private
   */
  _traceLodCounts() {
    Debug.call(() => {
      if (!Tracing.get(TRACEID_OCTREE_RESOURCES)) return;
      const loadedCounts = /* @__PURE__ */ new Map();
      for (const fileIndex of this.fileResources.keys()) {
        const lod = this.files[fileIndex].lodLevel;
        loadedCounts.set(lod, (loadedCounts.get(lod) || 0) + 1);
      }
      const maxLod = Math.max(0, this.lodLevels - 1);
      const loadedSummary = Array.from({ length: maxLod + 1 }, (_, i) => loadedCounts.get(i) || 0).join(" / ");
      Debug.trace(TRACEID_OCTREE_RESOURCES, `${this.assetFileUrl}: LOD resources in memory: ${loadedSummary}`);
    });
  }
  /**
   * Derives per-level approximation errors from splat counts, used when the manifest supplies
   * none. The measure is the log of the level's decimation factor against the node's finest
   * renderable level.
   *
   * The allocator only ever consumes the *difference* between adjacent levels, and decimation is
   * geometric - each level holds roughly half the splats of the one below it. A log therefore
   * gives equal error steps for equal count ratios, which matches how the levels were actually
   * produced, and it beat a cube-root spacing proxy on every capture measured - by 2 percentage
   * points on a finely partitioned one and by over 20 on a coarse one.
   *
   * Deliberately scale-free. Reweighting a node by its physical size, as `ln(ref/c) * V^p` over
   * AABB volume `V`, was swept for `p` in 1/12 .. 1/3 against real splat-transform errors on
   * three captures: it never helped, and cost up to +120% on the finely partitioned one. Two
   * reasons it should not help - {@link NodeInfo#lodCoverage} already accounts for apparent size,
   * so a size term double-counts it, and splat-transform's own error is a mass-weighted *mean*,
   * itself scale-free, so a scale-free proxy matches it in kind.
   *
   * How close it gets depends mostly on how finely the asset is partitioned, since a count-only
   * proxy has less to work with when a node covers more varied content. Against authored errors:
   * ~2-6% on captures with thousands of nodes, ~13-17% on one with only ~500.
   *
   * The result is clamped monotone non-decreasing, because nothing upstream guarantees that a
   * coarser level holds fewer splats and a coarser level must never advertise less error than
   * the finer one it stands in for.
   *
   * @private
   */
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
  /**
   * Takes a reference to the LOD selection table for a LOD range, building it on first use. The
   * caller must pass it back to {@link GSplatOctree#releaseLodTable} when it stops using it.
   *
   * The table has to be per range rather than derived from a single full-range one, because a
   * sub-range's Pareto frontier is not the full frontier filtered down to it - when `rangeMax`
   * lands inside a run of levels with equal error, a level that the full range discards becomes
   * the sub-range's cheapest entry.
   *
   * @param {number} rangeMin - Finest allowed LOD index.
   * @param {number} rangeMax - Coarsest allowed LOD index.
   * @param {string} [lodMode] - GSPLAT_LODMODE_ERROR (default) or GSPLAT_LODMODE_DISTANCE.
   * @returns {GSplatLodTable} The selection table, with its reference count incremented.
   */
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
  /**
   * Releases a reference taken by {@link GSplatOctree#acquireLodTable}, dropping the table once
   * no instance holds it.
   *
   * @param {GSplatLodTable|null} table - The table to release. Null is ignored, so callers can
   * release unconditionally.
   */
  releaseLodTable(table) {
    if (!table) return;
    Debug.assert(table.refCount > 0, `GSplatOctree: releasing a LOD table for range [${table.rangeMin}, ${table.rangeMax}] that holds no references.`);
    if (--table.refCount <= 0) {
      this._lodTables.delete(`${table.rangeMin},${table.rangeMax},${table.lodMode}`);
    }
  }
  /**
   * Recursively extracts leaf nodes (nodes with 'lods' property) from the hierarchical tree.
   *
   * @param {Object} node - The current tree node to process.
   * @param {Array} leafNodes - Array to collect leaf nodes.
   * @private
   */
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
  /**
   * Increments reference count for a file by index and cancels any pending cooldown.
   *
   * @param {number} fileIndex - Index of the file in `files` array.
   */
  incRefCount(fileIndex) {
    Debug.assert(fileIndex >= 0 && fileIndex < this.files.length);
    const count = this.fileRefCounts[fileIndex] + 1;
    this.fileRefCounts[fileIndex] = count;
    this.cooldowns.delete(fileIndex);
  }
  /**
   * Decrements reference count for a file by index. When it reaches zero, either unload
   * immediately (if cooldownTicks is 0) or schedule for cooldown.
   *
   * @param {number} fileIndex - Index of the file in `files` array.
   * @param {number} cooldownTicks - Number of update ticks before unloading when unused. If 0,
   * unload immediately.
   */
  decRefCount(fileIndex, cooldownTicks) {
    Debug.assert(fileIndex >= 0 && fileIndex < this.files.length);
    const count = this.fileRefCounts[fileIndex] - 1;
    this.fileRefCounts[fileIndex] = count;
    Debug.assert(count >= 0);
    if (count === 0) {
      if (cooldownTicks === 0) {
        this.unloadResource(fileIndex);
      } else {
        this.cooldowns.set(fileIndex, cooldownTicks);
      }
    }
  }
  /**
   * Unloads a resource for a file index if currently loaded.
   *
   * @param {number} fileIndex - Index of the file in `files` array.
   */
  unloadResource(fileIndex) {
    Debug.assert(fileIndex >= 0 && fileIndex < this.files.length);
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
  /**
   * Advances cooldowns for zero-ref files and unloads those whose timers expired.
   *
   * @param {number} cooldownTicks - Number of ticks for new cooldowns, synced from GSplatParams.
   */
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
  /**
   * Ensures a file resource is loaded and available. This function:
   * - Starts loading if not already started
   * - Checks if loading completed and stores the resource if available
   *
   * @param {number} fileIndex - The index of the file in the `files` array.
   */
  ensureFileResource(fileIndex) {
    Debug.assert(fileIndex >= 0 && fileIndex < this.files.length);
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
  /**
   * Increments reference count for environment.
   */
  incEnvironmentRefCount() {
    this.environmentRefCount++;
  }
  /**
   * Decrements reference count for environment. When it reaches zero, immediately unload.
   */
  decEnvironmentRefCount() {
    this.environmentRefCount--;
    Debug.assert(this.environmentRefCount >= 0);
    if (this.environmentRefCount === 0) {
      this.unloadEnvironmentResource();
    }
  }
  /**
   * Ensures environment resource is loaded and available.
   */
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
  /**
   * Unloads environment resource if currently loaded.
   */
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
