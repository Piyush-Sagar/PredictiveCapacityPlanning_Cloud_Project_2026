"use client";

import { useEffect, useState } from "react";

/**
 * Increments once per `intervalMs` after mount (starts at 0 on both server and
 * client, so there's no hydration mismatch) — used to reseed mock data so
 * charts visibly refresh like a live feed.
 */
export function useLiveTick(intervalMs = 1000): number {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return tick;
}
