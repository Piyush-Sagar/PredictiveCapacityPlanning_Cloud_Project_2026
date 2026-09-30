import { NextResponse, type NextRequest } from "next/server";

/**
 * In live mode every dashboard page requires a Cognito session. The proxy
 * only checks that session cookies exist (optimistic check); the backend
 * verifies the access token's signature, issuer and client on every call.
 */
export function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DATA_MODE !== "live") return NextResponse.next();
  const hasSession = request.cookies.has("cp_rt") || request.cookies.has("cp_at");
  if (hasSession) return NextResponse.next();
  const login = new URL("/login", request.url);
  const returnTo = request.nextUrl.pathname + request.nextUrl.search;
  if (returnTo !== "/") login.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    // Everything except auth endpoints, the login page, API routes and static assets.
    "/((?!login|auth/|api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)",
  ],
};
