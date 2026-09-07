/**
 * Manages creation of {@link JointComponent}s.
 *
 * @category Physics
 * @alpha
 */
export class JointComponentSystem extends ComponentSystem {
    /**
     * Joints waiting for their rigid bodies to enter the simulation.
     *
     * @type {Set<JointComponent>}
     * @private
     */
    private _pending;
    /**
     * Joints with an active constraint and a finite break impulse.
     *
     * @type {Set<JointComponent>}
     * @private
     */
    private _breakable;
    id: string;
    ComponentType: typeof JointComponent;
    initializeComponentData(component: any, data: any, properties: any): void;
    cloneComponent(entity: any, clone: any): import("../component.js").Component;
    onBeforeRemove(entity: any, component: any): void;
    onUpdate(dt: any): void;
    onPostUpdate(dt: any): void;
}
import { ComponentSystem } from '../system.js';
import { JointComponent } from './component.js';
