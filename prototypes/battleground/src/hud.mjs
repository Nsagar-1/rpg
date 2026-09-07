import { Vec3 } from 'playcanvas';

import { isMuted, setMuted } from './audio.mjs';

/** @import { AppBase, Entity } from 'playcanvas' */
/** @import { InputState } from './input/input-state.mjs' */
/** @import { WeaponController } from './scripts/weapon-controller.mjs' */
/** @import { PlayerController } from './scripts/player-controller.mjs' */
/** @import { DamageTarget } from './scripts/damage-target.mjs' */

/**
 * @typedef {object} HudOptions
 * @property {AppBase} app - Application.
 * @property {Entity} camera - Camera entity used to project world points.
 * @property {InputState} input - Shared input state.
 * @property {() => WeaponController|null} getWeapon - Weapon accessor.
 * @property {() => PlayerController|null} getPlayer - Player accessor.
 * @property {() => DamageTarget[]} getTargets - Live shootable targets.
 * @property {() => { minX: number, maxX: number, minZ: number, maxZ: number }} [getArena] - Map bounds.
 */

const worldPoint = new Vec3();
const NAMEPLATE_RANGE = 55;

/**
 * Wires every DOM element in the HUD to engine events. Nothing here touches gameplay state — it
 * only reads and renders, so the game runs fine with the HUD stripped out.
 *
 * @param {HudOptions} options - Application, camera and gameplay accessors.
 * @returns {{ addFeed: (text: string, tone?: 'good'|'bad'|'info') => void }} Kill-feed writer.
 */
