import { NextResponse, type NextRequest } from "next/server";

import { COOKIE, decodeJwt, type IdClaims } from "@/lib/server/auth";

/** Profile claims from the ID token for the client-side shell. */
export async function GET(request: NextRequest) {
  const claims = decodeJwt<IdClaims>(request.cookies.get(COOKIE.id)?.value);
  const hasRefresh = Boolean(request.cookies.get(COOKIE.refresh)?.value);
  if (!claims && !hasRefresh) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const groups = claims?.["cognito:groups"] ?? [];
  const name = claims?.name ?? claims?.email ?? "Signed-in user";
  return NextResponse.json({
    authenticated: true,
    sub: claims?.sub,
    email: claims?.email,
    name,
    groups,
    role: groups.includes("admins") ? "admin" : "operator",
    avatarInitials: name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(""),
    expiresAt: claims?.exp ? new Date(claims.exp * 1000).toISOString() : null,
    account: request.cookies.get(COOKIE.account)?.value ?? null,
  });
}
