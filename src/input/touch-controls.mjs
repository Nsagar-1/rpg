import {
    applyTouchLayout,
    joystickRadiusFromZone,
    loadTouchLayout
} from './touch-layout.mjs';
import { createTouchLayoutEditor } from './touch-layout-editor.mjs';

/** @import { TouchLayout } from './touch-layout.mjs' */

/**
 * On-screen controls: a fixed virtual joystick for movement, swipe-anywhere-else for camera
 * look, plus action buttons (fire, aim, jump, crouch, reload, swap, auto-fire).
 *
 * Everything is driven by Pointer Events so the same code path serves touch screens and a mouse
 * dragging the overlay, which is what makes the layout testable on desktop.
 *
 * @typedef {object} TouchOptions
 * @property {import('./input-state.mjs').InputState} input - Shared input state.
 * @property {number} [lookSpeed] - Multiplier converting drag pixels into look pixels.
 */

/**
 * @param {TouchOptions} options - Shared input state and tuning values.
 * @returns {{
 *   root: HTMLElement,
 *   setVisible: (on: boolean) => void,
 *   isVisible: () => boolean,
 *   openLayoutEditor: () => void,
 *   closeLayoutEditor: () => void,
 *   isLayoutEditorOpen: () => boolean
 * }} Handle for showing and hiding the overlay.
 */
