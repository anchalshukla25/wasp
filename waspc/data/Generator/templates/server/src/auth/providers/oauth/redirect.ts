import { config } from 'wasp/server'

export const callbackPath = 'callback'

// TODO: we need a server URL here, but we don't have it yet.
const serverUrl = `http://localhost:3001`
export function getRedirectUriForCallback(providerName: string) {
  return `${serverUrl}/auth/${providerName}/${callbackPath}`;
}

export function getRedirectUriForOneTimeCode(oneTimeCode: string) {
  return `${config.frontendUrl}/oauth/callback#${oneTimeCode}`;
}
