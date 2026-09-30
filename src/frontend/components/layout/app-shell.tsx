"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AccountGate } from "./account-gate";
import { ConsoleHeader } from "./console-header";
import { PageHeader } from "./page-header";
import { Sidebar } from "./sidebar";

const BARE_ROUTES = ["/login"];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (BARE_ROUTES.some((route) => pathname.startsWith(route))) {
    return <main className="flex min-h-screen flex-1 flex-col bg-background">{children}</main>;
  }
  return (
    <div className="flex min-h-screen w-full flex-col">
      <ConsoleHeader />
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <PageHeader />
          <main className="flex-1 overflow-x-hidden bg-background p-4 sm:p-6">
            <AccountGate>{children}</AccountGate>
          </main>
        </div>
      </div>
    </div>
  );
}
