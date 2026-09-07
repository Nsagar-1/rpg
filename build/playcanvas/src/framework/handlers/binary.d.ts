export class BinaryHandler extends ResourceHandler {
    constructor(app: any);
    /**
     * Parses raw DataView and returns ArrayBuffer.
     *
     * @param {DataView} data - The raw data as a DataView
     * @returns {ArrayBuffer} The parsed resource data.
     */
    openBinary(data: DataView): ArrayBuffer;
}
import { ResourceHandler } from './handler.js';
