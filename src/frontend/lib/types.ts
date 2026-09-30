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
  /** Live mode only: units before guardrails, budget cap flag, forecaster used. */
  rawRequiredUnits?: number;
  budgetCapped?: boolean;
  modelUsed?: ModelName;
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
  updatedAt?: string;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  snsMessageId?: string | null;
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
  /** True for emulated foundation models (no weights executed); see src/ai_models. */
  simulated?: boolean;
  host?: string;
  segments?: Record<string, { n: number; mae: number; smape: number; p90CoveragePct: number }>;
}

export interface CurrentUser {
  name: string;
  role: "operator" | "admin";
  avatarInitials: string;
  email?: string;
  groups?: string[];
}

// ---------------------------------------------------------------- live-mode API shapes

export type AccountStatus = "pending" | "connected" | "error" | "disconnected";

export interface LinkedAccount {
  id: string;
  awsAccountId: string;
  alias: string;
  displayName: string;
  status: AccountStatus;
  roleArn: string | null;
  externalId: string;
  stackId: string | null;
  regions: Region[];
  scale: number;
  createdAt: string;
  connectedAt: string | null;
  lastError: string | null;
  pendingAlerts: number | null;
}

export interface SampleAccount {
  accountId: string;
  alias: string;
  displayName: string;
  scale: number;
  regions: Region[];
}

export interface SimClock {
  now: string;
  tick: number;
  cursor: number;
  stepMinutes: number;
  tickSeconds: number;
  running: boolean;
  lastTickAt: string | null;
  lastTickMs: number | null;
  liveWindow: { start: string; end: string };
}

export interface PipelineStage {
  key: string;
  label: string;
  awsService: string;
  localStandIn: string;
  status: "ok" | "degraded" | "unknown";
  detail: string;
  lastRunAt: string | null;
}

export interface PipelineStatus {
  clock: SimClock;
  stages: PipelineStage[];
  selection: Record<string, ModelName>;
  planningModel: ModelName;
  dataset: { source?: string; rows?: number; start?: string; end?: string; sha256?: string; events?: number };
  preprocessing: Record<string, number>;
  aws: { ok: boolean | null; lastError: string | null; endpoint: string | null; platformAccount: string; topicArn?: string | null; calls: number; failures: number };
  schedulerError: string | null;
  account: { id: string; awsAccountId: string; alias: string };
}

export interface ScalingDecisionRow {
  id: number;
  region: Region;
  resourceType: ResourceType;
  timestamp: string;
  fromUnits: number;
  toUnits: number;
  trigger: "auto" | "approval";
  actor: string;
  modelUsed: ModelName;
  forecastP90: number;
  awsDesiredCount: number | null;
  awsRequest: string | null;
}

export interface PolicyComparisonRow {
  policy: string;
  label: string;
  slaViolationMinutes: number;
  overloadEvents: number;
  underutilizationEvents: number;
  scalingOscillations: number;
  infrastructureCostUsd: number;
  modelInferenceCostUsd: number;
  totalCostUsd: number;
  avgUtilizationPct: number;
}

export interface PolicyComparison {
  systemPolicy: string;
  testWindow: { start: string; end: string };
  policies: PolicyComparisonRow[];
}

export interface CostForecastPoint {
  TimePeriod: { Start: string; End: string };
  MeanValue: string;
  PredictionIntervalLowerBound: string;
  PredictionIntervalUpperBound: string;
}

export interface CostForecast {
  Total: { Amount: string; Unit: string };
  ForecastResultsByTime: CostForecastPoint[];
  PredictionIntervalLevel?: number;
  asOf: string;
  todaySoFarUsd: number;
  nextHour: {
    model: ModelName;
    p50CostUsd: number;
    p90CostUsd: number;
    currentRunRateUsdPerHour: number;
    byRegion: { region: Region; p50CostUsd: number; p90CostUsd: number; currentRunRateUsdPerHour: number }[];
  };
  monthEnd: { month: string; monthToDateUsd: number; meanUsd: number; lowerUsd: number; upperUsd: number };
  history: { date: string; costUsd: number }[];
  method: string;
}

export interface BenchmarkResponse {
  results: ModelBenchmarkResult[];
  selection: Record<string, ModelName>;
  simulatedModels: ModelName[];
  testWindow: { start: string; end: string };
}

export interface AccountPolicy {
  safetyMarginPct: number;
  mode: "auto" | "approve-all" | "recommend-only";
  hysteresisPct: number;
  hysteresisPeriods: number;
  scaleInCooldownSec: number;
  budgetMultiplier: number;
  autoExecuteMaxChangePct: number;
  approvalMinChangePct: number;
}
