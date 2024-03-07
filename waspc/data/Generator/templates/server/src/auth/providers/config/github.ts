{{={= =}=}}
import { Router, Request as ExpressRequest } from "express";
import { GitHub, generateState } from "arctic";

import type { ProviderConfig } from "wasp/auth/providers/types";
import { finishOAuthFlowAndGetRedirectUri } from "../oauth/user.js";
import { getStateCookieName, getValueFromCookie, setValueInCookie } from "../oauth/cookies.js";
import { callbackPath } from "../oauth/redirect.js";

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
            return res.status(302)
                .setHeader("Location", url.toString())
                .end();
        });

        router.get(`/${callbackPath}`, async (req, res) => {    
            try {
                const { code } =  getDataFromCallback(req);
                const { accessToken } = await github.validateAuthorizationCode(code);
                const { providerProfile, providerUserId } = await getGithubProfile(accessToken);
                const { redirectUri } =  await finishOAuthFlowAndGetRedirectUri(
                    provider,
                    providerProfile,
                    providerUserId,
                    _waspUserDefinedConfigFn,
                );

                // Redirect to the client with the one time code
                return res
                    .status(302)
                    .setHeader("Location", redirectUri)
                    .end();
            } catch (e) {
                // TODO: handle different errors
                console.error(e);
        
                // TODO: it makes sense to redirect to the client with the OAuth erorr!
                return res.status(500).json({
                    success: false,
                    message: "Something went wrong",
                });
            }
        });

        function getDataFromCallback(req: ExpressRequest): { code: string } {
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
                throw new Error("Invalid state or code");
            }

            return { code }
        }

        async function getGithubProfile(accessToken: string): Promise<{
            providerProfile: unknown;
            providerUserId: string;
        }> {
            // TODO: Get user's email if possible (that's how Passport did it)
            const response = await fetch("https://api.github.com/user", {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            const providerProfile = (await response.json()) as {
                id?: string;
            };

            console.log('providerProfile', providerProfile);
            
            if (!providerProfile.id) {
               throw new Error("Invalid profile");
            }

            return { providerProfile, providerUserId: `${providerProfile.id}` };
        }

        return router;
    },
}

export default _waspConfig;
