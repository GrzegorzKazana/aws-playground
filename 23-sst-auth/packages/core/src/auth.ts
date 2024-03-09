import { AuthHandler, GoogleAdapter, Session, Adapter } from 'sst/node/auth';
import { Config } from 'sst/node/config';
import { useBody, useMethod, usePath } from 'sst/node/api';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { IdTokenClaims } from 'openid-client';
import { google } from 'googleapis';

const redirect = !process.env.IS_LOCAL
    ? `https://${Config['webpage-url']}`
    : 'http://localhost:3000';

export const handler = AuthHandler({
    providers: {
        google: GoogleAdapter({
            mode: 'oidc',
            clientID: Config['google-client-id'],
            onSuccess: async (tokenset, client) => {
                return Session.parameter({
                    type: 'user',
                    redirect,
                    properties: googleIdTokenToAppJwt(tokenset.claims()),
                    options: {},
                });
            },
        }),
        'google-id': googleFromIdToken({ googleClientId: Config['google-client-id'] }),
        'google-code': googleFromCode({
            googleClientId: Config['google-client-id'],
            googleClientSecret: Config['google-client-secret'],
        }),
    },
});

/**
 * Adapter that authorizes user based on google generated id token.
 * Difference from `GoogleAdapter` is that `GoogleAdapter` handles the full auth flow,
 * this only expects token (which can be obtained by web app itself).
 */
function googleFromIdToken({ googleClientId }: { googleClientId: string }): Adapter {
    const jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

    return async () => {
        const [path] = usePath().slice(-1);
        const method = useMethod();
        const idToken = useBody();

        if (path !== 'callback') throw new Error('Invalid auth request');
        if (method !== 'POST') throw new Error('Invalid auth request method');
        if (!idToken) throw new Error('Invalid auth idToken');

        // verify provided jwt was signed by google
        // https://github.com/panva/jose/blob/main/docs/functions/jwks_remote.createRemoteJWKSet.md
        return jwtVerify(idToken, jwks, {
            issuer: 'https://accounts.google.com',
            audience: googleClientId,
        })
            .then(({ payload }) => {
                const token = Session.create({
                    type: 'user',
                    properties: googleIdTokenToAppJwt(payload),
                    options: {},
                });

                return { statusCode: 200, body: JSON.stringify({ token }) };
            })
            .catch(err => {
                return {
                    statusCode: 401,
                    body: JSON.stringify({
                        message: `${err.code}: ${err.message}`,
                    }),
                };
            });
    };
}

/**
 * Adapter that authorizes user based on google generated auth code (Authorization flow).
 * Difference from `GoogleAdapter` is that `GoogleAdapter` handles the full auth flow,
 * this only expects code obtained by frontend, which later needs to be exchanged for actual access token.
 */
function googleFromCode({
    googleClientId,
    googleClientSecret,
}: {
    googleClientId: string;
    googleClientSecret: string;
}): Adapter {
    const oauth2Client = new google.auth.OAuth2(googleClientId, googleClientSecret, redirect);

    /**
     * This does not verify signature, use only on trusted tokens.
     */
    function parseJwt(token: string) {
        return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    }

    return async () => {
        const [path] = usePath().slice(-1);
        const method = useMethod();
        const code = useBody();

        if (path !== 'callback') throw new Error('Invalid auth request');
        if (method !== 'POST') throw new Error('Invalid auth request method');
        if (!code) throw new Error('Invalid auth code');

        return oauth2Client
            .getToken(code)
            .then(({ tokens }) => {
                if (!tokens.id_token) return Promise.reject(new Error('Missing id_token'));

                const payload = parseJwt(tokens.id_token);

                const token = Session.create({
                    type: 'user',
                    properties: googleIdTokenToAppJwt(payload),
                    options: {},
                });

                return { statusCode: 200, body: JSON.stringify({ token }) };
            })
            .catch(err => {
                return {
                    statusCode: 401,
                    body: JSON.stringify({
                        message: err.message,
                    }),
                };
            });
    };
}

function googleIdTokenToAppJwt({ email = '', sub = '', name = '' }: Partial<IdTokenClaims>): {
    email: string;
    id: string;
    name: string;
} {
    return { email, id: sub, name };
}

declare module 'sst/node/auth' {
    export interface SessionTypes {
        user: {
            id: string;
            email: string;
            name: string;
        };
    }
}
