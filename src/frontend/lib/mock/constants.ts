import type { Horizon, ModelName, Region, ResourceType } from "@/lib/types";

/**
 * Fixed anchor "now" for all mock data. Using a real Date.now() would make
 * server-rendered and client-hydrated output diverge (hydration mismatch),
 * so the whole demo timeline is pinned to this instant instead.
 */
export const MOCK_NOW = new Date("2026-09-11T14:30:00.000Z");

/**
 * A fixed (non-live-tick) seed used to derive a comparable "previous period"
 * snapshot for KPI trend deltas, since the mock layer doesn't replay real
 * history — reuses the same reseed mechanism built for live-tick jitter.
 */
export const PREVIOUS_PERIOD_SEED = 8675309;

export const REGIONS: Region[] = ["us-east", "us-west", "eu-west", "ap-south", "sa-east"];

export const HORIZONS: Horizon[] = [15, 30, 60];

export const FOUNDATION_MODEL_LIST: ModelName[] = ["chronos", "timesfm", "moirai", "ttm"];
export const BASELINE_MODEL_LIST: ModelName[] = ["seasonal-naive", "xgboost", "lstm"];
export const ALL_MODELS: ModelName[] = [...FOUNDATION_MODEL_LIST, ...BASELINE_MODEL_LIST];

export const RESOURCE_TYPES: ResourceType[] = [
  "ecs-task",
  "ec2-asg",
  "origin-capacity",
  "transcoding-worker",
];

/** Relative base demand (concurrent viewers, thousands) per region. */
export const REGION_BASE_LOAD: Record<Region, number> = {
  "us-east": 420,
  "us-west": 260,
  "eu-west": 310,
  "ap-south": 380,
  "sa-east": 140,
};

export const DEFAULT_SAFETY_MARGIN_PCT = 0.2;
export const DEFAULT_THROUGHPUT_PER_UNIT = 8; // thousand concurrent viewers per capacity unit
export const DEFAULT_BUDGET_THRESHOLD_USD = 4200;
export const DEFAULT_COST_PER_UNIT_HOUR_USD = 0.42;
