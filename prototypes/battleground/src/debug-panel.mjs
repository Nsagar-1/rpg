/**
 * In-game developer panel — toggle with ` or F3.
 *
 * @typedef {object} DebugContext
 * @property {import('playcanvas').AppBase} app - Application.
 * @property {import('playcanvas').Entity} player - Player entity.
 * @property {import('playcanvas').Entity|null} cameraEntity - Camera entity.
 * @property {import('playcanvas').Vec3} spawn - Spawn position (mutated by the sliders).
 * @property {HTMLCanvasElement} canvas - Render canvas.
 * @property {import('./input/input-state.mjs').InputState} input - Shared input state.
 * @property {() => import('./scripts/weapon-controller.mjs').WeaponController|null} getWeapon - Weapon accessor.
 * @property {() => import('./scripts/player-controller.mjs').PlayerController|null} getPlayer - Player accessor.
 * @property {() => import('./scripts/damage-target.mjs').DamageTarget[]} getTargets - Shootable targets.
 * @property {() => import('./scripts/bot-controller.mjs').BotController[]} getBots - Bot AI scripts.
 * @property {(enabled: boolean) => void} setFallRescue - Toggle the fall rescue.
 * @property {(enabled: boolean) => void} setTouchMode - Toggle on-screen controls.
 * @property {(muted: boolean) => void} setMuted - Toggle audio.
 * @property {(weaponId: string) => void} givePickup - Drop a weapon pickup in front of the player.
 */

import { Vec3 } from 'playcanvas';

import { WEAPONS } from './weapons/weapon-data.mjs';

const rayStart = new Vec3();
const rayEnd = new Vec3();

/**
 * @param {DebugContext} ctx - Everything the panel can inspect or poke.
 * @returns {{ log: Function, setVisible: Function, teleportSpawn: Function }} Panel controls.
 */
