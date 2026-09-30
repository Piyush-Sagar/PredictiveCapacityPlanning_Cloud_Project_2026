"use client";

import { useState } from "react";
import { CirclePause, CirclePlay, Cloud, ExternalLink, Mail, SkipForward, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiError } from "@/lib/api/client";
import { useApiData } from "@/lib/api/hooks";
import { IS_LIVE } from "@/lib/config";
import { useSession } from "@/lib/session";
import { REGION_LABELS, type AccountPolicy, type LinkedAccount, type SampleAccount } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const CUSTOM = "custom";

function StatusPill({ status }: { status: LinkedAccount["status"] }) {
  const tone =
    status === "connected"
      ? "bg-status-success/15 text-status-success"
      : status === "error"
        ? "bg-destructive/15 text-destructive"
        : "bg-status-warning/15 text-status-warning";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium capitalize ${tone}`}>{status}</span>;
}

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : String(error);
}

export default function AccountsPage() {
  if (!IS_LIVE) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>AWS accounts are a live-mode feature</CardTitle>
          <CardDescription>
            Start the stack with <code className="font-mono">docker compose up</code> (or{" "}
            <code className="font-mono">make dev</code>) and set <code className="font-mono">NEXT_PUBLIC_DATA_MODE=live</code>{" "}
            to connect a simulated AWS account through a cross-account IAM role.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }
  return <LiveAccounts />;
}

function LiveAccounts() {
  const { accounts, activeAccount, user, refreshAccounts, selectAccount, clock, invalidate } = useSession();
  const isAdmin = user?.role === "admin";
  const samples = useApiData<SampleAccount[]>("/accounts/samples", () => []);
  const [choice, setChoice] = useState<string>("111122223333");
  const [customId, setCustomId] = useState("");
  const [busy, setBusy] = useState(false);

  async function connect() {
    const awsAccountId = choice === CUSTOM ? customId.replace(/\D/g, "") : choice;
    if (!/^\d{12}$/.test(awsAccountId)) {
      toast.error("AWS account IDs are 12 digits");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ consoleUrl: string }>("/accounts", { awsAccountId });
      window.location.href = res.consoleUrl;
    } catch (error) {
      toast.error(errorText(error));
      setBusy(false);
    }
  }

  async function remove(account: LinkedAccount) {
    if (!window.confirm(`Remove ${account.displayName}? Its forecasts, decisions and alerts are deleted.`)) return;
    try {
      await api.del(`/accounts/${account.id}`);
      await refreshAccounts();
      invalidate();
      toast.success(`Removed ${account.displayName}`);
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  const connectedIds = new Set(accounts.filter((a) => a.status === "connected").map((a) => a.awsAccountId));

  return (
    <div className="flex flex-col gap-5">
      <Card data-tour="accounts-connect">
        <CardHeader>
          <CardTitle>Connect an AWS account</CardTitle>
          <CardDescription>
            Opens a simulated CloudFormation quick-create page that deploys <code className="font-mono">CapPlanReadOnlyRole</code>{" "}
            in the target account, trusting this platform with a unique ExternalId. The backend then calls{" "}
            <code className="font-mono">sts:AssumeRole</code>. Everything runs against moto — no real AWS.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor="acct-choice">
              Account
            </label>
            <Select value={choice} onValueChange={(v) => setChoice(String(v))}>
              <SelectTrigger id="acct-choice" className="w-72">
                <SelectValue>
                  {choice === CUSTOM
                    ? "Custom account ID…"
                    : (samples.data?.find((s) => s.accountId === choice)?.displayName ?? choice)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(samples.data ?? []).map((s) => (
                  <SelectItem key={s.accountId} value={s.accountId} disabled={connectedIds.has(s.accountId)}>
                    {s.displayName} · {s.accountId} {connectedIds.has(s.accountId) ? "(connected)" : ""}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM}>Custom account ID…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {choice === CUSTOM && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="acct-id">
                12-digit account ID
              </label>
              <Input id="acct-id" inputMode="numeric" placeholder="123412341234" value={customId} onChange={(e) => setCustomId(e.target.value)} className="w-48 font-mono" />
            </div>
          )}
          <Button onClick={connect} disabled={busy} className="gap-1.5">
            <ExternalLink className="size-4" />
            {busy ? "Opening console…" : "Launch quick-create stack"}
          </Button>
        </CardContent>
      </Card>

      <Card data-tour="accounts-linked">
        <CardHeader>
          <CardTitle>Linked accounts</CardTitle>
          <CardDescription>The active account scopes every dashboard view.</CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No accounts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Regions</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Pending alerts</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Cloud className="size-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {a.displayName}
                            {activeAccount?.id === a.id && (
                              <Badge variant="secondary" className="ml-2 text-[10px]">
                                active
                              </Badge>
                            )}
                          </p>
                          <p className="font-mono text-xs text-muted-foreground">{a.awsAccountId}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusPill status={a.status} />
                      {a.lastError && <p className="mt-1 max-w-56 text-[11px] text-destructive">{a.lastError}</p>}
                    </TableCell>
                    <TableCell className="text-xs">{a.regions.map((r) => REGION_LABELS[r]).join(", ")}</TableCell>
                    <TableCell className="max-w-64 truncate font-mono text-[11px]" title={a.roleArn ?? undefined}>
                      {a.roleArn ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{a.pendingAlerts ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {a.status === "connected" && activeAccount?.id !== a.id && (
                          <Button size="sm" variant="outline" onClick={() => selectAccount(a.id)}>
                            Make active
                          </Button>
                        )}
                        {a.status !== "connected" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setChoice(samples.data?.some((s) => s.accountId === a.awsAccountId) ? a.awsAccountId : CUSTOM);
                              setCustomId(a.awsAccountId);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Retry
                          </Button>
                        )}
                        {isAdmin && (
                          <Button size="icon-sm" variant="ghost" aria-label={`Remove ${a.displayName}`} onClick={() => remove(a)}>
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {activeAccount && <PolicyCard key={activeAccount.id} isAdmin={isAdmin} accountName={activeAccount.displayName} />}
        <div className="flex flex-col gap-5">
          {clock && <ClockCard isAdmin={isAdmin} />}
          <NotificationsCard />
        </div>
      </div>
    </div>
  );
}

const POLICY_FIELDS: { key: keyof AccountPolicy; label: string; hint: string; step: number; pct?: boolean }[] = [
  { key: "safetyMarginPct", label: "Safety margin", hint: "headroom added on top of P90 demand", step: 0.01, pct: true },
  { key: "hysteresisPct", label: "Hysteresis band", hint: "scale in only below current × (1 − band)", step: 0.01, pct: true },
  { key: "hysteresisPeriods", label: "Hysteresis periods", hint: "consecutive 5-min periods below band", step: 1 },
  { key: "scaleInCooldownSec", label: "Scale-in cooldown (s)", hint: "minimum time between scale-ins", step: 60 },
  { key: "budgetMultiplier", label: "Budget multiplier", hint: "× default daily budget per fleet", step: 0.05 },
  { key: "autoExecuteMaxChangePct", label: "Auto-execute ≤", hint: "changes this small run without approval", step: 0.01, pct: true },
  { key: "approvalMinChangePct", label: "Approval ≥", hint: "changes this large always need approval", step: 0.05, pct: true },
];

function PolicyCard({ isAdmin, accountName }: { isAdmin: boolean; accountName: string }) {
  const { invalidate } = useSession();
  const policy = useApiData<AccountPolicy>("/policy", () => ({}) as AccountPolicy);
  const [draft, setDraft] = useState<AccountPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const current = draft ?? policy.data;

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await api.put<AccountPolicy>("/policy", draft);
      toast.success("Scaling policy updated");
      setDraft(null);
      policy.refresh();
      invalidate();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-tour="accounts-policy">
      <CardHeader>
        <CardTitle>Scaling policy</CardTitle>
        <CardDescription>
          Guardrails for {accountName}. {isAdmin ? "Admins can edit." : "Read-only — editing requires the admins group."}
        </CardDescription>
        {isAdmin && (
          <CardAction>
            <Button size="sm" disabled={!draft || saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!current ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="mode">
                Decision mode
              </label>
              <Select
                value={current.mode}
                disabled={!isAdmin}
                onValueChange={(v) => setDraft({ ...current, mode: String(v) as AccountPolicy["mode"] })}
              >
                <SelectTrigger id="mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto — execute within guardrails, ask for large changes</SelectItem>
                  <SelectItem value="approve-all">Approve all — every change needs an operator</SelectItem>
                  <SelectItem value="recommend-only">Recommend only — never execute</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {POLICY_FIELDS.map((f) => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor={f.key}>
                    {f.label}
                  </label>
                  <Input
                    id={f.key}
                    type="number"
                    step={f.step}
                    disabled={!isAdmin}
                    value={String(current[f.key])}
                    onChange={(e) => setDraft({ ...current, [f.key]: Number(e.target.value) })}
                    className="font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {f.hint}
                    {f.pct ? ` (${(Number(current[f.key]) * 100).toFixed(0)}%)` : ""}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ClockCard({ isAdmin }: { isAdmin: boolean }) {
  const { clock, invalidate } = useSession();
  const [seconds, setSeconds] = useState<string>("");
  if (!clock) return null;

  async function update(body: { running?: boolean; tickSeconds?: number }) {
    try {
      await api.put("/pipeline/clock", body);
      toast.success("Simulation clock updated");
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function step() {
    try {
      await api.post("/pipeline/step");
      invalidate();
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  return (
    <Card data-tour="accounts-clock">
      <CardHeader>
        <CardTitle>Simulation clock</CardTitle>
        <CardDescription>
          Telemetry is replayed from the dataset&apos;s live window ({formatDateTime(clock.liveWindow.start)} →{" "}
          {formatDateTime(clock.liveWindow.end)}); one {clock.stepMinutes}-minute step every {clock.tickSeconds}s.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Sim time</p>
            <p className="font-mono">{formatDateTime(clock.now)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tick</p>
            <p className="font-mono">{clock.tick}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last tick</p>
            <p className="font-mono">{clock.lastTickMs != null ? `${clock.lastTickMs} ms` : "—"}</p>
          </div>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={() => update({ running: !clock.running })}>
              {clock.running ? <CirclePause className="size-4" /> : <CirclePlay className="size-4" />}
              {clock.running ? "Pause" : "Resume"}
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={step}>
              <SkipForward className="size-4" /> Step 5 min
            </Button>
            <Input
              aria-label="Seconds per tick"
              type="number"
              min={1}
              placeholder={`${clock.tickSeconds}s/tick`}
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              className="h-7 w-28 font-mono text-xs"
            />
            <Button size="sm" variant="ghost" disabled={!seconds} onClick={() => update({ tickSeconds: Number(seconds) })}>
              Set speed
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Clock controls require the admins group.</p>
        )}
      </CardContent>
    </Card>
  );
}

function NotificationsCard() {
  const notes = useApiData<{ messageId: string; subject: string; timestamp: string }[]>("/notifications", () => []);
  return (
    <Card data-tour="accounts-sns">
      <CardHeader>
        <CardTitle>SNS deliveries</CardTitle>
        <CardDescription>Latest messages on the capplan-alerts topic, read back from its SQS subscriber.</CardDescription>
      </CardHeader>
      <CardContent>
        {(notes.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No notifications yet — warnings and critical alerts are published here.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(notes.data ?? []).map((n) => (
              <li key={n.messageId} className="flex items-start gap-2 text-xs">
                <Mail className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">{n.subject}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">{n.messageId}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
