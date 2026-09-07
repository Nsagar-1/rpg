import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import fbx2gltf from 'fbx2gltf';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/charcter/motion');
const files = (await readdir(dir)).filter((name) => name.toLowerCase().endsWith('.fbx'));

for (const [index, name] of files.entries()) {
    const src = path.join(dir, name);
    const dest = src.replace(/\.fbx$/i, '.glb');
    try {
        await access(dest);
        console.log(`[${index + 1}/${files.length}] skip ${path.basename(dest)}`);
        continue;
    } catch {
        // convert
    }
    process.stdout.write(`[${index + 1}/${files.length}] ${name}… `);
    await fbx2gltf(src, dest, ['--binary']);
    console.log('ok');
}
