import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MIXAMO_MOTIONS, motionSlug } from '../src/mixamo-catalog.mjs';

const CHARACTER_ID = '2dee24f8-3b49-48af-b735-c6377509eaac';
const OUT_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../public/assets/charcter/motion'
);

const MOTIONS = MIXAMO_MOTIONS;

const token = process.env.MIXAMO_TOKEN;
if (!token) {
    console.error('Set MIXAMO_TOKEN to a Mixamo Bearer token.');
    process.exit(1);
}

function headers(extra = {}) {
    return {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        Authorization: `Bearer ${token}`,
        'X-Api-Key': 'mixamo2',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: 'https://www.mixamo.com',
        Referer: 'https://www.mixamo.com/',
        ...extra
    };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(url, init = {}) {
    const res = await fetch(url, init);
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = { raw: text };
    }
    return { res, json };
}

function gmsHashFallback(id) {
    return {
        'model-id': Number(id),
        mirror: false,
        trim: [0, 100],
        overdrive: 0,
        params: '0',
        'arm-space': 0,
        inplace: false
    };
}

function gmsHashFromDetails(hash) {
    const params = Array.isArray(hash.params)
        ? hash.params.map((param) => param[1]).join(',')
        : (hash.params ?? '0');
    return { ...hash, params };
}

async function findProduct(motion) {
    const query = encodeURIComponent(motion.desc || motion.name);
    const { res, json } = await api(
        `https://www.mixamo.com/api/v1/products?page=1&limit=24&type=Motion&query=${query}`,
        { headers: headers() }
    );
    if (!res.ok) {
        return null;
    }
    const hit = (json.results ?? []).find((item) =>
        `${item.thumbnail ?? ''} ${item.thumbnail_animated ?? ''}`.includes(`/motions/${motion.id}/`)
    );
    if (!hit) {
        return null;
    }
    const product = await api(
        `https://www.mixamo.com/api/v1/products/${hit.id}?similar=0&character_id=${CHARACTER_ID}`,
        { headers: headers() }
    );
    return product.res.ok ? product.json : null;
}

async function exportMotion(id, productName, hash) {
    const { res, json } = await api('https://www.mixamo.com/api/v1/animations/export', {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json; charset=UTF-8' }),
        body: JSON.stringify({
            gms_hash: [hash],
            preferences: { format: 'fbx7_2019', skin: 'false', fps: '30', reducekf: '0' },
            character_id: CHARACTER_ID,
            type: 'Motion',
            product_name: productName
        })
    });
    if (res.status === 429) {
        return { retry: true };
    }
    if (res.status !== 200 && res.status !== 202) {
        throw new Error(`export ${productName} failed ${res.status}: ${JSON.stringify(json)}`);
    }
    return { retry: false, json };
}

async function monitor() {
    const url = `https://www.mixamo.com/api/v1/characters/${CHARACTER_ID}/monitor`;
    for (let i = 0; i < 80; i++) {
        const { res, json } = await api(url, { headers: headers() });
        if (res.status === 429) {
            await sleep(1500);
            continue;
        }
        if (res.status === 404) {
            await sleep(1000);
            continue;
        }
        if (res.status !== 200 && res.status !== 202) {
            throw new Error(`monitor failed ${res.status}: ${JSON.stringify(json)}`);
        }
        if (json?.status === 'completed' && json.job_result) {
            return json.job_result;
        }
        if (json?.status === 'failed') {
            throw new Error(`export failed: ${JSON.stringify(json)}`);
        }
        await sleep(1500);
    }
    throw new Error('monitor timed out');
}

async function downloadFile(url, dest) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`download failed ${res.status} ${url}`);
    }
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

await mkdir(OUT_DIR, { recursive: true });

for (const [index, motion] of MOTIONS.entries()) {
    const file = path.join(OUT_DIR, `${motionSlug(motion)}.fbx`);
    process.stdout.write(`[${index + 1}/${MOTIONS.length}] ${motion.id} ${motion.name}… `);
    try {
        await access(file);
        console.log(`skip ${path.basename(file)}`);
        continue;
    } catch {
        // not downloaded yet
    }
    try {
        const product = await findProduct(motion);
        const name = product?.name || motion.name;
        const hash = product?.details?.gms_hash
            ? gmsHashFromDetails(product.details.gms_hash)
            : gmsHashFallback(motion.id);
        let exported = await exportMotion(motion.id, name, hash);
        while (exported.retry) {
            await sleep(2000);
            exported = await exportMotion(motion.id, name, hash);
        }
        const jobUrl = await monitor();
        await downloadFile(jobUrl, file);
        console.log(`ok ${path.basename(file)}`);
        await sleep(800);
    } catch (err) {
        console.log(`FAIL ${err.message}`);
    }
}
