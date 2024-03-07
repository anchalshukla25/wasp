{{={= =}=}}
import { Router, Request as ExpressRequest } from "express";
import { Google, generateCodeVerifier, generateState } from "arctic";

import { HttpError } from 'wasp/server';
import { handleRejection } from "wasp/server/utils";
import type { ProviderConfig } from "wasp/auth/providers/types";
import { callbackPath, getRedirectUriForCallback } from "../oauth/redirect.js";
import { finishOAuthFlowAndGetRedirectUri } from "../oauth/user.js";
import { getCodeVerifierCookieName, getStateCookieName, getValueFromCookie, setValueInCookie } from "../oauth/cookies.js";
import { ensureEnvVarsForProvider } from "../oauth/env.js";
import { mergeDefaultAndUserConfig } from "../oauth/config.js";

{=# userSignupFields.isDefined =}
{=& userSignupFields.importStatement =}
const _waspUserSignupFields = {= userSignupFields.importIdentifier =}
{=/ userSignupFields.isDefined =}
{=^ userSignupFields.isDefined =}
const _waspUserSignupFields = undefined
{=/ userSignupFields.isDefined =}
{=# configFn.isDefined =}
{=& configFn.importStatement =}
const _waspUserDefinedConfigFn = {= configFn.importIdentifier =}
{=/ configFn.isDefined =}
{=^ configFn.isDefined =}
const _waspUserDefinedConfigFn = undefined
{=/ configFn.isDefined =}

const _waspConfig: ProviderConfig = {
    id: "{= providerId =}",
    displayName: "{= displayName =}",
    createRouter(provider) {
        const router = Router();

        const env = ensureEnvVarsForProvider(
            ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
            provider
        );

        const google = new Google(
            env.GOOGLE_CLIENT_ID,
            env.GOOGLE_CLIENT_SECRET,
            getRedirectUriForCallback(provider.id)
        );

        const config = mergeDefaultAndUserConfig({
            scopes: {=& requiredScopes =},
        }, _waspUserDefinedConfigFn);

        router.get('/login', handleRejection(async (_req, res) => {
            const state = generateState();
            setValueInCookie(getStateCookieName(provider.id), state, res);

            const codeVerifier = generateCodeVerifier();
            setValueInCookie(
                getCodeVerifierCookieName(provider.id),
                codeVerifier,
                res
            );

            const url = await google.createAuthorizationURL(state, codeVerifier, config);
            return res.status(302)
                .setHeader("Location", url.toString())
                .end();
        }));

        router.get(`/${callbackPath}`, handleRejection(async (req, res) => {
            try {
                const { code, codeVerifier } = getDataFromCallback(req);
                const { accessToken } = await google.validateAuthorizationCode(code, codeVerifier);
                const { providerProfile, providerUserId } = await getGoogleProfile(accessToken);
                const { redirectUri } =  await finishOAuthFlowAndGetRedirectUri(
                    provider,
                    providerProfile,
                    providerUserId,
                    _waspUserSignupFields,
                );

                return res
                    .status(302)
                    .setHeader("Location", redirectUri)
                    .end();
            } catch (e) {
                // TODO: handle different errors
                console.error(e);
        
                // TODO: it makes sense to redirect to the client with the OAuth erorr!
                throw new HttpError(500, "Something went wrong");
            }
        }));

        function getDataFromCallback(req: ExpressRequest): {
            code: string;
            codeVerifier: string;
        } {
            const storedState = getValueFromCookie(
                getStateCookieName(provider.id),
                req
            );
            const storedCodeVerifier = getValueFromCookie(
                getCodeVerifierCookieName(provider.id),
                req
            );
            const state = req.query.state;
            const code = req.query.code;
        
            if (
                !storedState ||
                !state ||
                storedState !== state ||
                typeof code !== "string"
            ) {
                throw new Error("Invalid state");
            }
        
            if (!storedCodeVerifier) {
                throw new Error("Invalid code verifier");
            }

            return {
                code,
                codeVerifier: storedCodeVerifier,
            }
        }

        async function getGoogleProfile(accessToken: string): Promise<{
            providerProfile: unknown;
            providerUserId: string;
        }> {
            const response = await fetch(
                "https://openidconnect.googleapis.com/v1/userinfo",
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                }
            );
            const providerProfile = (await response.json()) as {
                sub?: string;
            };
        
            if (!providerProfile.sub) {
                throw new Error("Invalid profile");
            }

            return { providerProfile, providerUserId: providerProfile.sub };
        }

        return router;
    },
}

export default _waspConfig;
