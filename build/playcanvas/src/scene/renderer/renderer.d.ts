/**
 * The base renderer functionality to allow implementation of specialized renderers.
 *
 * @ignore
 */
export class Renderer {
    /**
     * Create a new instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used by the renderer.
     * @param {Scene} scene - The scene.
     */
    constructor(graphicsDevice: GraphicsDevice, scene: Scene);
    /** @type {boolean} */
    clustersDebugRendered: boolean;
    /** @type {Scene} */
    scene: Scene;
    /**
     * The scene visibility culler: per-camera light visibility, mesh-instance culling (request /
     * execute) and shadow-caster culling.
     *
     * @type {Culler}
     * @ignore
     */
    culler: Culler;
    /**
     * @type {WorldClustersAllocator}
     * @ignore
     */
    worldClustersAllocator: WorldClustersAllocator;
    /**
     * A list of all unique lights in the layer composition.
     *
     * @type {Light[]}
     */
    lights: Light[];
    /**
     * A list of all unique local lights (spot & omni) in the layer composition.
     *
     * @type {Light[]}
     */
    localLights: Light[];
    /**
     * Shared non-persistent view uniform buffers, keyed by their uniform format. Reused every frame,
     * with the bind group and dynamic offset sourced from the dynamic buffer system.
     *
     * @type {WeakMap<UniformBufferFormat, UniformBuffer>}
     */
    _viewUniformBuffers: WeakMap<UniformBufferFormat, UniformBuffer>;
    /**
     * Reusable receiver for a view uniform buffer's dynamic bind group + offset.
     *
     * @type {DynamicBindGroup}
     */
    _dynamicViewBindGroup: DynamicBindGroup;
    /**
     * Per-view dynamic bind groups, captured during multiview view-uniform setup (allocations may
     * span dynamic buffers, so the bind group is captured per view alongside its offset).
     *
     * @type {BindGroup[]}
     */
    _viewBindGroups: BindGroup[];
    /** @type {number[]} */
    _viewBindGroupOffsets: number[];
    /**
     * Reused single-element array passed as the dynamic offsets to per-view setBindGroup, to avoid
     * per-draw allocation.
     *
     * @type {number[]}
     */
    _viewOffsetScratch: number[];
    blueNoise: BlueNoise;
    /**
     * A gsplat director for unified splat rendering.
     *
     * @type {GSplatDirector|null}
     */
    gsplatDirector: GSplatDirector | null;
    device: GraphicsDevice;
    lightTextureAtlas: LightTextureAtlas;
    shadowMapCache: ShadowMapCache;
    shadowRenderer: ShadowRenderer;
    _shadowRendererLocal: ShadowRendererLocal;
    _shadowRendererDirectional: ShadowRendererDirectional;
    _renderPassUpdateClustered: FramePassUpdateClustered;
    viewUniformFormat: UniformBufferFormat;
    _skinTime: number;
    _morphTime: number;
    _cullTime: number;
    _shadowMapTime: number;
    _lightClustersTime: number;
    _layerCompositionUpdateTime: number;
    _shadowDrawCalls: number;
    _skinDrawCalls: number;
    _instancedDrawCalls: number;
    _shadowMapUpdates: number;
    _numDrawCallsCulled: number;
    _camerasRendered: number;
    _lightClusters: number;
    _gsplatCount: number;
    boneTextureId: import("../../index.js").ScopeId;
    modelMatrixId: import("../../index.js").ScopeId;
    normalMatrixId: import("../../index.js").ScopeId;
    viewInvId: import("../../index.js").ScopeId;
    viewPos: Float32Array<ArrayBuffer>;
    viewPosId: import("../../index.js").ScopeId;
    projId: import("../../index.js").ScopeId;
    projSkyboxId: import("../../index.js").ScopeId;
    viewId: import("../../index.js").ScopeId;
    viewId3: import("../../index.js").ScopeId;
    viewProjId: import("../../index.js").ScopeId;
    flipYId: import("../../index.js").ScopeId;
    tbnBasis: import("../../index.js").ScopeId;
    cameraParams: Float32Array<ArrayBuffer>;
    cameraParamsId: import("../../index.js").ScopeId;
    viewportSize: Float32Array<ArrayBuffer>;
    viewportSizeId: import("../../index.js").ScopeId;
    viewIndexId: import("../../index.js").ScopeId;
    blueNoiseJitterVersion: number;
    blueNoiseJitterVec: Vec4;
    blueNoiseJitterData: Float32Array<ArrayBuffer>;
    blueNoiseJitterId: import("../../index.js").ScopeId;
    blueNoiseTextureId: import("../../index.js").ScopeId;
    alphaTestId: import("../../index.js").ScopeId;
    opacityMapId: import("../../index.js").ScopeId;
    exposureId: import("../../index.js").ScopeId;
    morphPositionTex: import("../../index.js").ScopeId;
    morphNormalTex: import("../../index.js").ScopeId;
    morphTexParams: import("../../index.js").ScopeId;
    lightCube: LightCube;
    constantLightCube: import("../../index.js").ScopeId;
    destroy(): void;
    /**
     * Set up the viewport and the scissor for camera rendering.
     *
     * @param {Camera} camera - The camera containing the viewport information.
     * @param {RenderTarget} [renderTarget] - The render target. NULL for the default one.
     */
    setupViewport(camera: Camera, renderTarget?: RenderTarget): void;
    setCameraUniforms(camera: any, target: any): any;
    /**
     * Clears the active render target. If the viewport is already set up, only its area is cleared.
     *
     * @param {Camera} camera - The camera supplying the value to clear to.
     * @param {boolean} [clearColor] - True if the color buffer should be cleared. Uses the value
     * from the camera if not supplied.
     * @param {boolean} [clearDepth] - True if the depth buffer should be cleared. Uses the value
     * from the camera if not supplied.
     * @param {boolean} [clearStencil] - True if the stencil buffer should be cleared. Uses the
     * value from the camera if not supplied.
     */
    clear(camera: Camera, clearColor?: boolean, clearDepth?: boolean, clearStencil?: boolean): void;
    setupCullModeAndFrontFace(cullFaces: any, flipFactor: any, drawCall: any): void;
    setupCullMode(cullFaces: any, flipFactor: any, drawCall: any): void;
    setBaseConstants(device: any, material: any): void;
    updateCpuSkinMatrices(drawCalls: any): void;
    /**
     * Update skin matrices ahead of rendering.
     *
     * @param {MeshInstance[]|Set<MeshInstance>} drawCalls - MeshInstances containing skinInstance.
     * @ignore
     */
    updateGpuSkinMatrices(drawCalls: MeshInstance[] | Set<MeshInstance>): void;
    /**
     * Update morphing ahead of rendering.
     *
     * @param {MeshInstance[]|Set<MeshInstance>} drawCalls - MeshInstances containing morphInstance.
     * @ignore
     */
    updateMorphing(drawCalls: MeshInstance[] | Set<MeshInstance>): void;
    /**
     * Update gsplats ahead of rendering.
     *
     * @param {MeshInstance[]|Set<MeshInstance>} drawCalls - MeshInstances containing gsplatInstances.
     * @ignore
     */
    updateGSplats(drawCalls: MeshInstance[] | Set<MeshInstance>): void;
    /**
     * Update draw calls ahead of rendering.
     *
     * @param {MeshInstance[]|Set<MeshInstance>} drawCalls - MeshInstances requiring updates.
     * @ignore
     */
    gpuUpdate(drawCalls: MeshInstance[] | Set<MeshInstance>): void;
    setVertexBuffers(device: any, mesh: any): void;
    setMorphing(device: any, morphInstance: any): void;
    setSkinning(device: any, meshInstance: any): void;
    dispatchViewPos(position: any): void;
    initViewUniformFormat(isClustered: any): void;
    /**
     * Set up uniforms for an XR view.
     */
    setupViewUniforms(view: any, index: any): void;
    /**
     * Returns the shared non-persistent view uniform buffer for the given format, creating it on
     * first use. It is bound via the dynamic buffer system, so it needs no explicit bind group.
     *
     * @param {UniformBufferFormat} viewUniformFormat - The view uniform buffer format.
     * @returns {UniformBuffer} The shared view uniform buffer.
     */
    getViewUniformBuffer(viewUniformFormat: UniformBufferFormat): UniformBuffer;
    /**
     * Sets up the shared (per-format) view uniform buffer for the current camera. For a single view
     * it updates the buffer and binds it immediately; for multiview (XR) it updates the buffer per
     * view and captures the per-view bind group and dynamic offset, which the forward render loop
     * then binds per draw. The bind group and dynamic offset come from the dynamic buffer system.
     *
     * @param {UniformBufferFormat} viewUniformFormat - The view uniform buffer format.
     * @param {RenderView[]|null} viewList - The list of XR views for multiview, or null for a
     * single view.
     */
    setupViewUniformBuffers(viewUniformFormat: UniformBufferFormat, viewList: RenderView[] | null): void;
    setupMeshUniformBuffers(shaderInstance: any): void;
    setMeshInstanceMatrices(meshInstance: any, setNormalMatrix?: boolean): void;
    collectLights(comp: any): void;
    /**
     * @param {MeshInstance[]} drawCalls - Mesh instances.
     * @param {boolean} onlyLitShaders - Limits the update to shaders affected by lighting.
     */
    updateShaders(drawCalls: MeshInstance[], onlyLitShaders: boolean): void;
    updateFrameUniforms(): void;
    /**
     * @param {LayerComposition} comp - The layer composition to update.
     */
    beginFrame(comp: LayerComposition): void;
    updateLightTextureAtlas(): void;
    /**
     * Updates the layer composition for rendering.
     *
     * @param {LayerComposition} comp - The layer composition to update.
     */
    updateLayerComposition(comp: LayerComposition): void;
    frameUpdate(): void;
}
import type { Scene } from '../scene.js';
import { Culler } from './culler.js';
import { WorldClustersAllocator } from './world-clusters-allocator.js';
import type { Light } from '../light.js';
import { UniformBufferFormat } from '../../platform/graphics/uniform-buffer-format.js';
import { UniformBuffer } from '../../platform/graphics/uniform-buffer.js';
import { DynamicBindGroup } from '../../platform/graphics/bind-group.js';
import type { BindGroup } from '../../platform/graphics/bind-group.js';
import { BlueNoise } from '../../core/math/blue-noise.js';
import type { GSplatDirector } from '../gsplat-unified/gsplat-director.js';
import type { GraphicsDevice } from '../../platform/graphics/graphics-device.js';
import { LightTextureAtlas } from '../lighting/light-texture-atlas.js';
import { ShadowMapCache } from './shadow-map-cache.js';
import { ShadowRenderer } from './shadow-renderer.js';
import { ShadowRendererLocal } from './shadow-renderer-local.js';
import { ShadowRendererDirectional } from './shadow-renderer-directional.js';
import { FramePassUpdateClustered } from './frame-pass-update-clustered.js';
import { Vec4 } from '../../core/math/vec4.js';
import { LightCube } from '../graphics/light-cube.js';
import { Camera } from '../camera.js';
import type { RenderTarget } from '../../platform/graphics/render-target.js';
import type { MeshInstance } from '../mesh-instance.js';
import type { RenderView } from '../render-view.js';
import type { LayerComposition } from '../composition/layer-composition.js';
