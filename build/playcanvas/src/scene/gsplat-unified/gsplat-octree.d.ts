/**
 * @import { GSplatResource } from '../gsplat/gsplat-resource.js'
 * @import { GSplatOctreeNodeLod } from './gsplat-octree-node.js'
 * @import { GSplatAssetLoaderBase } from './gsplat-asset-loader-base.js'
 */
export class GSplatOctree {
    /**
     * @param {string} assetFileUrl - The file URL of the container asset.
     * @param {Object} data - The parsed JSON data containing info, filenames and tree.
     */
    constructor(assetFileUrl: string, data: any);
    /**
     * @type {GSplatOctreeNode[]}
     */
    nodes: GSplatOctreeNode[];
    /**
     * Packed per-node axis-aligned bounds in octree local space for CPU hot paths (e.g. LOD).
     * Length is {@link GSplatOctree.nodes}.length * 6. For node index `i`, base `b = i * 6`:
     * `[minX, minY, minZ, maxX, maxY, maxZ]` matching {@link GSplatOctreeNode.bounds}.
     *
     * @type {Float32Array}
     */
    nodeBoundsMinMax: Float32Array;
    /**
     * @type {{ url: string, lodLevel: number }[]}
     */
    files: {
        url: string;
        lodLevel: number;
    }[];
    /**
     * @type {number}
     */
    lodLevels: number;
    /**
     * Where the per-level approximation errors in {@link GSplatOctreeNode#lods} came from.
     * `'file'` when the manifest declared `lodErrors` and every renderable level supplied a usable
     * value, `'derived'` when they were computed from splat counts instead. Errors always exist
     * either way - this is for diagnostics only, there is no separate code path.
     *
     * @type {'file'|'derived'}
     */
    lodErrorSource: "file" | "derived";
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
    private _lodTables;
    /**
     * The file URL of the container asset, used as the base for resolving relative URLs.
     *
     * @type {string}
     */
    assetFileUrl: string;
    /**
     * Resources of individual files, identified by their file index.
     *
     * @type {Map<number, GSplatResource>}
     */
    fileResources: Map<number, GSplatResource>;
    /**
     * Reference counts for each file by file index. Index is fileIndex, value is reference count.
     * When a file reaches zero references, it is scheduled for cooldown and unload.
     *
     * @type {Int32Array}
     */
    fileRefCounts: Int32Array;
    /**
     * Cooldown timers for files that reached zero references. Key is fileIndex, value is ticks
     * remaining.
     *
     * @type {Map<number, number>}
     */
    cooldowns: Map<number, number>;
    /**
     * Optional environment asset URL.
     *
     * @type {string|null}
     */
    environmentUrl: string | null;
    /**
     * Loaded environment resource.
     *
     * @type {GSplatResource|null}
     */
    environmentResource: GSplatResource | null;
    /**
     * Reference count for environment usage.
     */
    environmentRefCount: number;
    /**
     * Asset loader used for loading/unloading resources.
     *
     * @type {GSplatAssetLoaderBase|null}
     */
    assetLoader: GSplatAssetLoaderBase | null;
    /**
     * Whether this octree has been destroyed.
     */
    destroyed: boolean;
    /**
     * Number of update ticks before unloading unused file resources. Set from GSplatParams.
     *
     * @private
     */
    private cooldownTicks;
    /**
     * Destroys the octree and clears internal state. Does not force-unload resources as they may
     * still be referenced by managers. Resources will be cleaned up when their reference counts
     * reach zero through the normal cleanup mechanisms.
     */
    destroy(): void;
    /**
     * Trace out per-LOD counts of currently loaded file resources.
     *
     * @private
     */
    private _traceLodCounts;
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
    private _deriveLodErrors;
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
    acquireLodTable(rangeMin: number, rangeMax: number, lodMode?: string): GSplatLodTable;
    /**
     * Releases a reference taken by {@link GSplatOctree#acquireLodTable}, dropping the table once
     * no instance holds it.
     *
     * @param {GSplatLodTable|null} table - The table to release. Null is ignored, so callers can
     * release unconditionally.
     */
    releaseLodTable(table: GSplatLodTable | null): void;
    /**
     * Recursively extracts leaf nodes (nodes with 'lods' property) from the hierarchical tree.
     *
     * @param {Object} node - The current tree node to process.
     * @param {Array} leafNodes - Array to collect leaf nodes.
     * @private
     */
    private _extractLeafNodes;
    getFileResource(fileIndex: any): GSplatResource;
    /**
     * Increments reference count for a file by index and cancels any pending cooldown.
     *
     * @param {number} fileIndex - Index of the file in `files` array.
     */
    incRefCount(fileIndex: number): void;
    /**
     * Decrements reference count for a file by index. When it reaches zero, either unload
     * immediately (if cooldownTicks is 0) or schedule for cooldown.
     *
     * @param {number} fileIndex - Index of the file in `files` array.
     * @param {number} cooldownTicks - Number of update ticks before unloading when unused. If 0,
     * unload immediately.
     */
    decRefCount(fileIndex: number, cooldownTicks: number): void;
    /**
     * Unloads a resource for a file index if currently loaded.
     *
     * @param {number} fileIndex - Index of the file in `files` array.
     */
    unloadResource(fileIndex: number): void;
    /**
     * Advances cooldowns for zero-ref files and unloads those whose timers expired.
     *
     * @param {number} cooldownTicks - Number of ticks for new cooldowns, synced from GSplatParams.
     */
    updateCooldownTick(cooldownTicks: number): void;
    /**
     * Ensures a file resource is loaded and available. This function:
     * - Starts loading if not already started
     * - Checks if loading completed and stores the resource if available
     *
     * @param {number} fileIndex - The index of the file in the `files` array.
     */
    ensureFileResource(fileIndex: number): void;
    /**
     * Increments reference count for environment.
     */
    incEnvironmentRefCount(): void;
    /**
     * Decrements reference count for environment. When it reaches zero, immediately unload.
     */
    decEnvironmentRefCount(): void;
    /**
     * Ensures environment resource is loaded and available.
     */
    ensureEnvironmentResource(): void;
    /**
     * Unloads environment resource if currently loaded.
     */
    unloadEnvironmentResource(): void;
}
import { GSplatOctreeNode } from './gsplat-octree-node.js';
import type { GSplatResource } from '../gsplat/gsplat-resource.js';
import type { GSplatAssetLoaderBase } from './gsplat-asset-loader-base.js';
import { GSplatLodTable } from './gsplat-lod-table.js';
