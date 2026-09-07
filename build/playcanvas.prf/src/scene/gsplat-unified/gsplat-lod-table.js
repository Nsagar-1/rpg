import { GSPLAT_LODMODE_DISTANCE, GSPLAT_LODMODE_ERROR } from "../constants.js";
const DISTANCE_BAND_MULTIPLIER = 3;
class GSplatLodTable {
	rangeMin;
	rangeMax;
	lodMode;
	refCount = 0;
	startLod;
	startCount;
	firstUpgrade;
	upgradeToLod;
	upgradeCost;
	upgradeRatio;
	totalStartCount = 0;
	totalFinestCount = 0;
	constructor(octree, rangeMin, rangeMax, lodMode = GSPLAT_LODMODE_ERROR) {
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
