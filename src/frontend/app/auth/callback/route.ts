import { NextResponse, type NextRequest } from "next/server";

import { authConfig, COOKIE, exchangeCode, writeTokenCookies } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const loginUrl = new URL("/login", authConfig.appUrl);
  const raw = request.cookies.get(COOKIE.pkce)?.value;

  if (params.get("error")) {
    loginUrl.searchParams.set("error", params.get("error_description") ?? params.get("error") ?? "login_failed");
    return NextResponse.redirect(loginUrl);
  }
  const code = params.get("code");
  if (!raw || !code) {
    loginUrl.searchParams.set("error", "Login session expired — please try again.");
    return NextResponse.redirect(loginUrl);
  }
  const pkce = JSON.parse(raw) as { verifier: string; state: string; returnTo: string };
  if (pkce.state !== params.get("state")) {
    loginUrl.searchParams.set("error", "State mismatch (possible CSRF) — please sign in again.");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const tokens = await exchangeCode(code, pkce.verifier);
    const response = NextResponse.redirect(new URL(pkce.returnTo || "/", authConfig.appUrl));
    writeTokenCookies(response.cookies, tokens);
    response.cookies.set(COOKIE.pkce, "", { path: "/auth", maxAge: 0 });
    return response;
  } catch (error) {
    loginUrl.searchParams.set("error", error instanceof Error ? error.message : "Token exchange failed");
    return NextResponse.redirect(loginUrl);
  }
}
