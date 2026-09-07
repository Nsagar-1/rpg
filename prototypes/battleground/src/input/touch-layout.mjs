/**
 * Saved positions for every on-screen touch control. Values are percentages of the viewport so
 * layouts survive rotation and different phone sizes.
 *
 * @typedef {object} TouchZoneLayout
 * @property {number} x - Left edge, % of viewport width.
 * @property {number} y - Top edge, % of viewport height.
 * @property {number} w - Width, % of viewport width.
 * @property {number} h - Height, % of viewport height.
 */

/**
 * @typedef {object} TouchButtonLayout
 * @property {number} x - Horizontal centre, % of viewport width.
 * @property {number} y - Vertical centre, % of viewport height.
 * @property {number} size - Diameter in vmin units.
 */

/**
 * @typedef {object} TouchLayout
 * @property {TouchZoneLayout} move - Movement zone (fixed joystick lives here).
 * @property {TouchZoneLayout} [look] - Legacy saved layouts only; look is now the rest of the screen.
 * @property {TouchButtonLayout} fire - Fire button.
 * @property {TouchButtonLayout} aim - Aim button.
 * @property {TouchButtonLayout} jump - Jump button.
 * @property {TouchButtonLayout} crouch - Crouch button.
 * @property {TouchButtonLayout} prone - Prone button.
 * @property {TouchButtonLayout} reload - Reload button.
 * @property {TouchButtonLayout} swap - Weapon swap button.
 * @property {TouchButtonLayout} auto - Auto-fire toggle.
 * @property {TouchButtonLayout} sprint - Sprint button.
 * @property {TouchButtonLayout} medkit - Heal button.
 * @property {TouchButtonLayout} backpack - Pickup / inventory button.
 * @property {TouchButtonLayout} scout - Scout pulse button.
 */

const STORAGE_KEY = 'battleground.touchLayout.v2';

/** @type {TouchLayout} */
export const DEFAULT_TOUCH_LAYOUT = {
    move: { x: 0, y: 50, w: 34, h: 50 },
    look: { x: 54, y: 12, w: 46, h: 88 },
    fire: { x: 86, y: 76, size: 20 },
    aim: { x: 72, y: 64, size: 13 },
    jump: { x: 88, y: 56, size: 14 },
    crouch: { x: 74, y: 86, size: 12 },
    prone: { x: 64, y: 90, size: 11 },
    reload: { x: 62, y: 70, size: 11 },
    swap: { x: 93, y: 44, size: 10 },
    auto: { x: 54, y: 58, size: 10 },
    sprint: { x: 10, y: 52, size: 11 },
    medkit: { x: 20, y: 92, size: 12 },
    backpack: { x: 8, y: 92, size: 11 },
    scout: { x: 93, y: 93, size: 12 }
};

/** @type {(keyof TouchLayout)[]} */
export const TOUCH_LAYOUT_KEYS = [
    'move', 'fire', 'aim', 'jump', 'crouch', 'prone', 'reload', 'swap', 'auto',
    'sprint', 'medkit', 'backpack', 'scout'
];

/** @type {Record<keyof TouchLayout, string>} */
export const TOUCH_LAYOUT_LABELS = {
    move: 'Move / joystick',
    fire: 'Fire',
    aim: 'Aim',
    jump: 'Jump',
    crouch: 'Crouch',
    prone: 'Prone',
    reload: 'Reload',
    swap: 'Swap',
    auto: 'Auto fire',
    sprint: 'Sprint',
    medkit: 'Medkit',
    backpack: 'Backpack',
    scout: 'Scout'
};

/** @type {Record<keyof TouchLayout, string>} */
export const TOUCH_LAYOUT_TARGETS = {
    move: '#touch-move',
    fire: '#btn-fire',
    aim: '#btn-aim',
    jump: '#btn-jump',
    crouch: '#btn-crouch',
    prone: '#btn-prone',
    reload: '#btn-reload',
    swap: '#btn-swap',
    auto: '#btn-auto',
    sprint: '#btn-sprint',
    medkit: '#btn-medkit',
    backpack: '#btn-backpack',
    scout: '#btn-scout'
};

