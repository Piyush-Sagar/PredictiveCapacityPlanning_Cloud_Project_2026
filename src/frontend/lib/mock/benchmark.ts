import type { ModelBenchmarkResult } from "@/lib/types";
import { modelType } from "@/lib/types";

/**
 * Hand-authored benchmark table (not randomly generated) so the accuracy vs.
 * latency/cost/memory trade-off between foundation models and baselines reads
 * as a deliberate, credible result set rather than noise.
 */
const RAW_BENCHMARKS: Omit<ModelBenchmarkResult, "modelType">[] = [
  // Chronos
  { modelName: "chronos", horizonMinutes: 15, mae: 3.8, rmse: 5.1, smape: 6.2, mase: 0.61, p90CoveragePct: 89.4, inferenceLatencyMs: 140, costPer1kInferencesUsd: 2.4, memoryFootprintMb: 620 },
  { modelName: "chronos", horizonMinutes: 30, mae: 4.6, rmse: 6.3, smape: 7.4, mase: 0.68, p90CoveragePct: 88.1, inferenceLatencyMs: 145, costPer1kInferencesUsd: 2.45, memoryFootprintMb: 620 },
  { modelName: "chronos", horizonMinutes: 60, mae: 6.5, rmse: 8.9, smape: 9.8, mase: 0.83, p90CoveragePct: 85.6, inferenceLatencyMs: 150, costPer1kInferencesUsd: 2.5, memoryFootprintMb: 620 },
  // TimesFM
  { modelName: "timesfm", horizonMinutes: 15, mae: 4.0, rmse: 5.4, smape: 6.5, mase: 0.63, p90CoveragePct: 89.0, inferenceLatencyMs: 95, costPer1kInferencesUsd: 1.6, memoryFootprintMb: 410 },
  { modelName: "timesfm", horizonMinutes: 30, mae: 4.9, rmse: 6.7, smape: 7.9, mase: 0.71, p90CoveragePct: 87.5, inferenceLatencyMs: 100, costPer1kInferencesUsd: 1.65, memoryFootprintMb: 410 },
  { modelName: "timesfm", horizonMinutes: 60, mae: 7.0, rmse: 9.4, smape: 10.4, mase: 0.87, p90CoveragePct: 84.2, inferenceLatencyMs: 105, costPer1kInferencesUsd: 1.7, memoryFootprintMb: 410 },
  // Moirai
  { modelName: "moirai", horizonMinutes: 15, mae: 4.2, rmse: 5.6, smape: 6.8, mase: 0.65, p90CoveragePct: 88.7, inferenceLatencyMs: 180, costPer1kInferencesUsd: 2.9, memoryFootprintMb: 780 },
  { modelName: "moirai", horizonMinutes: 30, mae: 5.1, rmse: 7.0, smape: 8.2, mase: 0.74, p90CoveragePct: 86.9, inferenceLatencyMs: 188, costPer1kInferencesUsd: 2.95, memoryFootprintMb: 780 },
  { modelName: "moirai", horizonMinutes: 60, mae: 7.4, rmse: 10.1, smape: 11.0, mase: 0.91, p90CoveragePct: 82.8, inferenceLatencyMs: 195, costPer1kInferencesUsd: 3.0, memoryFootprintMb: 780 },
  // TTM
  { modelName: "ttm", horizonMinutes: 15, mae: 4.5, rmse: 6.0, smape: 7.1, mase: 0.69, p90CoveragePct: 88.0, inferenceLatencyMs: 60, costPer1kInferencesUsd: 0.85, memoryFootprintMb: 260 },
  { modelName: "ttm", horizonMinutes: 30, mae: 5.4, rmse: 7.4, smape: 8.6, mase: 0.77, p90CoveragePct: 86.2, inferenceLatencyMs: 65, costPer1kInferencesUsd: 0.9, memoryFootprintMb: 260 },
  { modelName: "ttm", horizonMinutes: 60, mae: 7.8, rmse: 10.6, smape: 11.6, mase: 0.95, p90CoveragePct: 83.1, inferenceLatencyMs: 70, costPer1kInferencesUsd: 0.95, memoryFootprintMb: 260 },
  // Seasonal naive
  { modelName: "seasonal-naive", horizonMinutes: 15, mae: 8.9, rmse: 11.8, smape: 14.2, mase: 1.1, p90CoveragePct: 78.5, inferenceLatencyMs: 4, costPer1kInferencesUsd: 0.02, memoryFootprintMb: 18 },
  { modelName: "seasonal-naive", horizonMinutes: 30, mae: 10.6, rmse: 13.9, smape: 16.5, mase: 1.24, p90CoveragePct: 75.1, inferenceLatencyMs: 4, costPer1kInferencesUsd: 0.02, memoryFootprintMb: 18 },
  { modelName: "seasonal-naive", horizonMinutes: 60, mae: 14.2, rmse: 18.4, smape: 21.3, mase: 1.52, p90CoveragePct: 69.8, inferenceLatencyMs: 5, costPer1kInferencesUsd: 0.02, memoryFootprintMb: 18 },
  // XGBoost
  { modelName: "xgboost", horizonMinutes: 15, mae: 6.8, rmse: 9.0, smape: 10.9, mase: 0.94, p90CoveragePct: 82.6, inferenceLatencyMs: 12, costPer1kInferencesUsd: 0.06, memoryFootprintMb: 90 },
  { modelName: "xgboost", horizonMinutes: 30, mae: 8.1, rmse: 10.7, smape: 12.8, mase: 1.05, p90CoveragePct: 79.8, inferenceLatencyMs: 13, costPer1kInferencesUsd: 0.07, memoryFootprintMb: 90 },
  { modelName: "xgboost", horizonMinutes: 60, mae: 11.0, rmse: 14.6, smape: 16.9, mase: 1.28, p90CoveragePct: 74.5, inferenceLatencyMs: 14, costPer1kInferencesUsd: 0.08, memoryFootprintMb: 90 },
  // LSTM
  { modelName: "lstm", horizonMinutes: 15, mae: 6.2, rmse: 8.3, smape: 10.1, mase: 0.88, p90CoveragePct: 83.9, inferenceLatencyMs: 22, costPer1kInferencesUsd: 0.15, memoryFootprintMb: 140 },
  { modelName: "lstm", horizonMinutes: 30, mae: 7.4, rmse: 9.9, smape: 11.8, mase: 0.99, p90CoveragePct: 81.2, inferenceLatencyMs: 24, costPer1kInferencesUsd: 0.16, memoryFootprintMb: 140 },
  { modelName: "lstm", horizonMinutes: 60, mae: 10.1, rmse: 13.5, smape: 15.6, mase: 1.19, p90CoveragePct: 76.3, inferenceLatencyMs: 26, costPer1kInferencesUsd: 0.18, memoryFootprintMb: 140 },
];

export const BENCHMARK_RESULTS: ModelBenchmarkResult[] = RAW_BENCHMARKS.map((row) => ({
  ...row,
  modelType: modelType(row.modelName),
}));
