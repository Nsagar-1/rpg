/**
 * Distributes a splat budget across octree instances by choosing a LOD level per node.
 *
 * Every node starts at the cheapest level it can render, which is the coarsest the scene can be and
 * therefore always within budget. Each single-level upgrade available anywhere in the scene is then
 * ranked by `coverage * error removed / splats added` - value for money, weighted by how much
 * screen the node covers - and they are bought best first until one does not fit.
 *
 * Stopping at the first upgrade that does not fit, rather than skipping it and continuing, is
 * deliberate. Continuing would make a node's outcome depend on whether some unrelated cheaper
 * upgrade happened to be considered first, so small camera movements would flip levels on and off.
 * The cost is leaving some budget unspent.
 *
 * Only a node's next unbought upgrade is ever in the queue; buying it enqueues its successor. That
 * keeps at most one entry per node live, which is what lets the buckets be intrusive lists over
 * preallocated typed arrays with no per-entry storage at all.
 *
 * A successor can be worth more than what was just bought, since values are the best deal reachable
 * from a level rather than that level's own slope. Requeueing is therefore capped at the bucket
 * being drained, so a run always completes within the sweep that started it - see the drain.
 *
 * @ignore
 */
export class GSplatBudgetBalancer {
    /** @type {Int32Array} */
    _bucketHead: Int32Array;
    /** @type {Int32Array} */
    _bucketTail: Int32Array;
    /**
     * Next node in the same bucket, indexed by global node index. -1 terminates the list.
     *
     * @type {Int32Array}
     * @private
     */
    private _next;
    /**
     * Index of a node's next unbought upgrade, indexed by global node index.
     *
     * @type {Int32Array}
     * @private
     */
    private _pending;
    /**
     * Node coverage, indexed by global node index. Copied out of NodeInfo during the seed pass so
     * the drain, which visits nodes in value order rather than index order, reads a flat array.
     *
     * @type {Float32Array}
     * @private
     */
    private _coverage;
    /**
     * Per node, the falloff-scaled bit key of its coverage, used instead of {@link _coverage} when
     * any instance has a non-default lodFalloff. See KEY_PIVOT.
     *
     * @type {Float64Array}
     * @private
     */
    private _coverageKey;
    /**
     * Which instance owns each global node index.
     *
     * @type {Uint16Array}
     * @private
     */
    private _instanceOf;
    /**
     * Global node index of each instance's first node.
     *
     * @type {number[]}
     * @private
     */
    private _instanceBase;
    /** @type {GSplatOctreeInstance[]} */
    _instances: GSplatOctreeInstance[];
    /** @type {GSplatLodTable[]} */
    _tables: GSplatLodTable[];
    /**
     * @param {number} capacity - Required global node capacity.
     * @private
     */
    private _ensureCapacity;
    /**
     * Maps an upgrade value to a bucket. Monotonic in the value, so ordering between different
     * upgrades is preserved; the drain caps where a successor may be requeued.
     *
     * @param {number} value - Coverage-weighted error reduction per splat.
     * @returns {number} Bucket index.
     * @private
     */
    private _bucketOf;
    /**
     * Maps a value already expressed as a bit key - the sum of a falloff-scaled coverage key and a
     * ratio key - to a bucket.
     *
     * @param {number} key - Bit-key of the value.
     * @returns {number} Bucket index.
     * @private
     */
    private _bucketOfKey;
    /**
     * @param {number} bucket - Bucket to append to.
     * @param {number} node - Global node index.
     * @private
     */
    private _push;
    /**
     * Assigns a LOD level to every node of every instance, keeping the total splat count within
     * budget. Reads NodeInfo#lodCoverage, writes NodeInfo#optimalLod.
     *
     * @param {Map<GSplatPlacement, GSplatOctreeInstance>} octreeInstances - Map of
     * GSplatOctreeInstance objects.
     * @param {number} budget - Target splat budget for octrees.
     */
    balance(octreeInstances: Map<GSplatPlacement, GSplatOctreeInstance>, budget: number): void;
    /**
     * Puts every node at one end of its LOD chain, for the cases where the budget makes the ranking
     * irrelevant - either the whole scene fits at its finest, or not even the cheapest scene does.
     *
     * @param {boolean} finest - True for the finest level in range, false for the cheapest.
     * @private
     */
    private _assignChainEnd;
}
import type { GSplatOctreeInstance } from './gsplat-octree-instance.js';
import type { GSplatLodTable } from './gsplat-lod-table.js';
import type { GSplatPlacement } from './gsplat-placement.js';
