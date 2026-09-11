"use client";

import { useMemo, useState } from "react";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ModelTypeBadge } from "@/components/dashboard/status-badges";
import { BenchmarkBarChart } from "@/components/dashboard/benchmark-bar-chart";
import { LatencyAccuracyScatter } from "@/components/dashboard/latency-accuracy-scatter";
import { ModelMixDonut } from "@/components/dashboard/model-mix-donut";
import { ExportCsvButton } from "@/components/dashboard/export-csv-button";
import { BENCHMARK_RESULTS } from "@/lib/mock";
import { MODEL_LABELS, type Horizon } from "@/lib/types";
import { formatPercent, formatUsd } from "@/lib/utils";

export default function BenchmarkingPage() {
  const [horizon, setHorizon] = useState<Horizon>(15);

  const results = useMemo(
    () =>
      BENCHMARK_RESULTS.filter((r) => r.horizonMinutes === horizon).sort((a, b) => a.mae - b.mae),
    [horizon]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Model accuracy, latency, and cost at the selected forecast horizon
        </p>
        <Tabs value={String(horizon)} onValueChange={(value) => setHorizon(Number(value) as Horizon)}>
          <TabsList>
            <TabsTrigger value="15">15m</TabsTrigger>
            <TabsTrigger value="30">30m</TabsTrigger>
            <TabsTrigger value="60">60m</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Error metrics</CardTitle>
            <CardDescription>Lower is better — MAE and RMSE by model.</CardDescription>
          </CardHeader>
          <CardContent>
            <BenchmarkBarChart results={results} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Efficiency frontier</CardTitle>
            <CardDescription>Accuracy (MAE) vs. inference latency — lower-left is best.</CardDescription>
          </CardHeader>
          <CardContent>
            <LatencyAccuracyScatter results={results} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Model mix</CardTitle>
            <CardDescription>Foundation vs. baseline share of the model portfolio.</CardDescription>
          </CardHeader>
          <CardContent>
            <ModelMixDonut results={results} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Benchmark table</CardTitle>
          <CardDescription>Sorted by MAE ascending.</CardDescription>
          <CardAction>
            <ExportCsvButton
              filename={`benchmark-${horizon}m.csv`}
              rows={results.map((result) => ({
                Model: MODEL_LABELS[result.modelName],
                Type: result.modelType,
                MAE: result.mae,
                RMSE: result.rmse,
                sMAPE: result.smape,
                MASE: result.mase,
                "P90 coverage (%)": result.p90CoveragePct,
                "Latency (ms)": result.inferenceLatencyMs,
                "Cost per 1k inferences (USD)": result.costPer1kInferencesUsd,
                "Memory (MB)": result.memoryFootprintMb,
              }))}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">MAE</TableHead>
                <TableHead className="text-right">RMSE</TableHead>
                <TableHead className="text-right">sMAPE</TableHead>
                <TableHead className="text-right">MASE</TableHead>
                <TableHead className="text-right">P90 cov.</TableHead>
                <TableHead className="text-right">Latency</TableHead>
                <TableHead className="text-right">Cost/1k</TableHead>
                <TableHead className="text-right">Memory</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
                <TableRow key={result.modelName}>
                  <TableCell className="font-medium">{MODEL_LABELS[result.modelName]}</TableCell>
                  <TableCell>
                    <ModelTypeBadge type={result.modelType} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{result.mae}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{result.rmse}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatPercent(result.smape, 1)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{result.mase}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatPercent(result.p90CoveragePct, 1)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {result.inferenceLatencyMs}ms
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatUsd(result.costPer1kInferencesUsd, 2)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {result.memoryFootprintMb}MB
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
