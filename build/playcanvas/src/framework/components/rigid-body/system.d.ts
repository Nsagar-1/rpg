/**
 * The RigidBodyComponentSystem manages the physics simulation for all rigid body components
 * in the application and is accessed as `app.systems.rigidbody`. It owns the physics world,
 * creates and destroys the bodies behind rigid body and collision components, steps the
 * simulation once per frame and writes the resulting transforms back to their entities. It also
 * holds global settings such as {@link RigidBodyComponentSystem#gravity}, performs raycasts
 * and reports collisions.
 *
 * The system is only functional once a physics backend is installed: either by supplying
 * {@link AppOptions#physicsWorld} when creating the application, or automatically when the
 * application has loaded the Ammo.js {@link WasmModule}.
 *
 * Set {@link RigidBodyComponentSystem#timeScale} to slow the simulation down, speed it up or
 * pause it, for example while a pause menu is open, and call
 * {@link RigidBodyComponentSystem#step} to advance it manually.
 *
 * @category Physics
 */
export class RigidBodyComponentSystem extends ComponentSystem {
    /**
     * Fired when a contact occurs between two rigid bodies. The handler is passed a
     * {@link SingleContactResult} object containing details of the contact between the two bodies.
     *
     * @event
     * @example
     * app.systems.rigidbody.on('contact', (result) => {
     *     console.log(`Contact between ${result.a.name} and ${result.b.name}`);
     * });
     */
    static EVENT_CONTACT: string;
    /** @ignore */
    maxSubSteps: number;
    /**
     * @type {number}
     * @ignore
     */
    fixedTimeStep: number;
    /**
     * Scales the time the simulation is advanced by each frame. Defaults to 1. Values below 1
     * run physics in slow motion and values above 1 speed it up. 0 pauses the simulation: the
     * system stops advancing it, bodies freeze in place, entity transforms are no longer driven
     * by their bodies and no contact or trigger events fire. The rest of the application keeps
     * running, so this suits a pause menu or inventory screen that must stay interactive while
     * the game world stands still. Negative values are treated as 0.
     *
     * This scale is applied on top of {@link AppBase#timeScale}. The simulation can still be
     * advanced manually with {@link RigidBodyComponentSystem#step} while paused, for example to
     * drive it from a custom time source.
     *
     * How slow motion below one fixed substep per frame looks depends on the backend: the Ammo
     * backend interpolates body transforms between substeps so motion stays smooth, while other
     * backends may only move bodies on the frames in which a substep runs. Fast forward is
     * limited by the maximum number of substeps the simulation may take per frame, beyond which
     * it runs slower than requested.
     *
     * Forces applied with {@link RigidBodyComponent#applyForce} while paused accumulate on the
     * body and are applied together on the next step, because forces are only cleared when the
     * simulation steps. Impulses and velocity changes take effect immediately.
     *
     * @example
     * // Freeze the game world while the pause menu is open
     * app.systems.rigidbody.timeScale = 0;
     * @example
     * // Run physics at quarter speed for a slow motion effect
     * app.systems.rigidbody.timeScale = 0.25;
     */
    timeScale: number;
    /**
     * The world space vector representing global gravity in the physics simulation. Defaults to
     * [0, -9.81, 0] which is an approximation of the gravitational force on Earth.
     *
     * @example
     * // Set the gravity in the physics world to simulate a planet with low gravity
     * app.systems.rigidbody.gravity = new Vec3(0, -3.7, 0);
     */
    gravity: Vec3;
    /**
     * @type {PhysicsWorld|null}
     * @private
     */
    private _world;
    /**
     * @type {RigidBodyComponent[]}
     * @private
     */
    private _dynamic;
    /**
     * @type {RigidBodyComponent[]}
     * @private
     */
    private _kinematic;
    /**
     * @type {Trigger[]}
     * @private
     */
    private _triggers;
    /**
     * @type {CollisionComponent[]}
     * @private
     */
    private _compounds;
    id: string;
    _stats: {
        fps: number;
        ms: number;
        dt: number;
        updateStart: number;
        updateTime: number;
        renderStart: number;
        renderTime: number;
        physicsStart: number;
        physicsTime: number;
        scriptUpdateStart: number;
        scriptUpdate: number;
        scriptPostUpdateStart: number;
        scriptPostUpdate: number;
        animUpdateStart: number;
        animUpdate: number;
        cullTime: number;
        sortTime: number;
        skinTime: number;
        morphTime: number;
        instancingTime: number;
        triangles: number;
        gsplats: number;
        gsplatSort: number;
        gsplatBufferCopy: number;
        otherPrimitives: number;
        shaders: number;
        materials: number;
        cameras: number;
        shadowMapUpdates: number;
        shadowMapTime: number;
        depthMapTime: number;
        forwardTime: number;
        lightClustersTime: number;
        lightClusters: number;
        _timeToCountFrames: number;
        _fpsAccum: number;
    };
    ComponentType: typeof RigidBodyComponent;
    contactPointPool: ObjectPool<typeof ContactPoint>;
    contactResultPool: ObjectPool<typeof ContactResult>;
    singleContactResultPool: ObjectPool<typeof SingleContactResult>;
    collisions: {};
    frameCollisions: {};
    /**
     * Called once application libraries have loaded. Creates the Ammo backend when the Ammo
     * global is present and no backend was injected via {@link AppOptions#physicsWorld}.
     *
     * @ignore
     */
    onLibraryLoaded(): void;
    /**
     * Installs a physics backend and registers this system as its contact listener. Called by
     * {@link AppBase#init} when {@link AppOptions#physicsWorld} is supplied, and internally by
     * Ammo auto-detection. A backend can be installed at most once.
     *
     * @param {PhysicsWorld} world - The physics backend.
     * @ignore
     */
    setPhysicsWorld(world: PhysicsWorld): void;
    /**
     * Gets the installed physics backend, or null when no backend is installed. Supply a
     * backend via {@link AppOptions#physicsWorld}, or load the Ammo.js library to have one
     * installed automatically.
     *
     * @type {PhysicsWorld|null}
     * @alpha
     */
    get physicsWorld(): PhysicsWorld | null;
    /**
     * The native physics world - btDiscreteDynamicsWorld when the Ammo backend is active,
     * null otherwise.
     *
     * @type {*}
     * @ignore
     */
    get dynamicsWorld(): any;
    /** @ignore */
    get collisionConfiguration(): any;
    /** @ignore */
    get dispatcher(): any;
    /** @ignore */
    get overlappingPairCache(): any;
    /** @ignore */
    get solver(): any;
    initializeComponentData(component: any, data: any): void;
    cloneComponent(entity: any, clone: any): import("../component.js").Component;
    onBeforeRemove(entity: any, component: any): void;
    addBody(body: any, group: any, mask: any): void;
    removeBody(body: any): void;
    /**
     * Adds a component's body to the simulation and registers the component with the update
     * lists for its body type. Fires 'simulationenabled' on the component. No-op unless the
     * component has a body, an enabled collision component and is not already simulating.
     *
     * @param {RigidBodyComponent} component - The component to add to the simulation.
     * @ignore
     */
    enableSimulation(component: RigidBodyComponent): void;
    /**
     * Removes a component's body from the simulation and unregisters the component from the
     * update lists. Fires 'simulationdisabled' on the component. No-op unless the component
     * has a body and is currently simulating.
     *
     * @param {RigidBodyComponent} component - The component to remove from the simulation.
     * @ignore
     */
    disableSimulation(component: RigidBodyComponent): void;
    /**
     * Adds a trigger's body to the simulation and registers the trigger for per-frame
     * transform updates. No-op if the trigger is already registered.
     *
     * @param {Trigger} trigger - The trigger to add to the simulation.
     * @ignore
     */
    addTrigger(trigger: Trigger): void;
    /**
     * Removes a trigger's body from the simulation and unregisters the trigger. No-op if the
     * trigger is not registered.
     *
     * @param {Trigger} trigger - The trigger to remove from the simulation.
     * @ignore
     */
    removeTrigger(trigger: Trigger): void;
    /**
     * Raycast the world and return the first entity the ray hits. Fire a ray into the world from
     * start to end, if the ray hits an entity with a collision component, it returns a
     * {@link RaycastResult}, otherwise returns null.
     *
     * @param {Vec3} start - The world space point where the ray starts.
     * @param {Vec3} end - The world space point where the ray ends.
     * @param {object} [options] - The additional options for the raycasting.
     * @param {number} [options.filterCollisionGroup] - Collision group to apply to the raycast.
     * @param {number} [options.filterCollisionMask] - Collision mask to apply to the raycast.
     * @param {any[]} [options.filterTags] - Tags filters. Defined the same way as a {@link Tags#has}
     * query but within an array.
     * @param {Function} [options.filterCallback] - Custom function to use to filter entities.
     * Must return true to proceed with result. Takes one argument: the entity to evaluate.
     *
     * @returns {RaycastResult|null} The result of the raycasting or null if there was no hit.
     */
    raycastFirst(start: Vec3, end: Vec3, options?: {
        filterCollisionGroup?: number;
        filterCollisionMask?: number;
        filterTags?: any[];
        filterCallback?: Function;
    }): RaycastResult | null;
    /**
     * Raycast the world and return all entities the ray hits. It returns an array of
     * {@link RaycastResult}, one for each hit. If no hits are detected, the returned array will be
     * of length 0. Results are returned in no particular order unless `options.sort` is true, in
     * which case they are sorted by distance with the closest first.
     *
     * @param {Vec3} start - The world space point where the ray starts.
     * @param {Vec3} end - The world space point where the ray ends.
     * @param {object} [options] - The additional options for the raycasting.
     * @param {boolean} [options.sort] - Whether to sort raycast results based on distance with closest
     * first. Defaults to false.
     * @param {number} [options.filterCollisionGroup] - Collision group to apply to the raycast.
     * @param {number} [options.filterCollisionMask] - Collision mask to apply to the raycast.
     * @param {any[]} [options.filterTags] - Tags filters. Defined the same way as a {@link Tags#has}
     * query but within an array.
     * @param {Function} [options.filterCallback] - Custom function to use to filter entities.
     * Must return true to proceed with result. Takes the entity to evaluate as argument.
     *
     * @returns {RaycastResult[]} An array of raycast hit results (0 length if there were no hits).
     *
     * @example
     * // Return all results of a raycast between 0, 2, 2 and 0, -2, -2
     * const hits = this.app.systems.rigidbody.raycastAll(new Vec3(0, 2, 2), new Vec3(0, -2, -2));
     * @example
     * // Return all results of a raycast between 0, 2, 2 and 0, -2, -2
     * // where hit entity is tagged with `bird` OR `mammal`
     * const hits = this.app.systems.rigidbody.raycastAll(new Vec3(0, 2, 2), new Vec3(0, -2, -2), {
     *     filterTags: [ "bird", "mammal" ]
     * });
     * @example
     * // Return all results of a raycast between 0, 2, 2 and 0, -2, -2
     * // where hit entity has a `camera` component
     * const hits = this.app.systems.rigidbody.raycastAll(new Vec3(0, 2, 2), new Vec3(0, -2, -2), {
     *     filterCallback: (entity) => entity && entity.camera
     * });
     * @example
     * // Return all results of a raycast between 0, 2, 2 and 0, -2, -2
     * // where hit entity is tagged with (`carnivore` AND `mammal`) OR (`carnivore` AND `reptile`)
     * // and the entity has an `anim` component
     * const hits = this.app.systems.rigidbody.raycastAll(new Vec3(0, 2, 2), new Vec3(0, -2, -2), {
     *     filterTags: [
     *         [ "carnivore", "mammal" ],
     *         [ "carnivore", "reptile" ]
     *     ],
     *     filterCallback: (entity) => entity && entity.anim
     * });
     */
    raycastAll(start: Vec3, end: Vec3, options?: {
        sort?: boolean;
        filterCollisionGroup?: number;
        filterCollisionMask?: number;
        filterTags?: any[];
        filterCallback?: Function;
    }): RaycastResult[];
    /**
     * Stores a collision between the entity and other in the contacts map and returns true if it
     * is a new collision.
     *
     * @param {Entity} entity - The entity.
     * @param {Entity} other - The entity that collides with the first entity.
     * @returns {boolean} True if this is a new collision, false otherwise.
     * @private
     */
    private _storeCollision;
    /**
     * Allocates a pooled contact point that is the given one seen from the other body's
     * perspective.
     *
     * @param {ContactPoint} forward - The contact point from body A's perspective.
     * @returns {ContactPoint} The reversed contact point.
     * @private
     */
    private _createReverseContactPoint;
    _createSingleContactResult(a: any, b: any, contactPoint: any): SingleContactResult;
    _createContactResult(other: any, contacts: any): ContactResult;
    /**
     * Removes collisions that no longer exist from the collisions list and fires collisionend
     * events to the related entities.
     *
     * @private
     */
    private _cleanOldCollisions;
    /**
     * Removes any stored collision keyed to the given entity. Called when a collision component is
     * removed so the persistent collisions map does not retain a destroyed entity. A new entity
     * that later reuses the same GUID (for example after reloading the same scene) would otherwise
     * inherit the stale entry and never fire `triggerleave` / `collisionend`, because the cached
     * entity no longer has a trigger or body.
     *
     * @param {Entity} entity - The entity whose stored collision should be removed.
     * @ignore
     */
    clearEntityCollisions(entity: Entity): void;
    /**
     * Returns true if the entity has a contact event attached and false otherwise.
     *
     * @param {Entity} entity - Entity to test.
     * @returns {boolean} True if the entity has a contact and false otherwise.
     * @private
     */
    private _hasContactEvent;
    /**
     * Called by the physics backend when a contact pass begins.
     *
     * @ignore
     */
    onContactsBegin(): void;
    /**
     * Called by the physics backend for each contacting pair. Fires the trigger and collision
     * events.
     *
     * @param {PhysicsContactPair} pair - The contacting pair. Only valid during the call.
     * @ignore
     */
    onContactPair(pair: PhysicsContactPair): void;
    /**
     * Called by the physics backend when a contact pass ends. Fires collisionend/triggerleave
     * events for lost contacts and frees the pooled results.
     *
     * @ignore
     */
    onContactsEnd(): void;
    /**
     * Advances the physics simulation by dt seconds. Synchronizes triggers, compound shapes and
     * kinematic bodies from their entities, steps the backend in fixed-length substeps (up to a
     * maximum number per call), writes the resulting transforms of dynamic bodies back to their
     * entities and fires contact and trigger events.
     *
     * The system calls this once per frame with the frame delta time multiplied by
     * {@link RigidBodyComponentSystem#timeScale}, unless that is 0. Call it directly to step the
     * simulation manually: to advance it while paused, to fast forward it by stepping several
     * times in one frame, or to drive it from a custom time source. Automatic stepping continues
     * while timeScale is above 0, so calling this every frame as well advances the simulation
     * twice per frame. Set timeScale to 0 first when taking over stepping entirely. The delta is
     * used as given, without applying timeScale. Does nothing when no physics backend is
     * installed.
     *
     * @param {number} dt - The amount of time to advance the simulation by, in seconds.
     * @example
     * // Pause automatic stepping and advance the simulation by 1/60 s per key press
     * const physics = app.systems.rigidbody;
     * physics.timeScale = 0;
     * app.keyboard.on('keydown', (event) => {
     *     if (event.key === KEY_SPACE) {
     *         physics.step(1 / 60);
     *     }
     * });
     */
    step(dt: number): void;
    /**
     * Steps the simulation by the frame delta time scaled by
     * {@link RigidBodyComponentSystem#timeScale}, or skips the frame entirely when the scale is
     * 0. Registered on the application's update event when a physics backend is installed.
     *
     * @param {number} dt - The frame delta time in seconds.
     * @ignore
     */
    onUpdate(dt: number): void;
    /**
     * Sets the world space gravity. Accepts either a Vec3 or three numbers.
     *
     * @param {number|Vec3} x - A Vec3 holding the gravity, or the x-component of the gravity.
     * @param {number} [y] - The y-component of the gravity.
     * @param {number} [z] - The z-component of the gravity.
     * @ignore
     * @deprecated Use {@link RigidBodyComponentSystem#gravity} instead.
     */
    setGravity(x: number | Vec3, y?: number, z?: number): void;
}
import { ComponentSystem } from '../system.js';
import { Vec3 } from '../../../core/math/vec3.js';
import { RigidBodyComponent } from './component.js';
import { ContactPoint } from './contact-point.js';
import { ObjectPool } from '../../../core/object-pool.js';
import { ContactResult } from './contact-result.js';
import { SingleContactResult } from './single-contact-result.js';
import type { PhysicsWorld } from '../../physics/physics-world.js';
import type { Trigger } from '../collision/trigger.js';
import type { RaycastResult } from './raycast-result.js';
import type { Entity } from '../../entity.js';
import type { PhysicsContactPair } from '../../physics/physics-world.js';
