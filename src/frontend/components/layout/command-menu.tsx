"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, MapPin, Search, SunMoon } from "lucide-react";

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
import { generateAlerts, generateCapacityRecommendations, generateConfidenceSnapshots, REGIONS } from "@/lib/mock";
import { REGION_LABELS } from "@/lib/types";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
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

  const pendingAlerts = useMemo(() => {
    const recommendations = generateCapacityRecommendations(REGIONS);
    const confidenceSnapshots = generateConfidenceSnapshots();
    return generateAlerts(recommendations, confidenceSnapshots)
      .filter((alert) => alert.status === "pending")
      .slice(0, 4);
  }, []);

  function runCommand(action: () => void) {
    setOpen(false);
    action();
  }

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
        <Command>
          <CommandInput placeholder="Search pages, regions, alerts…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

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
              {REGIONS.map((region) => (
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
