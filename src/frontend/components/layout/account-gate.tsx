"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cloud } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { IS_LIVE } from "@/lib/config";
import { useSession } from "@/lib/session";

/** In live mode, dashboard views need a connected (simulated) AWS account. */
export function AccountGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { ready, activeAccount } = useSession();
  if (!IS_LIVE || pathname.startsWith("/accounts")) return <>{children}</>;
  if (!ready) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!activeAccount) {
    return (
      <Card className="mx-auto mt-8 max-w-lg">
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Cloud className="size-5" />
          </div>
          <p className="text-base font-semibold">Connect an AWS account to start forecasting</p>
          <p className="text-sm text-muted-foreground">
            The planner reads telemetry and cost data from a (simulated) AWS account through a cross-account IAM
            role, and scales its ECS services. No real AWS account is used.
          </p>
          <Link href="/accounts" className={buttonVariants({ className: "mt-2" })}>
            Connect AWS account
          </Link>
        </CardContent>
      </Card>
    );
  }
  return <>{children}</>;
}
