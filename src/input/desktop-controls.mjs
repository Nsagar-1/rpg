/**
 * Keyboard + mouse bindings, written into a shared {@link InputState}.
 *
 * @typedef {object} DesktopOptions
 * @property {HTMLCanvasElement} canvas - Pointer lock target.
 * @property {import('./input-state.mjs').InputState} input - Shared input state.
 * @property {() => boolean} isBlocked - True when a UI overlay owns the keyboard (dev panel, death screen).
 */

const KEY_TO_ACTION = {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'back',
    ArrowDown: 'back',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right'
};

/**
 * @param {DesktopOptions} options - Canvas, shared input state and the UI-blocked predicate.
 * @returns {{ destroy: () => void, lock: () => void, isLocked: () => boolean }} Pointer lock
 * helpers and a teardown function.
 */
export function createDesktopControls({ canvas, input, isBlocked }) {
    const held = new Set();

    const syncMove = () => {
        input.moveX = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
        input.moveY = (held.has('forward') ? 1 : 0) - (held.has('back') ? 1 : 0);
    };

    const isLocked = () => document.pointerLockElement === canvas;

    const lock = () => {
        if (!input.touchMode && !isLocked()) {
            canvas.requestPointerLock();
        }
    };

    /** @param {KeyboardEvent} e - Key event. */
    const onKeyDown = (e) => {
        if (e.repeat || isBlocked()) {
            return;
        }

        const action = KEY_TO_ACTION[e.code];
        if (action) {
            held.add(action);
            syncMove();
            return;
        }

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                input.queueJump();
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                input.sprint = true;
                break;
            case 'KeyC':
            case 'ControlLeft':
                input.crouch = !input.crouch;
                input.prone = false;
                input.sit = false;
                break;
            case 'KeyZ':
                input.prone = !input.prone;
                input.crouch = false;
                input.sit = false;
                break;
            case 'KeyX':
                input.sit = !input.sit;
                input.crouch = false;
                input.prone = false;
                break;
            case 'KeyH':
                input.queueMedkit();
                break;
            case 'KeyV':
                input.queueScout();
                break;
            case 'KeyR':
                input.queueReload();
                break;
            case 'KeyE':
                input.queuePickup();
                break;
            case 'KeyG':
                input.queueDrop();
                break;
            case 'KeyQ':
                input.queueSwitch(-2); // -2 = cycle to the other slot
                break;
            case 'Digit1':
                input.queueSwitch(0);
                break;
            case 'Digit2':
                input.queueSwitch(1);
                break;
            case 'Digit3':
                input.queueSwitch(-1);
                break;
            case 'KeyF':
                input.fire = true;
                input.queueFire();
                break;
            default:
                break;
        }
    };

    /** @param {KeyboardEvent} e - Key event. */
    const onKeyUp = (e) => {
        const action = KEY_TO_ACTION[e.code];
        if (action) {
            held.delete(action);
            syncMove();
            return;
        }

        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            input.sprint = false;
        }
        if (e.code === 'KeyF') {
            input.fire = false;
        }
    };

    /** @param {MouseEvent} e - Mouse event. */
    const onMouseDown = (e) => {
        if (input.touchMode) {
            return;
        }
        if (!isLocked()) {
            lock();
            return;
        }
        if (e.button === 0) {
            input.fire = true;
            input.queueFire();
        }
        if (e.button === 2) {
            input.aim = true;
        }
    };

    /** @param {MouseEvent} e - Mouse event. */
    const onMouseUp = (e) => {
        if (e.button === 0) {
            input.fire = false;
        }
        if (e.button === 2) {
            input.aim = false;
        }
    };

    /** @param {MouseEvent} e - Mouse event. */
    const onMouseMove = (e) => {
        if (!isLocked()) {
            return;
        }
        input.lookX += e.movementX;
        input.lookY += e.movementY;
    };

    /** @param {WheelEvent} e - Wheel event. */
    const onWheel = (e) => {
        if (!isLocked()) {
            return;
        }
        input.queueSwitch(-2);
    };

    const onBlur = () => {
        held.clear();
        input.reset();
    };

    const onContextMenu = (/** @type {Event} */ e) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('wheel', onWheel, { passive: true });
    canvas.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', () => {
        if (!isLocked()) {
            onBlur();
        }
    });

    return {
        lock,
        isLocked,
        destroy() {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            canvas.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('wheel', onWheel);
            canvas.removeEventListener('contextmenu', onContextMenu);
        }
    };
}
