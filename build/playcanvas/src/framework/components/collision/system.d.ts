/**
 * Manages creation of {@link CollisionComponent}s.
 *
 * @category Physics
 */
export class CollisionComponentSystem extends ComponentSystem {
    id: string;
    ComponentType: typeof CollisionComponent;
    /**
     * The physics backend installed on the rigid body system, or null.
     *
     * @type {*}
     * @ignore
     */
    get physicsWorld(): any;
    initializeComponentData(component: any, data: any): void;
    cloneComponent(entity: any, clone: any): import("../component.js").Component;
    onBeforeRemove(entity: any, component: any): void;
    onRemove(entity: any): void;
    updateCompoundChildTransform(entity: any, forceUpdate: any): void;
    _removeCompoundChild(collision: any, shape: any): void;
    onTransformChanged(component: any, position: any, rotation: any, scale: any): void;
    changeType(component: any, previousType: any, newType: any): void;
    recreatePhysicalShapes(component: any): void;
    /**
     * Rebuilds a mesh component's shape from its current model or render sources, skipping any
     * asset loading. Used by the mesh source setters, which assign the resource directly.
     *
     * @param {CollisionComponent} component - The mesh collision component to rebuild.
     * @ignore
     */
    doRecreatePhysicalShape(component: CollisionComponent): void;
    /**
     * An {@link Entity#forEach} callback that wires a descendant of a compound root to it and
     * rebuilds the descendant's shape. Invoked with `this` set to the compound root component.
     *
     * @param {Entity} entity - The visited descendant entity.
     * @private
     */
    private _addEachDescendant;
    _calculateNodeRelativeTransform(node: any, relative: any): void;
    _getNodeScaling(node: any): any;
    /**
     * Computes a node's pose (with any collision component offsets applied), optionally
     * relative to an ancestor node, ignoring scale.
     *
     * @param {GraphNode} node - The node to read.
     * @param {GraphNode|null} relative - The ancestor to compute the pose relative to, or null
     * for the world pose.
     * @param {Vec3} position - The vector to write the position to.
     * @param {Quat} rotation - The quaternion to write the rotation to.
     * @private
     */
    private _getNodeTransform;
}
import { ComponentSystem } from '../system.js';
import { CollisionComponent } from './component.js';
