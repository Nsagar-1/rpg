/**
 * Synthesised game audio. The prototype ships no sound assets, so shots, hits and pickups are
 * generated with WebAudio primitives — enough feedback to judge weapon feel, and swappable for
 * real samples later.
 */

/** @type {AudioContext|null} */
let ctx = null;

/** @type {GainNode|null} */
let master = null;

/** @type {AudioBuffer|null} */
let noiseBuffer = null;

let muted = false;

function ensureContext() {
    if (ctx) {
        return ctx;
    }

    const Ctor = window.AudioContext ?? /** @type {any} */ (window).webkitAudioContext;
    if (!Ctor) {
        return null;
    }

    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);

    const length = Math.floor(ctx.sampleRate * 0.4);
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    return ctx;
}

/** Browsers block audio until a gesture; call this from the first click/tap. */
export function unlockAudio() {
    const c = ensureContext();
    if (c?.state === 'suspended') {
        c.resume();
    }
}

/**
 * @param {boolean} value - True to silence all audio.
 */
export function setMuted(value) {
    muted = value;
    if (master) {
        master.gain.value = value ? 0 : 0.35;
    }
}

/**
 * @returns {boolean} True while audio is silenced.
 */
export function isMuted() {
    return muted;
}

/**
 * Noise burst through a lowpass — the body of a gunshot or impact.
 *
 * @param {number} freq - Filter cutoff in Hz.
 * @param {number} duration - Seconds.
 * @param {number} gain - Peak gain.
 */
function burst(freq, duration, gain) {
    const c = ensureContext();
    if (!c || !master || !noiseBuffer || muted) {
        return;
    }

    const src = c.createBufferSource();
    src.buffer = noiseBuffer;

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4, c.currentTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq, 40), c.currentTime + duration);

    const env = c.createGain();
    env.gain.setValueAtTime(gain, c.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);

    src.connect(filter).connect(env).connect(master);
    src.start();
    src.stop(c.currentTime + duration);
}

/**
 * Short pitched blip — UI and hitmarker feedback.
 *
 * @param {number} freq - Frequency in Hz.
 * @param {number} duration - Seconds.
 * @param {number} gain - Peak gain.
 * @param {OscillatorType} [type] - Oscillator waveform.
 */
function tone(freq, duration, gain, type = 'square') {
    const c = ensureContext();
    if (!c || !master || muted) {
        return;
    }

    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, c.currentTime);

    const env = c.createGain();
    env.gain.setValueAtTime(gain, c.currentTime);
    env.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);

    osc.connect(env).connect(master);
    osc.start();
    osc.stop(c.currentTime + duration);
}

export const sfx = {
    /** @param {number} freq - Weapon-specific base frequency. */
    shot(freq) {
        burst(freq, 0.14, 0.5);
        tone(freq * 0.5, 0.07, 0.12, 'sawtooth');
    },
    hit() {
        tone(880, 0.05, 0.2, 'square');
    },
    headshot() {
        tone(1320, 0.07, 0.25, 'square');
    },
    kill() {
        tone(660, 0.08, 0.2);
        setTimeout(() => tone(990, 0.12, 0.2), 70);
    },
    reload() {
        tone(220, 0.06, 0.12, 'triangle');
        setTimeout(() => tone(160, 0.08, 0.12, 'triangle'), 140);
    },
    empty() {
        tone(140, 0.05, 0.12, 'square');
    },
    pickup() {
        tone(520, 0.06, 0.16, 'triangle');
        setTimeout(() => tone(780, 0.1, 0.16, 'triangle'), 60);
    },
    heal() {
        tone(440, 0.09, 0.14, 'sine');
        setTimeout(() => tone(660, 0.12, 0.14, 'sine'), 80);
    },
    playerHit() {
        burst(180, 0.18, 0.4);
    },
    death() {
        burst(90, 0.6, 0.5);
    }
};
