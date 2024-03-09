/// <reference types="vite/client" />
/// <reference types="google.accounts" />

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!API_BASE_URL) throw new Error('Invalid config, API_BASE_URL not defined');
if (!GOOGLE_CLIENT_ID) throw new Error('Invalid config, GOOGLE_CLIENT_ID not defined');

class UI {
    constructor() {
        this.ui = this.attachDom();
        this.auth = new Auth(API_BASE_URL);
        this.redirect = new RedirectAuth(API_BASE_URL);
        this.popup = new PopupAuth(API_BASE_URL);
        this.gsi = new GSIButtonAuth(
            API_BASE_URL,
            GOOGLE_CLIENT_ID,
            this.ui.gsiContainer,
            this.checkAndRenderAuthStatus.bind(this),
        );
        this.gsiCode = new GSIButtonCodeAuth(
            API_BASE_URL,
            GOOGLE_CLIENT_ID,
            this.checkAndRenderAuthStatus.bind(this),
        );
    }

    initialize() {
        this.redirect
            .onPageLoad()
            .then(t => this.checkAndRenderAuthStatus(t))
            .catch(console.error);
        this.ui.redirectButton.addEventListener('click', () => this.redirect.triggerAuthRedirect());
        this.ui.popupButton.addEventListener('click', () =>
            this.popup
                .triggerAuthPopup()
                .then(t => this.checkAndRenderAuthStatus(t))
                .catch(console.error),
        );
        this.ui.gsiCodeButton.addEventListener('click', () => this.gsiCode.client.requestCode());
    }

    attachDom() {
        const redirectButton = document.querySelector('#login-with-google-redirect-btn');
        const popupButton = document.querySelector('#login-with-google-popup-btn');
        const text = document.querySelector('#text');
        const subtext = document.querySelector('#subtext');
        const subtextAnswer = document.querySelector('#subtext-answer');
        const gsiContainer = document.querySelector('#gsi-container');
        const gsiCodeButton = document.querySelector('#login-with-google-client-btn');

        if (!redirectButton) throw new Error('Invalid DOM structure, redirectButton not found');
        if (!popupButton) throw new Error('Invalid DOM structure, popupButton not found');
        if (!text) throw new Error('Invalid DOM structure, text not found');
        if (!subtext) throw new Error('Invalid DOM structure, subtext not found');
        if (!subtextAnswer) throw new Error('Invalid DOM structure, subtextAnswer not found');
        if (!gsiContainer) throw new Error('Invalid DOM structure, gsiContainer not found');
        if (!gsiCodeButton) throw new Error('Invalid DOM structure, gsiCodeButton not found');

        return {
            redirectButton,
            popupButton,
            text,
            subtext,
            subtextAnswer,
            gsiContainer,
            gsiCodeButton,
        };
    }

    checkAndRenderAuthStatus(token) {
        this.ui.text.classList.remove('reveal--visible');
        this.ui.subtext.classList.remove('reveal--visible');

        return Promise.all([
            this.auth
                .checkAuth(token)
                .then(({ message }) => message)
                .catch(err => err.message),
            this.auth
                .checkProtectedAuth(token)
                .then(() => true)
                .catch(() => false),
        ]).then(([message, isAuthorized]) => {
            this.ui.text.classList.add('reveal--visible');
            this.ui.subtext.classList.add('reveal--visible');
            this.ui.text.textContent = message;
            this.ui.subtextAnswer.textContent = isAuthorized ? '✅' : '❌';
        });
    }
}

class Auth {
    constructor(apiBaseUrl) {
        this.authCheckUrl = `${apiBaseUrl}`;
        this.authCheckProtectedUrl = `${apiBaseUrl}/protected`;
    }

    checkAuth(args) {
        return this.fetchWithToken(this.authCheckUrl, args);
    }

    checkProtectedAuth(args) {
        return this.fetchWithToken(this.authCheckProtectedUrl, args);
    }

    fetchWithToken(url, args) {
        const { token } = args || {};

        return fetch(url, {
            headers: token ? { authorization: `Bearer ${token}` } : {},
        }).then(res => (res.ok ? res.json() : Promise.reject(new Error(res.statusText))));
    }
}

class RedirectAuth {
    constructor(apiBaseUrl) {
        this.authFlowStartUrl = `${apiBaseUrl}/auth/google/authorize`;
    }

    onPageLoad() {
        const url = new URL(document.location.href);
        const token = url.searchParams.get('token');

        if (!token) return Promise.resolve(null);

        url.searchParams.delete('token');
        history.replaceState(null, '', url);

        return Promise.resolve({ token });
    }

    triggerAuthRedirect() {
        location.href = this.authFlowStartUrl;
    }
}

class PopupAuth {
    constructor(apiBaseUrl) {
        this.authFlowStartUrl = `${apiBaseUrl}/auth/google/authorize`;
    }

    triggerAuthPopup() {
        return new Promise((resolve, reject) => {
            const appLocation = document.location.origin;
            const popup = window.open(this.authFlowStartUrl, 'auth popup', 'width=400, height=600');

            if (!popup) return reject(new Error('Failed to create auth popup'));

            const timer = setInterval(() => {
                try {
                    if (popup.location.origin !== appLocation) return;

                    const params = new URLSearchParams(popup.location.search);
                    const token = params.get('token');

                    if (!token) return;

                    popup.close();
                    clearInterval(timer);
                    resolve({ token });
                } catch {}
            }, 100);
        });
    }
}

class GSIButtonAuth {
    constructor(apiBaseUrl, googleClientId, parent, callback) {
        this.loginWithIdTokenUrl = `${apiBaseUrl}/auth/google-id/callback`;
        this.callback = callback;
        this.google = window.google;

        this.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: credentials => this.loginWithGoogleButton(credentials),
        });

        this.google.accounts.id.renderButton(parent, { type: 'standard', width: 256 });
    }

    loginWithGoogleButton({ credential }) {
        return fetch(this.loginWithIdTokenUrl, { method: 'POST', body: credential })
            .then(res => res.json())
            .then(this.callback);
    }
}

class GSIButtonCodeAuth {
    constructor(apiBaseUrl, googleClientId, callback) {
        this.loginWithCodeUrl = `${apiBaseUrl}/auth/google-code/callback`;
        this.callback = callback;
        this.google = window.google;
        this.client = this.google.accounts.oauth2.initCodeClient({
            client_id: googleClientId,
            scope: 'openid profile email',
            ux_mode: 'popup',
            callback: code => this.loginWithGoogleButton(code),
        });
    }

    loginWithGoogleButton({ code }) {
        return fetch(this.loginWithCodeUrl, { method: 'POST', body: code })
            .then(res => res.json())
            .then(this.callback);
    }
}

new UI().initialize();
