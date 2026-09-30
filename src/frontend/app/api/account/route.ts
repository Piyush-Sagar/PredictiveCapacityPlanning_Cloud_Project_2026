import { NextResponse, type NextRequest } from "next/server";

import { COOKIE, secureCookies } from "@/lib/server/auth";

/** Persists the selected AWS account for the BFF proxy. */
export async function POST(request: NextRequest) {
  const { accountId } = (await request.json()) as { accountId?: string | null };
  const response = NextResponse.json({ account: accountId ?? null });
  if (accountId) {
    response.cookies.set(COOKIE.account, accountId, { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/", maxAge: 60 * 60 * 24 * 30 });
  } else {
    response.cookies.set(COOKIE.account, "", { path: "/", maxAge: 0 });
  }
  return response;
}
