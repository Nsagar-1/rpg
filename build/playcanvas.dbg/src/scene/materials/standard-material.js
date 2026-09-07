var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { Debug } from "../../core/debug.js";
import { Color } from "../../core/math/color.js";
import { math } from "../../core/math/math.js";
import { Vec2 } from "../../core/math/vec2.js";
import { ShaderProcessorOptions } from "../../platform/graphics/shader-processor-options.js";
import {
  CUBEPROJ_BOX,
  CUBEPROJ_NONE,
  DETAILMODE_MUL,
  DITHER_NONE,
  FRESNEL_SCHLICK,
  PARALLAX_OCCLUSION,
  PARALLAX_OFFSET,
  SHADER_PICK,
  SHADER_PREPASS,
  SPECOCC_AO,
  tonemapNames
} from "../constants.js";
import { ShaderPass } from "../shader-pass.js";
import { EnvLighting } from "../graphics/env-lighting.js";
import { getProgramLibrary } from "../shader-lib/get-program-library.js";
import { _matTex2D, standard } from "../shader-lib/programs/standard.js";
import { Material } from "./material.js";
import { StandardMaterialMapTransforms } from "./standard-material-map-transforms.js";
import { StandardMaterialOptionsBuilder } from "./standard-material-options-builder.js";
import { standardMaterialCubemapParameters, standardMaterialTextureParameters } from "./standard-material-parameters.js";
import { DebugGraphics } from "../../platform/graphics/debug-graphics.js";
import { ShaderUtils } from "../shader-lib/shader-utils.js";
const _props = {};
const _uniforms = {};
let _params = /* @__PURE__ */ new Set();
const _tempColor = new Color();
const isBlack = (color) => {
  return color.r === 0 && color.g === 0 && color.b === 0;
};
class StandardMaterial extends Material {
  /**
   * Create a new StandardMaterial instance.
   *
   * @example
   * // Create a new Standard material
   * const material = new StandardMaterial();
   *
   * // Update the material's diffuse and specular properties
   * material.diffuse.set(1, 0, 0);
   * material.specular.set(1, 1, 1);
   *
   * // Notify the material that it has been modified
   * material.update();
   * @example
   * // Create a new Standard material
   * const material = new StandardMaterial();
   *
   * // Assign a texture to the diffuse slot
   * material.diffuseMap = texture;
   *
   * // Use the alpha channel of the texture for alpha testing with a reference value of 0.5
   * material.opacityMap = texture;
   * material.alphaTest = 0.5;
   *
   * // Notify the material that it has been modified
   * material.update();
   */
  constructor() {
    super();
    __publicField(this, "userAttributes", /* @__PURE__ */ new Map());
    /**
     * Whether the specular color was black at the last update.
     *
     * @type {boolean}
     * @private
     */
    __publicField(this, "_specularIsBlack");
    /**
     * Texture transform grouping state.
     *
     * @type {StandardMaterialMapTransforms}
     * @private
     */
    __publicField(this, "_mapTransforms", new StandardMaterialMapTransforms());
    /**
     * A custom function that will be called after all shader generator properties are collected
     * and before shader code is generated. This function will receive an object with shader
     * generator settings (based on current material and scene properties), that you can change and
     * then return. Returned value will be used instead. This is mostly useful when rendering the
     * same set of objects, but with different shader variations based on the same material. For
     * example, you may wish to render a depth or normal pass using textures assigned to the
     * material, a reflection pass with simpler shaders and so on. These properties are split into
     * two sections, generic standard material options and lit options. Properties of the standard
     * material options are {@link StandardMaterialOptions} and the options for the lit options are
     * {@link LitShaderOptions}.
     *
     * @type {UpdateShaderCallback|undefined}
     */
    __publicField(this, "onUpdateShader");
    this._assetReferences = {};
    this._activeParams = /* @__PURE__ */ new Set();
    this._activeLightingParams = /* @__PURE__ */ new Set();
    this.shaderOptBuilder = new StandardMaterialOptionsBuilder();
    this.reset();
    this._specularIsBlack = isBlack(this._specular);
  }
  reset() {
    Object.keys(_props).forEach((name) => {
      this[`_${name}`] = _props[name].value();
    });
    this._uniformCache = {};
    this._mapTransforms.reset();
  }
  /**
   * Copy a `StandardMaterial`.
   *
   * @param {StandardMaterial} source - The material to copy from.
   * @returns {StandardMaterial} The destination material.
   */
  copy(source) {
    super.copy(source);
    Object.keys(_props).forEach((name) => {
      this[name] = _props[name].copyFromBacking ? source[`_${name}`] : source[name];
    });
    this._alphaDither = source._alphaDither;
    this.userAttributes = new Map(source.userAttributes);
    return this;
  }
  /**
   * @override
   */
  update() {
    if (this._mapTransforms.update(this)) {
      this._dirtyShader = true;
    }
    const specularIsBlack = isBlack(this._specular);
    if (this._specularIsBlack !== specularIsBlack) {
      this._specularIsBlack = specularIsBlack;
      this._dirtyShader = true;
    }
    super.update();
  }
  /**
   * Returns the transform group assigned to a texture map.
   *
   * @param {string} name - Texture map base name.
   * @returns {number} The transform group, or zero when no transform is needed.
   * @private
   */
  _getMapTransformId(name) {
    return this._mapTransforms.getId(name);
  }
  /**
   * Sets a vertex shader attribute on a material.
   *
   * @param {string} name - The name of the parameter to set.
   * @param {string} semantic - Semantic to map the vertex data. Must match with the semantic set
   * on vertex stream of the mesh.
   * @example
   * mesh.setVertexStream(SEMANTIC_ATTR15, offset, 3);
   * material.setAttribute('offset', SEMANTIC_ATTR15);
   */
  setAttribute(name, semantic) {
    this.userAttributes.set(semantic, name);
  }
  _setParameter(name, value) {
    _params.add(name);
    this.setParameter(name, value);
  }
  _setParameters(parameters) {
    parameters.forEach((v) => {
      this._setParameter(v.name, v.value);
    });
  }
  _processParameters(paramsName) {
    const prevParams = this[paramsName];
    prevParams.forEach((param) => {
      if (!_params.has(param)) {
        delete this.parameters[param];
      }
    });
    this[paramsName] = _params;
    _params = prevParams;
    _params.clear();
  }
  _updateMap(p) {
    const mname = `${p}Map`;
    const map = this[mname];
    if (map) {
      this._setParameter(`texture_${mname}`, map);
      const tname = `${mname}Transform`;
      const uniform = this.getUniform(tname);
      if (uniform) {
        this._setParameters(uniform);
      }
    }
  }
  // allocate a uniform if it doesn't already exist in the uniform cache
  _allocUniform(name, allocFunc) {
    let uniform = this._uniformCache[name];
    if (!uniform) {
      uniform = allocFunc();
      this._uniformCache[name] = uniform;
    }
    return uniform;
  }
  getUniform(name, device, scene) {
    return _uniforms[name](this, device, scene);
  }
  updateUniforms(device, scene) {
    if (this._mapTransforms.update(this)) {
      this._dirtyShader = true;
    }
    const getUniform = (name) => {
      return this.getUniform(name, device, scene);
    };
    this._setParameter("material_ambient", getUniform("ambient"));
    this._setParameter("material_diffuse", getUniform("diffuse"));
    this._setParameter("material_specular", getUniform("specular"));
    this._setParameter("material_aoIntensity", this.aoIntensity);
    if (this.useMetalness) {
      if (!this.metalnessMap || this.metalness < 1) {
        this._setParameter("material_metalness", this.metalness);
      }
      if (!this.specularityFactorMap || this.specularityFactorTint || this.specularityFactor !== 1) {
        this._setParameter("material_specularityFactor", this.specularityFactor);
      }
      this._setParameter("material_sheen", getUniform("sheen"));
      this._setParameter("material_sheenGloss", this.sheenGloss);
      this._setParameter("material_refractionIndex", this.refractionIndex);
    }
    if (this.enableGGXSpecular) {
      this._setParameter("material_anisotropyIntensity", this.anisotropyIntensity);
      this._setParameter("material_anisotropyRotation", [Math.cos(this.anisotropyRotation * math.DEG_TO_RAD), Math.sin(this.anisotropyRotation * math.DEG_TO_RAD)]);
    }
    if (this.clearCoat > 0) {
      this._setParameter("material_clearCoat", this.clearCoat);
      this._setParameter("material_clearCoatGloss", this.clearCoatGloss);
      this._setParameter("material_clearCoatBumpiness", this.clearCoatBumpiness);
    }
    this._setParameter("material_gloss", this.gloss);
    Debug.call(() => {
      if (this.emissiveMap && this._emissive.r === 0 && this._emissive.g === 0 && this._emissive.b === 0) {
        Debug.warnOnce(`Emissive map is set but emissive color is black, making the map invisible. Set emissive color to white to make the map visible. Rendering [${DebugGraphics.toString()}]`, this);
      }
    });
    this._setParameter("material_emissive", getUniform("emissive"));
    this._setParameter("material_emissiveIntensity", this.emissiveIntensity);
    if (this.refraction > 0) {
      this._setParameter("material_refraction", this.refraction);
    }
    if (!this.useMetalness && (this.refraction > 0 || this.refractionMap)) {
      this._setParameter("material_refractionIndex", this.refractionIndex);
    }
    if (this.dispersion > 0) {
      this._setParameter("material_dispersion", this.dispersion);
    }
    if (this.useDynamicRefraction) {
      this._setParameter("material_thickness", this.thickness);
      this._setParameter("material_attenuation", getUniform("attenuation"));
      this._setParameter("material_invAttenuationDistance", this.attenuationDistance === 0 ? 0 : 1 / this.attenuationDistance);
    }
    if (this.useIridescence) {
      this._setParameter("material_iridescence", this.iridescence);
      this._setParameter("material_iridescenceRefractionIndex", this.iridescenceRefractionIndex);
      this._setParameter("material_iridescenceThicknessMin", this.iridescenceThicknessMin);
      this._setParameter("material_iridescenceThicknessMax", this.iridescenceThicknessMax);
    }
    this._setParameter("material_opacity", this.opacity);
    const ditherScale = this._opacity > 0 ? this.alphaDither / this._opacity : 1;
    this._setParameter("material_alphaDitherScale", ditherScale);
    if (this.opacityFadesSpecular === false) {
      this._setParameter("material_alphaFade", this.alphaFade);
    }
    if (this.occludeSpecular) {
      this._setParameter("material_occludeSpecularIntensity", this.occludeSpecularIntensity);
    }
    if (this.cubeMapProjection === CUBEPROJ_BOX) {
      this._setParameter(getUniform("cubeMapProjectionBox"));
    }
    for (const p in _matTex2D) {
      this._updateMap(p);
    }
    if (this.ambientSH) {
      this._setParameter("ambientSH[0]", this.ambientSH);
    }
    if (this.normalMap) {
      this._setParameter("material_bumpiness", this.bumpiness);
    }
    if (this.normalMap && this.normalDetailMap) {
      this._setParameter("material_normalDetailMapBumpiness", this.normalDetailMapBumpiness);
    }
    if (this.heightMap) {
      this._setParameter("material_heightMapFactor", getUniform("heightMapFactor"));
      this._setParameter("material_heightMapBase", this.heightMapBase);
      if (this.parallaxMode === PARALLAX_OCCLUSION) {
        this._setParameter("material_parallaxSamples", this.parallaxSamples);
        if (this.parallaxShadowSamples > 0) {
          this._setParameter("material_parallaxShadowSamples", this.parallaxShadowSamples);
        }
      }
    }
    if (this.envAtlas && this.cubeMap) {
      this._setParameter("texture_envAtlas", this.envAtlas);
      this._setParameter("texture_cubeMap", this.cubeMap);
    } else if (this.envAtlas) {
      this._setParameter("texture_envAtlas", this.envAtlas);
    } else if (this.cubeMap) {
      this._setParameter("texture_cubeMap", this.cubeMap);
    } else if (this.sphereMap) {
      this._setParameter("texture_sphereMap", this.sphereMap);
    }
    this._setParameter("material_reflectivity", this.reflectivity);
    this._processParameters("_activeParams");
    super.updateUniforms(device, scene);
  }
  updateEnvUniforms(device, scene) {
    const hasLocalEnvOverride = this.envAtlas || this.cubeMap || this.sphereMap;
    if (!hasLocalEnvOverride && this.useSkybox) {
      if (scene.envAtlas && scene.skybox) {
        this._setParameter("texture_envAtlas", scene.envAtlas);
        this._setParameter("texture_cubeMap", scene.skybox);
      } else if (scene.envAtlas) {
        this._setParameter("texture_envAtlas", scene.envAtlas);
      } else if (scene.skybox) {
        this._setParameter("texture_cubeMap", scene.skybox);
      }
    }
    this._processParameters("_activeLightingParams");
  }
  /** @ignore */
  getShaderVariant(params) {
    const { device, scene, pass, objDefs, sortedLights, cameraShaderParams } = params;
    this.updateEnvUniforms(device, scene);
    const shaderPassInfo = ShaderPass.get(device).getByIndex(pass);
    const minimalOptions = pass === SHADER_PICK || pass === SHADER_PREPASS || shaderPassInfo.isShadow;
    let options = minimalOptions ? standard.optionsContextMin : standard.optionsContext;
    options.defines = ShaderUtils.getCoreDefines(this, params);
    if (minimalOptions) {
      this.shaderOptBuilder.updateMinRef(options, scene, this, objDefs, pass, sortedLights);
    } else {
      this.shaderOptBuilder.updateRef(options, scene, cameraShaderParams, this, objDefs, pass, sortedLights);
    }
    const useDualSourceBlending = shaderPassInfo.isForward && this.blendState.usesDualSourceBlending;
    options.useDualSourceBlending = useDualSourceBlending;
    if (!this.useFog) options.defines.set("FOG", "NONE");
    options.defines.set("TONEMAP", tonemapNames[options.litOptions.toneMap]);
    if (this.onUpdateShader) {
      options = this.onUpdateShader(options);
    }
    options.useDualSourceBlending = useDualSourceBlending;
    const processingOptions = new ShaderProcessorOptions(params.viewUniformFormat, params.vertexFormat);
    const library = getProgramLibrary(device);
    library.register("standard", standard);
    const shader = library.getProgram("standard", options, processingOptions, this.userId);
    return shader;
  }
  /**
   * Removes this material from the scene and possibly frees up memory from its shaders (if there
   * are no other materials using it).
   */
  destroy() {
    for (const asset in this._assetReferences) {
      this._assetReferences[asset]._unbind();
    }
    this._assetReferences = null;
    super.destroy();
  }
  /**
   * Sets the shininess in the range 0 to 100, mapping to {@link StandardMaterial#gloss} in the
   * range 0 to 1.
   *
   * @type {number}
   * @ignore
   * @deprecated Use {@link StandardMaterial#gloss} instead.
   */
  set shininess(value) {
    Object.assign(this, { gloss: value * 0.01 });
  }
  /**
   * Gets the shininess.
   *
   * @type {number}
   * @ignore
   * @deprecated Use {@link StandardMaterial#gloss} instead.
   */
  get shininess() {
    return this.gloss * 100;
  }
  /**
   * Sets whether tonemapping is applied. Note: no deprecation warning is logged, to keep
   * existing code working without warnings.
   *
   * @type {boolean}
   * @ignore
   * @deprecated Use {@link StandardMaterial#useTonemap} instead.
   */
  set useGammaTonemap(value) {
    Object.assign(this, { useTonemap: value });
  }
  /**
   * Gets whether tonemapping is applied.
   *
   * @type {boolean}
   * @ignore
   * @deprecated Use {@link StandardMaterial#useTonemap} instead.
   */
  get useGammaTonemap() {
    return this.useTonemap;
  }
  /**
   * Sets the anisotropy as a signed intensity, mapping to {@link StandardMaterial#anisotropyIntensity}
   * and {@link StandardMaterial#anisotropyRotation}.
   *
   * @type {number}
   * @ignore
   * @deprecated Use {@link StandardMaterial#anisotropyIntensity} and
   * {@link StandardMaterial#anisotropyRotation} instead.
   */
  set anisotropy(value) {
    Debug.deprecated("StandardMaterial#anisotropy is deprecated. Use StandardMaterial#anisotropyIntensity and StandardMaterial#anisotropyRotation instead.");
    Object.assign(this, {
      anisotropyIntensity: Math.abs(value),
      anisotropyRotation: value >= 0 ? 0 : 90
    });
  }
  /**
   * Gets the anisotropy as a signed intensity.
   *
   * @type {number}
   * @ignore
   * @deprecated Use {@link StandardMaterial#anisotropyIntensity} and
   * {@link StandardMaterial#anisotropyRotation} instead.
   */
  get anisotropy() {
    Debug.deprecated("StandardMaterial#anisotropy is deprecated. Use StandardMaterial#anisotropyIntensity and StandardMaterial#anisotropyRotation instead.");
    const sign = Math.sign(Math.cos(this.anisotropyRotation * math.DEG_TO_RAD * 2));
    return this.anisotropyIntensity * sign;
  }
}
__publicField(StandardMaterial, "TEXTURE_PARAMETERS", standardMaterialTextureParameters);
__publicField(StandardMaterial, "CUBEMAP_PARAMETERS", standardMaterialCubemapParameters);
const defineUniform = (name, getUniformFunc) => {
  _uniforms[name] = getUniformFunc;
};
const definePropInternal = (name, constructorFunc, setterFunc, getterFunc, copyFromBacking = false) => {
  Object.defineProperty(StandardMaterial.prototype, name, {
    get: getterFunc || function() {
      return this[`_${name}`];
    },
    set: setterFunc
  });
  _props[name] = {
    value: constructorFunc,
    copyFromBacking
  };
};
const defineValueProp = (prop) => {
  const internalName = `_${prop.name}`;
  const dirtyShaderFunc = prop.dirtyShaderFunc || (() => true);
  const onGet = prop.onGet;
  const onSet = prop.onSet;
  const setterFunc = function(value) {
    const oldValue = this[internalName];
    if (oldValue !== value) {
      this._dirtyShader = this._dirtyShader || dirtyShaderFunc(oldValue, value);
      this[internalName] = value;
      onSet?.call(this);
    }
  };
  const getterFunc = prop.getterFunc || onGet && function() {
    onGet.call(this);
    return this[internalName];
  };
  definePropInternal(prop.name, () => prop.defaultValue, setterFunc, getterFunc, !!onGet);
};
const defineAggProp = (prop) => {
  const internalName = `_${prop.name}`;
  const dirtyShaderFunc = prop.dirtyShaderFunc || (() => true);
  const onGet = prop.onGet;
  const onSet = prop.onSet;
  const setterFunc = function(value) {
    const oldValue = this[internalName];
    if (!oldValue.equals(value)) {
      this._dirtyShader = this._dirtyShader || dirtyShaderFunc(oldValue, value);
      this[internalName] = oldValue.copy(value);
      onSet?.call(this);
    }
  };
  const getterFunc = prop.getterFunc || onGet && function() {
    onGet.call(this);
    return this[internalName];
  };
  definePropInternal(prop.name, () => prop.defaultValue.clone(), setterFunc, getterFunc, !!onGet);
};
const defineProp = (prop) => {
  return prop.defaultValue && prop.defaultValue.clone ? defineAggProp(prop) : defineValueProp(prop);
};
const markMapTransformsDirty = function() {
  this._mapTransforms.markDirty();
};
const markMapTransformsMutable = function() {
  this._mapTransforms.markMutable();
};
function _defineTex2D(name, channel = "rgb", vertexColor = true, uv = 0) {
  _matTex2D[name] = channel.length || -1;
  defineProp({
    name: `${name}Map`,
    defaultValue: null,
    dirtyShaderFunc: (oldValue, newValue) => {
      return !!oldValue !== !!newValue || oldValue && (oldValue.type !== newValue.type || oldValue.format !== newValue.format);
    },
    onSet: markMapTransformsDirty
  });
  defineProp({
    name: `${name}MapTiling`,
    defaultValue: new Vec2(1, 1),
    dirtyShaderFunc: () => false,
    onSet: markMapTransformsDirty,
    onGet: markMapTransformsMutable
  });
  defineProp({
    name: `${name}MapOffset`,
    defaultValue: new Vec2(0, 0),
    dirtyShaderFunc: () => false,
    onSet: markMapTransformsDirty,
    onGet: markMapTransformsMutable
  });
  defineProp({
    name: `${name}MapRotation`,
    defaultValue: 0,
    dirtyShaderFunc: () => false,
    onSet: markMapTransformsDirty
  });
  defineProp({
    name: `${name}MapUv`,
    defaultValue: uv,
    onSet: markMapTransformsDirty
  });
  if (channel) {
    defineProp({
      name: `${name}MapChannel`,
      defaultValue: channel
    });
    if (vertexColor) {
      defineProp({
        name: `${name}VertexColor`,
        defaultValue: false
      });
      defineProp({
        name: `${name}VertexColorChannel`,
        defaultValue: channel
      });
    }
  }
  const mapTiling = `${name}MapTiling`;
  const mapOffset = `${name}MapOffset`;
  const mapRotation = `${name}MapRotation`;
  const mapTransform = `${name}MapTransform`;
  defineUniform(mapTransform, (material, device, scene) => {
    const tiling = material[`_${mapTiling}`];
    const offset = material[`_${mapOffset}`];
    const rotation = material[`_${mapRotation}`];
    if (tiling.x === 1 && tiling.y === 1 && offset.x === 0 && offset.y === 0 && rotation === 0) {
      return null;
    }
    const uniform = material._allocUniform(mapTransform, () => {
      return [{
        name: `texture_${mapTransform}0`,
        value: new Float32Array(3)
      }, {
        name: `texture_${mapTransform}1`,
        value: new Float32Array(3)
      }];
    });
    const cr = Math.cos(rotation * math.DEG_TO_RAD);
    const sr = Math.sin(rotation * math.DEG_TO_RAD);
    const uniform0 = uniform[0].value;
    uniform0[0] = cr * tiling.x;
    uniform0[1] = -sr * tiling.y;
    uniform0[2] = offset.x;
    const uniform1 = uniform[1].value;
    uniform1[0] = sr * tiling.x;
    uniform1[1] = cr * tiling.y;
    uniform1[2] = 1 - tiling.y - offset.y;
    return uniform;
  });
}
function _defineColor(name, defaultValue) {
  defineProp({
    name,
    defaultValue,
    dirtyShaderFunc: () => false
  });
  defineUniform(name, (material, device, scene) => {
    const uniform = material._allocUniform(name, () => new Float32Array(3));
    const color = material[`_${name}`];
    _tempColor.linear(color);
    uniform[0] = _tempColor.r;
    uniform[1] = _tempColor.g;
    uniform[2] = _tempColor.b;
    return uniform;
  });
}
function _defineFloat(name, defaultValue, getUniformFunc) {
  defineProp({
    name,
    defaultValue,
    dirtyShaderFunc: (oldValue, newValue) => {
      return (oldValue === 0 || oldValue === 1) !== (newValue === 0 || newValue === 1);
    }
  });
  defineUniform(name, getUniformFunc);
}
function _defineObject(name, getUniformFunc) {
  defineProp({
    name,
    defaultValue: null,
    dirtyShaderFunc: (oldValue, newValue) => {
      return !!oldValue === !!newValue;
    }
  });
  defineUniform(name, getUniformFunc);
}
function _defineFlag(name, defaultValue) {
  defineProp({
    name,
    defaultValue
  });
}
function _defineMaterialProps() {
  _defineColor("ambient", new Color(1, 1, 1));
  _defineColor("diffuse", new Color(1, 1, 1));
  _defineColor("specular", new Color(0, 0, 0));
  _defineColor("emissive", new Color(0, 0, 0));
  _defineColor("sheen", new Color(1, 1, 1));
  _defineColor("attenuation", new Color(1, 1, 1));
  _defineFloat("emissiveIntensity", 1);
  _defineFloat("specularityFactor", 1);
  _defineFloat("sheenGloss", 0);
  _defineFloat("gloss", 0.25);
  _defineFloat("aoIntensity", 1);
  _defineFloat("heightMapFactor", 1, (material, device, scene) => {
    return material.heightMapFactor * 0.1;
  });
  defineProp({
    name: "heightMapBase",
    defaultValue: 0.5,
    dirtyShaderFunc: () => false
  });
  _defineFloat("parallaxSamples", 16);
  definePropInternal("parallaxShadowSamples", () => 0, function(value) {
    if (this._parallaxShadowSamples !== value) {
      if (this._parallaxShadowSamples === 0 !== (value === 0)) {
        this._dirtyShader = true;
      }
      this._parallaxShadowSamples = value;
    }
  });
  _defineFloat("opacity", 1);
  _defineFloat("alphaFade", 1);
  defineProp({
    name: "alphaDither",
    defaultValue: null,
    dirtyShaderFunc: () => false,
    getterFunc: function() {
      return this._alphaDither ?? this._opacity;
    }
  });
  _defineFloat("alphaTest", 0);
  _defineFloat("bumpiness", 1);
  _defineFloat("normalDetailMapBumpiness", 1);
  _defineFloat("reflectivity", 1);
  _defineFloat("occludeSpecularIntensity", 1);
  _defineFloat("refraction", 0);
  _defineFloat("refractionIndex", 1 / 1.5, (material, device, scene) => {
    return Math.max(1e-3, material.refractionIndex);
  });
  _defineFloat("dispersion", 0);
  _defineFloat("thickness", 0);
  _defineFloat("attenuationDistance", 0);
  _defineFloat("metalness", 1);
  _defineFloat("anisotropyIntensity", 0);
  _defineFloat("anisotropyRotation", 0);
  _defineFloat("clearCoat", 0);
  _defineFloat("clearCoatGloss", 1);
  _defineFloat("clearCoatBumpiness", 1);
  _defineFloat("aoUvSet", 0, null);
  _defineFloat("iridescence", 0);
  _defineFloat("iridescenceRefractionIndex", 1 / 1.5);
  _defineFloat("iridescenceThicknessMin", 0);
  _defineFloat("iridescenceThicknessMax", 0);
  _defineObject("ambientSH");
  _defineObject("cubeMapProjectionBox", (material, device, scene) => {
    const uniform = material._allocUniform("cubeMapProjectionBox", () => {
      return [{
        name: "envBoxMin",
        value: new Float32Array(3)
      }, {
        name: "envBoxMax",
        value: new Float32Array(3)
      }];
    });
    const bboxMin = material.cubeMapProjectionBox.getMin();
    const minUniform = uniform[0].value;
    minUniform[0] = bboxMin.x;
    minUniform[1] = bboxMin.y;
    minUniform[2] = bboxMin.z;
    const bboxMax = material.cubeMapProjectionBox.getMax();
    const maxUniform = uniform[1].value;
    maxUniform[0] = bboxMax.x;
    maxUniform[1] = bboxMax.y;
    maxUniform[2] = bboxMax.z;
    return uniform;
  });
  _defineFlag("specularityFactorTint", false);
  _defineFlag("useMetalness", false);
  _defineFlag("useMetalnessSpecularColor", false);
  _defineFlag("useSheen", false);
  _defineFlag("enableGGXSpecular", false);
  _defineFlag("occludeDirect", false);
  _defineFlag("opacityFadesSpecular", true);
  _defineFlag("occludeSpecular", SPECOCC_AO);
  _defineFlag("fresnelModel", FRESNEL_SCHLICK);
  _defineFlag("useDynamicRefraction", false);
  _defineFlag("cubeMapProjection", CUBEPROJ_NONE);
  _defineFlag("useFog", true);
  _defineFlag("useLighting", true);
  _defineFlag("useTonemap", true);
  _defineFlag("useSkybox", true);
  _defineFlag("forceUv1", false);
  _defineFlag("pixelSnap", false);
  _defineFlag("twoSidedLighting", false);
  _defineFlag("nineSlicedMode", void 0);
  _defineFlag("msdfTextAttribute", false);
  _defineFlag("useIridescence", false);
  _defineFlag("glossInvert", false);
  _defineFlag("sheenGlossInvert", false);
  _defineFlag("clearCoatGlossInvert", false);
  _defineFlag("parallaxMode", PARALLAX_OFFSET);
  _defineFlag("opacityDither", DITHER_NONE);
  _defineFlag("opacityShadowDither", DITHER_NONE);
  _defineFlag("shadowCatcher", false);
  _defineFlag("vertexColorGamma", false);
  _defineTex2D("diffuse");
  _defineTex2D("specular");
  _defineTex2D("emissive");
  _defineTex2D("thickness", "g");
  _defineTex2D("specularityFactor", "g");
  _defineTex2D("normal", "");
  _defineTex2D("metalness", "g");
  _defineTex2D("gloss", "g");
  _defineTex2D("opacity", "a");
  _defineTex2D("refraction", "g");
  _defineTex2D("height", "g", false);
  _defineTex2D("ao", "g");
  _defineTex2D("light", "rgb", true, 1);
  _defineTex2D("msdf", "");
  _defineTex2D("diffuseDetail", "rgb", false);
  _defineTex2D("normalDetail", "");
  _defineTex2D("aoDetail", "g", false);
  _defineTex2D("clearCoat", "g");
  _defineTex2D("clearCoatGloss", "g");
  _defineTex2D("clearCoatNormal", "");
  _defineTex2D("sheen", "rgb");
  _defineTex2D("sheenGloss", "g");
  _defineTex2D("iridescence", "g");
  _defineTex2D("iridescenceThickness", "g");
  _defineTex2D("anisotropy", "");
  _defineFlag("diffuseDetailMode", DETAILMODE_MUL);
  _defineFlag("aoDetailMode", DETAILMODE_MUL);
  _defineObject("cubeMap");
  _defineObject("sphereMap");
  _defineObject("envAtlas");
  const getterFunc = function() {
    return this._prefilteredCubemaps;
  };
  const setterFunc = function(value) {
    const cubemaps = this._prefilteredCubemaps;
    value = value || [];
    let changed = false;
    let complete = true;
    for (let i = 0; i < 6; ++i) {
      const v = value[i] || null;
      if (cubemaps[i] !== v) {
        cubemaps[i] = v;
        changed = true;
      }
      complete = complete && !!cubemaps[i];
    }
    if (changed) {
      if (complete) {
        this.envAtlas = EnvLighting.generatePrefilteredAtlas(cubemaps, {
          target: this.envAtlas
        });
      } else {
        if (this.envAtlas) {
          this.envAtlas.destroy();
          this.envAtlas = null;
        }
      }
      this._dirtyShader = true;
    }
  };
  const empty = [null, null, null, null, null, null];
  definePropInternal("prefilteredCubemaps", () => empty.slice(), setterFunc, getterFunc);
}
_defineMaterialProps();
function _defineDeprecatedAlias(newName, oldName) {
  Object.defineProperty(StandardMaterial.prototype, oldName, {
    get: function() {
      Debug.deprecated(`StandardMaterial#${oldName} is deprecated. Use StandardMaterial#${newName} instead.`);
      return this[newName];
    },
    set: function(value) {
      Debug.deprecated(`StandardMaterial#${oldName} is deprecated. Use StandardMaterial#${newName} instead.`);
      this[newName] = value;
    }
  });
}
function _defineRemovedTint(name) {
  Object.defineProperty(StandardMaterial.prototype, name, {
    get: function() {
      Debug.removed(`StandardMaterial#${name} was removed, and the behaviour is as if ${name} was always true`);
      return true;
    },
    set: function(value) {
      Debug.removed(`StandardMaterial#${name} was removed, and the behaviour is as if ${name} was always true`);
    }
  });
}
_defineRemovedTint("sheenTint");
_defineRemovedTint("diffuseTint");
_defineRemovedTint("emissiveTint");
_defineRemovedTint("ambientTint");
_defineRemovedTint("specularTint");
_defineDeprecatedAlias("aoVertexColor", "aoMapVertexColor");
_defineDeprecatedAlias("diffuseVertexColor", "diffuseMapVertexColor");
_defineDeprecatedAlias("specularVertexColor", "specularMapVertexColor");
_defineDeprecatedAlias("emissiveVertexColor", "emissiveMapVertexColor");
_defineDeprecatedAlias("metalnessVertexColor", "metalnessMapVertexColor");
_defineDeprecatedAlias("glossVertexColor", "glossMapVertexColor");
_defineDeprecatedAlias("opacityVertexColor", "opacityMapVertexColor");
_defineDeprecatedAlias("lightVertexColor", "lightMapVertexColor");
_defineDeprecatedAlias("sheenGloss", "sheenGlossiness");
_defineDeprecatedAlias("clearCoatGloss", "clearCoatGlossiness");
export {
  StandardMaterial
};
