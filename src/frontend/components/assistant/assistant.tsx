"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, Loader2, RotateCcw, SendHorizontal, Sparkles, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api/client";
import { IS_LIVE } from "@/lib/config";
import { cn } from "@/lib/utils";

/** Open the assistant from anywhere: `openAssistant("optional question")`. */
export const ASSISTANT_EVENT = "capplan:assistant";
export function openAssistant(question?: string) {
  window.dispatchEvent(new CustomEvent(ASSISTANT_EVENT, { detail: { question } }));
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  meta?: { mode?: string; model?: string | null; toolsUsed?: string[]; notice?: string };
}

interface ChatResponse {
  answer: string;
  mode: "openrouter" | "offline";
  model: string | null;
  toolsUsed: string[];
  suggestions?: string[];
  notice?: string;
}

const STARTERS = [
  "How many viewers will US East have in the next hour?",
  "How many servers will we need for the next peak?",
  "What will this month cost?",
  "Any big events coming up tonight?",
  "What's waiting for my approval?",
  "Is predictive scaling worth it?",
];

const TOOL_LABELS: Record<string, string> = {
  get_demand_forecast: "demand forecast",
  get_capacity_plan: "capacity plan",
  get_cost_outlook: "cost outlook",
  get_upcoming_events: "event calendar",
  get_pending_alerts: "pending alerts",
  get_policy_comparison: "policy backtest",
  get_model_performance: "model benchmark",
  get_scaling_policy: "scaling policy",
};

// --------------------------------------------------------------- tiny, safe markdown renderer

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) parts.push(<strong key={i++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) parts.push(<code key={i++} className="rounded bg-muted px-1 font-mono text-[0.85em]">{tok.slice(1, -1)}</code>);
    else parts.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let table: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={blocks.length} className="my-1 ml-4 list-disc space-y-0.5">
          {list.map((l, i) => (
            <li key={i}>{inline(l)}</li>
          ))}
        </ul>
      );
      list = [];
    }
    if (table.length) {
      const rows = table.filter((r) => !/^\|?\s*:?-{2,}/.test(r)).map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
      blocks.push(
        <div key={blocks.length} className="my-1.5 overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={cn("border-b border-border/60", i === 0 && "font-semibold")}>
                  {r.map((c, j) => (
                    <td key={j} className="px-1.5 py-1">
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      table = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*\|/.test(line)) {
      if (list.length) flush();
      table.push(line.trim());
      continue;
    }
    if (table.length) flush();
    const bullet = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    blocks.push(
      <p key={blocks.length} className={cn("my-1", heading && "mt-2 font-semibold")}>
        {inline(heading ? heading[1] : line)}
      </p>
    );
  }
  flush();
  return <Fragment>{blocks}</Fragment>;
}

// --------------------------------------------------------------- dialog

export function AssistantDialog() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const [status, setStatus] = useState<{ mode: string; model: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const send = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      const history: ChatMessage[] = [...messages, { role: "user", content: q }];
      setMessages(history);
      setInput("");
      if (!IS_LIVE) {
        setMessages([...history, { role: "assistant", content: "The assistant reads live pipeline data, so it needs **live mode** (`docker compose up` or `make dev`)." }]);
        return;
      }
      setBusy(true);
      try {
        const res = await api.post<ChatResponse>("/assistant/chat", {
          messages: history.map(({ role, content }) => ({ role, content })),
        });
        setMessages([
          ...history,
          { role: "assistant", content: res.answer, meta: { mode: res.mode, model: res.model, toolsUsed: res.toolsUsed, notice: res.notice } },
        ]);
        if (res.suggestions?.length) setSuggestions(res.suggestions);
      } catch (error) {
        const msg =
          error instanceof ApiError && error.code === "no_connected_account"
            ? "Connect an AWS account first (AWS Accounts page) — I answer from that account's live data."
            : `Sorry, something went wrong: ${error instanceof Error ? error.message : String(error)}`;
        setMessages([...history, { role: "assistant", content: msg }]);
      } finally {
        setBusy(false);
      }
    },
    [busy, messages]
  );

  // Opened from the ⌘K palette ("Ask AI: …"), the header button, or openAssistant().
  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpen(true);
      const q = (e as CustomEvent<{ question?: string }>).detail?.question;
      if (q) setTimeout(() => send(q), 50);
    };
    window.addEventListener(ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_EVENT, onOpen);
  }, [send]);

  useEffect(() => {
    if (!open || !IS_LIVE || status) return;
    api.get<{ mode: string; model: string | null }>("/assistant/status").then(setStatus).catch(() => undefined);
  }, [open, status]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[min(680px,calc(100vh-4rem))] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Capacity Assistant
          </DialogTitle>
          <DialogDescription className="text-xs">
            Ask about upcoming demand, servers needed, costs, events and pending decisions.{" "}
            {status && (
              <span className="font-medium">
                {status.mode === "openrouter" ? `OpenRouter · ${status.model}` : "Offline mode (set OPENROUTER_API_KEY in .env for an LLM)"}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Bot className="size-5" />
              </div>
              <p className="text-sm font-medium">What do you want to know about the plan ahead?</p>
              <p className="max-w-md text-xs text-muted-foreground">
                I read the live forecasts, capacity plan, cost outlook and event calendar for the active account.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex gap-2.5", m.role === "user" && "flex-row-reverse")}>
              <div
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                  m.role === "user" ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
                )}
              >
                {m.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
              </div>
              <div
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/60"
                )}
              >
                {m.role === "user" ? m.content : <Markdown text={m.content} />}
                {m.meta && (
                  <p className="mt-2 border-t border-border/60 pt-1.5 text-[10px] text-muted-foreground">
                    {m.meta.mode === "openrouter" ? `OpenRouter · ${m.meta.model}` : "offline answer"}
                    {m.meta.toolsUsed && m.meta.toolsUsed.length > 0 &&
                      ` · data: ${[...new Set(m.meta.toolsUsed)].map((t) => TOOL_LABELS[t] ?? t).join(", ")}`}
                    {m.meta.notice && ` · ${m.meta.notice}`}
                  </p>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Checking live data…
            </div>
          )}
        </div>

        <div className="border-t px-4 py-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestions.slice(0, 4).map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => send(s)}
                className="cursor-pointer rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="e.g. How many servers will AP South need at the next peak?"
              aria-label="Ask the capacity assistant"
              className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
            {messages.length > 0 && (
              <Button type="button" variant="ghost" size="icon" aria-label="New conversation" onClick={() => { setMessages([]); setSuggestions(STARTERS); }}>
                <RotateCcw />
              </Button>
            )}
            <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
              <SendHorizontal />
            </Button>
          </form>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Enter to send · Shift+Enter for a new line · Tip: type a question in the ⌘K search and press Enter</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