export function createHud({ app, camera, input, getWeapon, getPlayer, getTargets, getArena }) {
    const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

    const healthFill = $('health-fill');
    const healthValue = $('health-value');
    const healthMax = $('health-max');
    const squadHp1 = $('squad-hp-1');
    const ammoMag = $('ammo-mag');
    const ammoReserve = $('ammo-reserve');
    const weaponName = $('weapon-name');
    const weaponKind = $('weapon-kind');
    const slotsEl = $('weapon-slots');
    const crosshair = $('crosshair');
    const hitmarker = $('hitmarker');
    const feedEl = $('kill-feed');
    const scoreKills = $('score-kills');
    const scoreDeaths = $('score-deaths');
    const scorePoints = $('score-points');
    const goldValue = $('gold-value');
    const matchTimer = $('match-timer');
    const matchScoreA = $('match-score-a');
    const matchScoreB = $('match-score-b');
    const medkitCount = document.getElementById('medkit-count');
    const minimap = /** @type {HTMLCanvasElement|null} */ (document.getElementById('minimap'));
    const miniCtx = minimap?.getContext('2d') ?? null;
    const speakerBtn = document.getElementById('hud-speaker');
    const promptEl = $('pickup-prompt');
    const promptLabel = $('pickup-label');
    const deathEl = $('death-screen');
    const deathTimer = $('death-timer');
    const deathBy = $('death-by');
    const damageLayer = $('damage-layer');
    const nameplateLayer = $('nameplate-layer');
    const scopeEl = $('scope-overlay');
    const hurtEl = $('hurt-overlay');
    const reloadEl = $('reload-indicator');

    let score = 0;
    let gold = 700;
    let hitmarkerTimer = 0;
    let respawnAt = 0;
    let scoutUntil = 0;
    const matchEndsAt = performance.now() + 10 * 60 * 1000;

    /** @type {Map<string, { wrap: HTMLElement, fill: HTMLElement, name: HTMLElement }>} */
    const nameplates = new Map();

    speakerBtn?.addEventListener('click', () => {
        setMuted(!isMuted());
        speakerBtn.classList.toggle('off', isMuted());
    });
    document.getElementById('hud-mic')?.addEventListener('click', (e) => {
        /** @type {HTMLElement} */ (e.currentTarget).classList.toggle('off');
    });

    // --- Health -----------------------------------------------------------

    app.on('player:health', (/** @type {number} */ health, /** @type {number} */ max) => {
        const pct = Math.max(0, (health / max) * 100);
        healthFill.style.width = `${pct}%`;
        healthFill.classList.toggle('low', pct < 35);
        healthValue.textContent = String(Math.ceil(health));
        if (healthMax) {
            healthMax.textContent = String(max);
        }
        if (squadHp1) {
            squadHp1.style.width = `${pct}%`;
        }
    });

    app.on('player:hurt', () => {
        hurtEl.classList.remove('flash');
        // Reading a layout property forces a reflow, which restarts the CSS animation.
        hurtEl.getBoundingClientRect();
        hurtEl.classList.add('flash');
    });

    app.on('player:died', (/** @type {string} */ source, /** @type {number} */ delay) => {
        respawnAt = performance.now() + delay * 1000;
        deathBy.textContent = source;
        deathEl.classList.add('show');
        addFeed(`${source} eliminated you`, 'bad');
    });

    app.on('player:respawn', () => {
        deathEl.classList.remove('show');
    });

    // --- Weapon -----------------------------------------------------------

    app.on('weapon:state', (/** @type {any} */ state) => {
        ammoMag.textContent = String(state.ammo);
        ammoReserve.textContent = `/ ${state.reserve}`;
        weaponName.textContent = state.name;
        weaponKind.textContent = state.kind;
        reloadEl.classList.toggle('show', state.reloading);
        ammoMag.classList.toggle('empty', state.ammo === 0);

        slotsEl.innerHTML = state.slots.map((/** @type {any} */ slot, /** @type {number} */ i) => {
            const active = i === state.activeSlot ? ' active' : '';
            if (!slot) {
                return `<button type="button" class="slot${active}" data-slot="${i}"><i class="slot-fist">✊</i></button>`;
            }
            return `<button type="button" class="slot${active}" data-slot="${i}">
                <b>${slot.name}</b>
                <span>${slot.ammo} / ${slot.reserve}</span>
                ${state.reloading && i === state.activeSlot ? '<em>Reload</em>' : ''}
            </button>`;
        }).join('');
    });

    slotsEl.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement} */ (e.target).closest('[data-slot]');
        if (btn) {
            input.queueSwitch(Number(/** @type {HTMLElement} */ (btn).dataset.slot));
        }
    });

    app.on('weapon:hitmarker', (/** @type {boolean} */ isHead, /** @type {boolean} */ killed) => {
        hitmarker.className = `show${isHead ? ' head' : ''}${killed ? ' kill' : ''}`;
        hitmarkerTimer = 0.14;
    });

    app.on('weapon:scope', (/** @type {boolean} */ on) => {
        scopeEl.classList.toggle('show', on);
        crosshair.classList.toggle('hidden', on);
    });

    // --- Feed and score ---------------------------------------------------

    /**
     * @param {string} text - Message body.
     * @param {'good'|'bad'|'info'} [tone] - Colour treatment.
     */
    function addFeed(text, tone = 'info') {
        const line = document.createElement('div');
        line.className = `feed-line ${tone}`;
        line.textContent = text;
        feedEl.prepend(line);
        while (feedEl.children.length > 5) {
            feedEl.lastChild?.remove();
        }
        setTimeout(() => line.remove(), 4500);
    }

    app.on('feed:message', (/** @type {string} */ text) => addFeed(text));

    app.on('score:kill', (/** @type {string} */ label, /** @type {string} */ weapon, /** @type {boolean} */ isHead) => {
        score += isHead ? 150 : 100;
        gold += isHead ? 80 : 50;
        scorePoints.textContent = String(score);
        if (goldValue) {
            goldValue.textContent = String(gold);
        }
        if (matchScoreA) {
            matchScoreA.textContent = String(getPlayer()?.kills ?? 0);
        }
        addFeed(`You ${isHead ? 'headshot' : 'eliminated'} ${label} · ${weapon}`, 'good');
    });

    app.on('target:died', () => {
        const player = getPlayer();
        if (player) {
            scoreKills.textContent = String(player.kills);
        }
    });

    app.on('player:died', () => {
        const player = getPlayer();
        if (player) {
            scoreDeaths.textContent = String(player.deaths);
        }
    });

    // --- Pickup prompt ----------------------------------------------------

    app.on('player:medkits', (/** @type {number} */ count) => {
        if (medkitCount) {
            medkitCount.textContent = String(count);
        }
    });

    app.on('scout:pulse', () => {
        scoutUntil = performance.now() + 4500;
        addFeed('Scout deployed', 'info');
    });

    app.on('pickup:prompt', (/** @type {{ label: string, kind: string }|null} */ info) => {
        if (!info) {
            promptEl.classList.remove('show');
            return;
        }
        promptLabel.textContent = info.label;
        promptEl.classList.add('show');
    });

    promptEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        input.queuePickup();
    });

    // --- Floating damage numbers ------------------------------------------

    app.on('damage:show', (/** @type {Vec3} */ point, /** @type {number} */ amount, /** @type {boolean} */ isHead) => {
        if (!camera.camera) {
            return;
        }

        const screen = camera.camera.worldToScreen(point);
        if (screen.z <= 0) {
            return;
        }

        const el = document.createElement('div');
        el.className = `damage-number${isHead ? ' head' : ''}`;
        el.textContent = isHead ? `${amount} HS` : String(amount);
        el.style.left = `${screen.x}px`;
        el.style.top = `${screen.y}px`;
        damageLayer.appendChild(el);
        setTimeout(() => el.remove(), 800);
    });

    // --- Per-frame updates ------------------------------------------------

    app.on('update', (/** @type {number} */ dt) => {
        if (hitmarkerTimer > 0) {
            hitmarkerTimer -= dt;
            if (hitmarkerTimer <= 0) {
                hitmarker.className = '';
            }
        }

        if (deathEl.classList.contains('show')) {
            const left = Math.max(0, (respawnAt - performance.now()) / 1000);
            deathTimer.textContent = left.toFixed(1);
        }

        if (matchTimer) {
            const remain = Math.max(0, (matchEndsAt - performance.now()) / 1000);
            const m = Math.floor(remain / 60);
            const s = Math.floor(remain % 60);
            matchTimer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }

        drawMinimap();

        // Crosshair opens up with the current cone so the player can read their accuracy.
        const weapon = getWeapon();
        if (weapon) {
            const gap = 3 + weapon.spread * 5.5;
            crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
            crosshair.classList.toggle('aiming', weapon.aiming);
        }

        updateNameplates();
    });

    /**
     * Projects a health bar above every live target in view. Bars are pooled by entity GUID so we
     * are not creating DOM nodes every frame.
     */
    function updateNameplates() {
        if (!camera.camera) {
            return;
        }

        const cameraPos = camera.getPosition();
        const seen = new Set();

        for (const target of getTargets()) {
            const guid = target.entity.getGuid();
            seen.add(guid);

            let plate = nameplates.get(guid);
            if (!plate) {
                const wrap = document.createElement('div');
                wrap.className = 'nameplate';
                wrap.innerHTML = '<span class="np-name"></span><div class="np-bar"><div class="np-fill"></div></div>';
                nameplateLayer.appendChild(wrap);
                plate = {
                    wrap,
                    fill: /** @type {HTMLElement} */ (wrap.querySelector('.np-fill')),
                    name: /** @type {HTMLElement} */ (wrap.querySelector('.np-name'))
                };
                plate.name.textContent = target.label;
                nameplates.set(guid, plate);
            }

            worldPoint.copy(target.entity.getPosition());
            worldPoint.y += 1.5;

            const distance = worldPoint.distance(cameraPos);
            const screen = camera.camera.worldToScreen(worldPoint);
            const range = performance.now() < scoutUntil ? NAMEPLATE_RANGE * 2.5 : NAMEPLATE_RANGE;

            if (!target.alive || screen.z <= 0 || distance > range) {
                plate.wrap.style.display = 'none';
                continue;
            }

            // Shrink with distance so a firing line of targets does not turn into a wall of bars.
            const scale = Math.max(0.42, Math.min(1, 12 / distance));

            plate.wrap.style.display = 'block';
            plate.wrap.style.left = `${screen.x}px`;
            plate.wrap.style.top = `${screen.y}px`;
            plate.wrap.style.transform = `translate(-50%, -100%) scale(${scale.toFixed(2)})`;
            plate.wrap.style.opacity = String(Math.max(0.3, 1 - distance / range));
            plate.fill.style.width = `${(target.health / target.maxHealth) * 100}%`;
        }

        for (const [guid, plate] of nameplates) {
            if (!seen.has(guid)) {
                plate.wrap.remove();
                nameplates.delete(guid);
            }
        }
    }

    /**
     * Top-down arena sketch: player chevron, bots, dummies.
     */
    function drawMinimap() {
        if (!miniCtx || !minimap) {
            return;
        }

        const w = minimap.width;
        const h = minimap.height;
        miniCtx.clearRect(0, 0, w, h);
        miniCtx.fillStyle = 'rgba(8, 16, 10, 0.82)';
        miniCtx.beginPath();
        miniCtx.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
        miniCtx.fill();
        miniCtx.strokeStyle = 'rgba(255,255,255,0.25)';
        miniCtx.lineWidth = 2;
        miniCtx.stroke();

        const arena = getArena?.();
        const player = getPlayer();
        if (!arena || !player) {
            return;
        }

        const spanX = arena.maxX - arena.minX || 1;
        const spanZ = arena.maxZ - arena.minZ || 1;
        const pad = 8;

        /**
         * @param {number} x - World X.
         * @param {number} z - World Z.
         * @returns {[number, number]} Canvas coordinates.
         */
        const toMap = (x, z) => [
            pad + ((x - arena.minX) / spanX) * (w - pad * 2),
            pad + (1 - (z - arena.minZ) / spanZ) * (h - pad * 2)
        ];

        miniCtx.save();
        miniCtx.beginPath();
        miniCtx.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2);
        miniCtx.clip();

        for (const target of getTargets()) {
            if (!target.alive) {
                continue;
            }
            const p = target.entity.getPosition();
            const [mx, mz] = toMap(p.x, p.z);
            miniCtx.fillStyle = target.label.startsWith('Bot') ? '#ff5a4a' : '#ffa23d';
            miniCtx.beginPath();
            miniCtx.arc(mx, mz, 3.5, 0, Math.PI * 2);
            miniCtx.fill();
        }

        const pos = player.entity.getPosition();
        const [px, pz] = toMap(pos.x, pos.z);
        const yaw = (player.yaw ?? 0) * Math.PI / 180;
        miniCtx.save();
        miniCtx.translate(px, pz);
        miniCtx.rotate(-yaw);
        miniCtx.fillStyle = '#fff';
        miniCtx.beginPath();
        miniCtx.moveTo(0, -7);
        miniCtx.lineTo(5, 6);
        miniCtx.lineTo(0, 3);
        miniCtx.lineTo(-5, 6);
        miniCtx.closePath();
        miniCtx.fill();
        miniCtx.restore();
        miniCtx.restore();
    }

    return { addFeed };
}
