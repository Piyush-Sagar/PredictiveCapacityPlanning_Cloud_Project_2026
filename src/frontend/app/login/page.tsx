import Link from "next/link";
import { KeyRound, Radar, ShieldCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { IS_LIVE } from "@/lib/config";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const returnTo = typeof params.returnTo === "string" && params.returnTo.startsWith("/") ? params.returnTo : "/";
  const error = typeof params.error === "string" ? params.error : null;
  const loginHref = `/auth/login?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-5 py-2">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded bg-[#ec7211] text-white">
              <Radar className="size-5" />
            </div>
            <div>
              <p className="text-lg font-semibold">Capacity Planner</p>
              <p className="text-xs text-muted-foreground">Predictive capacity planning for video streaming</p>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {IS_LIVE ? (
            <>
              {/* Plain anchors: /auth/login is a route handler that redirects off-site to the Hosted UI. */}
              <a href={loginHref} className={buttonVariants({ size: "lg", className: "w-full" })}>
                <KeyRound />
                Sign in with Amazon Cognito
              </a>
              <a href={`${loginHref}&prompt=login`} className="text-center text-xs text-muted-foreground underline-offset-4 hover:underline">
                Use a different account
              </a>
              <div className="flex gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
                <p>
                  OAuth 2.0 authorization code flow with PKCE against a <b>simulated</b> Cognito user pool. Tokens
                  are RS256 JWTs verified by the API against the pool&apos;s JWKS. No real AWS account is involved.
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                The dashboard is running in <b>mock mode</b> (no backend), so sign-in is disabled. Set{" "}
                <code className="font-mono text-xs">NEXT_PUBLIC_DATA_MODE=live</code> to use the Cognito flow.
              </p>
              <Link href="/" className={buttonVariants({ variant: "outline", className: "w-full" })}>
                Open the mock dashboard
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
