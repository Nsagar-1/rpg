export class TemplateHandler extends ResourceHandler {
    constructor(app: any);
    /**
     * TextDecoder for decoding binary data.
     *
     * @type {TextDecoder|null}
     * @private
     */
    private decoder;
    /**
     * Parses raw DataView and returns string.
     *
     * @param {DataView} data - The raw data as a DataView
     * @returns {Template} The parsed resource data.
     */
    openBinary(data: DataView): Template;
    patch(asset: any, registry: any): void;
}
import { ResourceHandler } from './handler.js';
import { Template } from '../template.js';
