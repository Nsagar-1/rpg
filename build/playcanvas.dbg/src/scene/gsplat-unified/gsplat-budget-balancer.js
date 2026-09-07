var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { NUM_VALUE_BUCKETS } from "./constants.js";
const _f32 = new Float32Array(1);
const _u32 = new Uint32Array(_f32.buffer);
const keyOf = (value) => {
  _f32[0] = value;
  return _u32[0];
};
const KEY_LO = keyOf(1e-24);
const KEY_HI = keyOf(1e3);
const KEY_SCALE = (NUM_VALUE_BUCKETS - 1) / (KEY_HI - KEY_LO);
const KEY_ONE = keyOf(1);
const KEY_PIVOT = keyOf(1e-4);
class GSplatBudgetBalancer {
  constructor() {
    /** @type {Int32Array} */
    __publicField(this, "_bucketHead", new Int32Array(NUM_VALUE_BUCKETS));
    /** @type {Int32Array} */
    __publicField(this, "_bucketTail", new Int32Array(NUM_VALUE_BUCKETS));
    /**
     * Next node in the same bucket, indexed by global node index. -1 terminates the list.
     *
     * @type {Int32Array}
     * @private
     */
    __publicField(this, "_next", new Int32Array(0));
    /**
     * Index of a node's next unbought upgrade, indexed by global node index.
     *
     * @type {Int32Array}
     * @private
     */
    __publicField(this, "_pending", new Int32Array(0));
    /**
     * Node coverage, indexed by global node index. Copied out of NodeInfo during the seed pass so
     * the drain, which visits nodes in value order rather than index order, reads a flat array.
     *
     * @type {Float32Array}
     * @private
     */
    __publicField(this, "_coverage", new Float32Array(0));
    /**
     * Per node, the falloff-scaled bit key of its coverage, used instead of {@link _coverage} when
     * any instance has a non-default lodFalloff. See KEY_PIVOT.
     *
     * @type {Float64Array}
     * @private
     */
    __publicField(this, "_coverageKey", new Float64Array(0));
    /**
     * Which instance owns each global node index.
     *
     * @type {Uint16Array}
     * @private
     */
    __publicField(this, "_instanceOf", new Uint16Array(0));
    /**
     * Global node index of each instance's first node.
     *
     * @type {number[]}
     * @private
     */
    __publicField(this, "_instanceBase", []);
    /** @type {GSplatOctreeInstance[]} */
    __publicField(this, "_instances", []);
    /** @type {GSplatLodTable[]} */
    __publicField(this, "_tables", []);
  }
  /**
   * @param {number} capacity - Required global node capacity.
   * @private
   */
  _ensureCapacity(capacity) {
    if (this._next.length >= capacity) return;
    const size = Math.max(capacity, this._next.length * 2, 1024);
    this._next = new Int32Array(size);
    this._pending = new Int32Array(size);
    this._coverage = new Float32Array(size);
    this._coverageKey = new Float64Array(size);
    this._instanceOf = new Uint16Array(size);
  }
  /**
   * Maps an upgrade value to a bucket. Monotonic in the value, so ordering between different
   * upgrades is preserved; the drain caps where a successor may be requeued.
   *
   * @param {number} value - Coverage-weighted error reduction per splat.
   * @returns {number} Bucket index.
   * @private
   */
  _bucketOf(value) {
    const bucket = (keyOf(value) - KEY_LO) * KEY_SCALE | 0;
    return bucket < 0 ? 0 : bucket >= NUM_VALUE_BUCKETS ? NUM_VALUE_BUCKETS - 1 : bucket;
  }
  /**
   * Maps a value already expressed as a bit key - the sum of a falloff-scaled coverage key and a
   * ratio key - to a bucket.
   *
   * @param {number} key - Bit-key of the value.
   * @returns {number} Bucket index.
   * @private
   */
  _bucketOfKey(key) {
    const bucket = (key - KEY_LO) * KEY_SCALE | 0;
    return bucket < 0 ? 0 : bucket >= NUM_VALUE_BUCKETS ? NUM_VALUE_BUCKETS - 1 : bucket;
  }
  /**
   * @param {number} bucket - Bucket to append to.
   * @param {number} node - Global node index.
   * @private
   */
  _push(bucket, node) {
    this._next[node] = -1;
    if (this._bucketHead[bucket] < 0) {
      this._bucketHead[bucket] = node;
    } else {
      this._next[this._bucketTail[bucket]] = node;
    }
    this._bucketTail[bucket] = node;
  }
  /**
   * Assigns a LOD level to every node of every instance, keeping the total splat count within
   * budget. Reads NodeInfo#lodCoverage, writes NodeInfo#optimalLod.
   *
   * @param {Map<GSplatPlacement, GSplatOctreeInstance>} octreeInstances - Map of
   * GSplatOctreeInstance objects.
   * @param {number} budget - Target splat budget for octrees.
   */
  balance(octreeInstances, budget) {
    const instances = this._instances;
    const tables = this._tables;
    const bases = this._instanceBase;
    instances.length = 0;
    tables.length = 0;
    bases.length = 0;
    let nodeTotal = 0;
    let totalStartCount = 0;
    let totalFinestCount = 0;
    let useKeys = false;
    for (const [, inst] of octreeInstances) {
      const table = inst.lodTable;
      bases.push(nodeTotal);
      instances.push(inst);
      tables.push(table);
      nodeTotal += inst.octree.nodes.length;
      totalStartCount += table.totalStartCount;
      totalFinestCount += table.totalFinestCount;
      if (inst.placement.lodFalloff !== 1) useKeys = true;
    }
    if (instances.length === 0) return;
    if (totalFinestCount <= budget) {
      this._assignChainEnd(true);
      return;
    }
    if (totalStartCount >= budget) {
      this._assignChainEnd(false);
      return;
    }
    this._ensureCapacity(nodeTotal);
    this._bucketHead.fill(-1);
    const next = this._next;
    const pending = this._pending;
    const coverage = this._coverage;
    const coverageKey = this._coverageKey;
    const instanceOf = this._instanceOf;
    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const table = tables[i];
      const nodeInfos = inst.nodeInfos;
      const base = bases[i];
      const { startLod, firstUpgrade, upgradeRatio } = table;
      const falloff = inst.placement.lodFalloff;
      for (let n = 0, len = nodeInfos.length; n < len; n++) {
        const nodeInfo = nodeInfos[n];
        const lod = startLod[n];
        nodeInfo.optimalLod = lod;
        if (lod < 0) continue;
        const first = firstUpgrade[n];
        if (first >= firstUpgrade[n + 1]) continue;
        const g = base + n;
        const cov = nodeInfo.lodCoverage;
        coverage[g] = cov;
        instanceOf[g] = i;
        pending[g] = first;
        if (useKeys) {
          coverageKey[g] = falloff * (keyOf(cov) - KEY_PIVOT) + KEY_PIVOT;
          this._push(this._bucketOfKey(coverageKey[g] + keyOf(upgradeRatio[first]) - KEY_ONE), g);
        } else {
          this._push(this._bucketOf(cov * upgradeRatio[first]), g);
        }
      }
    }
    let spent = totalStartCount;
    for (let bucket = NUM_VALUE_BUCKETS - 1; bucket >= 0; bucket--) {
      let g = this._bucketHead[bucket];
      while (g >= 0) {
        this._bucketHead[bucket] = next[g];
        const i = instanceOf[g];
        const table = tables[i];
        const k = pending[g];
        const cost = table.upgradeCost[k];
        if (spent + cost > budget) return;
        spent += cost;
        const n = g - bases[i];
        instances[i].nodeInfos[n].optimalLod = table.upgradeToLod[k];
        const k2 = k + 1;
        if (k2 < table.firstUpgrade[n + 1]) {
          pending[g] = k2;
          const target = useKeys ? this._bucketOfKey(coverageKey[g] + keyOf(table.upgradeRatio[k2]) - KEY_ONE) : this._bucketOf(coverage[g] * table.upgradeRatio[k2]);
          this._push(target > bucket ? bucket : target, g);
        }
        g = this._bucketHead[bucket];
      }
    }
  }
  /**
   * Puts every node at one end of its LOD chain, for the cases where the budget makes the ranking
   * irrelevant - either the whole scene fits at its finest, or not even the cheapest scene does.
   *
   * @param {boolean} finest - True for the finest level in range, false for the cheapest.
   * @private
   */
  _assignChainEnd(finest) {
    for (let i = 0; i < this._instances.length; i++) {
      const table = this._tables[i];
      const nodeInfos = this._instances[i].nodeInfos;
      const { startLod, firstUpgrade, upgradeToLod } = table;
      for (let n = 0, len = nodeInfos.length; n < len; n++) {
        const lod = startLod[n];
        if (lod < 0 || !finest) {
          nodeInfos[n].optimalLod = lod;
          continue;
        }
        const end = firstUpgrade[n + 1];
        nodeInfos[n].optimalLod = end > firstUpgrade[n] ? upgradeToLod[end - 1] : lod;
      }
    }
  }
}
export {
  GSplatBudgetBalancer
};
