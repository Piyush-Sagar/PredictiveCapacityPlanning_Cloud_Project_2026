import { NextResponse, type NextRequest } from "next/server";

import { authConfig, COOKIE } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  const refresh = request.cookies.get(COOKIE.refresh)?.value;
  if (refresh) {
    await fetch(`${authConfig.internalUrl}/oauth2/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refresh, client_id: authConfig.clientId }),
    }).catch(() => undefined);
  }
  const logout = new URL(`${authConfig.publicUrl}/logout`);
  logout.search = new URLSearchParams({ client_id: authConfig.clientId, logout_uri: `${authConfig.appUrl}/login` }).toString();
  const response = NextResponse.redirect(logout);
  for (const name of [COOKIE.access, COOKIE.id, COOKIE.refresh]) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return response;
}
