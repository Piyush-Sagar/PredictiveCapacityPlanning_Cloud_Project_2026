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
import { Badge } from "@/components/ui/badge";
import { useApiData } from "@/lib/api/hooks";
import { IS_LIVE } from "@/lib/config";
import { BENCHMARK_RESULTS } from "@/lib/mock";
import { MODEL_LABELS, type BenchmarkResponse, type Horizon } from "@/lib/types";
import { formatPercent, formatUsd } from "@/lib/utils";

const MOCK_RESPONSE: BenchmarkResponse = {
  results: BENCHMARK_RESULTS,
  selection: {},
  simulatedModels: [],
  testWindow: { start: "", end: "" },
};

function formatLatency(ms: number) {
  return ms < 1 ? `${ms.toFixed(2)}ms` : `${Math.round(ms * 10) / 10}ms`;
}

function formatSmallUsd(v: number) {
  return v < 0.01 ? `$${v.toFixed(5)}` : formatUsd(v, 2);
}

export default function BenchmarkingPage() {
  const [horizon, setHorizon] = useState<Horizon>(15);

  const query = useApiData<BenchmarkResponse>("/benchmarks", () => MOCK_RESPONSE);
  const selected = query.data?.selection[String(horizon)];
  const simulated = query.data?.simulatedModels ?? [];
  const results = useMemo(
    () =>
      (query.data?.results ?? []).filter((r) => r.horizonMinutes === horizon).sort((a, b) => a.mae - b.mae),
    [query.data, horizon]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Model accuracy, latency, and cost at the selected forecast horizon
        </p>
        <Tabs data-tour="bench-horizon" value={String(horizon)} onValueChange={(value) => setHorizon(Number(value) as Horizon)}>
          <TabsList>
            <TabsTrigger value="15">15m</TabsTrigger>
            <TabsTrigger value="30">30m</TabsTrigger>
            <TabsTrigger value="60">60m</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {IS_LIVE && simulated.length > 0 && (
        <div data-tour="bench-banner" className="rounded-lg border border-status-warning/40 bg-status-warning/5 p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Foundation models are simulated.</span>{" "}
          {simulated.map((m) => MODEL_LABELS[m]).join(", ")} are emulated from published error, latency and hosting
          profiles (no weights are executed). Seasonal-naive, XGBoost and LSTM are real models trained on the dataset.
          Metrics are from a rolling-origin backtest over the held-out test week
          {query.data?.testWindow.start ? ` (${query.data.testWindow.start.slice(0, 10)} → ${query.data.testWindow.end.slice(0, 10)})` : ""}.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1" data-tour="bench-errors">
          <CardHeader>
            <CardTitle>Error metrics</CardTitle>
            <CardDescription>Lower is better — MAE and RMSE by model.</CardDescription>
          </CardHeader>
          <CardContent>
            <BenchmarkBarChart results={results} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-tour="bench-frontier">
          <CardHeader>
            <CardTitle>Efficiency frontier</CardTitle>
            <CardDescription>Accuracy (MAE) vs. inference latency — lower-left is best.</CardDescription>
          </CardHeader>
          <CardContent>
            <LatencyAccuracyScatter results={results} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-1" data-tour="bench-mix">
          <CardHeader>
            <CardTitle>Model mix</CardTitle>
            <CardDescription>Foundation vs. baseline share of the model portfolio.</CardDescription>
          </CardHeader>
          <CardContent>
            <ModelMixDonut results={results} />
          </CardContent>
        </Card>
      </div>

      <Card data-tour="bench-table">
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
                Simulated: result.simulated ? "yes" : "no",
                "Flash-crowd sMAPE": result.segments?.["flash-crowd"]?.smape ?? "",
                "Flash-crowd P90 coverage (%)": result.segments?.["flash-crowd"]?.p90CoveragePct ?? "",
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
                {IS_LIVE && <TableHead className="text-right">Flash-crowd sMAPE / cov.</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((result) => (
                <TableRow key={result.modelName}>
                  <TableCell className="font-medium">
                    {MODEL_LABELS[result.modelName]}
                    {selected === result.modelName && (
                      <Badge className="ml-2 text-[10px]" title="Chosen by capacity-first model selection">
                        selected
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <ModelTypeBadge type={result.modelType} />
                      {result.simulated && (
                        <Badge variant="outline" className="border-status-warning/50 text-[10px] text-status-warning">
                          simulated
                        </Badge>
                      )}
                    </div>
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
                    {formatLatency(result.inferenceLatencyMs)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatSmallUsd(result.costPer1kInferencesUsd)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {result.memoryFootprintMb}MB
                  </TableCell>
                  {IS_LIVE && (
                    <TableCell className="text-right font-mono tabular-nums">
                      {result.segments?.["flash-crowd"]
                        ? `${formatPercent(result.segments["flash-crowd"].smape, 1)} / ${formatPercent(result.segments["flash-crowd"].p90CoveragePct, 0)}`
                        : "—"}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
