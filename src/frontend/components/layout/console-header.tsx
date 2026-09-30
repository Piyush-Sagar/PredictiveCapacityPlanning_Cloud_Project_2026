"use client";

import { useState } from "react";
import { Bell, GraduationCap, Menu, Radar, Sparkles } from "lucide-react";

import { AssistantDialog, openAssistant } from "@/components/assistant/assistant";
import Link from "next/link";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { AccountSwitcher, SimClockBadge } from "./account-switcher";
import { CommandMenu } from "./command-menu";
import { useTour } from "@/components/tour/tour-provider";
import { SidebarNav } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";
import { UserBadge } from "./user-badge";

export function ConsoleHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const tour = useTour();

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-console-header-border bg-console-header px-3 text-console-header-foreground sm:px-4">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <button
        type="button"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-console-header-hover md:hidden"
      >
        <Menu className="size-5" />
      </button>

      <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-console-header-hover">
        <div className="flex size-7 items-center justify-center rounded bg-[#ec7211] text-white">
          <Radar className="size-4" />
        </div>
        <span className="hidden text-sm font-semibold whitespace-nowrap sm:inline">Capacity Planner</span>
      </Link>

      <div className="mx-auto flex w-full max-w-xl flex-1 items-center">
        <CommandMenu />
      </div>

      <button
        type="button"
        onClick={() => openAssistant()}
        data-tour="assistant-button"
        className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-console-header-border px-2.5 text-xs font-medium text-console-header-foreground transition-colors hover:bg-console-header-hover"
      >
        <Sparkles className="size-3.5 text-[#ec7211]" />
        <span className="hidden sm:inline">Ask AI</span>
      </button>
      <AssistantDialog />
      <div data-tour="header-context" className="flex shrink-0 items-center gap-2">
        <SimClockBadge />
        <AccountSwitcher />
      </div>
      <button
        type="button"
        onClick={() => tour.start("full")}
        aria-label="Start the interactive tour"
        title="Interactive tour"
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-console-header-foreground/90 transition-colors hover:bg-console-header-hover hover:text-console-header-foreground"
      >
        <GraduationCap className="size-4" />
      </button>
      <Link
        href="/alerts"
        aria-label="View alerts"
        className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-console-header-foreground/90 transition-colors hover:bg-console-header-hover hover:text-console-header-foreground"
      >
        <Bell className="size-4" />
      </Link>
      <ThemeToggle />
      <UserBadge />
    </header>
  );
}
