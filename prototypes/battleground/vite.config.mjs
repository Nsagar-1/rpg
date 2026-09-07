import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const engineRoot = path.resolve(root, '../..');

export default defineConfig({
    root,
    publicDir: 'public',
    server: {
        host: '0.0.0.0',
        port: 5560,
        fs: {
            allow: [engineRoot]
        }
    },
    resolve: {
        alias: {
            playcanvas: path.resolve(engineRoot, 'build/playcanvas/src/index.js')
        }
    },
    optimizeDeps: {
        exclude: ['playcanvas']
    }
});
