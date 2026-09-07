/**
 * A vertex buffer is the mechanism via which the application specifies vertex data to the graphics
 * hardware.
 *
 * @category Graphics
 */
export class VertexBuffer {
    /**
     * Create a new VertexBuffer instance.
     *
     * @param {GraphicsDevice} graphicsDevice - The graphics device used to manage this vertex
     * buffer.
     * @param {VertexFormat} format - The vertex format of this vertex buffer.
     * @param {number} numVertices - The number of vertices that this vertex buffer will hold.
     * @param {object} [options] - Object for passing optional arguments.
     * @param {number} [options.usage] - The usage type of the vertex buffer (see BUFFER_*).
     * Defaults to BUFFER_STATIC.
     * @param {ArrayBuffer|ArrayBufferView} [options.data] - Initial data. Can be an
     * {@link ArrayBuffer} or a typed array (for example a {@link Float32Array}). The data is
     * stored by reference and is not copied, so a typed array that is a view into a larger buffer
     * is kept as-is. If left unspecified, the vertex buffer will be initialized to zeros.
     * @param {boolean} [options.storage] - Defines if the vertex buffer can be used as a storage
     * buffer by a compute shader. Defaults to false. Only supported on WebGPU.
     */
    constructor(graphicsDevice: GraphicsDevice, format: VertexFormat, numVertices: number, options?: {
        usage?: number;
        data?: ArrayBuffer | ArrayBufferView;
        storage?: boolean;
    }, ...args: any[]);
    usage: number;
    /**
     * Lazily evaluated cache of {@link VertexBuffer#vaoKeyPart}.
     *
     * @type {string|null}
     * @private
     */
    private _vaoKeyPart;
    device: GraphicsDevice;
    format: VertexFormat;
    numVertices: number;
    id: number;
    impl: any;
    numBytes: number;
    storage: ArrayBuffer;
    /**
     * This buffer's contribution to the key of the device's vertex array object cache. It identifies
     * both the buffer and its format, and is delimited so that the parts of several buffers can be
     * concatenated without ambiguity.
     *
     * Evaluated lazily, as it is only needed by buffers taking part in a draw which uses more than
     * one vertex buffer, and most buffers never do. The format of a vertex buffer never changes, so
     * the value is safe to cache.
     *
     * @type {string}
     * @ignore
     */
    get vaoKeyPart(): string;
    /**
     * Frees resources associated with this vertex buffer.
     */
    destroy(): void;
    adjustVramSizeTracking(vram: any, size: any): void;
    /**
     * Called when the rendering context was lost. It releases all context related resources.
     *
     * @ignore
     */
    loseContext(): void;
    /**
     * Called when the rendering context is restored. Recreates the GPU buffer and uploads from
     * {@link VertexBuffer#lock|lock} storage.
     *
     * @ignore
     */
    restoreContext(): void;
    /**
     * Returns the data format of the specified vertex buffer.
     *
     * @returns {VertexFormat} The data format of the specified vertex buffer.
     */
    getFormat(): VertexFormat;
    /**
     * Returns the usage type of the specified vertex buffer. This indicates whether the buffer can
     * be modified once and used many times {@link BUFFER_STATIC}, modified repeatedly and used
     * many times {@link BUFFER_DYNAMIC} or modified once and used at most a few times
     * {@link BUFFER_STREAM}.
     *
     * @returns {number} The usage type of the vertex buffer (see BUFFER_*).
     */
    getUsage(): number;
    /**
     * Returns the number of vertices stored in the specified vertex buffer.
     *
     * @returns {number} The number of vertices stored in the vertex buffer.
     */
    getNumVertices(): number;
    /**
     * Returns a mapped memory block representing the content of the vertex buffer.
     *
     * @returns {ArrayBuffer|ArrayBufferView} The memory that stores the buffer's vertices. This
     * matches whatever was supplied as the initial data: an {@link ArrayBuffer} when none was
     * provided, otherwise the {@link ArrayBuffer} or typed array that was passed in. Use
     * {@link ArrayBuffer.isView} to distinguish the two before accessing it.
     */
    lock(): ArrayBuffer | ArrayBufferView;
    /**
     * Notifies the graphics engine that the client side copy of the vertex buffer's memory can be
     * returned to the control of the graphics driver.
     */
    unlock(): void;
    /**
     * Sets the data of the vertex buffer and uploads it to the GPU.
     *
     * @param {ArrayBuffer|ArrayBufferView} [data] - Source data. Can be an {@link ArrayBuffer} or
     * a typed array. Stored by reference, not copied.
     * @returns {boolean} True if function finished successfully, false otherwise.
     */
    setData(data?: ArrayBuffer | ArrayBufferView): boolean;
}
import type { GraphicsDevice } from './graphics-device.js';
import type { VertexFormat } from './vertex-format.js';
