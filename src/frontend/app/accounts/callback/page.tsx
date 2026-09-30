"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/session";
import type { LinkedAccount } from "@/lib/types";

type Phase = { kind: "working"; step: string } | { kind: "done"; account: LinkedAccount; assumed: string } | { kind: "error"; message: string };

/**
 * Return leg of the "Connect AWS account" flow: the simulated CloudFormation
 * console redirects here with the new role ARN; we ask the backend to
 * sts:AssumeRole with the ExternalId and bootstrap the account.
 */
export default function AccountCallbackPage() {
  const router = useRouter();
  const { refreshAccounts, selectAccount } = useSession();
  const [phase, setPhase] = useState<Phase>({ kind: "working", step: "Verifying the CloudFormation stack…" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const state = params.get("state") ?? "";
    const roleArn = params.get("roleArn");
    (async () => {
      if (params.get("error") || !roleArn) {
        setPhase({ kind: "error", message: params.get("error") === "cancelled" ? "Stack creation was cancelled." : "No role ARN was returned by the console." });
        return;
      }
      try {
        setPhase({ kind: "working", step: "Assuming CapPlanReadOnlyRole with the ExternalId and bootstrapping ECS services…" });
        const res = await api.post<{ account: LinkedAccount; assumedRoleArn: string }>(`/accounts/${state}/connect/complete`, {
          roleArn,
          stackId: params.get("stackId"),
          state,
        });
        await selectAccount(res.account.id);
        await refreshAccounts();
        setPhase({ kind: "done", account: res.account, assumed: res.assumedRoleArn });
        toast.success(`Connected ${res.account.displayName}`);
      } catch (error) {
        setPhase({ kind: "error", message: error instanceof ApiError ? error.message : String(error) });
      }
    })();
  }, [refreshAccounts, selectAccount]);

  return (
    <Card className="mx-auto mt-6 max-w-xl">
      <CardContent className="flex flex-col gap-4 py-2">
        {phase.kind === "working" && (
          <div className="flex items-center gap-3 text-sm">
            <Loader2 className="size-5 animate-spin text-primary" />
            {phase.step}
          </div>
        )}
        {phase.kind === "done" && (
          <>
            <div className="flex items-center gap-3 text-base font-semibold">
              <CheckCircle2 className="size-5 text-status-success" />
              {phase.account.displayName} connected
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Account</dt>
              <dd className="font-mono">{phase.account.awsAccountId}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="font-mono break-all">{phase.account.roleArn}</dd>
              <dt className="text-muted-foreground">Session</dt>
              <dd className="font-mono break-all">{phase.assumed}</dd>
              <dt className="text-muted-foreground">Regions</dt>
              <dd>{phase.account.regions.join(", ")}</dd>
            </dl>
            <div className="flex gap-2">
              <button type="button" className={buttonVariants()} onClick={() => router.push("/")}>
                Open dashboard
              </button>
              <Link href="/accounts" className={buttonVariants({ variant: "outline" })}>
                Manage accounts
              </Link>
            </div>
          </>
        )}
        {phase.kind === "error" && (
          <>
            <div className="flex items-center gap-3 text-base font-semibold text-destructive">
              <XCircle className="size-5" />
              Connection failed
            </div>
            <p className="text-sm text-muted-foreground">{phase.message}</p>
            <Link href="/accounts" className={buttonVariants({ variant: "outline", className: "w-fit" })}>
              Back to accounts
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
