import { NextResponse, type NextRequest } from "next/server";

import {
  authConfig,
  COOKIE,
  decodeJwt,
  isExpired,
  refreshTokens,
  writeTokenCookies,
  type IdClaims,
  type TokenSet,
} from "@/lib/server/auth";

/**
 * Backend-for-frontend proxy: attaches the Cognito access token from the
 * httpOnly cookie (refreshing it when needed), the selected AWS account and
 * the user's profile claims, then forwards to the FastAPI backend.
 */
async function forward(request: NextRequest, ctx: RouteContext<"/api/backend/[...path]">) {
  const { path } = await ctx.params;
  let access = request.cookies.get(COOKIE.access)?.value;
  let idToken = request.cookies.get(COOKIE.id)?.value;
  const refresh = request.cookies.get(COOKIE.refresh)?.value;
  let refreshed: TokenSet | null = null;

  async function doRefresh(): Promise<boolean> {
    if (!refresh) return false;
    try {
      refreshed = await refreshTokens(refresh);
      access = refreshed.access_token;
      idToken = refreshed.id_token;
      return true;
    } catch {
      return false;
    }
  }

  if (isExpired(access) && !(await doRefresh())) {
    return NextResponse.json({ detail: "not authenticated" }, { status: 401 });
  }

  const target = new URL(`${authConfig.backendUrl}/api/${path.map(encodeURIComponent).join("/")}`);
  target.search = request.nextUrl.search;
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.text();

  async function call() {
    const claims = decodeJwt<IdClaims>(idToken);
    const headers: Record<string, string> = {
      authorization: `Bearer ${access}`,
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = request.headers.get("content-type") ?? "application/json";
    const account = request.cookies.get(COOKIE.account)?.value;
    if (account) headers["x-capplan-account"] = account;
    if (claims?.email) headers["x-capplan-user-email"] = claims.email;
    if (claims?.name) headers["x-capplan-user-name"] = claims.name;
    return fetch(target, { method: request.method, headers, body, cache: "no-store" });
  }

  let upstream: Response;
  try {
    upstream = await call();
    if (upstream.status === 401 && !refreshed && (await doRefresh())) {
      upstream = await call();
    }
  } catch (error) {
    return NextResponse.json(
      { detail: `backend unreachable at ${authConfig.backendUrl}: ${error instanceof Error ? error.message : error}` },
      { status: 502 }
    );
  }

  const response = new NextResponse(upstream.status === 204 ? null : await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
  if (refreshed) writeTokenCookies(response.cookies, refreshed);
  return response;
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const DELETE = forward;
