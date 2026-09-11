export type Region = "us-east" | "us-west" | "eu-west" | "ap-south" | "sa-east";

export const REGION_LABELS: Record<Region, string> = {
  "us-east": "US East",
  "us-west": "US West",
  "eu-west": "EU West",
  "ap-south": "AP South",
  "sa-east": "SA East",
};

export type Horizon = 15 | 30 | 60;

export type ModelName =
  | "chronos"
  | "timesfm"
  | "moirai"
  | "ttm"
  | "seasonal-naive"
  | "xgboost"
  | "lstm";

export const MODEL_LABELS: Record<ModelName, string> = {
  chronos: "Chronos",
  timesfm: "TimesFM",
  moirai: "Moirai",
  ttm: "TTM",
  "seasonal-naive": "Seasonal Naive",
  xgboost: "XGBoost",
  lstm: "LSTM",
};

export type ModelType = "foundation" | "baseline";

export const FOUNDATION_MODELS: ModelName[] = ["chronos", "timesfm", "moirai", "ttm"];
export const BASELINE_MODELS: ModelName[] = ["seasonal-naive", "xgboost", "lstm"];

export function modelType(model: ModelName): ModelType {
  return FOUNDATION_MODELS.includes(model) ? "foundation" : "baseline";
}

export type ResourceType =
  | "ecs-task"
  | "ec2-asg"
  | "origin-capacity"
  | "transcoding-worker";

export const RESOURCE_LABELS: Record<ResourceType, string> = {
  "ecs-task": "ECS Task",
  "ec2-asg": "EC2 ASG",
  "origin-capacity": "Origin Capacity",
  "transcoding-worker": "Transcoding Worker",
};

export type DecisionState = "recommend" | "approve" | "auto-execute";

export type ModelStatus = "nominal" | "degraded" | "fallback";

export type AlertType =
  | "predicted-peak"
  | "low-confidence"
  | "proposed-scale"
  | "sla-risk"
  | "budget-risk";

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertStatus = "pending" | "approved" | "rejected" | "auto-executed";

export interface ForecastPoint {
  timestamp: string;
  region: Region;
  horizonMinutes: Horizon;
  /** Only present for timestamps at or before "now" in the mock timeline. */
  actual?: number;
  p50: number;
  p90: number;
  modelUsed: ModelName;
  isForecast: boolean;
}

export interface ForecastSeries {
  region: Region;
  horizonMinutes: Horizon;
  generatedAt: string;
  nowIndex: number;
  points: ForecastPoint[];
}

export interface CapacityRecommendation {
  id: string;
  region: Region;
  resourceType: ResourceType;
  timestamp: string;
  forecastP90: number;
  throughputPerUnit: number;
  safetyMarginPct: number;
  requiredUnits: number;
  currentUnits: number;
  minUnits: number;
  maxUnits: number;
  hysteresisActive: boolean;
  cooldownRemainingSec: number;
  budgetThresholdUsd: number;
  estimatedCostUsd: number;
  decisionState: DecisionState;
}

export interface ModelConfidenceSnapshot {
  modelName: ModelName;
  horizonMinutes: Horizon;
  region: Region;
  targetCoveragePct: number;
  actualCoveragePct: number;
  calibrationErrorPct: number;
  confidenceScore: number;
  status: ModelStatus;
  fallbackModel?: ModelName;
  asOf: string;
}

export interface AlertItem {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  region: Region;
  createdAt: string;
  relatedRecommendationId?: string;
  status: AlertStatus;
}

export interface CostSlaMetric {
  timestamp: string;
  region: Region;
  instanceHours: number;
  taskHours: number;
  modelInferenceCostUsd: number;
  infrastructureCostUsd: number;
  slaViolationMinutes: number;
  overloadEvents: number;
  underutilizationEvents: number;
  scalingOscillations: number;
}

export interface ModelBenchmarkResult {
  modelName: ModelName;
  modelType: ModelType;
  horizonMinutes: Horizon;
  mae: number;
  rmse: number;
  smape: number;
  mase: number;
  p90CoveragePct: number;
  inferenceLatencyMs: number;
  costPer1kInferencesUsd: number;
  memoryFootprintMb: number;
}

export interface CurrentUser {
  name: string;
  role: "operator" | "admin";
  avatarInitials: string;
}
