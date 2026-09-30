import { createHash, randomBytes } from "node:crypto";

/** Server-side OAuth2 (authorization code + PKCE) helpers for the mock Cognito user pool. */

export const COOKIE = {
  pkce: "cp_pkce",
  access: "cp_at",
  id: "cp_it",
  refresh: "cp_rt",
  account: "cp_account",
} as const;

export const authConfig = {
  publicUrl: (process.env.COGNITO_PUBLIC_URL ?? "http://localhost:9229").replace(/\/$/, ""),
  internalUrl: (process.env.COGNITO_INTERNAL_URL ?? process.env.COGNITO_PUBLIC_URL ?? "http://localhost:9229").replace(/\/$/, ""),
  clientId: process.env.COGNITO_CLIENT_ID ?? "capplan-web",
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  backendUrl: (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, ""),
};

export const secureCookies = authConfig.appUrl.startsWith("https://");

export function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function createPkce() {
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));
  const nonce = base64url(randomBytes(16));
  return { verifier, challenge, state, nonce };
}

export interface TokenSet {
  access_token: string;
  id_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${authConfig.internalUrl}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: authConfig.clientId, ...body }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`token endpoint ${res.status}: ${detail}`);
  }
  return res.json();
}

export function exchangeCode(code: string, verifier: string): Promise<TokenSet> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: `${authConfig.appUrl}/auth/callback`,
  });
}

export function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** Decodes (without verifying) a JWT payload. Tokens only ever come from our
 * own server-side exchange and live in httpOnly cookies; the backend verifies
 * every access token's signature against JWKS. */
export function decodeJwt<T = Record<string, unknown>>(token: string | undefined): T | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function isExpired(token: string | undefined, skewSeconds = 30): boolean {
  const claims = decodeJwt<{ exp?: number }>(token);
  return !claims?.exp || claims.exp * 1000 < Date.now() + skewSeconds * 1000;
}

export interface IdClaims {
  sub: string;
  email: string;
  name?: string;
  "cognito:groups"?: string[];
  exp: number;
}

type CookieSetter = { set: (name: string, value: string, options: Record<string, unknown>) => void };

export function writeTokenCookies(target: CookieSetter, tokens: TokenSet): void {
  const base = { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/" };
  target.set(COOKIE.access, tokens.access_token, { ...base, maxAge: tokens.expires_in });
  target.set(COOKIE.id, tokens.id_token, { ...base, maxAge: tokens.expires_in });
  if (tokens.refresh_token) {
    target.set(COOKIE.refresh, tokens.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 });
  }
}
