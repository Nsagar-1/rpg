import { now } from "../../../core/time.js";
import { ObjectPool } from "../../../core/object-pool.js";
import { Vec3 } from "../../../core/math/vec3.js";
import { AmmoPhysicsWorld } from "../../physics/ammo/ammo-physics-world.js";
import { ComponentSystem } from "../system.js";
import {
	BODYGROUP_TRIGGER,
	BODYMASK_NOT_STATIC,
	BODYTYPE_DYNAMIC,
	BODYTYPE_KINEMATIC,
	BODYTYPE_STATIC
} from "./constants.js";
import { RigidBodyComponent } from "./component.js";
import { ContactPoint } from "./contact-point.js";
import { ContactResult } from "./contact-result.js";
import { SingleContactResult } from "./single-contact-result.js";
const _properties = [
	"mass",
	"linearDamping",
	"angularDamping",
	"linearFactor",
	"angularFactor",
	"friction",
	"rollingFriction",
	"restitution",
	"type",
	"group",
	"mask"
];
class RigidBodyComponentSystem extends ComponentSystem {
	static EVENT_CONTACT = "contact";
	maxSubSteps = 10;
	fixedTimeStep = 1 / 60;
	timeScale = 1;
	gravity = new Vec3(0, -9.81, 0);
	_world = null;
	_dynamic = [];
	_kinematic = [];
	_triggers = [];
	_compounds = [];
	constructor(app) {
		super(app);
		this.id = "rigidbody";
		this._stats = app.stats.frame;
		this.ComponentType = RigidBodyComponent;
		this.contactPointPool = null;
		this.contactResultPool = null;
		this.singleContactResultPool = null;
		this.collisions = {};
		this.frameCollisions = {};
		this.on("beforeremove", this.onBeforeRemove, this);
	}
	onLibraryLoaded() {
		if (!this._world && typeof Ammo !== "undefined") {
			this.setPhysicsWorld(new AmmoPhysicsWorld());
		}
	}
	setPhysicsWorld(world) {
		this._world = world;
		world.contactListener = this;
		this.contactPointPool = new ObjectPool(ContactPoint, 1);
		this.contactResultPool = new ObjectPool(ContactResult, 1);
		this.singleContactResultPool = new ObjectPool(SingleContactResult, 1);
		this.app.systems.on("update", this.onUpdate, this);
	}
	get physicsWorld() {
		return this._world;
	}
	get dynamicsWorld() {
		return this._world?.nativeWorld ?? null;
	}
	get collisionConfiguration() {
		return this._world?.collisionConfiguration ?? null;
	}
	get dispatcher() {
		return this._world?.dispatcher ?? null;
	}
	get overlappingPairCache() {
		return this._world?.overlappingPairCache ?? null;
	}
	get solver() {
		return this._world?.solver ?? null;
	}
	initializeComponentData(component, data) {
		for (const property of _properties) {
			if (data.hasOwnProperty(property)) {
				const value = data[property];
				if (Array.isArray(value)) {
					component[property] = new Vec3(value[0], value[1], value[2]);
				} else {
					component[property] = value;
				}
			}
		}
		super.initializeComponentData(component, data);
	}
	cloneComponent(entity, clone) {
		const c = entity.rigidbody;
		const data = {
			enabled: c.enabled
		};
		for (const property of _properties) {
			data[property] = c[property];
		}
		return this.addComponent(clone, data);
	}
	onBeforeRemove(entity, component) {
		if (component.enabled) {
			component.enabled = false;
		}
		if (component._body) {
			this._world.destroyBody(component._body);
			component.body = null;
		}
	}
	addBody(body, group, mask) {
		this._world.addBody(body, group, mask);
	}
	removeBody(body) {
		this._world.removeBody(body);
	}
	enableSimulation(component) {
		const entity = component.entity;
		if (entity.collision && entity.collision.enabled && !component._simulationEnabled) {
			const body = component._body;
			if (body) {
				this.addBody(body, component._group, component._mask);
				switch (component._type) {
					case BODYTYPE_DYNAMIC:
						this._dynamic.push(component);
						component.syncEntityToBody();
						break;
					case BODYTYPE_KINEMATIC:
						this._kinematic.push(component);
						break;
					case BODYTYPE_STATIC:
						component.syncEntityToBody();
						break;
				}
				if (entity.collision.type === "compound") {
					this._compounds.push(entity.collision);
				}
				body.activate();
				component._simulationEnabled = true;
				component.fire("simulationenabled");
			}
		}
	}
	disableSimulation(component) {
		const body = component._body;
		if (body && component._simulationEnabled) {
			let idx = this._compounds.indexOf(component.entity.collision);
			if (idx > -1) {
				this._compounds.splice(idx, 1);
			}
			idx = this._dynamic.indexOf(component);
			if (idx > -1) {
				this._dynamic.splice(idx, 1);
			}
			idx = this._kinematic.indexOf(component);
			if (idx > -1) {
				this._kinematic.splice(idx, 1);
			}
			this.removeBody(body);
			component._simulationEnabled = false;
			component.fire("simulationdisabled");
		}
	}
	addTrigger(trigger) {
		if (this._triggers.indexOf(trigger) < 0) {
			this.addBody(trigger.body, BODYGROUP_TRIGGER, BODYMASK_NOT_STATIC ^ BODYGROUP_TRIGGER);
			this._triggers.push(trigger);
		}
	}
	removeTrigger(trigger) {
		const idx = this._triggers.indexOf(trigger);
		if (idx > -1) {
			this.removeBody(trigger.body);
			this._triggers.splice(idx, 1);
		}
	}
	raycastFirst(start, end, options = {}) {
		if (options.filterTags || options.filterCallback) {
			options.sort = true;
			return this.raycastAll(start, end, options)[0] || null;
		}
		return this._world.raycastFirst(start, end, options);
	}
	raycastAll(start, end, options = {}) {
		const results = this._world.raycastAll(start, end, options);
		if (options.sort) {
			results.sort((a, b) => a.hitFraction - b.hitFraction);
		}
		return results;
	}
	_storeCollision(entity, other) {
		let isNewCollision = false;
		const guid = entity.guid;
		this.collisions[guid] = this.collisions[guid] || { others: [], entity };
		if (this.collisions[guid].others.indexOf(other) < 0) {
			this.collisions[guid].others.push(other);
			isNewCollision = true;
		}
		this.frameCollisions[guid] = this.frameCollisions[guid] || { others: [], entity };
		this.frameCollisions[guid].others.push(other);
		return isNewCollision;
	}
	_createReverseContactPoint(forward) {
		const contact = this.contactPointPool.allocate();
		contact.localPoint.copy(forward.localPointOther);
		contact.localPointOther.copy(forward.localPoint);
		contact.point.copy(forward.pointOther);
		contact.pointOther.copy(forward.point);
		contact.normal.copy(forward.normal);
		contact.impulse = forward.impulse;
		return contact;
	}
	_createSingleContactResult(a, b, contactPoint) {
		const result = this.singleContactResultPool.allocate();
		result.a = a;
		result.b = b;
		result.localPointA = contactPoint.localPoint;
		result.localPointB = contactPoint.localPointOther;
		result.pointA = contactPoint.point;
		result.pointB = contactPoint.pointOther;
		result.normal = contactPoint.normal;
		result.impulse = contactPoint.impulse;
		return result;
	}
	_createContactResult(other, contacts) {
		const result = this.contactResultPool.allocate();
		result.other = other;
		result.contacts = contacts;
		return result;
	}
	_cleanOldCollisions() {
		for (const guid in this.collisions) {
			if (this.collisions.hasOwnProperty(guid)) {
				const frameCollision = this.frameCollisions[guid];
				const collision = this.collisions[guid];
				const entity = collision.entity;
				const entityCollision = entity.collision;
				const entityRigidbody = entity.rigidbody;
				const others = collision.others;
				const length = others.length;
				let i = length;
				while (i--) {
					const other = others[i];
					if (!frameCollision || frameCollision.others.indexOf(other) < 0) {
						others.splice(i, 1);
						if (entity.trigger) {
							if (entityCollision) {
								entityCollision.fire("triggerleave", other);
							}
							if (other.rigidbody) {
								other.rigidbody.fire("triggerleave", entity);
							}
						} else if (!other.trigger) {
							if (entityRigidbody) {
								entityRigidbody.fire("collisionend", other);
							}
							if (entityCollision) {
								entityCollision.fire("collisionend", other);
							}
						}
					}
				}
				if (others.length === 0) {
					delete this.collisions[guid];
				}
			}
		}
	}
	clearEntityCollisions(entity) {
		delete this.collisions[entity.guid];
	}
	_hasContactEvent(entity) {
		const c = entity.collision;
		if (c && (c.hasEvent("collisionstart") || c.hasEvent("collisionend") || c.hasEvent("contact"))) {
			return true;
		}
		const r = entity.rigidbody;
		return r && (r.hasEvent("collisionstart") || r.hasEvent("collisionend") || r.hasEvent("contact"));
	}
	onContactsBegin() {
		this.frameCollisions = {};
	}
	onContactPair(pair) {
		const e0 = pair.entityA;
		const e1 = pair.entityB;
		const forwardContacts = [];
		const reverseContacts = [];
		let newCollision;
		if (pair.triggerA || pair.triggerB) {
			const e0Events = e0.collision && (e0.collision.hasEvent("triggerenter") || e0.collision.hasEvent("triggerleave"));
			const e1Events = e1.collision && (e1.collision.hasEvent("triggerenter") || e1.collision.hasEvent("triggerleave"));
			const e0BodyEvents = e0.rigidbody && (e0.rigidbody.hasEvent("triggerenter") || e0.rigidbody.hasEvent("triggerleave"));
			const e1BodyEvents = e1.rigidbody && (e1.rigidbody.hasEvent("triggerenter") || e1.rigidbody.hasEvent("triggerleave"));
			if (e0Events) {
				newCollision = this._storeCollision(e0, e1);
				if (newCollision && !pair.triggerB) {
					e0.collision.fire("triggerenter", e1);
				}
			}
			if (e1Events) {
				newCollision = this._storeCollision(e1, e0);
				if (newCollision && !pair.triggerA) {
					e1.collision.fire("triggerenter", e0);
				}
			}
			if (e0BodyEvents) {
				if (!newCollision) {
					newCollision = this._storeCollision(e1, e0);
				}
				if (newCollision) {
					e0.rigidbody.fire("triggerenter", e1);
				}
			}
			if (e1BodyEvents) {
				if (!newCollision) {
					newCollision = this._storeCollision(e0, e1);
				}
				if (newCollision) {
					e1.rigidbody.fire("triggerenter", e0);
				}
			}
		} else {
			const e0Events = this._hasContactEvent(e0);
			const e1Events = this._hasContactEvent(e1);
			const globalEvents = this.hasEvent("contact");
			if (globalEvents || e0Events || e1Events) {
				const contactCount = pair.contactCount;
				for (let j = 0; j < contactCount; j++) {
					const contactPoint = this.contactPointPool.allocate();
					pair.readContact(j, contactPoint);
					if (e0Events || e1Events) {
						forwardContacts.push(contactPoint);
						reverseContacts.push(this._createReverseContactPoint(contactPoint));
					}
					if (globalEvents) {
						const result = this._createSingleContactResult(e0, e1, contactPoint);
						this.fire("contact", result);
					}
				}
				if (e0Events) {
					const forwardResult = this._createContactResult(e1, forwardContacts);
					newCollision = this._storeCollision(e0, e1);
					if (e0.collision) {
						e0.collision.fire("contact", forwardResult);
						if (newCollision) {
							e0.collision.fire("collisionstart", forwardResult);
						}
					}
					if (e0.rigidbody) {
						e0.rigidbody.fire("contact", forwardResult);
						if (newCollision) {
							e0.rigidbody.fire("collisionstart", forwardResult);
						}
					}
				}
				if (e1Events) {
					const reverseResult = this._createContactResult(e0, reverseContacts);
					newCollision = this._storeCollision(e1, e0);
					if (e1.collision) {
						e1.collision.fire("contact", reverseResult);
						if (newCollision) {
							e1.collision.fire("collisionstart", reverseResult);
						}
					}
					if (e1.rigidbody) {
						e1.rigidbody.fire("contact", reverseResult);
						if (newCollision) {
							e1.rigidbody.fire("collisionstart", reverseResult);
						}
					}
				}
			}
		}
	}
	onContactsEnd() {
		this._cleanOldCollisions();
		this.contactPointPool.freeAll();
		this.contactResultPool.freeAll();
		this.singleContactResultPool.freeAll();
	}
	step(dt) {
		const world = this._world;
		if (!world) return;
		let i, len;
		this._stats.physicsStart = now();
		world.setGravity(this.gravity);
		const triggers = this._triggers;
		for (i = 0, len = triggers.length; i < len; i++) {
			triggers[i].updateTransform();
		}
		const compounds = this._compounds;
		for (i = 0, len = compounds.length; i < len; i++) {
			compounds[i]._updateCompound();
		}
		const kinematic = this._kinematic;
		for (i = 0, len = kinematic.length; i < len; i++) {
			kinematic[i]._updateKinematic();
		}
		world.step(dt, this.maxSubSteps, this.fixedTimeStep);
		const dynamic = this._dynamic;
		for (i = 0, len = dynamic.length; i < len; i++) {
			dynamic[i]._updateDynamic();
		}
		world.flushContacts();
		this._stats.physicsTime = now() - this._stats.physicsStart;
	}
	onUpdate(dt) {
		const timeScale = this.timeScale;
		if (!(timeScale > 0)) {
			this._stats.physicsTime = 0;
			return;
		}
		this.step(dt * timeScale);
	}
	destroy() {
		super.destroy();
		this.app.systems.off("update", this.onUpdate, this);
		if (this._world) {
			this._world.destroy();
			this._world = null;
		}
	}
	setGravity(x, y, z) {
		if (y === void 0) {
			this.gravity.copy(x);
		} else {
			this.gravity.set(x, y, z);
		}
	}
}
export {
	RigidBodyComponentSystem
};
