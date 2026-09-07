import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHARACTER_ID = '2dee24f8-3b49-48af-b735-c6377509eaac';
const OUT_DIR = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../public/assets/charcter/motion'
);

const MOTIONS = [
    { id: '116180902', name: 'Turn Right', desc: 'Turn Right While Crouching Game Blend' },
    { id: '117510902', name: 'Prone Left Turn', desc: 'Turning Left While Prone Game Blend' },
    { id: '117520902', name: 'Prone Right Turn', desc: 'Turning Right While Prone Game Blend' },
    { id: '116170902', name: 'Turn Left', desc: 'Turn Left While Crouching Game Blend' },
    { id: '101420901', name: 'Gunplay', desc: 'Gunplay With Remington Shotgun' },
    { id: '101430901', name: 'Gunplay', desc: 'Male Standing Fantasy Gunplay With Hand Cannon' },
    { id: '101430902', name: 'Gunplay', desc: 'Male Kneeling Fantasy Gunplay With Hand Cannon' },
    { id: '101450908', name: 'Gunplay', desc: 'Standing Shooting Rapid Fire' },
    { id: '101450907', name: 'Gunplay', desc: 'Shooting' },
    { id: '101450906', name: 'Gunplay', desc: 'Cover To Shooting' },
    { id: '101450905', name: 'Gunplay', desc: 'Standing Shooting Rapid Fire' },
    { id: '104290901', name: 'Gunplay', desc: 'Duck And Look Around Apprehensively' },
    { id: '130780901', name: 'Shooting', desc: 'Firing A Gun' },
    { id: '112400901', name: 'Shooting Gun', desc: 'Shooting Handgun' },
    { id: '130760901', name: 'Drawing Gun', desc: 'Drawing Gun From Lower Back' },
    { id: '130810901', name: 'Aiming', desc: 'Turning Around To Aim Gun' },
    { id: '101710901', name: 'Reloading', desc: 'Gun Reload While Walking' },
    { id: '102560901', name: 'Female Peek And Aim', desc: 'Female Turnaround Gun Aim' },
    { id: '102550901', name: 'Femme Peek Around Corner', desc: 'Female Peek Around Corner With Gun' },
    { id: '136610901', name: 'Aiming Gun', desc: 'Picking Up Gun From Ground To Aiming' },
    { id: '137570901', name: 'Sitting Gun Motion', desc: 'Sitting And Motioning With A Gun' },
    { id: '115050901', name: 'Shooting Pistol', desc: 'Shooting A Pistol From Behind Cover' },
    { id: '112390901', name: 'Shooting Arrow', desc: 'Shooting With Bow And Arrow' },
    { id: '116100901', name: 'Rifle Run To Dying', desc: 'Getting Shot While Running With An Aimed Rifle' },
    { id: '125970901', name: 'Rifle Idle', desc: 'Two Hand Lowered Gun Rifle Idle' },
    { id: '112170902', name: 'Piano Playing', desc: 'Playing Multiple Runs On A Piano' },
    { id: '119860901', name: 'Wall Run', desc: 'Male Runs Up A Wall Onto A Platform' }
];

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

function slug(motion) {
    const label = motion.name.toLowerCase() === motion.desc.toLowerCase()
        ? motion.name
        : `${motion.name} ${motion.desc}`;
    const s = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${motion.id}-${s}`;
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
    const file = path.join(OUT_DIR, `${slug(motion)}.fbx`);
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
