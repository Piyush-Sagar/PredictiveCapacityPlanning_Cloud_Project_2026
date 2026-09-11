"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDirection = "asc" | "desc";

export interface SortState<Key extends string> {
  key: Key | null;
  direction: SortDirection;
}

/** Toggle a column: same key flips direction, a new key starts ascending. */
export function toggleSort<Key extends string>(prev: SortState<Key>, key: Key): SortState<Key> {
  if (prev.key === key) {
    return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
  }
  return { key, direction: "asc" };
}

export function sortRows<Row, Key extends string>(
  rows: Row[],
  sort: SortState<Key>,
  accessors: Record<Key, (row: Row) => string | number>
): Row[] {
  if (!sort.key) return rows;
  const accessor = accessors[sort.key];
  const factor = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const aVal = accessor(a);
    const bVal = accessor(b);
    if (aVal < bVal) return -1 * factor;
    if (aVal > bVal) return 1 * factor;
    return 0;
  });
}

export function SortableTableHead<Key extends string>({
  sortKey,
  sort,
  onSort,
  align = "left",
  className,
  children,
}: {
  sortKey: Key;
  sort: SortState<Key>;
  onSort: (key: Key) => void;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const isActive = sort.key === sortKey;
  const Icon = isActive ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
          align === "right" && "w-full flex-row-reverse justify-end"
        )}
      >
        {children}
        <Icon className={cn("size-3 shrink-0", !isActive && "opacity-40")} />
      </button>
    </TableHead>
  );
}
