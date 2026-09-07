/**
 * Client-side sign-in for the battleground prototype.
 *
 * Google Sign-In uses Google Identity Services (GIS). Set `VITE_GOOGLE_CLIENT_ID` in `.env`
 * (see `.env.example`) and add `http://localhost:5560` as an authorized JavaScript origin
 * in Google Cloud Console → APIs & Services → Credentials.
 *
 * @typedef {object} AuthUser
 * @property {'google'|'guest'} provider - Sign-in method.
 * @property {string} displayName - Name shown in the lobby and squad strip.
 * @property {string} [email] - Email when signed in with Google.
 * @property {string} [picture] - Avatar URL when signed in with Google.
 * @property {string} [sub] - Stable Google subject id.
 * @property {number} loggedInAt - Unix ms when the session was created.
 */

const STORAGE_KEY = 'battleground.auth.v1';
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';

/** @type {AuthUser|null} */
let currentUser = null;

/**
 * @returns {AuthUser|null} Restored session, or null when logged out / expired.
 */
export function getAuthUser() {
    return currentUser;
}

/**
 * @returns {boolean} True once the player has passed the login screen.
 */
export function isAuthenticated() {
    return currentUser !== null;
}

/**
 * @param {AuthUser} user - Session to persist.
 */
function saveSession(user) {
    currentUser = user;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

/**
 * Clears the saved session and returns to the login screen.
 */
export function signOut() {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEY);
    if (window.google?.accounts?.id) {
        window.google.accounts.id.disableAutoSelect();
    }
}

/**
 * @returns {AuthUser|null} Parsed session from localStorage.
 */
function loadSession() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const data = JSON.parse(raw);
        if (!data || typeof data.displayName !== 'string' || !data.provider) {
            return null;
        }
        return /** @type {AuthUser} */ (data);
    } catch {
        return null;
    }
}

/**
 * @param {string} token - Google credential JWT.
 * @returns {AuthUser} Parsed profile fields.
 */
function userFromGoogleJwt(token) {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return {
        provider: 'google',
        displayName: payload.name ?? payload.email ?? 'Player',
        email: payload.email,
        picture: payload.picture,
        sub: payload.sub,
        loggedInAt: Date.now()
    };
}

/**
 * Loads the GIS client script once.
 *
 * @returns {Promise<void>}
 */
function loadGoogleScript() {
    if (window.google?.accounts?.id) {
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('Google Sign-In failed to load')), { once: true });
            return;
        }
        const script = document.createElement('script');
        script.src = GOOGLE_SCRIPT;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Google Sign-In failed to load'));
        document.head.appendChild(script);
    });
}

/**
 * @typedef {object} LoginFlowOptions
 * @property {HTMLElement} loginScreen - Full-screen sign-in panel.
 * @property {HTMLElement} lobbyScreen - Post-auth lobby (play + options).
 * @property {HTMLElement} googleBtnHost - Container for the rendered Google button.
 * @property {HTMLButtonElement} guestBtn - Continue without account.
 * @property {HTMLButtonElement} playBtn - Enter match from the lobby.
 * @property {HTMLButtonElement} signOutBtn - Sign out from the lobby.
 * @property {HTMLElement} authError - Inline error text.
 * @property {HTMLElement} authSetupHint - Shown when no Google client id is configured.
 * @property {HTMLImageElement} userAvatar - Lobby avatar image.
 * @property {HTMLElement} userName - Lobby display name.
 * @property {HTMLElement} userEmail - Lobby email line.
 * @property {HTMLElement} userBadge - Provider pill (Google / Guest).
 * @property {(user: AuthUser) => void} [onUserChange] - Fired after sign-in or sign-out.
 * @property {() => void} onStartGame - Lobby play button — hide lobby and start the match.
 */

/**
 * Wires login → lobby → play. Restores a saved session on load when present.
 *
 * @param {LoginFlowOptions} options - DOM hooks and callbacks.
 * @returns {{ showLogin: () => void, showLobby: (user: AuthUser) => void, isPreGame: () => boolean }}
 */