export function createTouchControls({ input, lookSpeed = 1.15 }) {
    const root = document.createElement('div');
    root.id = 'touch-ui';
    root.innerHTML = `
        <div class="touch-zone" id="touch-move"></div>
        <div id="joystick"><div id="joystick-knob"></div></div>
        <button type="button" class="tbtn tbtn-fire" id="btn-fire" aria-label="Fire">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/></svg>
        </button>
        <button type="button" class="tbtn tbtn-aim" id="btn-aim" aria-label="Aim down sights">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/></svg>
            <small>2x</small>
        </button>
        <button type="button" class="tbtn tbtn-jump" id="btn-jump" aria-label="Jump">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V5M6 11l6-6 6 6"/></svg>
        </button>
        <button type="button" class="tbtn tbtn-crouch" id="btn-crouch" aria-label="Crouch">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15M6 13l6 6 6-6"/></svg>
        </button>
        <button type="button" class="tbtn tbtn-prone" id="btn-prone" aria-label="Prone">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16h16M6 16l2-4h8l2 4M8 12V9h3"/></svg>
        </button>
        <button type="button" class="tbtn tbtn-sprint" id="btn-sprint" aria-label="Sprint">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 4a2 2 0 1 0 0-4"/><path d="M7 22l3-7 3 2 3-6"/><path d="M4 17l4-2 2-5h4"/></svg>
        </button>
        <button type="button" class="tbtn tbtn-medkit" id="btn-medkit" aria-label="Medkit">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h16v12H4z"/><path d="M10 3h4v5h-4z"/><path d="M12 12v6M9 15h6"/></svg>
            <em id="medkit-count">2</em>
        </button>
        <button type="button" class="tbtn tbtn-backpack" id="btn-backpack" aria-label="Pick up">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5a4 4 0 0 1 8 0v2"/><path d="M6 7h12v14H6z"/></svg>
        </button>
        <button type="button" class="tbtn tbtn-scout" id="btn-scout" aria-label="Scout">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M4 12h4M16 12h4M12 4v4M12 16v4"/></svg>
            <span>SCOUT</span>
        </button>
        <button type="button" class="tbtn tbtn-reload" id="btn-reload" aria-label="Reload">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.7-6"/><path d="M20 4v5h-5"/></svg>
        </button>
        <button type="button" class="tbtn tbtn-swap" id="btn-swap" aria-label="Swap weapon">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>
        </button>
        <button type="button" class="tbtn tbtn-auto" id="btn-auto" aria-label="Toggle auto fire">AUTO</button>
        <button type="button" id="touch-settings-btn" aria-label="Customize controls">⚙</button>
    `;
    document.body.appendChild(root);

    /** @type {(() => void)|null} */
    let zoomLockCleanup = null;

    /**
     * Blocks pinch-zoom and double-tap zoom while touch controls are active. iOS Safari can still
     * zoom on rapid fire-button taps unless touchstart/touchend are cancelled on the overlay.
     *
     * @returns {() => void} Call to remove the listeners.
     */
    const installZoomLock = () => {
        /**
         * @param {Event} e - Gesture event.
         */
        const blockGesture = (e) => {
            e.preventDefault();
        };

        let lastTouchEnd = 0;

        /**
         * @param {TouchEvent} e - Touch end event.
         */
        const blockDoubleTapZoom = (e) => {
            const now = performance.now();
            if (now - lastTouchEnd < 320) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        };

        /**
         * @param {TouchEvent} e - Touch start event.
         */
        const blockMultiTouch = (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        };

        /**
         * @param {TouchEvent} e - Touch start event.
         */
        const blockTouchStart = (e) => {
            e.preventDefault();
        };

        document.addEventListener('gesturestart', blockGesture, { passive: false });
        document.addEventListener('gesturechange', blockGesture, { passive: false });
        document.addEventListener('gestureend', blockGesture, { passive: false });
        root.addEventListener('touchend', blockDoubleTapZoom, { passive: false });
        root.addEventListener('touchstart', blockMultiTouch, { passive: false });

        for (const el of root.querySelectorAll('.tbtn, #touch-settings-btn, #touch-move')) {
            el.addEventListener('touchstart', blockTouchStart, { passive: false });
        }

        return () => {
            document.removeEventListener('gesturestart', blockGesture);
            document.removeEventListener('gesturechange', blockGesture);
            document.removeEventListener('gestureend', blockGesture);
            root.removeEventListener('touchend', blockDoubleTapZoom);
            root.removeEventListener('touchstart', blockMultiTouch);
            for (const el of root.querySelectorAll('.tbtn, #touch-settings-btn, #touch-move')) {
                el.removeEventListener('touchstart', blockTouchStart);
            }
        };
    };

    /** @type {TouchLayout} */
    let layout = loadTouchLayout();
    let layoutEditing = false;
    let joystickRadius = joystickRadiusFromZone(layout.move);

    const moveZone = /** @type {HTMLElement} */ (root.querySelector('#touch-move'));
    const stick = /** @type {HTMLElement} */ (root.querySelector('#joystick'));
    const knob = /** @type {HTMLElement} */ (root.querySelector('#joystick-knob'));

    let visible = false;
    let stickCenterX = 0;
    let stickCenterY = 0;

    /**
     * Keeps the joystick ring anchored to the centre of the move zone.
     */
    const syncJoystickAnchor = () => {
        const rect = moveZone.getBoundingClientRect();
        stickCenterX = rect.left + rect.width * 0.5;
        stickCenterY = rect.top + rect.height * 0.62;
        stick.style.left = `${stickCenterX}px`;
        stick.style.top = `${stickCenterY}px`;
    };

    /**
     * @param {number} dx - Knob offset X in CSS pixels.
     * @param {number} dy - Knob offset Y in CSS pixels.
     */
    const moveKnob = (dx, dy) => {
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };

    /**
     * @param {TouchLayout} next - Layout to apply to the DOM.
     */
    const applyLayout = (next) => {
        layout = next;
        applyTouchLayout(root, layout);
        joystickRadius = joystickRadiusFromZone(layout.move);
        syncJoystickAnchor();
    };

    applyLayout(layout);

    // --- Virtual joystick (fixed position) --------------------------------

    /** @type {number|null} */
    let movePointer = null;

    /**
     * @param {number} clientX - Pointer X in CSS pixels.
     * @param {number} clientY - Pointer Y in CSS pixels.
     */
    const applyStickDeflection = (clientX, clientY) => {
        let dx = clientX - stickCenterX;
        let dy = clientY - stickCenterY;
        const dist = Math.hypot(dx, dy);

        if (dist > joystickRadius) {
            dx = (dx / dist) * joystickRadius;
            dy = (dy / dist) * joystickRadius;
        }

        moveKnob(dx, dy);
        input.moveX = dx / joystickRadius;
        input.moveY = -dy / joystickRadius;
    };

    const releaseStick = () => {
        movePointer = null;
        stick.classList.remove('active');
        moveKnob(0, 0);
        input.moveX = 0;
        input.moveY = 0;
    };

    const layoutEditor = createTouchLayoutEditor({
        root,
        getLayout: () => layout,
        setLayout: (next) => {
            layout = next;
        },
        onApply: applyLayout,
        onOpen: () => {
            layoutEditing = true;
            releaseStick();
            input.reset();
        },
        onClose: () => {
            layoutEditing = false;
        }
    });

    /** @type {HTMLElement} */
    const settingsBtn = root.querySelector('#touch-settings-btn');
    settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        layoutEditor.open();
    });

    /**
     * Pointer capture keeps a drag alive when the thumb slides off the element. It can reject for
     * a pointer the browser no longer considers active, which must not abort the handler.
     *
     * @param {HTMLElement} el - Element to capture onto.
     * @param {number} pointerId - Pointer to capture.
     */
    const capture = (el, pointerId) => {
        try {
            el.setPointerCapture(pointerId);
        } catch {
            /* pointer already released */
        }
    };

    moveZone.addEventListener('pointerdown', (e) => {
        if (layoutEditing || !visible || movePointer !== null) {
            return;
        }
        e.stopPropagation();
        movePointer = e.pointerId;
        capture(moveZone, e.pointerId);
        stick.classList.add('active');
        applyStickDeflection(e.clientX, e.clientY);
    });

    moveZone.addEventListener('pointermove', (e) => {
        if (layoutEditing || e.pointerId !== movePointer) {
            return;
        }
        applyStickDeflection(e.clientX, e.clientY);
    });

    const endMove = (/** @type {PointerEvent} */ e) => {
        if (e.pointerId === movePointer) {
            releaseStick();
        }
    };
    moveZone.addEventListener('pointerup', endMove);
    moveZone.addEventListener('pointercancel', endMove);

    // --- Camera look (swipe anywhere outside the joystick and buttons) ---

    /** @type {Map<number, { lastX: number, lastY: number }>} */
    const lookPointers = new Map();

    /**
     * @param {EventTarget|null} target - Event target to inspect.
     * @returns {boolean} True when this target should not drive camera look.
     */
    const blocksLook = (target) => {
        if (!(target instanceof Element)) {
            return false;
        }
        return !!target.closest('#touch-move, #joystick, .tbtn, #touch-settings-btn, #touch-layout-editor');
    };

    /**
     * Turns drag movement into camera look. Used for full-screen swipes and by the fire button.
     *
     * @param {HTMLElement} el - Element to track drags on.
     * @param {() => void} [onTap] - Called when the drag ended without moving much.
     */
    const trackLook = (el, onTap) => {
        /** @type {number|null} */
        let id = null;
        let lastX = 0;
        let lastY = 0;
        let travel = 0;

        el.addEventListener('pointerdown', (e) => {
            if (layoutEditing || !visible || id !== null) {
                return;
            }
            id = e.pointerId;
            lastX = e.clientX;
            lastY = e.clientY;
            travel = 0;
            capture(el, e.pointerId);
        });

        el.addEventListener('pointermove', (e) => {
            if (layoutEditing || e.pointerId !== id) {
                return;
            }
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            travel += Math.abs(dx) + Math.abs(dy);
            input.lookX += dx * lookSpeed;
            input.lookY += dy * lookSpeed;
        });

        const end = (/** @type {PointerEvent} */ e) => {
            if (e.pointerId !== id) {
                return;
            }
            id = null;
            if (travel < 12) {
                onTap?.();
            }
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
    };

    root.addEventListener('pointerdown', (e) => {
        if (layoutEditing || !visible || blocksLook(e.target)) {
            return;
        }
        lookPointers.set(e.pointerId, { lastX: e.clientX, lastY: e.clientY });
        capture(root, e.pointerId);
    });

    root.addEventListener('pointermove', (e) => {
        const look = lookPointers.get(e.pointerId);
        if (!look) {
            return;
        }
        const dx = e.clientX - look.lastX;
        const dy = e.clientY - look.lastY;
        look.lastX = e.clientX;
        look.lastY = e.clientY;
        input.lookX += dx * lookSpeed;
        input.lookY += dy * lookSpeed;
    });

    const endLook = (/** @type {PointerEvent} */ e) => {
        lookPointers.delete(e.pointerId);
    };
    root.addEventListener('pointerup', endLook);
    root.addEventListener('pointercancel', endLook);

    // --- Buttons ----------------------------------------------------------

    /**
     * @param {string} id - Element id.
     * @param {object} handlers - Press behaviour.
     * @param {() => void} [handlers.onPress] - Called on pointer down.
     * @param {() => void} [handlers.onRelease] - Called on pointer up or cancel.
     * @param {boolean} [handlers.look] - Also feed drags on this button into camera look.
     * @returns {HTMLElement} The bound button.
     */
    const bind = (id, { onPress, onRelease, look = false }) => {
        const el = /** @type {HTMLElement} */ (root.querySelector(`#${id}`));
        el.addEventListener('pointerdown', (e) => {
            if (layoutEditing) {
                return;
            }
            e.preventDefault();
            el.classList.add('down');
            onPress?.();
        });
        const up = () => {
            el.classList.remove('down');
            onRelease?.();
        };
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('pointerleave', (e) => {
            // Only bail out when the pointer genuinely left; a captured drag keeps firing.
            if (!look && e.buttons === 0) {
                up();
            }
        });
        if (look) {
            trackLook(el);
        }
        return el;
    };

    bind('btn-fire', {
        look: true,
        onPress: () => {
            input.fire = true;
            input.queueFire();
        },
        onRelease: () => {
            input.fire = false;
        }
    });

    const aimBtn = bind('btn-aim', {
        onPress: () => {
            input.aim = !input.aim;
        }
    });

    bind('btn-jump', { onPress: () => input.queueJump() });

    const crouchBtn = bind('btn-crouch', {
        onPress: () => {
            input.crouch = !input.crouch;
            if (input.crouch) {
                input.prone = false;
            }
        }
    });

    const proneBtn = bind('btn-prone', {
        onPress: () => {
            input.prone = !input.prone;
            if (input.prone) {
                input.crouch = false;
            }
        }
    });

    bind('btn-sprint', {
        onPress: () => {
            input.sprint = true;
        },
        onRelease: () => {
            input.sprint = false;
        }
    });

    bind('btn-medkit', { onPress: () => input.queueMedkit() });
    bind('btn-backpack', { onPress: () => input.queuePickup() });
    bind('btn-scout', { onPress: () => input.queueScout() });

    bind('btn-reload', { onPress: () => input.queueReload() });
    bind('btn-swap', { onPress: () => input.queueSwitch(-2) });

    const autoBtn = bind('btn-auto', {
        onPress: () => {
            input.autoFire = !input.autoFire;
        }
    });

    // Toggle buttons need their lit state kept in sync with the input state, which other systems
    // (death, weapon switch) can also clear.
    const syncToggles = () => {
        aimBtn.classList.toggle('on', input.aim);
        crouchBtn.classList.toggle('on', input.crouch);
        proneBtn.classList.toggle('on', input.prone);
        autoBtn.classList.toggle('on', input.autoFire);
        requestAnimationFrame(syncToggles);
    };
    requestAnimationFrame(syncToggles);

    window.addEventListener('resize', () => {
        applyLayout(layout);
    });

    return {
        root,
        isVisible: () => visible,
        openLayoutEditor: () => layoutEditor.open(),
        closeLayoutEditor: () => layoutEditor.close(),
        isLayoutEditorOpen: () => layoutEditor.isOpen(),
        setVisible(on) {
            visible = on;
            input.touchMode = on;
            root.classList.toggle('active', on);
            if (on) {
                zoomLockCleanup?.();
                zoomLockCleanup = installZoomLock();
                syncJoystickAnchor();
            } else {
                zoomLockCleanup?.();
                zoomLockCleanup = null;
                layoutEditor.close();
                releaseStick();
                lookPointers.clear();
                input.reset();
            }
        }
    };
}
