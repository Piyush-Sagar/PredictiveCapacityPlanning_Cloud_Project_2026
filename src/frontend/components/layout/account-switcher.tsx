"use client";

import { Cloud } from "lucide-react";
import { useRouter } from "next/navigation";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IS_LIVE } from "@/lib/config";
import { useSession } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

function prettyAccount(id: string) {
  return `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8)}`;
}

export function AccountSwitcher() {
  const { accounts, activeAccount, selectAccount } = useSession();
  const router = useRouter();
  if (!IS_LIVE) return null;
  const connected = accounts.filter((a) => a.status === "connected");
  if (connected.length === 0) {
    return (
      <button
        type="button"
        onClick={() => router.push("/accounts")}
        className="hidden shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-console-header-foreground hover:bg-console-header-hover lg:inline-flex"
      >
        <Cloud className="size-3.5" /> Connect account
      </button>
    );
  }
  return (
    <Select value={activeAccount?.id ?? ""} onValueChange={(v) => v && selectAccount(String(v))}>
      <SelectTrigger
        aria-label="AWS account"
        className="hidden h-8 w-52 shrink-0 border-console-header-border bg-transparent text-xs text-console-header-foreground lg:flex"
      >
        <SelectValue>
          {activeAccount ? `${activeAccount.alias} · ${prettyAccount(activeAccount.awsAccountId)}` : "Select account"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {connected.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.alias} · {prettyAccount(a.awsAccountId)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SimClockBadge() {
  const { clock } = useSession();
  if (!IS_LIVE || !clock) return null;
  return (
    <span
      title={`Simulated time: one ${clock.stepMinutes}-minute step every ${clock.tickSeconds}s · tick ${clock.tick}`}
      className="hidden shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] text-console-header-muted xl:inline-flex"
    >
      <span className={`size-1.5 rounded-full ${clock.running ? "bg-status-success" : "bg-status-warning"}`} />
      {formatDateTime(clock.now)} UTC
    </span>
  );
}
