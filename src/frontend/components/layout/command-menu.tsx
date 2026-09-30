"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, MapPin, Search, Sparkles, SunMoon } from "lucide-react";

import { defaultFilter } from "cmdk";

import { openAssistant } from "@/components/assistant/assistant";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_ITEMS } from "./nav-items";
import { useApiData } from "@/lib/api/hooks";
import { IS_LIVE } from "@/lib/config";
import { generateAlerts, generateCapacityRecommendations, generateConfidenceSnapshots, REGIONS } from "@/lib/mock";
import { useRegions, useSession } from "@/lib/session";
import { REGION_LABELS, type AlertItem } from "@/lib/types";

const MOCK_PENDING = generateAlerts(generateCapacityRecommendations(REGIONS), generateConfidenceSnapshots())
  .filter((alert) => alert.status === "pending")
  .slice(0, 4);

const ASK_AI = "__ask_ai__";
const QUESTION_START = /^(how|what|when|where|which|who|why|will|is|are|can|could|should|do|does|any|show|tell|explain|give|list|compare)\b/i;

/** Typed text that reads like a question for the assistant rather than a page/region search. */
function looksLikeQuestion(q: string): boolean {
  const t = q.trim();
  return t.includes("?") || (t.split(/\s+/).length >= 3 && QUESTION_START.test(t)) || t.split(/\s+/).length >= 5;
}

/** Normal fuzzy search, plus an "Ask AI" entry that jumps to the top for questions. */
function paletteFilter(value: string, search: string, keywords?: string[]): number {
  // Always shown; ranked first for questions, last for plain searches (render order matches).
  if (value === ASK_AI) return search.trim() ? (looksLikeQuestion(search) ? 2 : 0.0001) : 1;
  return defaultFilter(value, search, keywords);
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const regions = useRegions();
  const { activeAccount } = useSession();
  const live = useApiData<AlertItem[]>(IS_LIVE && open && activeAccount ? "/alerts?status=pending&limit=4" : null, () => MOCK_PENDING);
  const pendingAlerts = useMemo(() => (IS_LIVE ? (live.data ?? []) : MOCK_PENDING), [live.data]);

  function runCommand(action: () => void) {
    setOpen(false);
    setQuery("");
    action();
  }

  // Questions put "Ask AI" on top (so Enter asks); plain searches keep it at the bottom.
  const askFirst = !query.trim() || looksLikeQuestion(query);
  const askGroup = (
            <CommandGroup heading="Ask AI">
              <CommandItem value={ASK_AI} onSelect={() => runCommand(() => openAssistant(query.trim() || undefined))}>
                <Sparkles className="text-[#ec7211]" />
                <span className="truncate">
                  {query.trim() ? (
                    <>
                      Ask AI: <span className="font-medium">“{query.trim()}”</span>
                    </>
                  ) : (
                    "Ask the capacity assistant a question"
                  )}
                </span>
                {query.trim() && looksLikeQuestion(query) && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">↵ Enter to ask</span>
                )}
              </CommandItem>
            </CommandGroup>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md bg-console-header-hover/60 px-3 py-1.5 text-left text-sm text-console-header-muted transition-colors hover:bg-console-header-hover"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden truncate sm:inline">Search pages, regions, alerts…</span>
        <span className="ml-auto hidden shrink-0 items-center gap-0.5 rounded border border-console-header-border px-1.5 py-0.5 font-mono text-[10px] leading-none sm:flex">
          &#8984;K
        </span>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command filter={paletteFilter}>
          <CommandInput placeholder="Search pages, regions, alerts… or ask a question" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {askFirst && askGroup}
            {askFirst && <CommandSeparator />}

            <CommandGroup heading="Pages">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem key={item.href} onSelect={() => runCommand(() => router.push(item.href))}>
                    <Icon />
                    {item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>

            <CommandSeparator />
            <CommandGroup heading="Regions">
              {regions.map((region) => (
                <CommandItem
                  key={region}
                  onSelect={() => runCommand(() => router.push(`/forecast?region=${region}`))}
                >
                  <MapPin />
                  {REGION_LABELS[region]} forecast
                </CommandItem>
              ))}
            </CommandGroup>

            {pendingAlerts.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Pending alerts">
                  {pendingAlerts.map((alert) => (
                    <CommandItem key={alert.id} onSelect={() => runCommand(() => router.push("/alerts"))}>
                      <Bell />
                      <span className="truncate">{alert.title}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}

            {!askFirst && askGroup}
            <CommandSeparator />
            <CommandGroup heading="Actions">
              <CommandItem
                onSelect={() => runCommand(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
              >
                <SunMoon />
                Toggle theme
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