/**
 * @param {unknown} value - Parsed JSON value.
 * @returns {TouchLayout|null} Valid layout or null.
 */
function sanitize(value) {
    if (!value || typeof value !== 'object') {
        return null;
    }

    /** @type {TouchLayout} */
    const out = structuredClone(DEFAULT_TOUCH_LAYOUT);

    for (const key of TOUCH_LAYOUT_KEYS) {
        const src = /** @type {Record<string, unknown>} */ (value)[key];
        const dst = out[key];
        if (!src || typeof src !== 'object') {
            return null;
        }

        if (key === 'move') {
            const zone = /** @type {TouchZoneLayout} */ (dst);
            const z = /** @type {Record<string, unknown>} */ (src);
            if (typeof z.x !== 'number' || typeof z.y !== 'number' || typeof z.w !== 'number' || typeof z.h !== 'number') {
                return null;
            }
            zone.x = clamp(z.x, 0, 100);
            zone.y = clamp(z.y, 0, 100);
            zone.w = clamp(z.w, 8, 100);
            zone.h = clamp(z.h, 8, 100);
            continue;
        }

        const btn = /** @type {TouchButtonLayout} */ (dst);
        const b = /** @type {Record<string, unknown>} */ (src);
        if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.size !== 'number') {
            return null;
        }
        btn.x = clamp(b.x, 0, 100);
        btn.y = clamp(b.y, 0, 100);
        btn.size = clamp(b.size, 8, 40);
    }

    return out;
}

/**
 * @param {number} value - Input value.
 * @param {number} min - Minimum allowed value.
 * @param {number} max - Maximum allowed value.
 * @returns {number} Clamped value.
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * @returns {TouchLayout} Saved layout or the built-in default.
 */
export function loadTouchLayout() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return structuredClone(DEFAULT_TOUCH_LAYOUT);
        }
        return sanitize(JSON.parse(raw)) ?? structuredClone(DEFAULT_TOUCH_LAYOUT);
    } catch {
        return structuredClone(DEFAULT_TOUCH_LAYOUT);
    }
}

/**
 * @param {TouchLayout} layout - Layout to persist.
 */
export function saveTouchLayout(layout) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

/**
 * @param {HTMLElement} root - Touch UI root element.
 * @param {TouchLayout} layout - Layout to apply.
 */
export function applyTouchLayout(root, layout) {
    for (const key of TOUCH_LAYOUT_KEYS) {
        const sel = TOUCH_LAYOUT_TARGETS[key];
        const el = /** @type {HTMLElement|null} */ (root.querySelector(sel));
        if (!el) {
            continue;
        }

        const item = layout[key];
        el.style.right = 'auto';
        el.style.bottom = 'auto';

        if (key === 'move') {
            const zone = /** @type {TouchZoneLayout} */ (item);
            el.style.left = `${zone.x}%`;
            el.style.top = `${zone.y}%`;
            el.style.width = `${zone.w}%`;
            el.style.height = `${zone.h}%`;
            continue;
        }

        const btn = /** @type {TouchButtonLayout} */ (item);
        el.style.left = `${btn.x}%`;
        el.style.top = `${btn.y}%`;
        el.style.width = `${btn.size}vmin`;
        el.style.height = `${btn.size}vmin`;
        el.style.marginLeft = `${-btn.size / 2}vmin`;
        el.style.marginTop = `${-btn.size / 2}vmin`;
    }
}

/**
 * @param {TouchZoneLayout} zone - Movement zone layout.
 * @returns {number} Joystick travel radius in CSS pixels.
 */
export function joystickRadiusFromZone(zone) {
    const zoneW = (zone.w / 100) * window.innerWidth;
    const zoneH = (zone.h / 100) * window.innerHeight;
    return clamp(Math.min(zoneW, zoneH) * 0.24, 36, 96);
}
