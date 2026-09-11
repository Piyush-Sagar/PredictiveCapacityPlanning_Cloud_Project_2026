"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exportToCsv } from "@/lib/utils";

export function ExportCsvButton({
  filename,
  rows,
}: {
  filename: string;
  rows: Record<string, string | number>[];
}) {
  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportToCsv(filename, rows)}>
      <Download className="size-3.5" />
      Export CSV
    </Button>
  );
}
