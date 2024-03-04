{{={= =}=}}
import { Router } from "express";
import { Google, generateCodeVerifier, generateState } from "arctic";

import type { ProviderConfig } from "wasp/auth/providers/types";
import { createProviderId } from 'wasp/auth/utils'
import { callbackPath, getRedirectUriForCallback, getRedirectUriForOneTimeCode } from "../oauth/redirect.js";
import { getAuthIdFromProviderDetails } from "../oauth/user.js";
import { getCodeVerifierCookieName, getStateCookieName, getValueFromCookie, setValueInCookie } from "../oauth/cookies.js";
import { tokenStore } from "../oauth/oneTimeCode.js";

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

        // TODO: make sure to validate the env vars
        const google = new Google(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            getRedirectUriForCallback(provider.id)
        );

        router.get('/login', async (_req, res) => {
            const state = generateState();
            const codeVerifier = generateCodeVerifier();
            const url = await google.createAuthorizationURL(state, codeVerifier, {
                // TODO: use the user defined config function
                scopes: {=& requiredScopes =}
            });
            setValueInCookie(getStateCookieName(provider.id), state, res);
            setValueInCookie(
                getCodeVerifierCookieName(provider.id),
                codeVerifier,
                res
            );
            return res.status(302).setHeader("Location", url.toString()).end();
        })

        router.get(`/${callbackPath}`, async (req, res) => {
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
                return res.status(400).json({
                    success: false,
                    message: "Invalid state",
                });
            }
        
            if (!storedCodeVerifier) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid code verifier",
                });
            }
        
            try {
                const { accessToken } = await google.validateAuthorizationCode(
                    code,
                    storedCodeVerifier
                );
        
                const response = await fetch(
                    "https://openidconnect.googleapis.com/v1/userinfo",
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                        },
                    }
                );
                const providerProfile = (await response.json()) as {
                    id?: string;
                    sub?: string;
                };
        
                const providerUserId = providerProfile.sub ?? providerProfile.id;
        
                if (!providerUserId) {
                    return res.status(500).json({
                        success: false,
                        message: "Something went wrong",
                    });
                }

                const providerId = createProviderId(provider.id, providerUserId);

                const authId = await getAuthIdFromProviderDetails(providerId, providerProfile, _waspUserSignupFields)
    
                if (!authId) {
                    return res.status(500).json({
                        success: false,
                        message: "Something went wrong",
                    });
                }
        
                const oneTimeCode = await tokenStore.createToken(authId);

                // Redirect to the client with the one time code
                return res
                    .status(302)
                    .setHeader("Location", getRedirectUriForOneTimeCode(oneTimeCode))
                    .end();
            } catch (e) {
                // TODO: handle different errors
                console.error(e);
        
                return res.status(500).json({
                    success: false,
                    message: "Something went wrong",
                });
            }
        })

        return router;
    },
}

export default _waspConfig;
