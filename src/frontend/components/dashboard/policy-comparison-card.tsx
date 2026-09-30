"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PolicyComparison } from "@/lib/types";
import { formatDateTime, formatUsd } from "@/lib/utils";

const slaConfig = { slaViolationMinutes: { label: "SLA-violation minutes", color: "var(--chart-4)" } } satisfies ChartConfig;
const costConfig = { totalCostUsd: { label: "Total cost (USD)", color: "var(--chart-1)" } } satisfies ChartConfig;

/** Capacity-first evaluation: the same test week replayed under each policy. */
export function PolicyComparisonCard({ comparison }: { comparison: PolicyComparison }) {
  const rows = comparison.policies;
  const reactive = rows.find((r) => r.policy === "reactive");
  const data = rows.map((r) => ({ ...r, name: r.label.replace("Predictive ", "").replace(" · ", " ") }));

  return (
    <Card data-tour="cost-policies">
      <CardHeader>
        <CardTitle>Scaling policy comparison (backtest)</CardTitle>
        <CardDescription>
          Test week {formatDateTime(comparison.testWindow.start)} – {formatDateTime(comparison.testWindow.end)} replayed
          at 5-minute steps with a 10-minute provisioning delay, all five regions and four fleets.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartContainer config={slaConfig} className="aspect-auto h-60 w-full">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="slaViolationMinutes" fill="var(--color-slaViolationMinutes)" radius={3} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
          <ChartContainer config={costConfig} className="aspect-auto h-60 w-full">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="name" width={130} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="totalCostUsd" fill="var(--color-totalCostUsd)" radius={3} isAnimationActive={false} />
            </BarChart>
          </ChartContainer>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Policy</TableHead>
              <TableHead className="text-right">SLA min.</TableHead>
              <TableHead className="text-right">Oscillations</TableHead>
              <TableHead className="text-right">Avg. util.</TableHead>
              <TableHead className="text-right">Infra</TableHead>
              <TableHead className="text-right">Inference</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">vs. reactive</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.policy}>
                <TableCell className="text-xs font-medium">
                  {r.label}
                  {r.policy === comparison.systemPolicy && (
                    <Badge variant="secondary" className="ml-2 text-[10px]">
                      in use
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">{r.slaViolationMinutes}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{r.scalingOscillations}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{r.avgUtilizationPct.toFixed(0)}%</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatUsd(r.infrastructureCostUsd)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatUsd(r.modelInferenceCostUsd)}</TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums">{formatUsd(r.totalCostUsd)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {reactive ? `${(((r.totalCostUsd - reactive.totalCostUsd) / reactive.totalCostUsd) * 100).toFixed(1)}%` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
