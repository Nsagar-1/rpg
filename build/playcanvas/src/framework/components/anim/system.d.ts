/**
 * @import { AppBase } from '../../app-base.js'
 * @import { Component } from '../component.js'
 */
/**
 * The AnimComponentSystem manages creating and deleting AnimComponents.
 *
 * @category Animation
 */
export class AnimComponentSystem extends ComponentSystem {
    id: string;
    ComponentType: typeof AnimComponent;
    initializeComponentData(component: any, data: any, properties: any): void;
    onAnimationUpdate(dt: any): void;
    /**
     * Rebinds every component animating a hierarchy which contains the entity whose mesh instances
     * changed. Anim targets which reference mesh instances - morph target weights and animated
     * material textures - are resolved once and then cached, so they have to be re-resolved when the
     * mesh instances they point at are created or destroyed. Disabled components are included, as
     * they keep their bindings and are not rebound when re-enabled.
     *
     * @param {Component} component - The component whose mesh instances changed.
     * @private
     */
    private onMeshInstancesChange;
    cloneComponent(entity: any, clone: any): Component;
    onBeforeRemove(entity: any, component: any): void;
}
import { ComponentSystem } from '../system.js';
import { AnimComponent } from './component.js';
import type { Component } from '../component.js';
