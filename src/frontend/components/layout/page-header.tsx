"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "./nav-items";

export function PageHeader() {
  const pathname = usePathname();
  const currentItem =
    NAV_ITEMS.find((item) => item.href === pathname) ??
    NAV_ITEMS.find((item) => item.href !== "/" && pathname.startsWith(item.href)) ??
    NAV_ITEMS[0];

  return (
    <div className="border-b border-border bg-background px-4 pt-3 pb-4 sm:px-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Capacity Planner</span>
        <ChevronRight className="size-3" />
        <span className="font-medium text-foreground">{currentItem.label}</span>
      </nav>
      <h1 className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">{currentItem.label}</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">{currentItem.description}</p>
    </div>
  );
}
