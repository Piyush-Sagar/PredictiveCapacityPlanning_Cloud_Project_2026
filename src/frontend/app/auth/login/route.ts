import { NextResponse, type NextRequest } from "next/server";

import { authConfig, COOKIE, createPkce, secureCookies } from "@/lib/server/auth";

/** Starts the Cognito Hosted UI flow: authorization code + PKCE (S256). */
export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/";
  const { verifier, challenge, state, nonce } = createPkce();

  const authorize = new URL(`${authConfig.publicUrl}/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: authConfig.clientId,
    redirect_uri: `${authConfig.appUrl}/auth/callback`,
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    ...(request.nextUrl.searchParams.get("prompt") ? { prompt: "login" } : {}),
  }).toString();

  const response = NextResponse.redirect(authorize);
  response.cookies.set(COOKIE.pkce, JSON.stringify({ verifier, state, returnTo: returnTo.startsWith("/") ? returnTo : "/" }), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    path: "/auth",
    maxAge: 600,
  });
  return response;
}
