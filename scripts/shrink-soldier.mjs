/**
 * Rebuilds asset/players/soldier_full_tactical_gear.glb into a web-sized public asset:
 * - decodes every embedded PNG with macOS `sips`, downscales, re-encodes as JPEG (baseColor)
 *   or PNG (normal maps, kept lossless)
 * - keeps ALL non-image buffer chunks (vertices, indices, skin inverse bind matrices) and
 *   re-offsets every bufferView, so accessors stay in range
 * - drops the 16s idle animation (2MB of keyframes replaced by procedural bone motion)
 * Usage: node scripts/shrink-soldier.mjs [maxDim=1024]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'asset/players/soldier_full_tactical_gear.glb');
const outFile = path.join(root, 'public/assets/models/player/soldier.glb');
const tmpDir = path.join(root, '.tmp-soldier-imgs');

const maxDim = Number(process.argv[2] ?? 1024);

const buf = fs.readFileSync(src);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen;
const binLen = buf.readUInt32LE(binStart);
const bin = buf.subarray(binStart + 8, binStart + 8 + binLen);

fs.rmSync(tmpDir, { recursive: true, force: true });
fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const isNormal = new Array(json.images.length).fill(false);
for (const mat of json.materials) {
    const nt = mat.normalTexture?.index;
    if (nt !== undefined) {
        isNormal[json.textures[nt].source] = true;
    }
}

/**
 * Rebuild buffer 0 one view at a time. Views whose data is an embedded image get re-encoded;
 * everything else (positions, indices, IBMs,…) is copied verbatim.
 *
 * @type {Map<number, Buffer>} viewIndex -> new bytes
 */
const newChunks = new Map();
let cursor = 0;

/**
 * @param {number} i - BufferView index.
 * @param {Buffer} data - Replacement bytes.
 */
const setChunk = (i, data) => {
    const padded = Math.ceil(data.length / 4) * 4;
    newChunks.set(i, Buffer.concat([data, Buffer.alloc(padded - data.length)]));
    cursor += padded;
};

for (let i = 0; i < json.images.length; i++) {
    const im = json.images[i];
    const view = json.bufferViews[im.bufferView];
    const start = view.byteOffset ?? 0;
    const inPath = path.join(tmpDir, `in-${i}.png`);
    fs.writeFileSync(inPath, bin.subarray(start, start + view.byteLength));

    const outPath = path.join(tmpDir, isNormal[i] ? `out-${i}.png` : `out-${i}.jpg`);
    execFileSync('sips', ['-s', 'format', isNormal[i] ? 'png' : 'jpeg', '-Z', String(maxDim), inPath, '--out', outPath], { stdio: 'pipe' });
    const data = fs.readFileSync(outPath);
    fs.rmSync(inPath);

    // Image views are private to the image; repoint them at fresh chunks.
    json.bufferViews[im.bufferView] = { buffer: 0, byteOffset: 0, byteLength: 0 };
    setChunk(im.bufferView, data);
    json.images[i] = { bufferView: im.bufferView, mimeType: isNormal[i] ? 'image/png' : 'image/jpeg' };
    console.log(`img ${i}: ${(view.byteLength / 1e6).toFixed(1)}MB -> ${(data.length / 1e3).toFixed(0)}KB`);
}
fs.rmSync(tmpDir, { recursive: true, force: true });

// The 16s idle pose adds 2MB of keyframes we never play — motion is procedural instead.
json.animations = [];

for (const [i, view] of json.bufferViews.entries()) {
    if (view.buffer !== 0) {
        continue;
    }
    if (!newChunks.has(i)) {
        const start = view.byteOffset ?? 0;
        setChunk(i, bin.subarray(start, start + view.byteLength));
    }
}

let offset = 0;
for (const [i, view] of json.bufferViews.entries()) {
    const chunk = newChunks.get(i);
    if (!chunk) {
        continue;
    }
    view.byteOffset = offset;
    view.byteLength = chunk.length;
    if (view.byteStride !== undefined && view.byteStride > chunk.length) {
        delete view.byteStride;
    }
    offset += chunk.length;
}

// Prune views we never repacked (animation data) so no accessor points past the buffer.
const kept = new Set(newChunks.keys());
const referenced = new Set();
const keepView = (i) => {
    if (i === undefined || !kept.has(i)) {
        return;
    }
    referenced.add(i);
};
for (const mesh of json.meshes) {
    for (const prim of mesh.primitives) {
        Object.values(prim.attributes).forEach(keepView);
        keepView(prim.indices);
        prim.targets?.forEach((t) => Object.values(t).forEach(keepView));
    }
}
for (const skin of json.skins) {
    keepView(skin.inverseBindMatrices);
}
for (const [i, view] of json.bufferViews.entries()) {
    if (kept.has(i) && !referenced.has(i) && view.byteLength > 0) {
        // Orphaned animation keyframe data — collapse it.
        newChunks.delete(i);
        view.byteLength = 0;
    }
}
// Re-close gaps after pruning.
let total = 0;
for (const [i, view] of json.bufferViews.entries()) {
    const chunk = newChunks.get(i);
    if (!chunk) {
        continue;
    }
    view.byteOffset = total;
    view.byteLength = chunk.length;
    total += chunk.length;
}

const binOut = Buffer.concat([...newChunks.entries()].sort((a, b) => json.bufferViews[a[0]].byteOffset - json.bufferViews[b[0]].byteOffset).map(([, c]) => c), total);
json.buffers = [{ byteLength: total }];

const jsonOut = Buffer.from(JSON.stringify(json));
const jsonPad = (4 - (jsonOut.length % 4)) % 4;
const binPad = (4 - (total % 4)) % 4;

const u32 = (/** @type {number} */ n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
};

const outFileBuf = Buffer.concat([
    Buffer.from('glTF'),
    u32(2),
    u32(12 + 8 + jsonOut.length + jsonPad + 8 + total + binPad),
    u32(jsonOut.length + jsonPad),
    Buffer.from('JSON'),
    jsonOut,
    Buffer.alloc(jsonPad, 0x20),
    u32(total + binPad),
    Buffer.from('BIN\0'),
    binOut,
    Buffer.alloc(binPad)
]);
fs.writeFileSync(outFile, outFileBuf);

// Sanity: every accessor must sit inside the rebuilt buffer.
let bad = 0;
for (const acc of json.accessors) {
    const view = json.bufferViews[acc.bufferView];
    if (!view || view.byteOffset + (acc.byteOffset ?? 0) + acc.count * 4 > total + 4) {
        bad++;
    }
}
console.log(`soldier.glb: ${(binOut.length / 1e6).toFixed(1)}MB, accessors out of range: ${bad}`);
