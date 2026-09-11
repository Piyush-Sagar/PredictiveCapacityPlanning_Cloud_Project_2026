import type { ReactNode } from "react";

import { ConsoleHeader } from "./console-header";
import { PageHeader } from "./page-header";
import { Sidebar } from "./sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <ConsoleHeader />
      <div className="flex flex-1">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <PageHeader />
          <main className="flex-1 overflow-x-hidden bg-background p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
