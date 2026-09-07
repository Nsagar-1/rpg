import { GlbContainerParser } from "../parsers/glb-container-parser.js";
import { ResourceHandler } from "./handler.js";
class ContainerResource {
	instantiateModelEntity(options) {
		return null;
	}
	instantiateRenderEntity(options) {
		return null;
	}
	getMaterialVariants() {
		return null;
	}
	applyMaterialVariant(entity, name) {
	}
	applyMaterialVariantInstances(instances, name) {
	}
}
class ContainerHandler extends ResourceHandler {
	constructor(app) {
		super(app, "container");
		this.addParser(new GlbContainerParser(app.graphicsDevice, app.assets));
	}
}
export {
	ContainerHandler,
	ContainerResource
};
