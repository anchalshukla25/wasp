import { Router } from "express";

import { findAuthWithUserBy, createToken, verifyToken } from 'wasp/auth/utils'
import { createSession } from 'wasp/auth/session'

export const tokenStore = createTokenStore();

export function setupOneTimeCodeRoute(router: Router) {
  router.post(
    "/exchange-code",
    async (req, res) => {
      const { code } = req.body;

      try {
        if (tokenStore.isUsed(code)) {
          return res.status(400).json({
            success: false,
            message: "Code already used",
          });
        }

        const { id: authId } = await tokenStore.verifyToken(code);
        const auth = await findAuthWithUserBy({ id: authId })

        if (!auth) {
          return res.status(400).json({
            success: false,
            message: "Invalid code",
          });
        }

        const session = await createSession(auth.id);

        tokenStore.markUsed(code);

        return res.json({
          success: true,
          sessionId: session.id,
        });
      } catch (e) {
        console.error(e);

        return res.status(500).json({
          success: false,
          message: "Something went wrong",
        });
      }
    }
  );
}

function createTokenStore() {
  const usedTokens = new Map<string, number>();

  const validFor = 1000 * 60; // 1 minute
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
      return createToken(
        {
          id: userId,
        },
        {
          expiresIn: validFor,
        }
      );
    },
    verifyToken(token: string) {
      return verifyToken<{ id: string }>(token);
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
