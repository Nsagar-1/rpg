/**
 * The Ammo.js (Bullet) physics backend. The `Ammo` global must be available when the world is
 * constructed - load the library first, then supply the backend to the application:
 *
 * ```javascript
 * WasmModule.setConfig('Ammo', {
 *     glueUrl: 'ammo.wasm.js',
 *     wasmUrl: 'ammo.wasm.wasm',
 *     fallbackUrl: 'ammo.js'
 * });
 * await new Promise((resolve) => {
 *     WasmModule.getInstance('Ammo', () => resolve());
 * });
 *
 * const options = new AppOptions();
 * options.physicsWorld = new AmmoPhysicsWorld();
 * ```
 *
 * When {@link AppOptions#physicsWorld} is omitted, the engine creates this backend
 * automatically once application libraries have loaded, if the Ammo global is present.
 *
 * @category Physics
 * @alpha
 */
export class AmmoPhysicsWorld extends PhysicsWorld {
    /** @private */
    private _gravityFloat32;
    /**
     * Built triangle data cached per geometry source id, shared by all mesh shapes created
     * from the same geometry. Entries live until the world is destroyed.
     *
     * @type {Map<number, object>}
     * @ignore
     */
    _triMeshCache: Map<number, object>;
    /**
     * The shared static body world-pinned joints attach to, lazily created.
     *
     * @type {object|null}
     * @ignore
     */
    _fixedBody: object | null;
    /**
     * The fixed timestep of the last simulation step, used by joint motor conversions.
     *
     * @ignore
     */
    _fixedTimeStep: number;
    /**
     * The native btDefaultCollisionConfiguration.
     *
     * @ignore
     */
    collisionConfiguration: any;
    /**
     * The native btCollisionDispatcher.
     *
     * @ignore
     */
    dispatcher: any;
    /**
     * The native btDbvtBroadphase.
     *
     * @ignore
     */
    overlappingPairCache: any;
    /**
     * The native btSequentialImpulseConstraintSolver.
     *
     * @ignore
     */
    solver: any;
    /**
     * Whether contacts are reported per fixed substep from inside stepSimulation.
     *
     * @private
     */
    private _useTickCallback;
    /**
     * The reused contact pair driven through the contact listener.
     *
     * @private
     */
    private _contactPair;
    /** @private */
    private _btVec1;
    /** @private */
    private _btVec2;
    /** @private */
    private _btQuat;
    /** @private */
    private _btTransform;
    /** @private */
    private _btRayStart;
    /** @private */
    private _btRayEnd;
    /**
     * @param {PhysicsBodyDesc} desc - The body descriptor.
     * @returns {AmmoPhysicsBody} The new body.
     * @ignore
     */
    createBody(desc: PhysicsBodyDesc): AmmoPhysicsBody;
    destroyBody(body: any): void;
    addBody(body: any, group: any, mask: any): void;
    removeBody(body: any): void;
    destroyShape(shape: any): void;
    addCompoundChild(compound: any, child: any, position: any, rotation: any): void;
    updateCompoundChild(compound: any, child: any, position: any, rotation: any): void;
    removeCompoundChild(compound: any, child: any): void;
    getCompoundChildCount(compound: any): any;
    /**
     * @param {PhysicsJointDesc} desc - The joint descriptor.
     * @returns {AmmoPhysicsJoint} The new joint.
     * @ignore
     */
    createJoint(desc: PhysicsJointDesc): AmmoPhysicsJoint;
    destroyJoint(joint: any): void;
    step(dt: any, maxSubSteps: any, fixedTimeStep: any): void;
    /**
     * Walks the dispatcher's contact manifolds and reports each contacting pair with entities
     * on both bodies to the contact listener.
     *
     * @private
     */
    private _walkContacts;
    raycastFirst(start: any, end: any, options?: {}): RaycastResult;
    raycastAll(start: any, end: any, options?: {}): RaycastResult[];
}
import { PhysicsWorld } from '../physics-world.js';
import type { PhysicsBodyDesc } from '../physics-world.js';
import { AmmoPhysicsBody } from './ammo-physics-body.js';
import type { PhysicsJointDesc } from '../physics-world.js';
import type { AmmoPhysicsJoint } from './ammo-physics-joint.js';
import { RaycastResult } from '../../components/rigid-body/raycast-result.js';
