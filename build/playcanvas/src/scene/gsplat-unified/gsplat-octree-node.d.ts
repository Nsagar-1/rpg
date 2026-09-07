export type GSplatOctreeNodeLod = {
    /**
     * - The file path
     */
    file: string;
    /**
     * - The file index in the octree files array
     */
    fileIndex: number;
    /**
     * - The offset in the file
     */
    offset: number;
    /**
     * - The count of items
     */
    count: number;
    /**
     * - Approximation error relative to the finest LOD present in this node.
     * Zero at that finest level and non-decreasing as levels get coarser. Read from the manifest when
     * it supplies one, otherwise derived from splat counts - see `GSplatOctree#lodErrorSource`.
     */
    error: number;
};
export class GSplatOctreeNode {
    /**
     * @param {GSplatOctreeNodeLod[]} lods - The LOD data for this node
     * @param {Object} [boundData] - The bounding box data with min and max arrays
     */
    constructor(lods: GSplatOctreeNodeLod[], boundData?: any);
    /**
     * @type {GSplatOctreeNodeLod[]}
     */
    lods: GSplatOctreeNodeLod[];
    /**
     * The axis-aligned bounding box of this octree node in local space.
     */
    bounds: BoundingBox;
    /**
     * Precomputed bounding sphere derived from the AABB. Stored as (center.x, center.y,
     * center.z, radius) for efficient GPU frustum culling.
     */
    boundingSphere: Vec4;
}
import { BoundingBox } from '../../core/shape/bounding-box.js';
import { Vec4 } from '../../core/math/vec4.js';
