"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { api } from "@/lib/api/client";
import { CURRENT_USER } from "@/lib/auth-stub";
import { IS_LIVE } from "@/lib/config";
import { MOCK_NOW, REGIONS } from "@/lib/mock/constants";
import type { CurrentUser, LinkedAccount, Region, SimClock } from "@/lib/types";

interface SessionState {
  user: CurrentUser | null;
  accounts: LinkedAccount[];
  activeAccount: LinkedAccount | null;
  clock: SimClock | null;
  /** Bumps whenever the simulation ticks or data is mutated; live hooks refetch on change. */
  dataVersion: number;
  ready: boolean;
  selectAccount: (id: string) => Promise<void>;
  refreshAccounts: () => Promise<void>;
  invalidate: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

const MOCK_SESSION: SessionState = {
  user: CURRENT_USER,
  accounts: [],
  activeAccount: null,
  clock: null,
  dataVersion: 0,
  ready: true,
  selectAccount: async () => undefined,
  refreshAccounts: async () => undefined,
  invalidate: () => undefined,
};

const PUBLIC_ROUTES = ["/login"];

export function SessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The login page must not bootstrap a session (it would redirect to itself).
  if (!IS_LIVE || PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return <SessionContext.Provider value={MOCK_SESSION}>{children}</SessionContext.Provider>;
  }
  return <LiveSessionProvider>{children}</LiveSessionProvider>;
}

function LiveSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [clock, setClock] = useState<SimClock | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [ready, setReady] = useState(false);
  const lastTick = useRef<number | null>(null);

  const refreshAccounts = useCallback(async () => {
    const rows = await api.get<LinkedAccount[]>("/accounts");
    setAccounts(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/session", { cache: "no-store" });
      if (res.status === 401) {
        // Session expired: full reload through the login route (clears client state).
        window.location.replace(new URL(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`, window.location.origin));
        return;
      }
      const s = await res.json();
      if (cancelled) return;
      setUser({ name: s.name, role: s.role, avatarInitials: s.avatarInitials || "U", email: s.email, groups: s.groups });
      setSelectedId(s.account);
      try {
        await refreshAccounts();
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAccounts]);

  // Poll the simulation clock; each new tick invalidates live data.
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      try {
        const c = await api.get<SimClock>("/clock");
        setClock(c);
        if (lastTick.current !== null && c.tick !== lastTick.current) setDataVersion((v) => v + 1);
        lastTick.current = c.tick;
        timer = setTimeout(poll, Math.max(1500, Math.min(c.tickSeconds * 500, 10_000)));
      } catch {
        timer = setTimeout(poll, 5000);
      }
      if (stopped) clearTimeout(timer);
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ready]);

  const selectAccount = useCallback(async (id: string) => {
    await fetch("/api/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: id }) });
    setSelectedId(id);
    setDataVersion((v) => v + 1);
  }, []);

  const invalidate = useCallback(() => setDataVersion((v) => v + 1), []);

  const connected = accounts.filter((a) => a.status === "connected");
  const activeAccount = connected.find((a) => a.id === selectedId) ?? connected[0] ?? null;

  const value = useMemo<SessionState>(
    () => ({ user, accounts, activeAccount, clock, dataVersion, ready, selectAccount, refreshAccounts, invalidate }),
    [user, accounts, activeAccount, clock, dataVersion, ready, selectAccount, refreshAccounts, invalidate]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** "Now" on the dashboard timeline: the simulation clock in live mode, the pinned mock instant otherwise. */
export function useNowIso(): string {
  const { clock } = useSession();
  return clock?.now ?? MOCK_NOW.toISOString();
}

export function useRegions(): Region[] {
  const { activeAccount } = useSession();
  return activeAccount?.regions ?? REGIONS;
}
