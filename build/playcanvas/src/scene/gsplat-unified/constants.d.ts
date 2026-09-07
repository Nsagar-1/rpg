/** Minimum alpha treated as visible; matches historical 1/255 shader floor. */
export const ALPHA_VISIBILITY_THRESHOLD: number;
export const CACHE_STRIDE: 8;
/**
 * Default target number of splats across all GSplats in the scene, used by
 * {@link GSplatParams#splatBudget} and substituted when a non-positive budget is configured.
 * @type {number}
 */
export const SPLAT_BUDGET_DEFAULT: number;
/**
 * Number of value buckets for global splat budget balancing. Upgrades are bucketed by
 * coverage-weighted error reduction per splat on a fixed log scale, so this sets how finely the
 * greedy order is resolved. 256 already measured indistinguishable from an exact sort at no more
 * cost than 64; 512 keeps that resolution across the wider value window the balancer uses.
 * @type {number}
 */
export const NUM_VALUE_BUCKETS: number;
