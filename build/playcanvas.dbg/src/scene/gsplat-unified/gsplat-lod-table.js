var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { GSPLAT_LODMODE_DISTANCE, GSPLAT_LODMODE_ERROR } from "../constants.js";
const DISTANCE_BAND_MULTIPLIER = 3;
class GSplatLodTable {
  /**
   * @param {GSplatOctree} octree - The octree to build the table for.
   * @param {number} rangeMin - Finest allowed LOD index.
   * @param {number} rangeMax - Coarsest allowed LOD index.
   * @param {string} [lodMode] - GSPLAT_LODMODE_ERROR (default) or GSPLAT_LODMODE_DISTANCE.
   */
  constructor(octree, rangeMin, rangeMax, lodMode = GSPLAT_LODMODE_ERROR) {
    /**
     * Finest allowed LOD index.
     *
     * @type {number}
     */
    __publicField(this, "rangeMin");
    /**
     * Coarsest allowed LOD index.
     *
     * @type {number}
     */
    __publicField(this, "rangeMax");
    /**
     * The LOD selection mode this table was built for - GSPLAT_LODMODE_ERROR or
     * GSPLAT_LODMODE_DISTANCE. Part of the octree's cache identity alongside the range.
     *
     * @type {string}
     */
    __publicField(this, "lodMode");
    /**
     * How many octree instances currently hold this table. Managed by the owning
     * {@link GSplatOctree}, which drops the table when this reaches zero - so a table is retained
     * exactly while some instance is using its range, rather than on a fixed cap that could evict
     * one still in use.
     *
     * @type {number}
     */
    __publicField(this, "refCount", 0);
    /**
     * Per node, the cheapest renderable level in range - where the allocator starts before it
     * spends anything. -1 when the node has no renderable level in range at all.
     *
     * @type {Int16Array}
     */
    __publicField(this, "startLod");
    /**
     * Per node, the splat count at {@link GSplatLodTable#startLod}.
     *
     * @type {Int32Array}
     */
    __publicField(this, "startCount");
    /**
     * Per node, where its upgrade slice begins. Node `n` owns
     * `[firstUpgrade[n], firstUpgrade[n + 1])`, so the array holds one extra entry and the slice
     * length needs no second array.
     *
     * @type {Int32Array}
     */
    __publicField(this, "firstUpgrade");
    /**
     * Per upgrade, the LOD index it moves the node to.
     *
     * @type {Int16Array}
     */
    __publicField(this, "upgradeToLod");
    /**
     * Per upgrade, the additional splats it costs. Always above zero.
     *
     * @type {Int32Array}
     */
    __publicField(this, "upgradeCost");
    /**
     * Per upgrade, error removed per additional splat over the best run this upgrade opens up -
     * `max` over the levels reachable from where it starts, rather than its own slope. Multiplying
     * by the node's coverage yields the upgrade's value.
     *
     * Note this is not monotone along a chain: once a poorly-valued step has been taken, what
     * remains can be worth more than what was just bought. The allocator tolerates that, see
     * GSplatBudgetBalancer.
     *
     * @type {Float32Array}
     */
    __publicField(this, "upgradeRatio");
    /**
     * Sum of {@link GSplatLodTable#startCount} over all nodes - the splat cost of the whole octree
     * before any upgrade is bought.
     *
     * @type {number}
     */
    __publicField(this, "totalStartCount", 0);
    /**
     * Sum of the finest renderable level in range over all nodes - the splat cost with every
     * upgrade bought.
     *
     * @type {number}
     */
    __publicField(this, "totalFinestCount", 0);
    this.rangeMin = rangeMin;
    this.rangeMax = rangeMax;
    this.lodMode = lodMode;
    const nodes = octree.nodes;
    const nodeCount = nodes.length;
    const spanLength = rangeMax - rangeMin + 1;
    this.startLod = new Int16Array(nodeCount);
    this.startCount = new Int32Array(nodeCount);
    this.firstUpgrade = new Int32Array(nodeCount + 1);
    const maxUpgrades = nodeCount * Math.max(0, spanLength - 1);
    const upgradeToLod = new Int16Array(maxUpgrades);
    const upgradeCost = new Int32Array(maxUpgrades);
    const upgradeRatio = new Float32Array(maxUpgrades);
    const scratch = new Int16Array(spanLength);
    const distanceMode = lodMode === GSPLAT_LODMODE_DISTANCE;
    const err = new Float64Array(rangeMax + 1);
    const bandWeight = new Float64Array(rangeMax + 1);
    for (let lod = 1; lod <= rangeMax; lod++) {
      bandWeight[lod] = Math.pow(DISTANCE_BAND_MULTIPLIER, 2 * (lod - 1));
    }
    let upgradeCount = 0;
    let totalStartCount = 0;
    let totalFinestCount = 0;
    for (let n = 0; n < nodeCount; n++) {
      const lods = nodes[n].lods;
      this.firstUpgrade[n] = upgradeCount;
      if (distanceMode) {
        let finerCount = -1;
        let e = 0;
        for (let lod = rangeMin; lod <= rangeMax; lod++) {
          if (lods[lod].count <= 0) continue;
          if (finerCount >= 0) {
            e += Math.max(finerCount - lods[lod].count, 1) * bandWeight[lod];
          }
          err[lod] = e;
          finerCount = lods[lod].count;
        }
      } else {
        for (let lod = rangeMin; lod <= rangeMax; lod++) {
          err[lod] = lods[lod].error;
        }
      }
      let candidateCount = 0;
      for (let lod = rangeMax; lod >= rangeMin; lod--) {
        if (lods[lod].count <= 0) continue;
        let j = candidateCount++;
        while (j > 0) {
          const prev = scratch[j - 1];
          if (lods[prev].count < lods[lod].count || lods[prev].count === lods[lod].count && err[prev] <= err[lod]) {
            break;
          }
          scratch[j] = prev;
          j--;
        }
        scratch[j] = lod;
      }
      let frontierCount = 0;
      let bestError = Infinity;
      for (let i = 0; i < candidateCount; i++) {
        const lod = scratch[i];
        if (err[lod] < bestError) {
          bestError = err[lod];
          scratch[frontierCount++] = lod;
        }
      }
      if (frontierCount === 0) {
        this.startLod[n] = -1;
        this.startCount[n] = 0;
        continue;
      }
      const startLod = scratch[0];
      this.startLod[n] = startLod;
      this.startCount[n] = lods[startLod].count;
      totalStartCount += lods[startLod].count;
      totalFinestCount += lods[scratch[frontierCount - 1]].count;
      for (let i = 1; i < frontierCount; i++) {
        const coarseLod = scratch[i - 1];
        const fineLod = scratch[i];
        let ratio = 0;
        for (let j = i; j < frontierCount; j++) {
          const reach = scratch[j];
          const r = (err[coarseLod] - err[reach]) / (lods[reach].count - lods[coarseLod].count);
          if (r > ratio) ratio = r;
        }
        upgradeToLod[upgradeCount] = fineLod;
        upgradeCost[upgradeCount] = lods[fineLod].count - lods[coarseLod].count;
        upgradeRatio[upgradeCount] = ratio;
        upgradeCount++;
      }
    }
    this.firstUpgrade[nodeCount] = upgradeCount;
    this.totalStartCount = totalStartCount;
    this.totalFinestCount = totalFinestCount;
    this.upgradeToLod = upgradeToLod.subarray(0, upgradeCount).slice();
    this.upgradeCost = upgradeCost.subarray(0, upgradeCount).slice();
    this.upgradeRatio = upgradeRatio.subarray(0, upgradeCount).slice();
  }
  /**
   * Walks a node's chain to the coarsest level that is no finer than `lod` and no coarser than
   * `limit` levels above it, preferring the finest such level that satisfies `accept`.
   *
   * Streaming fallbacks use this instead of walking raw LOD indices, so they can only ever pick
   * a level the allocator itself would consider. That keeps the splat count monotone as a node
   * climbs towards its target: chain entries are ordered by ascending cost, whereas raw level
   * indices are not - nothing guarantees a coarser level holds fewer splats.
   *
   * @param {number} nodeIndex - The node.
   * @param {number} lod - The target LOD index, expected to be on the node's chain.
   * @param {number} limit - How many chain steps coarser than the target are acceptable.
   * @param {(lod: number) => boolean} accept - Predicate a level must satisfy.
   * @returns {number} The chosen LOD index, or -1 when nothing in the window qualifies.
   */
  findCoarserAccepted(nodeIndex, lod, limit, accept) {
    const start = this.firstUpgrade[nodeIndex];
    const end = this.firstUpgrade[nodeIndex + 1];
    let position = -1;
    for (let k = start; k < end; k++) {
      if (this.upgradeToLod[k] === lod) {
        position = k - start;
        break;
      }
    }
    if (position < 0 && this.startLod[nodeIndex] !== lod) return -1;
    const lowest = Math.max(-1, position - limit);
    for (let p = position; p >= lowest; p--) {
      const candidate = p < 0 ? this.startLod[nodeIndex] : this.upgradeToLod[start + p];
      if (accept(candidate)) return candidate;
    }
    return -1;
  }
  /**
   * Returns the next coarser level on a node's chain, or -1 when `lod` is already its cheapest.
   *
   * @param {number} nodeIndex - The node.
   * @param {number} lod - A LOD index on the node's chain.
   * @returns {number} The next coarser chain entry, or -1.
   */
  coarserOnChain(nodeIndex, lod) {
    const start = this.firstUpgrade[nodeIndex];
    const end = this.firstUpgrade[nodeIndex + 1];
    for (let k = start; k < end; k++) {
      if (this.upgradeToLod[k] === lod) {
        return k === start ? this.startLod[nodeIndex] : this.upgradeToLod[k - 1];
      }
    }
    return -1;
  }
  /**
   * Returns the next finer level on a node's chain, or -1 when `lod` is already its finest.
   *
   * @param {number} nodeIndex - The node.
   * @param {number} lod - A LOD index on the node's chain.
   * @returns {number} The next finer chain entry, or -1.
   */
  finerOnChain(nodeIndex, lod) {
    const start = this.firstUpgrade[nodeIndex];
    const end = this.firstUpgrade[nodeIndex + 1];
    if (start === end) return -1;
    if (this.startLod[nodeIndex] === lod) return this.upgradeToLod[start];
    for (let k = start; k < end - 1; k++) {
      if (this.upgradeToLod[k] === lod) return this.upgradeToLod[k + 1];
    }
    return -1;
  }
}
export {
  GSplatLodTable
};
