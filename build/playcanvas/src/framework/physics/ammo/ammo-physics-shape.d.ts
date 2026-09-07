/**
 * @param {AmmoPhysicsWorld} world - The owning world.
 * @param {PhysicsShapeDesc} desc - The shape descriptor.
 * @returns {object} The native shape, tagged with its descriptor type for destroyShape.
 */
export function createShape(world: AmmoPhysicsWorld, desc: PhysicsShapeDesc): object;
/**
 * @param {object} shape - The native shape to destroy.
 */
export function destroyShape(shape: object): void;
/**
 * @param {AmmoPhysicsWorld} world - The owning world.
 * @param {object} compound - The btCompoundShape.
 * @param {object} child - The child shape.
 * @param {Vec3} position - The child position in the compound's local space.
 * @param {Quat} rotation - The child rotation in the compound's local space.
 */
export function addCompoundChild(world: AmmoPhysicsWorld, compound: object, child: object, position: Vec3, rotation: Quat): void;
/**
 * @param {AmmoPhysicsWorld} world - The owning world.
 * @param {object} compound - The btCompoundShape.
 * @param {object} child - The child shape.
 * @param {Vec3} position - The child position in the compound's local space.
 * @param {Quat} rotation - The child rotation in the compound's local space.
 */
export function updateCompoundChild(world: AmmoPhysicsWorld, compound: object, child: object, position: Vec3, rotation: Quat): void;
/**
 * @param {object} compound - The btCompoundShape.
 * @param {object} child - The child shape.
 */
export function removeCompoundChild(compound: object, child: object): void;
import type { AmmoPhysicsWorld } from './ammo-physics-world.js';
import type { PhysicsShapeDesc } from '../physics-world.js';
import type { Vec3 } from '../../../core/math/vec3.js';
import type { Quat } from '../../../core/math/quat.js';
