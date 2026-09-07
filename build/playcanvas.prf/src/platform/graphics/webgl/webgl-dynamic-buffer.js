import { DynamicBuffer } from "../dynamic-buffer.js";
class WebglDynamicBuffer extends DynamicBuffer {
	bufferId = null;
	storage;
	size;
	constructor(device, size) {
		super(device);
		this.size = size;
		this.storage = new Int32Array(size / 4);
		device._vram.ub += size;
	}
	destroy(device) {
		if (this.bufferId) {
			device.gl.deleteBuffer(this.bufferId);
			this.bufferId = null;
		}
		device._vram.ub -= this.size;
	}
	loseContext() {
		this.bufferId = null;
	}
	upload() {
		const gl = this.device.gl;
		if (!this.bufferId) {
			this.bufferId = gl.createBuffer();
		}
		gl.bindBuffer(gl.UNIFORM_BUFFER, this.bufferId);
		gl.bufferData(gl.UNIFORM_BUFFER, this.storage, gl.STREAM_DRAW);
	}
}
export {
	WebglDynamicBuffer
};
