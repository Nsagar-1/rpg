import { _matTex2D } from "../shader-lib/programs/standard.js";
const mapTransformsEqual = (a, b) => {
	const a0 = a[0].value;
	const a1 = a[1].value;
	const b0 = b[0].value;
	const b1 = b[1].value;
	return a0[0] === b0[0] && a0[1] === b0[1] && a0[2] === b0[2] && a1[0] === b1[0] && a1[1] === b1[1] && a1[2] === b1[2];
};
class StandardMaterialMapTransforms {
	_dirty = true;
	_mutable = false;
	_ids = /* @__PURE__ */ new Map();
	_states = /* @__PURE__ */ new Map();
	reset() {
		this._ids.clear();
		this._states.clear();
		this._dirty = true;
		this._mutable = false;
	}
	markDirty() {
		this._dirty = true;
	}
	markMutable() {
		this._dirty = true;
		this._mutable = true;
	}
	update(material) {
		if (!this._dirty && !this._mutable) {
			return false;
		}
		this._dirty = false;
		let transformsChanged = false;
		for (const p in _matTex2D) {
			const active = material[`_${p}Map`] ? 1 : 0;
			const uv = material[`_${p}MapUv`];
			const tiling = material[`_${p}MapTiling`];
			const offset = material[`_${p}MapOffset`];
			const rotation = material[`_${p}MapRotation`];
			let state = this._states.get(p);
			if (!state) {
				state = new Float64Array(7);
				state[0] = -1;
				this._states.set(p, state);
			}
			if (state[0] !== active || active && (state[1] !== uv || state[2] !== tiling.x || state[3] !== tiling.y || state[4] !== offset.x || state[5] !== offset.y || state[6] !== rotation)) {
				state[0] = active;
				state[1] = uv;
				state[2] = tiling.x;
				state[3] = tiling.y;
				state[4] = offset.x;
				state[5] = offset.y;
				state[6] = rotation;
				transformsChanged = true;
			}
		}
		if (!transformsChanged) {
			return false;
		}
		return this._updateIds(material);
	}
	_updateIds(material) {
		const groupsByUv = [];
		const previousIds = this._ids;
		const ids = /* @__PURE__ */ new Map();
		let groupTopologyChanged = false;
		let mapId = 1;
		for (const p in _matTex2D) {
			let id = 0;
			if (material[`_${p}Map`]) {
				const transform = material.getUniform(`${p}MapTransform`);
				if (transform) {
					const uv = material[`_${p}MapUv`];
					const groups = groupsByUv[uv] ?? (groupsByUv[uv] = []);
					let group;
					for (let i = 0; i < groups.length; i++) {
						if (mapTransformsEqual(groups[i].transform, transform)) {
							group = groups[i];
							break;
						}
					}
					if (group) {
						id = group.id;
					} else {
						id = mapId;
						groups.push({ id, transform });
					}
				}
			}
			ids.set(p, id);
			groupTopologyChanged || (groupTopologyChanged = (previousIds.get(p) ?? 0) !== id);
			mapId++;
		}
		this._ids = ids;
		return groupTopologyChanged;
	}
	getId(name) {
		return this._ids.get(name) ?? 0;
	}
}
export {
	StandardMaterialMapTransforms
};