export function createDebugPanel(ctx) {
    const root = document.createElement('div');
    root.id = 'debug-panel';
    root.innerHTML = `
        <header>
            <strong>Battleground Dev</strong>
            <span id="debug-status" class="pill ok">OK</span>
            <button type="button" id="debug-close" title="Close (backtick key)">×</button>
        </header>
        <div class="debug-body">
            <section>
                <h3>Player</h3>
                <div class="grid" id="debug-player"></div>
            </section>
            <section>
                <h3>Combat</h3>
                <div class="grid" id="debug-combat"></div>
            </section>
            <section>
                <h3>Performance</h3>
                <div class="grid" id="debug-perf"></div>
            </section>
            <section>
                <h3>Last shot</h3>
                <div class="grid" id="debug-shot"></div>
            </section>
            <section>
                <h3>Give weapon</h3>
                <div class="btn-row" id="debug-give"></div>
            </section>
            <section>
                <h3>Quick fixes</h3>
                <div class="btn-row">
                    <button type="button" data-action="teleport-spawn">Teleport to spawn</button>
                    <button type="button" data-action="reset-targets">Reset targets</button>
                    <button type="button" data-action="heal">Full heal</button>
                    <button type="button" data-action="release-mouse">Release mouse</button>
                    <button type="button" data-action="clear-log">Clear log</button>
                </div>
                <label class="check"><input type="checkbox" id="debug-fall-rescue" checked /> Rescue if falling (y &lt; -4)</label>
                <label class="check"><input type="checkbox" id="debug-touch" /> On-screen controls</label>
                <label class="check"><input type="checkbox" id="debug-mute" /> Mute audio</label>
            </section>
            <section>
                <h3>Tweak live</h3>
                <label>Spawn X <input type="range" id="sl-spawn-x" min="-20" max="20" step="0.5" /><span id="val-spawn-x"></span></label>
                <label>Spawn Y <input type="range" id="sl-spawn-y" min="0" max="8" step="0.25" /><span id="val-spawn-y"></span></label>
                <label>Spawn Z <input type="range" id="sl-spawn-z" min="-26" max="14" step="0.5" /><span id="val-spawn-z"></span></label>
                <label>Gravity Y <input type="range" id="sl-gravity" min="-40" max="-4" step="1" /><span id="val-gravity"></span></label>
                <label>Move speed <input type="range" id="sl-speed" min="10" max="120" step="5" /><span id="val-speed"></span></label>
                <label>Jump force <input type="range" id="sl-jump" min="200" max="1600" step="50" /><span id="val-jump"></span></label>
                <label>Look sens <input type="range" id="sl-sens" min="0.02" max="0.4" step="0.01" /><span id="val-sens"></span></label>
                <label>Damage × <input type="range" id="sl-damage" min="0.25" max="5" step="0.25" /><span id="val-damage"></span></label>
                <label>Bot accuracy <input type="range" id="sl-bot-acc" min="0" max="1" step="0.05" /><span id="val-bot-acc"></span></label>
                <button type="button" data-action="apply-spawn">Apply spawn + teleport</button>
            </section>
            <section>
                <h3>Event log</h3>
                <div id="debug-log"></div>
            </section>
        </div>
    `;
    document.body.appendChild(root);

    const $ = (/** @type {string} */ sel) => /** @type {HTMLElement} */ (root.querySelector(sel));
    const statusEl = $('#debug-status');
    const playerEl = $('#debug-player');
    const combatEl = $('#debug-combat');
    const perfEl = $('#debug-perf');
    const shotEl = $('#debug-shot');
    const logEl = $('#debug-log');

    /** @type {{ time: number, dt: number, fps: number }} */
    const perf = { time: 0, dt: 0, fps: 60 };

    /** @type {{ hit: boolean, entity: string, point: string, time: string }} */
    let lastShot = { hit: false, entity: '—', point: '—', time: '—' };

    let visible = false;

    /**
     * @param {'info'|'warn'|'error'} level - Severity.
     * @param {string} message - Text.
     */
    const log = (level, message) => {
        const line = document.createElement('div');
        line.className = `log-line ${level}`;
        line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logEl.prepend(line);
        while (logEl.children.length > 80) {
            logEl.lastChild?.remove();
        }
    };

    const setVisible = (/** @type {boolean} */ on) => {
        visible = on;
        root.classList.toggle('open', on);
        if (on) {
            ctx.canvas.style.cursor = 'default';
            document.exitPointerLock();
        }
    };

    const fmt = (/** @type {number} */ n) => (typeof n === 'number' ? n.toFixed(2) : String(n));

    /**
     * @param {HTMLElement} el - Grid container.
     * @param {Array<[string, string]>} rows - Key/value pairs.
     */
    const kv = (el, rows) => {
        el.innerHTML = rows.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('');
    };

    // --- Give weapon buttons ---------------------------------------------

    const giveRow = $('#debug-give');
    giveRow.innerHTML = Object.values(WEAPONS)
    .map(def => `<button type="button" data-give="${def.id}">${def.name}</button>`)
    .join('');
    giveRow.addEventListener('click', (e) => {
        const id = /** @type {HTMLElement} */ (e.target).dataset?.give;
        if (id) {
            ctx.givePickup(id);
            log('info', `Spawned ${id} pickup in front of player`);
        }
    });

    // --- Sliders ----------------------------------------------------------

    const sliders = {
        spawnX: /** @type {HTMLInputElement} */ ($('#sl-spawn-x')),
        spawnY: /** @type {HTMLInputElement} */ ($('#sl-spawn-y')),
        spawnZ: /** @type {HTMLInputElement} */ ($('#sl-spawn-z')),
        gravity: /** @type {HTMLInputElement} */ ($('#sl-gravity')),
        speed: /** @type {HTMLInputElement} */ ($('#sl-speed')),
        jump: /** @type {HTMLInputElement} */ ($('#sl-jump')),
        sens: /** @type {HTMLInputElement} */ ($('#sl-sens')),
        damage: /** @type {HTMLInputElement} */ ($('#sl-damage')),
        botAcc: /** @type {HTMLInputElement} */ ($('#sl-bot-acc'))
    };

    sliders.spawnX.value = String(ctx.spawn.x);
    sliders.spawnY.value = String(ctx.spawn.y);
    sliders.spawnZ.value = String(ctx.spawn.z);
    sliders.gravity.value = String(ctx.app.systems.rigidbody?.gravity.y ?? -18);
    sliders.speed.value = String(ctx.getPlayer()?.speedGround ?? 52);
    sliders.jump.value = String(ctx.getPlayer()?.jumpForce ?? 850);
    sliders.sens.value = String(ctx.getPlayer()?.lookSens ?? 0.12);
    sliders.damage.value = String(ctx.getWeapon()?.damageMult ?? 1);
    sliders.botAcc.value = String(ctx.getBots()[0]?.accuracy ?? 0.45);

    /** @type {Array<[string, HTMLInputElement]>} */
    const labelPairs = [
        ['val-spawn-x', sliders.spawnX],
        ['val-spawn-y', sliders.spawnY],
        ['val-spawn-z', sliders.spawnZ],
        ['val-gravity', sliders.gravity],
        ['val-speed', sliders.speed],
        ['val-jump', sliders.jump],
        ['val-sens', sliders.sens],
        ['val-damage', sliders.damage],
        ['val-bot-acc', sliders.botAcc]
    ];

    const syncLabels = () => {
        for (const [id, el] of labelPairs) {
            const span = root.querySelector(`#${id}`);
            if (span) {
                span.textContent = el.value;
            }
        }
    };
    syncLabels();

    for (const input of Object.values(sliders)) {
        input.addEventListener('input', () => {
            syncLabels();
            const playerScript = ctx.getPlayer();
            const weapon = ctx.getWeapon();

            if (input === sliders.gravity && ctx.app.systems.rigidbody) {
                ctx.app.systems.rigidbody.gravity.set(0, Number(sliders.gravity.value), 0);
            }
            if (input === sliders.speed && playerScript) {
                playerScript.speedGround = Number(sliders.speed.value);
            }
            if (input === sliders.jump && playerScript) {
                playerScript.jumpForce = Number(sliders.jump.value);
            }
            if (input === sliders.sens && playerScript) {
                playerScript.lookSens = Number(sliders.sens.value);
            }
            if (input === sliders.damage && weapon) {
                weapon.damageMult = Number(sliders.damage.value);
            }
            if (input === sliders.botAcc) {
                for (const bot of ctx.getBots()) {
                    bot.accuracy = Number(sliders.botAcc.value);
                }
            }
        });
    }

    // --- Actions ----------------------------------------------------------

    const teleportSpawn = () => {
        ctx.spawn.set(
            Number(sliders.spawnX.value),
            Number(sliders.spawnY.value),
            Number(sliders.spawnZ.value)
        );
        const playerScript = ctx.getPlayer();
        if (playerScript) {
            playerScript.spawnPoint.copy(ctx.spawn);
        }
        if (ctx.player.rigidbody) {
            ctx.player.rigidbody.teleport(ctx.spawn);
            ctx.player.rigidbody.linearVelocity = new Vec3(0, 0, 0);
            ctx.player.rigidbody.angularVelocity = new Vec3(0, 0, 0);
        } else {
            ctx.player.setPosition(ctx.spawn);
        }
        log('info', `Teleported to (${fmt(ctx.spawn.x)}, ${fmt(ctx.spawn.y)}, ${fmt(ctx.spawn.z)})`);
    };

    $('#debug-close').addEventListener('click', () => setVisible(false));

    root.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const action = /** @type {HTMLElement} */ (btn).dataset.action;
            if (action === 'teleport-spawn' || action === 'apply-spawn') {
                teleportSpawn();
            }
            if (action === 'reset-targets') {
                ctx.getTargets().forEach(t => t.resetHealth());
                log('info', 'All targets reset.');
            }
            if (action === 'heal') {
                ctx.getPlayer()?.heal(999);
                log('info', 'Player healed.');
            }
            if (action === 'release-mouse') {
                document.exitPointerLock();
            }
            if (action === 'clear-log') {
                logEl.innerHTML = '';
            }
        });
    });

    /**
     * @param {string} id - Checkbox id.
     * @param {(checked: boolean) => void} handler - Change handler.
     * @param {boolean} [initial] - Starting state.
     * @returns {HTMLInputElement} The bound checkbox.
     */
    const bindCheck = (id, handler, initial = false) => {
        const el = /** @type {HTMLInputElement} */ ($(id));
        el.checked = initial;
        el.addEventListener('change', () => handler(el.checked));
        return el;
    };

    bindCheck('#debug-fall-rescue', (on) => {
        ctx.setFallRescue(on);
        log('info', `Fall rescue ${on ? 'ON' : 'OFF'}`);
    }, true);

    bindCheck('#debug-touch', (on) => {
        ctx.setTouchMode(on);
        log('info', `On-screen controls ${on ? 'ON' : 'OFF'}`);
    }, ctx.input.touchMode);

    bindCheck('#debug-mute', (on) => {
        ctx.setMuted(on);
        log('info', `Audio ${on ? 'muted' : 'on'}`);
    });

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Backquote' || e.code === 'F3') {
            e.preventDefault();
            setVisible(!visible);
        }
    });

    // --- Event wiring -----------------------------------------------------

    ctx.app.on('debug:log', (/** @type {'info'|'warn'|'error'} */ level, /** @type {string} */ msg) => log(level, msg));
    ctx.app.on('debug:shot', (/** @type {any} */ data) => {
        lastShot = {
            hit: !!data.hit,
            entity: data.entity ?? 'miss',
            point: data.point ?? '—',
            time: new Date().toLocaleTimeString()
        };
    });
    ctx.app.on('target:died', (/** @type {string} */ label) => log('info', `${label} eliminated`));
    ctx.app.on('player:died', (/** @type {string} */ source) => log('warn', `Player killed by ${source}`));

    ctx.app.on('update', (/** @type {number} */ dt) => {
        perf.dt = dt;
        perf.time += dt;
        if (perf.time >= 0.25) {
            perf.fps = Math.round(1 / Math.max(dt, 0.0001));
            perf.time = 0;
        }

        if (!visible) {
            return;
        }

        const playerScript = ctx.getPlayer();
        const weapon = ctx.getWeapon();
        const p = ctx.player.getPosition();
        const vel = ctx.player.rigidbody?.linearVelocity;
        const speed = vel ? Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) : 0;

        rayStart.copy(p);
        rayStart.y += 0.2;
        rayEnd.copy(p);
        rayEnd.y -= 8;
        const ground = ctx.app.systems.rigidbody?.raycastFirst(rayStart, rayEnd, {
            filterCallback: (/** @type {any} */ e) => e !== ctx.player
        });

        const issues = [];
        if (p.y < -4) {
            issues.push('Falling through floor');
        }
        if (!ground) {
            issues.push('No ground hit below player');
        }
        if (perf.fps < 30) {
            issues.push('Low FPS');
        }

        if (issues.length) {
            statusEl.textContent = issues[0];
            statusEl.className = `pill ${p.y < -4 ? 'err' : 'warn'}`;
        } else {
            statusEl.textContent = 'OK';
            statusEl.className = 'pill ok';
        }

        kv(playerEl, [
            ['Position', `${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}`],
            ['Velocity', vel ? `${fmt(speed)} m/s` : '—'],
            ['Grounded', playerScript?.grounded ? 'yes' : 'no'],
            ['Stance', playerScript?.crouching ? 'crouched' : 'standing'],
            ['Health', playerScript ? `${Math.ceil(playerScript.health)} / ${playerScript.maxHealth}` : '—'],
            ['Ground Y', ground ? ground.point.y.toFixed(2) : 'none'],
            ['Pointer lock', document.pointerLockElement ? 'yes' : 'no'],
            ['Input mode', ctx.input.touchMode ? 'touch' : 'keyboard + mouse']
        ]);

        kv(combatEl, [
            ['Weapon', weapon?.active?.def.name ?? 'Unarmed'],
            ['Ammo', weapon?.active ? `${weapon.active.ammo} / ${weapon.active.reserve}` : '—'],
            ['Spread', weapon ? `${fmt(weapon.spread)}°` : '—'],
            ['Aiming', weapon?.aiming ? 'yes' : 'no'],
            ['Auto fire', ctx.input.autoFire ? 'ON' : 'off'],
            ['Kills / deaths', playerScript ? `${playerScript.kills} / ${playerScript.deaths}` : '—'],
            ['Bots alive', String(ctx.getBots().filter(b => b.state !== 'dead').length)],
            ['Bot states', ctx.getBots().map(b => b.state).join(', ') || '—']
        ]);

        kv(perfEl, [
            ['FPS', String(perf.fps)],
            ['Frame ms', fmt(dt * 1000)],
            ['Gravity Y', fmt(ctx.app.systems.rigidbody?.gravity.y ?? 0)],
            ['Graphics', ctx.app.graphicsDevice?.isWebGPU ? 'WebGPU' : 'WebGL2']
        ]);

        kv(shotEl, [
            ['Hit', lastShot.hit ? 'yes' : 'no'],
            ['Entity', lastShot.entity],
            ['Point', lastShot.point],
            ['Time', lastShot.time]
        ]);
    });

    log('info', 'Dev panel ready — press ` or F3 to toggle.');
    return { log, setVisible, teleportSpawn };
}
