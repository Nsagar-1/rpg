import { DynamicBuffer } from "../dynamic-buffer.js";
import { DynamicBuffers } from "../dynamic-buffers.js";
class NullDynamicBuffers extends DynamicBuffers {
	buffer;
	constructor(device) {
		super(device, 0, 0);
		this.buffer = new DynamicBuffer(device);
	}
	alloc(allocation, size) {
		allocation.gpuBuffer = this.buffer;
		allocation.offset = 0;
		allocation.storage = new Int32Array(size / 4);
	}
}
export {
	NullDynamicBuffers
};
