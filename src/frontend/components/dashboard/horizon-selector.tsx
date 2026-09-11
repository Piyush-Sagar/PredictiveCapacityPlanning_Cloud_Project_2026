"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { HORIZONS } from "@/lib/mock";
import type { Horizon } from "@/lib/types";

export function HorizonSelector({
  value,
  onValueChange,
}: {
  value: Horizon;
  onValueChange: (value: Horizon) => void;
}) {
  return (
    <ToggleGroup
      variant="outline"
      value={[String(value)]}
      onValueChange={(next) => {
        const raw = next[0];
        if (raw != null) onValueChange(Number(raw) as Horizon);
      }}
    >
      {HORIZONS.map((horizon) => (
        <ToggleGroupItem key={horizon} value={String(horizon)} className="px-3 text-xs">
          {horizon}m
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
