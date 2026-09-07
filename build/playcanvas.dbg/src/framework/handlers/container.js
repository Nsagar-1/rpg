import { GlbContainerParser } from "../parsers/glb-container-parser.js";
import { ResourceHandler } from "./handler.js";
class ContainerResource {
  /**
   * Instantiates an entity with a model component.
   *
   * @param {object} [options] - The initialization data for the model component type
   * {@link ModelComponent}.
   * @returns {Entity} A single entity with a model component. Model component internally
   * contains a hierarchy based on {@link GraphNode}.
   * @example
   * // load a glb file and instantiate an entity with a model component based on it
   * app.assets.loadFromUrl("statue.glb", "container", (err, asset) => {
   *     const entity = asset.resource.instantiateModelEntity({
   *         castShadows: true
   *     });
   *     app.root.addChild(entity);
   * });
   */
  instantiateModelEntity(options) {
    return null;
  }
  /**
   * Instantiates an entity with a render component.
   *
   * @param {object} [options] - The initialization data for the render component type
   * {@link RenderComponent}.
   * @returns {Entity} A hierarchy of entities with render components on entities containing
   * renderable geometry.
   * @example
   * // load a glb file and instantiate an entity with a render component based on it
   * app.assets.loadFromUrl("statue.glb", "container", (err, asset) => {
   *     const entity = asset.resource.instantiateRenderEntity({
   *         castShadows: true
   *     });
   *     app.root.addChild(entity);
   *
   *     // find all render components containing mesh instances, and change blend mode on their materials
   *     const renders = entity.findComponents("render");
   *     renders.forEach((render) => {
   *         render.meshInstances.forEach((meshInstance) => {
   *             meshInstance.material.blendType = BLEND_MULTIPLICATIVE;
   *             meshInstance.material.update();
   *         });
   *     });
   * });
   */
  instantiateRenderEntity(options) {
    return null;
  }
  /**
   * Queries the list of available material variants.
   *
   * @returns {string[]} An array of variant names.
   */
  getMaterialVariants() {
    return null;
  }
  /**
   * Applies a material variant to an entity hierarchy.
   *
   * @param {Entity} entity - The entity root to which material variants will be applied.
   * @param {string} [name] - The name of the variant, as queried from getMaterialVariants, if
   * null the variant will be reset to the default.
   * @example
   * // load a glb file and instantiate an entity with a render component based on it
   * app.assets.loadFromUrl("statue.glb", "container", (err, asset) => {
   *     const entity = asset.resource.instantiateRenderEntity({
   *         castShadows: true
   *     });
   *     app.root.addChild(entity);
   *     const materialVariants = asset.resource.getMaterialVariants();
   *     asset.resource.applyMaterialVariant(entity, materialVariants[0]);
   * });
   */
  applyMaterialVariant(entity, name) {
  }
  /**
   * Applies a material variant to a set of mesh instances. Compared to the applyMaterialVariant,
   * this method allows for setting the variant on a specific set of mesh instances instead of the
   * whole entity.
   *
   * @param {MeshInstance[]} instances - An array of mesh instances.
   * @param {string} [name] - The name of the variant, as queried by getMaterialVariants. If null,
   * the variant will be reset to the default.
   * @example
   * // load a glb file and instantiate an entity with a render component based on it
   * app.assets.loadFromUrl("statue.glb", "container", (err, asset) => {
   *     const entity = asset.resource.instantiateRenderEntity({
   *         castShadows: true
   *     });
   *     app.root.addChild(entity);
   *     const materialVariants = asset.resource.getMaterialVariants();
   *     const renders = entity.findComponents("render");
   *     for (let i = 0; i < renders.length; i++) {
   *         const renderComponent = renders[i];
   *         asset.resource.applyMaterialVariantInstances(renderComponent.meshInstances, materialVariants[0]);
   *     }
   * });
   */
  applyMaterialVariantInstances(instances, name) {
  }
}
class ContainerHandler extends ResourceHandler {
  /**
   * Create a new ContainerResource instance.
   *
   * @param {AppBase} app - The running {@link AppBase}.
   * @ignore
   */
  constructor(app) {
    super(app, "container");
    this.addParser(new GlbContainerParser(app.graphicsDevice, app.assets));
  }
}
export {
  ContainerHandler,
  ContainerResource
};
