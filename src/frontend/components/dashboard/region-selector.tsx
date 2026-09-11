"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { REGION_LABELS, type Region } from "@/lib/types";
import { REGIONS } from "@/lib/mock";

export function RegionSelector({
  value,
  onValueChange,
  includeAll = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  includeAll?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(String(next))}>
      <SelectTrigger className="w-40">
        <SelectValue placeholder="Region" />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">All regions</SelectItem>}
        {REGIONS.map((region: Region) => (
          <SelectItem key={region} value={region}>
            {REGION_LABELS[region]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
