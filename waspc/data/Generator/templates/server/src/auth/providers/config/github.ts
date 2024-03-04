{{={= =}=}}
import { Router } from "express";
import { GitHub, generateState } from "arctic";

import type { ProviderConfig } from "wasp/auth/providers/types";
import { createProviderId } from 'wasp/auth/utils'
import { getAuthIdFromProviderDetails } from "../oauth/user.js";
import { getStateCookieName, getValueFromCookie, setValueInCookie } from "../oauth/cookies.js";
import { tokenStore } from "../oauth/oneTimeCode.js";
import { callbackPath, getRedirectUriForOneTimeCode } from "../oauth/redirect.js";

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

/*

Consider introducing a helper called

createRouter({
    initAuthProvider: () => new GitHub(),
    prepareRedirectUrl: async (req, res, provider, auth) => {},
    getProviderProfile: async (req, res, provider, auth) => {},
    getProviderUserId: (providerProfile) => {},
})

Or consider multilpe small helpers like

setStateCookie(provider.id, state, res)
getStateCookie(provider.id, req)
getCodeFromQuery(req)
validateState(storedState, state, code)
validateCode(code)
createAuthorizationUrl(provider, state)

*/

const _waspConfig: ProviderConfig = {
    id: "{= providerId =}",
    displayName: "{= displayName =}",
    createRouter(provider) {
        const router = Router();

        // TODO: make sure to validate the env vars
        const github = new GitHub(
            process.env.GITHUB_CLIENT_ID,
            process.env.GITHUB_CLIENT_SECRET,
        );

        router.get('/login', async (_req, res) => {
            const state = generateState();
            const url = await github.createAuthorizationURL(state, {
                // TODO: use the user defined config function
                scopes: {=& requiredScopes =},
            });
            setValueInCookie(getStateCookieName(provider.id), state, res);
            return res.status(302).setHeader("Location", url.toString()).end();
        })

        router.get(`/${callbackPath}`, async (req, res) => {
            const storedState = getValueFromCookie(
                getStateCookieName(provider.id),
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
    
            try {
                const { accessToken } = await github.validateAuthorizationCode(code);
    
                // TODO: maybe an additional request to get the user's email?
                const response = await fetch("https://api.github.com/user", {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                });
                const providerProfile = (await response.json()) as {
                    id?: string;
                    sub?: string;
                };

                console.log('providerProfile', providerProfile);
        
                const providerUserId = providerProfile.sub ?? providerProfile.id;
        
                if (!providerUserId) {
                    return res.status(500).json({
                        success: false,
                        message: "Something went wrong",
                    });
                }

                const providerId = createProviderId(provider.id, `${providerUserId}`);

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
