{{={= =}=}}
import { useEffect, useRef, useState } from "react";
import { Redirect } from 'react-router-dom'
import { useAuth } from 'wasp/client/auth'
import { api } from 'wasp/client/api'
import { initSession } from 'wasp/auth/helpers/user'

export function OAuthCallbackPage() {
  const { isLoading, error, user } = useOAuthCallbackHandler();
  
  if (user) {
    return <Redirect to="{= onAuthSucceededRedirectTo =}" />;
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "4rem",
    }}>
      {error && <div style={{
        color: "rgb(239 68 68)"
      }}>{error}</div>}
      {isLoading && <div>Please wait a moment while we log you in.</div>}
    </div>
  );
}

function useOAuthCallbackHandler() {
  const { data: user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function handleCallback() {
    try {
      setIsLoading(true);
      const code = window.location.hash.slice(1);
      const response = await exchangeOAuthCodeForToken({ code });
      const sessionId = response.data.sessionId;
      if (sessionId) {
        await initSession(sessionId)
      } else {
        setError("Unable to login with the OAuth provider.");
      }
    } catch (e: unknown) {
      console.error(e);
      setError("Unable to login with the OAuth provider.");
    } finally {
      setIsLoading(false);
    }
  }

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      handleCallback();
    }
  }, []);

  return {
    user,
    error,
    isLoading,
  };
}

// TODO: don't hard code the URL
async function exchangeOAuthCodeForToken(data: { code: string }) {
  return api.post<
    { sessionId: string } | { message: string }
  >(`/auth/exchange-code`, data);
}
