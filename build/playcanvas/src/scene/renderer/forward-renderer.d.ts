/**
 * The forward renderer renders {@link Scene}s.
 *
 * @ignore
 */
export class ForwardRenderer extends Renderer {
    static skipRenderCamera: any;
    static _skipRenderCounter: number;
    static skipRenderAfter: number;
    _forwardDrawCalls: number;
    _materialSwitches: number;
    _depthMapTime: number;
    _forwardTime: number;
    _sortTime: number;
    fogColorId: import("../../index.js").ScopeId;
    fogStartId: import("../../index.js").ScopeId;
    fogEndId: import("../../index.js").ScopeId;
    fogDensityId: import("../../index.js").ScopeId;
    ambientId: import("../../index.js").ScopeId;
    skyboxIntensityId: import("../../index.js").ScopeId;
    cubeMapRotationMatrixId: import("../../index.js").ScopeId;
    pcssDiskSamplesId: import("../../index.js").ScopeId;
    pcssSphereSamplesId: import("../../index.js").ScopeId;
    lightColorId: any[];
    lightDir: any[];
    lightDirId: any[];
    lightShadowMapId: any[];
    lightShadowMatrixId: any[];
    lightShadowParamsId: any[];
    lightShadowIntensity: any[];
    lightRadiusId: any[];
    lightPos: any[];
    lightPosId: any[];
    lightWidth: any[];
    lightWidthId: any[];
    lightHeight: any[];
    lightHeightId: any[];
    lightInAngleId: any[];
    lightOutAngleId: any[];
    lightCookieId: any[];
    lightCookieIntId: any[];
    lightCookieMatrixId: any[];
    lightCookieOffsetId: any[];
    lightShadowSearchAreaId: any[];
    lightCameraParamsId: any[];
    lightSoftShadowParamsId: any[];
    shadowMatrixPaletteId: any[];
    shadowCascadeDistancesId: any[];
    shadowCascadeCountId: any[];
    shadowCascadeBlendId: any[];
    shadowCascadeRadiiId: any[];
    screenSizeId: import("../../index.js").ScopeId;
    _screenSize: Float32Array<ArrayBuffer>;
    fogColor: Float32Array<ArrayBuffer>;
    ambientColor: Float32Array<ArrayBuffer>;
    pcssDiskSamples: number[];
    pcssSphereSamples: number[];
    /**
     * @param {Scene} scene - The scene.
     */
    dispatchGlobalLights(scene: Scene): void;
    _resolveLight(scope: any, i: any): void;
    setLTCDirectionalLight(wtm: any, cnt: any, dir: any, campos: any, far: any): void;
    dispatchDirectLights(dirs: any, mask: any, camera: any): number;
    setLTCPositionalLight(wtm: any, cnt: any): void;
    dispatchOmniLight(scope: any, omni: any, cnt: any): void;
    dispatchSpotLight(scope: any, spot: any, cnt: any): void;
    dispatchLocalLights(sortedLights: any, mask: any, usedDirLights: any): void;
    renderForwardPrepareMaterials(camera: any, renderTarget: any, drawCalls: any, sortedLights: any, layer: any, pass: any, viewUniformFormat: any): {
        drawCalls: any[];
        shaderInstances: any[];
        isNewMaterial: any[];
        lightMaskChanged: any[];
        clear: () => void;
    };
    renderForwardInternal(camera: any, preparedCalls: any, sortedLights: any, pass: any, drawCallback: any, flipFaces: any): void;
    renderForward(camera: any, renderTarget: any, allDrawCalls: any, sortedLights: any, pass: any, drawCallback: any, layer: any, flipFaces: any, viewUniformFormat: any): void;
    /**
     * Forward render mesh instances on a specified layer, using a camera and a render target.
     * Shaders used are based on the shaderPass provided, with optional clustered lighting support.
     *
     * @param {Camera} camera - The camera.
     * @param {RenderTarget|undefined} renderTarget - The render target.
     * @param {Layer} layer - The layer.
     * @param {boolean} transparent - True if transparent sublayer should be rendered, opaque
     * otherwise.
     * @param {number} shaderPass - A type of shader to use during rendering.
     * @param {object} [options] - Object for passing optional arguments.
     * @param {boolean} [options.clearColor] - True if the color buffer should be cleared.
     * @param {boolean} [options.clearDepth] - True if the depth buffer should be cleared.
     * @param {boolean} [options.clearStencil] - True if the stencil buffer should be cleared.
     * @param {WorldClusters} [options.lightClusters] - The world clusters object to be used for
     * clustered lighting.
     * @param {MeshInstance[]} [options.meshInstances] - The mesh instances to be rendered. Use
     * when layer is not provided.
     * @param {object} [options.splitLights] - The split lights to be used for clustered lighting.
     * @param {Function} [options.drawCallback] - Function called before each mesh instance is
     * rendered, with the mesh instance as the argument.
     * @param {UniformBufferFormat} [options.viewUniformFormat] - A custom view uniform buffer
     * format to use for this layer. When not provided, the renderer's default view uniform format
     * is used. The shaders are processed and the view uniform buffer is set up using the same
     * format, so they always match.
     */
    renderForwardLayer(camera: Camera, renderTarget: RenderTarget | undefined, layer: Layer, transparent: boolean, shaderPass: number, options?: {
        clearColor?: boolean;
        clearDepth?: boolean;
        clearStencil?: boolean;
        lightClusters?: WorldClusters;
        meshInstances?: MeshInstance[];
        splitLights?: object;
        drawCallback?: Function;
        viewUniformFormat?: UniformBufferFormat;
    }): void;
    setFogConstants(fogParams: any): void;
    setSceneConstants(): void;
    /**
     * Builds a frame graph for the rendering of the whole frame.
     *
     * @param {FrameGraph} frameGraph - The frame-graph that is built.
     * @param {LayerComposition} layerComposition - The layer composition used to build the frame
     * graph.
     * @ignore
     */
    buildFrameGraph(frameGraph: FrameGraph, layerComposition: LayerComposition): void;
    /**
     * @param {any} camera - The camera component for the current render action. The XR data lives on
     * the underlying `Camera` (`CameraComponent.camera`), as `xrActive` / `xrViews`, not on the
     * component itself, so we dereference it before checking.
     * @returns {boolean} True if the camera should have its passes replicated per XR view (currently
     * gated to the WebGPU backend; other backends keep the existing single-pass multi-viewport flow).
     * @private
     */
    private _isMultiview;
    /**
     * @param {FrameGraph} frameGraph - The frame graph.
     * @param {LayerComposition} layerComposition - The layer composition.
     */
    addMainRenderPass(frameGraph: FrameGraph, layerComposition: LayerComposition, renderTarget: any, startIndex: any, endIndex: any): void;
    /**
     * Build a {@link LayerRenderStep} from a composition {@link RenderAction}. This is the only
     * place that bridges the internal RenderAction scheduling type to the render pass's own
     * LayerRenderStep, so neither RenderPassForward nor LayerRenderStep reference RenderAction.
     *
     * @param {RenderAction} renderAction - The composition render action.
     * @returns {LayerRenderStep} The layer render step.
     * @private
     */
    private _layerRenderStepFromRenderAction;
    /**
     * @param {LayerComposition} comp - The layer composition.
     */
    update(comp: LayerComposition): void;
    /**
     * Visibility culling of mesh instances and shadow casters, followed by GPU data updates for the
     * resulting visible objects, and consuming one-shot shadow updates. Runs after the frame graph
     * has been built (which is itself after {@link ForwardRenderer#update}), so shadow-pass building
     * and shadow-caster culling have both read the shadow update mode before it is consumed here.
     *
     * @param {LayerComposition} comp - The layer composition.
     */
    cull(comp: LayerComposition): void;
}
import { Renderer } from './renderer.js';
import type { Scene } from '../scene.js';
import type { Camera } from '../camera.js';
import type { RenderTarget } from '../../platform/graphics/render-target.js';
import type { Layer } from '../layer.js';
import type { WorldClusters } from '../lighting/world-clusters.js';
import type { MeshInstance } from '../mesh-instance.js';
import type { UniformBufferFormat } from '../../platform/graphics/uniform-buffer-format.js';
import type { FrameGraph } from '../frame-graph.js';
import type { LayerComposition } from '../composition/layer-composition.js';
