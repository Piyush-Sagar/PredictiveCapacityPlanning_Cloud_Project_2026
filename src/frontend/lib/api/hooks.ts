"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ApiError, api } from "@/lib/api/client";
import { IS_LIVE } from "@/lib/config";
import { useLiveTick } from "@/lib/hooks/use-live-tick";
import { useSession } from "@/lib/session";

export interface ApiData<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  refresh: () => void;
}

/**
 * Live mode: GET ``/api/backend{path}`` and refetch on every simulation tick
 * (and when the selected account changes). Mock mode: evaluate ``mock`` with a
 * 1-second live tick, exactly like the original seeded demo.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- same signature as useMockData
function useLiveData<T>(path: string | null, _mock: (tick: number) => T): ApiData<T> {
  const { dataVersion, activeAccount } = useSession();
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean; key?: string }>({ loading: true });
  const [nonce, setNonce] = useState(0);
  const accountId = activeAccount?.id;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    const key = `${path}|${accountId}`;
    api
      .get<T>(path)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, key });
      })
      .catch((error: ApiError) => {
        if (!cancelled) setState((prev) => ({ ...prev, error, loading: false, key }));
      });
    return () => {
      cancelled = true;
    };
  }, [path, dataVersion, accountId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  // Hide data belonging to a previous path/account while the new request is in flight.
  const stale = state.key !== undefined && state.key !== `${path}|${accountId}`;
  return { data: stale ? undefined : state.data, error: stale ? undefined : state.error, loading: state.loading || stale, refresh };
}

function useMockData<T>(_path: string | null, mock: (tick: number) => T): ApiData<T> {
  const tick = useLiveTick(1000);
  const data = useMemo(() => mock(tick), [tick, mock]);
  return { data, error: undefined, loading: false, refresh: () => undefined };
}

export const useApiData: <T>(path: string | null, mock: (tick: number) => T) => ApiData<T> = IS_LIVE
  ? useLiveData
  : useMockData;
