declare const _default: "\n\n    // global texture bias for standard textures\n    // note: unlike GLSL, the tiled nine-slice mode does not force the top mip here, as the chunks\n    // reference this as 'uniform.textureBias' and so it needs to be a real uniform\n    uniform textureBias: f32;\n\n    #include \"litShaderArgsPS\"\n";
export default _default;
