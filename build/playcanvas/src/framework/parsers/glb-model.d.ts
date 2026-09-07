export class GlbModelParser {
    constructor(modelHandler: any);
    _device: any;
    _defaultMaterial: any;
    _assets: any;
    canParse(context: any): boolean;
    load(url: any, callback: any, asset: any): void;
    parse(data: any, callback: any, asset: any): void;
}
