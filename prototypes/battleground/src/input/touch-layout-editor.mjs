import {
    DEFAULT_TOUCH_LAYOUT,
    TOUCH_LAYOUT_KEYS,
    TOUCH_LAYOUT_LABELS,
    saveTouchLayout
} from './touch-layout.mjs';

/** @import { TouchLayout, TouchButtonLayout, TouchZoneLayout } from './touch-layout.mjs' */

/**
 * @typedef {object} TouchLayoutEditorOptions
 * @property {HTMLElement} root - Touch UI root.
 * @property {() => TouchLayout} getLayout - Current layout reader.
 * @property {(layout: TouchLayout) => void} setLayout - Layout writer.
 * @property {(layout: TouchLayout) => void} onApply - Re-apply geometry after edits.
 * @property {() => void} [onOpen] - Called when edit mode starts.
 * @property {() => void} [onClose] - Called when edit mode ends.
 */

/**
 * Overlay editor: drag controls anywhere on screen and resize them with a corner handle.
 *
 * @param {TouchLayoutEditorOptions} options - Editor wiring.
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean }} Editor handle.
 */
export function createTouchLayoutEditor({ root, getLayout, setLayout, onApply, onOpen, onClose }) {
    const panel = document.createElement('div');
    panel.id = 'touch-layout-editor';
    panel.innerHTML = `
        <div id="touch-layout-toolbar">
            <strong>Customize controls</strong>
            <span>Drag to move · corner handle to resize</span>
            <div id="touch-layout-actions">
                <button type="button" id="touch-layout-reset">Reset</button>
                <button type="button" id="touch-layout-done">Done</button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    /** @type {Map<string, HTMLElement>} */
    const handles = new Map();

    for (const key of TOUCH_LAYOUT_KEYS) {
        const frame = document.createElement('div');
        frame.className = 'touch-layout-frame';
        frame.dataset.control = key;
        frame.innerHTML = `
            <span class="touch-layout-label">${TOUCH_LAYOUT_LABELS[key]}</span>
            <button type="button" class="touch-layout-resize" aria-label="Resize ${TOUCH_LAYOUT_LABELS[key]}"></button>
        `;
        panel.appendChild(frame);
        handles.set(key, frame);
    }

    let open = false;

    /**
     * @param {keyof TouchLayout} key - Control id.
     * @returns {boolean} True when the entry describes a zone rather than a button.
     */
    const isZone = key => key === 'move';

    /**
     * @param {HTMLElement} frame - Selection chrome around a control.
     * @param {keyof TouchLayout} key - Control id.
     */
    const syncFrame = (frame, key) => {
        const layout = getLayout()[key];
        if (isZone(key)) {
            const zone = /** @type {TouchZoneLayout} */ (layout);
            frame.style.left = `${zone.x}%`;
            frame.style.top = `${zone.y}%`;
            frame.style.width = `${zone.w}%`;
            frame.style.height = `${zone.h}%`;
            frame.style.marginLeft = '0';
            frame.style.marginTop = '0';
            return;
        }

        const btn = /** @type {TouchButtonLayout} */ (layout);
        frame.style.left = `${btn.x}%`;
        frame.style.top = `${btn.y}%`;
        frame.style.width = `${btn.size}vmin`;
        frame.style.height = `${btn.size}vmin`;
        frame.style.marginLeft = `${-btn.size / 2}vmin`;
        frame.style.marginTop = `${-btn.size / 2}vmin`;
    };

    const syncAllFrames = () => {
        for (const key of TOUCH_LAYOUT_KEYS) {
            syncFrame(handles.get(key), key);
        }
    };

    /**
     * @param {number} value - Input value.
     * @param {number} min - Minimum allowed value.
     * @param {number} max - Maximum allowed value.
     * @returns {number} Clamped value.
     */
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    /**
     * @param {keyof TouchLayout} key - Control being edited.
     * @param {number} dx - Horizontal delta in pixels.
     * @param {number} dy - Vertical delta in pixels.
     */
    const moveControl = (key, dx, dy) => {
        const layout = structuredClone(getLayout());
        const item = layout[key];

        if (isZone(key)) {
            const zone = /** @type {TouchZoneLayout} */ (item);
            zone.x = clamp(zone.x + (dx / window.innerWidth) * 100, 0, 100 - zone.w);
            zone.y = clamp(zone.y + (dy / window.innerHeight) * 100, 0, 100 - zone.h);
        } else {
            const btn = /** @type {TouchButtonLayout} */ (item);
            btn.x = clamp(btn.x + (dx / window.innerWidth) * 100, 0, 100);
            btn.y = clamp(btn.y + (dy / window.innerHeight) * 100, 0, 100);
        }

        setLayout(layout);
        onApply(layout);
        syncFrame(handles.get(key), key);
    };

    /**
     * @param {keyof TouchLayout} key - Control being edited.
     * @param {number} dx - Horizontal delta in pixels.
     * @param {number} dy - Vertical delta in pixels.
     */
    const resizeControl = (key, dx, dy) => {
        const layout = structuredClone(getLayout());
        const item = layout[key];
        const delta = Math.max(dx, dy);

        if (isZone(key)) {
            const zone = /** @type {TouchZoneLayout} */ (item);
            zone.w = clamp(zone.w + (delta / window.innerWidth) * 100, 12, 100 - zone.x);
            zone.h = clamp(zone.h + (delta / window.innerHeight) * 100, 12, 100 - zone.y);
        } else {
            const btn = /** @type {TouchButtonLayout} */ (item);
            const minSide = Math.min(window.innerWidth, window.innerHeight);
            btn.size = clamp(btn.size + (delta / minSide) * 100, 8, 40);
        }

        setLayout(layout);
        onApply(layout);
        syncFrame(handles.get(key), key);
    };

    /**
     * @param {HTMLElement} el - Drag surface.
     * @param {(dx: number, dy: number, event: PointerEvent) => void} onDelta - Drag callback.
     */
    const bindDrag = (el, onDelta) => {
        /** @type {number|null} */
        let pointerId = null;
        let lastX = 0;
        let lastY = 0;

        el.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            pointerId = e.pointerId;
            lastX = e.clientX;
            lastY = e.clientY;
            try {
                el.setPointerCapture(e.pointerId);
            } catch {
                /* pointer already released */
            }
        });

        el.addEventListener('pointermove', (e) => {
            if (e.pointerId !== pointerId) {
                return;
            }
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            if (dx !== 0 || dy !== 0) {
                onDelta(dx, dy, e);
            }
        });

        const end = (/** @type {PointerEvent} */ e) => {
            if (e.pointerId !== pointerId) {
                return;
            }
            pointerId = null;
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
    };

    for (const key of TOUCH_LAYOUT_KEYS) {
        const frame = handles.get(key);
        const resize = /** @type {HTMLElement} */ (frame.querySelector('.touch-layout-resize'));
        bindDrag(frame, (dx, dy) => moveControl(key, dx, dy));
        bindDrag(resize, (dx, dy) => resizeControl(key, dx, dy));
    }

    /** @type {HTMLElement} */
    const resetBtn = panel.querySelector('#touch-layout-reset');
    /** @type {HTMLElement} */
    const doneBtn = panel.querySelector('#touch-layout-done');

    resetBtn.addEventListener('click', () => {
        const layout = structuredClone(DEFAULT_TOUCH_LAYOUT);
        setLayout(layout);
        onApply(layout);
        syncAllFrames();
    });

    const closeEditor = () => {
        if (!open) {
            return;
        }
        open = false;
        root.classList.remove('editing');
        panel.classList.remove('open');
        saveTouchLayout(getLayout());
        onClose?.();
    };

    doneBtn.addEventListener('click', closeEditor);

    window.addEventListener('resize', () => {
        if (open) {
            onApply(getLayout());
            syncAllFrames();
        }
    });

    return {
        isOpen: () => open,
        open() {
            if (open) {
                return;
            }
            open = true;
            root.classList.add('editing');
            panel.classList.add('open');
            onApply(getLayout());
            syncAllFrames();
            onOpen?.();
        },
        close: closeEditor
    };
}
