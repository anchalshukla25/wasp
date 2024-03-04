import {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { parseCookies } from "oslo/cookie";

type CookieName = {
  cookieName: string;
};

export function setValueInCookie(
  { cookieName }: CookieName,
  value: string,
  res: ExpressResponse
) {
  res.cookie(cookieName, value, {
    httpOnly: true,
    // TODO: use server config to determine if secure
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 1000, // 1 hour
  });
}

export function getValueFromCookie(
  { cookieName }: CookieName,
  req: ExpressRequest
) {
  const cookies = parseCookies(req.headers.cookie ?? "");
  return cookies.get(cookieName);
}

export function getStateCookieName(providerName: string) {
  return {
    cookieName: `${providerName}_oauth_state`,
  };
}

export function getCodeVerifierCookieName(providerName: string) {
  return {
    cookieName: `${providerName}_oauth_code_verifier`,
  };
}
