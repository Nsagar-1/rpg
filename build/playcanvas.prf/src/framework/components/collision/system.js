import { Mat4 } from "../../../core/math/mat4.js";
import { Quat } from "../../../core/math/quat.js";
import { Vec3 } from "../../../core/math/vec3.js";
import { BufferUtils } from "../../../platform/graphics/buffer-utils.js";
import { SEMANTIC_POSITION } from "../../../platform/graphics/constants.js";
import { ComponentSystem } from "../system.js";
import { CollisionComponent } from "./component.js";
import { Trigger } from "./trigger.js";
const mat4 = new Mat4();
const p1 = new Vec3();
const p2 = new Vec3();
const p3 = new Vec3();
const quat = new Quat();
const quat2 = new Quat();
const _properties = [
	"halfExtents",
	"radius",
	"axis",
	"height",
	"convexHull",
	"model",
	"asset",
	"render",
	"renderAsset",
	"linearOffset",
	"angularOffset",
	"checkVertexDuplicates"
];
const collisionImpls = {
	box: {
		createPhysicalShape: (system, entity, component) => system.physicsWorld?.createShape({
			type: "box",
			halfExtents: component.halfExtents
		})
	},
	sphere: {
		createPhysicalShape: (system, entity, component) => system.physicsWorld?.createShape({
			type: "sphere",
			radius: component.radius
		})
	},
	capsule: {
		createPhysicalShape: (system, entity, component) => system.physicsWorld?.createShape({
			type: "capsule",
			axis: component.axis,
			radius: component.radius,
			height: component.height
		})
	},
	cylinder: {
		createPhysicalShape: (system, entity, component) => system.physicsWorld?.createShape({
			type: "cylinder",
			axis: component.axis,
			radius: component.radius,
			height: component.height
		})
	},
	cone: {
		createPhysicalShape: (system, entity, component) => system.physicsWorld?.createShape({
			type: "cone",
			axis: component.axis,
			radius: component.radius,
			height: component.height
		})
	},
	mesh: {
		createPhysicalShape: createMeshShape,
		recreatePhysicalShapes: recreateMeshShapes,
		updateTransform: updateMeshTransform
	},
	compound: {
		createPhysicalShape: (system, entity, component) => system.physicsWorld?.createShape({
			type: "compound"
		})
	}
};
function getImpl(type) {
	const impl = collisionImpls[type];
	return impl;
}
function beforeInitialize(system, component) {
	component._shape = null;
}
function afterInitialize(system, component) {
	system.recreatePhysicalShapes(component);
	component._initialized = true;
}
function recreateBody(entity) {
	entity.rigidbody.disableSimulation();
	entity.rigidbody.createBody();
	if (entity.enabled && entity.rigidbody.enabled) {
		entity.rigidbody.enableSimulation();
	}
}
function recreateTrigger(system, entity, component) {
	if (!entity.trigger) {
		entity.trigger = new Trigger(system.app, component);
	} else {
		entity.trigger.initialize();
	}
}
function destroyShape(system, component) {
	if (component._shape) {
		system.physicsWorld.destroyShape(component._shape);
		component._shape = null;
	}
}
function beforeRemove(system, entity, component) {
	if (component._shape) {
		if (component._compoundParent && !component._compoundParent.entity._destroying) {
			system._removeCompoundChild(component._compoundParent, component._shape);
			if (component._compoundParent.entity.rigidbody) {
				component._compoundParent.entity.rigidbody.activate();
			}
		}
		component._compoundParent = null;
		destroyShape(system, component);
	}
}
function recreateShapes(system, component) {
	const entity = component.entity;
	const world = system.physicsWorld;
	if (world) {
		if (entity.trigger) {
			entity.trigger.destroy();
			delete entity.trigger;
		}
		if (component._shape) {
			if (component._compoundParent) {
				if (component !== component._compoundParent) {
					system._removeCompoundChild(component._compoundParent, component._shape);
				}
				if (component._compoundParent.entity.rigidbody) {
					component._compoundParent.entity.rigidbody.activate();
				}
			}
			destroyShape(system, component);
		}
		component._shape = getImpl(component._type).createPhysicalShape(system, entity, component);
		const firstCompoundChild = !component._compoundParent;
		if (component._type === "compound" && (!component._compoundParent || component === component._compoundParent)) {
			component._compoundParent = component;
			entity.forEach(system._addEachDescendant, component);
		} else if (component._type !== "compound") {
			if (!entity.rigidbody) {
				component._compoundParent = null;
				let parent = entity.parent;
				while (parent) {
					if (parent.collision && parent.collision.type === "compound") {
						component._compoundParent = parent.collision;
						break;
					}
					parent = parent.parent;
				}
			}
		}
		if (component._compoundParent) {
			if (component !== component._compoundParent) {
				if (firstCompoundChild && world.getCompoundChildCount(component._compoundParent.shape) === 0) {
					system.recreatePhysicalShapes(component._compoundParent);
				} else {
					system.updateCompoundChildTransform(entity, true);
					if (component._compoundParent.entity.rigidbody) {
						component._compoundParent.entity.rigidbody.activate();
					}
				}
			}
		}
		if (entity.rigidbody) {
			recreateBody(entity);
		} else if (!component._compoundParent) {
			recreateTrigger(system, entity, component);
		}
	}
}
function updateShapeTransform(system, component, position, rotation, scale) {
	if (component.entity.trigger) {
		component.entity.trigger.updateTransform();
	}
}
function createMeshSource(system, mesh, node, bakeScale, convexHull, checkDuplicates) {
	let positions = null;
	let stride = 0;
	let indices = null;
	let extracted = false;
	const extract = () => {
		if (extracted) return;
		extracted = true;
		if (convexHull) {
			positions = [];
			mesh.getPositions(positions);
			stride = 3;
		} else {
			const vb = mesh.vertexBuffer;
			const format = vb.getFormat();
			for (let i = 0; i < format.elements.length; i++) {
				const element = format.elements[i];
				if (element.name === SEMANTIC_POSITION) {
					positions = BufferUtils.createStorageView(vb, Float32Array, element.offset);
					stride = element.stride / 4;
					break;
				}
			}
			indices = [];
			mesh.getIndices(indices);
		}
	};
	const source = {
		id: mesh.id,
		get positions() {
			extract();
			return positions;
		},
		get stride() {
			extract();
			return stride;
		},
		get indices() {
			extract();
			return indices;
		},
		base: mesh.primitive[0].base,
		count: mesh.primitive[0].count,
		convexHull,
		checkDuplicates,
		bakeScale,
		shapeScale: node ? system._getNodeScaling(node) : null,
		position: new Vec3(),
		rotation: new Quat()
	};
	if (node) {
		system._getNodeTransform(node, null, source.position, source.rotation);
	}
	return source;
}
function createMeshShape(system, entity, component) {
	const world = system.physicsWorld;
	if (!world) return void 0;
	if (component._model || component._render) {
		const entityTransform = entity.getWorldTransform();
		const scale = entityTransform.getScale();
		const sources = [];
		let shapeScale = null;
		if (component._render) {
			const meshes = component._render.meshes;
			for (let i = 0; i < meshes.length; i++) {
				sources.push(createMeshSource(system, meshes[i], null, scale, component._convexHull, component._checkVertexDuplicates));
			}
		} else if (component._model) {
			const meshInstances = component._model.meshInstances;
			for (let i = 0; i < meshInstances.length; i++) {
				sources.push(createMeshSource(system, meshInstances[i].mesh, meshInstances[i].node, null, false, component._checkVertexDuplicates));
			}
			shapeScale = scale;
		}
		component._builtWorldScale = scale;
		return world.createShape({
			type: "mesh",
			sources,
			scale: shapeScale
		});
	}
	return void 0;
}
function doRecreateMeshShape(system, component) {
	const entity = component.entity;
	if (component._model || component._render) {
		destroyShape(system, component);
		component._shape = createMeshShape(system, entity, component);
		if (entity.rigidbody) {
			recreateBody(entity);
		} else {
			recreateTrigger(system, entity, component);
		}
	} else {
		beforeRemove(system, entity, component);
		system.onRemove(entity);
	}
}
function loadMeshAsset(system, component, id, property) {
	const assets = system.app.assets;
	const privateProperty = `_${property}`;
	const previousPropertyValue = component[privateProperty];
	const onAssetFullyReady = (asset2) => {
		if (component[privateProperty] !== previousPropertyValue) {
			return;
		}
		component[privateProperty] = asset2.resource;
		doRecreateMeshShape(system, component);
	};
	const loadAndHandleAsset = (asset2) => {
		asset2.ready((asset3) => {
			if (asset3.data.containerAsset) {
				const containerAsset = assets.get(asset3.data.containerAsset);
				if (containerAsset.loaded) {
					onAssetFullyReady(asset3);
				} else {
					containerAsset.ready(() => {
						onAssetFullyReady(asset3);
					});
					assets.load(containerAsset);
				}
			} else {
				onAssetFullyReady(asset3);
			}
		});
		assets.load(asset2);
	};
	const asset = assets.get(id);
	if (asset) {
		loadAndHandleAsset(asset);
	} else {
		assets.once(`add:${id}`, loadAndHandleAsset);
	}
}
function recreateMeshShapes(system, component) {
	if (component._renderAsset || component._asset) {
		if (component.enabled && component.entity.enabled) {
			loadMeshAsset(
				system,
				component,
				component._renderAsset || component._asset,
				component._renderAsset ? "render" : "model"
			);
			return;
		}
	}
	doRecreateMeshShape(system, component);
}
function updateMeshTransform(system, component, position, rotation, scale) {
	if (component.shape && component._builtWorldScale) {
		const entityTransform = component.entity.getWorldTransform();
		const worldScale = entityTransform.getScale();
		if (!worldScale.equals(component._builtWorldScale)) {
			doRecreateMeshShape(system, component);
		}
	}
	updateShapeTransform(system, component, position, rotation, scale);
}
class CollisionComponentSystem extends ComponentSystem {
	constructor(app) {
		super(app);
		this.id = "collision";
		this.ComponentType = CollisionComponent;
		this.on("beforeremove", this.onBeforeRemove, this);
		this.on("remove", this.onRemove, this);
	}
	get physicsWorld() {
		return this.app.systems.rigidbody?.physicsWorld ?? null;
	}
	initializeComponentData(component, data) {
		if (data.type) {
			component._type = data.type;
		}
		let properties = _properties;
		if (data.asset !== void 0) {
			properties = properties.filter((p) => p !== "model" && p !== "render");
		} else if (data.model !== void 0) {
			properties = properties.filter((p) => p !== "asset");
		}
		for (const property of properties) {
			if (data[property] !== void 0) {
				component[property] = data[property];
			}
		}
		const impl = getImpl(component._type);
		(impl.beforeInitialize ?? beforeInitialize)(this, component);
		super.initializeComponentData(component, data);
		afterInitialize(this, component);
	}
	cloneComponent(entity, clone) {
		const c = entity.collision;
		const data = {
			enabled: c.enabled,
			type: c.type
		};
		for (const property of _properties) {
			data[property] = c[property];
		}
		return this.addComponent(clone, data);
	}
	onBeforeRemove(entity, component) {
		beforeRemove(this, entity, component);
		component.onBeforeRemove();
		if (this.app.systems.rigidbody) {
			this.app.systems.rigidbody.clearEntityCollisions(entity);
		}
	}
	onRemove(entity) {
		if (entity.rigidbody && entity.rigidbody._body) {
			entity.rigidbody.disableSimulation();
		}
		if (entity.trigger) {
			entity.trigger.destroy();
			delete entity.trigger;
		}
	}
	updateCompoundChildTransform(entity, forceUpdate) {
		const parentComponent = entity.collision._compoundParent;
		if (parentComponent === entity.collision) return;
		if (entity.enabled && entity.collision.enabled && (entity._dirtyLocal || forceUpdate)) {
			this._getNodeTransform(entity, parentComponent.entity, p3, quat2);
			this.physicsWorld.updateCompoundChild(parentComponent.shape, entity.collision.shape, p3, quat2);
		}
	}
	_removeCompoundChild(collision, shape) {
		this.physicsWorld.removeCompoundChild(collision.shape, shape);
	}
	onTransformChanged(component, position, rotation, scale) {
		const impl = getImpl(component.type);
		(impl.updateTransform ?? updateShapeTransform)(this, component, position, rotation, scale);
	}
	// Destroys the previous collision type and creates a new one based on the new type provided
	changeType(component, previousType, newType) {
		beforeRemove(this, component.entity, component);
		this.onRemove(component.entity);
		const impl = getImpl(newType);
		(impl.beforeInitialize ?? beforeInitialize)(this, component);
		afterInitialize(this, component);
	}
	// Recreates rigid bodies or triggers for the specified component
	recreatePhysicalShapes(component) {
		const impl = getImpl(component.type);
		(impl.recreatePhysicalShapes ?? recreateShapes)(this, component);
	}
	doRecreatePhysicalShape(component) {
		doRecreateMeshShape(this, component);
	}
	_addEachDescendant(entity) {
		if (!entity.collision || entity.rigidbody) {
			return;
		}
		entity.collision._compoundParent = this;
		if (entity !== this.entity) {
			entity.collision.system.recreatePhysicalShapes(entity.collision);
		}
	}
	_calculateNodeRelativeTransform(node, relative) {
		if (node === relative) {
			const scale = node.getWorldTransform().getScale();
			mat4.setScale(scale.x, scale.y, scale.z);
		} else {
			this._calculateNodeRelativeTransform(node.parent, relative);
			mat4.mul(node.getLocalTransform());
		}
	}
	_getNodeScaling(node) {
		return node.getWorldTransform().getScale();
	}
	_getNodeTransform(node, relative, position, rotation) {
		let pos, rot;
		if (relative) {
			this._calculateNodeRelativeTransform(node, relative);
			pos = p1;
			rot = quat;
			mat4.getTranslation(pos);
			rot.setFromMat4(mat4);
		} else {
			pos = node.getPosition();
			rot = node.getRotation();
		}
		const component = node.collision;
		if (component && component._hasOffset) {
			const lo = component.linearOffset;
			const ao = component.angularOffset;
			const newOrigin = p2;
			quat.copy(rot).transformVector(lo, newOrigin);
			newOrigin.add(pos);
			quat.copy(rot).mul(ao);
			position.copy(newOrigin);
			rotation.copy(quat);
		} else {
			position.copy(pos);
			rotation.copy(rot);
		}
	}
}
export {
	CollisionComponentSystem
};
