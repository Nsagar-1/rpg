/**
 * Everything the budget allocator can know about an octree before it sees a camera, precomputed
 * once per LOD range.
 *
 * Each node is reduced to a chain of single-level *upgrades*, ordered cheapest level first. The
 * chain is the Pareto frontier over (splat count, error): a level is kept only when it strictly
 * improves on the cheapest error seen so far, which discards levels that cost more and look worse
 * than something else the node already offers - a small fraction in practice, and redundant by
 * definition. Requiring a *strict* improvement also collapses levels identical in both, so
 * consecutive entries always differ in both and every upgrade's cost stays above zero.
 *
 * Every level that survives is a level the node can render, and the allocator moves one level at a
 * time. Nothing else is dropped: levels that are poor value for their splats are still real
 * improvements, and the chain doubles as the set of states streaming and underfill may pass
 * through, so removing them would deny a loaded level to underfill and turn prefetch's one-level
 * climb into a multi-level jump.
 *
 * Per update the allocator needs one number per node - its projected screen coverage - and the
 * value of an upgrade is `coverage * error removed / splats added`. The second factor is fixed and
 * coverage is a single non-negative scalar multiplying every upgrade of that node equally, so
 * {@link GSplatLodTable#upgradeRatio} holds the fixed part and selection costs one multiply per
 * upgrade.
 *
 * In {@link GSPLAT_LODMODE_DISTANCE} the node's error metadata is deliberately ignored and a
 * synthetic table is used instead, shaped so that error-per-splat is a per-level constant across
 * all nodes. Content then cancels out of the ranking entirely and selection degenerates to
 * distance bands: every node steps coarser at fixed distance ratios, which is the guarantee that
 * mode exists to provide.
 *
 * @ignore
 */
export class GSplatLodTable {
    /**
     * @param {GSplatOctree} octree - The octree to build the table for.
     * @param {number} rangeMin - Finest allowed LOD index.
     * @param {number} rangeMax - Coarsest allowed LOD index.
     * @param {string} [lodMode] - GSPLAT_LODMODE_ERROR (default) or GSPLAT_LODMODE_DISTANCE.
     */
    constructor(octree: GSplatOctree, rangeMin: number, rangeMax: number, lodMode?: string);
    /**
     * Finest allowed LOD index.
     *
     * @type {number}
     */
    rangeMin: number;
    /**
     * Coarsest allowed LOD index.
     *
     * @type {number}
     */
    rangeMax: number;
    /**
     * The LOD selection mode this table was built for - GSPLAT_LODMODE_ERROR or
     * GSPLAT_LODMODE_DISTANCE. Part of the octree's cache identity alongside the range.
     *
     * @type {string}
     */
    lodMode: string;
    /**
     * How many octree instances currently hold this table. Managed by the owning
     * {@link GSplatOctree}, which drops the table when this reaches zero - so a table is retained
     * exactly while some instance is using its range, rather than on a fixed cap that could evict
     * one still in use.
     *
     * @type {number}
     */
    refCount: number;
    /**
     * Per node, the cheapest renderable level in range - where the allocator starts before it
     * spends anything. -1 when the node has no renderable level in range at all.
     *
     * @type {Int16Array}
     */
    startLod: Int16Array;
    /**
     * Per node, the splat count at {@link GSplatLodTable#startLod}.
     *
     * @type {Int32Array}
     */
    startCount: Int32Array;
    /**
     * Per node, where its upgrade slice begins. Node `n` owns
     * `[firstUpgrade[n], firstUpgrade[n + 1])`, so the array holds one extra entry and the slice
     * length needs no second array.
     *
     * @type {Int32Array}
     */
    firstUpgrade: Int32Array;
    /**
     * Per upgrade, the LOD index it moves the node to.
     *
     * @type {Int16Array}
     */
    upgradeToLod: Int16Array;
    /**
     * Per upgrade, the additional splats it costs. Always above zero.
     *
     * @type {Int32Array}
     */
    upgradeCost: Int32Array;
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
    upgradeRatio: Float32Array;
    /**
     * Sum of {@link GSplatLodTable#startCount} over all nodes - the splat cost of the whole octree
     * before any upgrade is bought.
     *
     * @type {number}
     */
    totalStartCount: number;
    /**
     * Sum of the finest renderable level in range over all nodes - the splat cost with every
     * upgrade bought.
     *
     * @type {number}
     */
    totalFinestCount: number;
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
    findCoarserAccepted(nodeIndex: number, lod: number, limit: number, accept: (lod: number) => boolean): number;
    /**
     * Returns the next coarser level on a node's chain, or -1 when `lod` is already its cheapest.
     *
     * @param {number} nodeIndex - The node.
     * @param {number} lod - A LOD index on the node's chain.
     * @returns {number} The next coarser chain entry, or -1.
     */
    coarserOnChain(nodeIndex: number, lod: number): number;
    /**
     * Returns the next finer level on a node's chain, or -1 when `lod` is already its finest.
     *
     * @param {number} nodeIndex - The node.
     * @param {number} lod - A LOD index on the node's chain.
     * @returns {number} The next finer chain entry, or -1.
     */
    finerOnChain(nodeIndex: number, lod: number): number;
}
import type { GSplatOctree } from './gsplat-octree.js';
