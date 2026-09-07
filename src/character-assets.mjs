/** @typedef {{ id: string, name: string, url: string, playable?: boolean }} CharacterAsset */

/** @type {CharacterAsset[]} */
export const CHARACTER_ASSETS = [
    { id: 'long-gorn', name: 'Long Gorn', url: '/assets/charcter/long_horn_motion_glb.glb', playable: true },
    { id: 'x-bot-jump-backward', name: 'X Bot — Jump Backward', url: '/assets/charcter/x-bot-jump-backward.glb', playable: false },
    { id: 'soldier', name: 'Soldier', url: '/assets/models/player/soldier.glb', playable: false }
];

/**
 * Animation-only GLBs — Mixamo "without skin" downloads carry a skeleton and clips but no mesh, so
 * they cannot be viewed on their own. The inspector renders `hostUrl` as the body and takes the
 * clips from `url`. Any host works as long as its bone names match: the anim binder resolves curves
 * by full path first, then falls back to matching on leaf bone name.
 *
 * @typedef {{ id: string, name: string, url: string, hostUrl: string }} MotionClipAsset
 */

/** @type {MotionClipAsset[]} */
export const MOTION_CLIPS = [
    {
        id: 'jump-backward',
        name: 'Jump Backward',
        url: '/assets/charcter/jump-backward.glb',
        hostUrl: '/assets/charcter/x-bot-jump-backward.glb'
    }
];

export const DEFAULT_PLAYER_ID = 'long-gorn';

const STORAGE_KEY = 'battleground.playerId';

/**
 * @param {{ id: string, resource?: { name?: string }, name?: string }} clip - Container animation asset.
 * @returns {string} Display / state name for the clip.
 */
export function clipName(clip) {
    return clip.resource?.name || clip.name || 'clip';
}

/**
 * @param {object[]} clips - Container animation assets.
 * @returns {object|null} Best default clip for preview / locomotion.
 */
export function pickDefaultClip(clips) {
    return clips.find((c) => /run|walk|idle|jump/i.test(clipName(c))) ?? clips[0] ?? null;
}

/**
 * Player model URL from `?player=` or saved inspect choice.
 *
 * @returns {string} GLB URL for the in-game body.
 */
export function resolvePlayerAssetUrl() {
    const param = new URLSearchParams(location.search).get('player');
    const fromParam = CHARACTER_ASSETS.find((item) => item.id === param);
    if (fromParam?.playable) {
        return fromParam.url;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    const fromStorage = CHARACTER_ASSETS.find((item) => item.id === stored);
    if (fromStorage?.playable) {
        return fromStorage.url;
    }

    return CHARACTER_ASSETS.find((item) => item.id === DEFAULT_PLAYER_ID).url;
}

/**
 * @param {string} id - Character catalog id.
 */
export function savePlayerChoice(id) {
    localStorage.setItem(STORAGE_KEY, id);
}
