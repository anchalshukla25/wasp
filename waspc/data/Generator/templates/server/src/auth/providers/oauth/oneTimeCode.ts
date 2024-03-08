import { Router } from "express";

import { HttpError } from 'wasp/server';
import { handleRejection } from 'wasp/server/utils'
import { createJWT, validateJWT, TimeSpan } from 'wasp/auth/jwt'
import { findAuthWithUserBy } from 'wasp/auth/utils'
import { createSession } from 'wasp/auth/session'

export const tokenStore = createTokenStore();

export function setupOneTimeCodeRoute(router: Router) {
  router.post(
    "/exchange-code",
    handleRejection(async (req, res) => {
      const { code } = req.body;

      if (tokenStore.isUsed(code)) {
        throw new HttpError(400, "Unable to login with the OAuth provider. The code has already been used.");
      }

      const { id: authId } = await tokenStore.verifyToken(code);
      const auth = await findAuthWithUserBy({ id: authId })

      if (!auth) {
        throw new HttpError(400, "Unable to login with the OAuth provider. The code is invalid.");
      }

      const session = await createSession(auth.id);

      tokenStore.markUsed(code);

      return res.json({
        sessionId: session.id,
      });
    })
  );
}

function createTokenStore() {
  const usedTokens = new Map<string, number>();

  const validFor = new TimeSpan(1, 'm') // 1 minute
  const cleanupAfter = 1000 * 60 * 60; // 1 hour

  function cleanUp() {
    const now = Date.now();
    for (const [token, timestamp] of usedTokens.entries()) {
      if (now - timestamp > cleanupAfter) {
        usedTokens.delete(token);
      }
    }
  }

  return {
    createToken(userId: string) {
      return createJWT(
        {
          id: userId,
        },
        {
          expiresIn: validFor,
        }
      );
    },
    verifyToken(token: string) {
      return validateJWT<{ id: string }>(token);
    },
    isUsed(token: string) {
      return usedTokens.has(token);
    },
    markUsed(token: string) {
      usedTokens.set(token, Date.now());
      cleanUp();
    },
  };
}
