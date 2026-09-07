var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
import { DynamicBuffer } from "../dynamic-buffer.js";
import { DynamicBuffers } from "../dynamic-buffers.js";
class NullDynamicBuffers extends DynamicBuffers {
  /**
   * @param {GraphicsDevice} device - The graphics device.
   */
  constructor(device) {
    super(device, 0, 0);
    /** @type {DynamicBuffer} */
    __publicField(this, "buffer");
    this.buffer = new DynamicBuffer(device);
  }
  /**
   * @param {DynamicBufferAllocation} allocation - The allocation info to fill.
   * @param {number} size - The size of the allocation.
   */
  alloc(allocation, size) {
    allocation.gpuBuffer = this.buffer;
    allocation.offset = 0;
    allocation.storage = new Int32Array(size / 4);
  }
}
export {
  NullDynamicBuffers
};