export function createLoginFlow({
    loginScreen,
    lobbyScreen,
    googleBtnHost,
    guestBtn,
    playBtn,
    signOutBtn,
    authError,
    authSetupHint,
    userAvatar,
    userName,
    userEmail,
    userBadge,
    onUserChange,
    onStartGame
}) {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';

    /**
     * @param {string} message - Error to show under the buttons.
     */
    const showError = (message) => {
        authError.textContent = message;
        authError.hidden = !message;
    };

    /**
     * @param {AuthUser} user - Signed-in profile.
     */
    const paintLobby = (user) => {
        userName.textContent = user.displayName;
        userEmail.textContent = user.email ?? (user.provider === 'guest' ? 'Guest account · progress is local only' : '');
        userBadge.textContent = user.provider === 'google' ? 'Google' : 'Guest';
        userBadge.dataset.provider = user.provider;
        if (user.picture) {
            userAvatar.src = user.picture;
            userAvatar.alt = user.displayName;
            userAvatar.hidden = false;
        } else {
            userAvatar.hidden = true;
            userAvatar.removeAttribute('src');
        }
    };

    const showLogin = () => {
        loginScreen.classList.remove('hidden');
        lobbyScreen.classList.add('hidden');
    };

    /**
     * @param {AuthUser} user - Profile to show in the lobby.
     */
    const showLobby = (user) => {
        saveSession(user);
        paintLobby(user);
        loginScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        showError('');
        onUserChange?.(user);
    };

    /**
     * @param {AuthUser} user - Completed sign-in.
     */
    const completeSignIn = (user) => {
        showLobby(user);
    };

    guestBtn.addEventListener('click', () => {
        showError('');
        completeSignIn({
            provider: 'guest',
            displayName: `Guest${Math.floor(Math.random() * 9000 + 1000)}`,
            loggedInAt: Date.now()
        });
    });

    signOutBtn.addEventListener('click', () => {
        signOut();
        onUserChange?.(/** @type {AuthUser} */ (null));
        showLogin();
    });

    playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentUser) {
            showLogin();
            return;
        }
        lobbyScreen.classList.add('hidden');
        onStartGame();
    });

    lobbyScreen.addEventListener('click', (e) => {
        if (!(/** @type {Element} */ (e.target)).closest('#lobby-options, #lobby-signout, button')) {
            playBtn.click();
        }
    });

    // --- Google Identity Services -------------------------------------------

    if (!clientId) {
        authSetupHint.hidden = false;
        authSetupHint.textContent = 'Add VITE_GOOGLE_CLIENT_ID to .env for real Google sign-in (see .env.example). Guest works without it.';
    } else {
        authSetupHint.hidden = true;
        loadGoogleScript()
            .then(() => {
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: (/** @type {{ credential: string }} */ response) => {
                        try {
                            showError('');
                            completeSignIn(userFromGoogleJwt(response.credential));
                        } catch {
                            showError('Could not read Google profile. Try again or use Guest.');
                        }
                    },
                    auto_select: false,
                    cancel_on_tap_outside: true
                });
                window.google.accounts.id.renderButton(googleBtnHost, {
                    type: 'standard',
                    theme: 'filled_blue',
                    size: 'large',
                    text: 'signin_with',
                    shape: 'pill',
                    logo_alignment: 'left',
                    width: Math.min(320, googleBtnHost.clientWidth || 320)
                });
            })
            .catch(() => {
                showError('Google Sign-In could not load. Check your connection or use Guest.');
            });
    }

    // --- Boot: restore session or show login --------------------------------

    const saved = loadSession();
    if (saved) {
        currentUser = saved;
        paintLobby(saved);
        loginScreen.classList.add('hidden');
        lobbyScreen.classList.remove('hidden');
        onUserChange?.(saved);
    } else {
        showLogin();
    }

    return {
        showLogin,
        showLobby,
        /** @returns {boolean} True while login or lobby is visible (game input should stay blocked). */
        isPreGame: () => !loginScreen.classList.contains('hidden') || !lobbyScreen.classList.contains('hidden')
    };
}
