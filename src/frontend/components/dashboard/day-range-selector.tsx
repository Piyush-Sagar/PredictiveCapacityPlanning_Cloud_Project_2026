"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const DAY_RANGES = [7, 14, 30] as const;
export type DayRange = (typeof DAY_RANGES)[number];

export function DayRangeSelector({
  value,
  onValueChange,
}: {
  value: DayRange;
  onValueChange: (value: DayRange) => void;
}) {
  return (
    <ToggleGroup
      variant="outline"
      value={[String(value)]}
      onValueChange={(next) => {
        const raw = next[0];
        if (raw != null) onValueChange(Number(raw) as DayRange);
      }}
    >
      {DAY_RANGES.map((days) => (
        <ToggleGroupItem key={days} value={String(days)} className="px-3 text-xs">
          {days}d
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
