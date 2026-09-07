import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fbx2gltf from 'fbx2gltf';

const root = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(root, '../asset/LowPolyGunAssets/GunAssets');
const outRoot = path.resolve(root, '../public/assets/models/guns');

/**
 * @param {string} dir - Gun folder name.
 * @returns {Promise<string|null>} Path to the FBX file, if one exists.
 */
async function findFbx(dir) {
    const folder = path.join(sourceRoot, dir);
    const files = await readdir(folder);
    const fbx = files.find(name => name.toLowerCase().endsWith('.fbx'));
    return fbx ? path.join(folder, fbx) : null;
}

await mkdir(outRoot, { recursive: true });

const gunDirs = (await readdir(sourceRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

for (const dir of gunDirs) {
    const input = await findFbx(dir);
    if (!input) {
        console.warn(`[convert-guns] Skipping ${dir} — no .fbx found`);
        continue;
    }

    const slug = dir.replace(/\s+/g, '-').toLowerCase();
    const output = path.join(outRoot, `${slug}.glb`);

    await fbx2gltf(input, output, ['--binary']);
    console.log(`[convert-guns] ${dir} → ${path.relative(root, output)}`);
}

console.log('[convert-guns] Done');
