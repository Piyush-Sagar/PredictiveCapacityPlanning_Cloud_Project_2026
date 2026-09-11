import type { Horizon, ModelConfidenceSnapshot, ModelName, ModelStatus, Region } from "@/lib/types";
import { modelType } from "@/lib/types";
import { ALL_MODELS, HORIZONS, MOCK_NOW, REGIONS } from "./constants";
import { gaussian, seededRandom } from "./rng";

const TARGET_COVERAGE_PCT = 90;
const LIVE_JITTER_AMPLITUDE = 0.4; // percentage points

function calibrationErrorFor(model: ModelName, horizonMinutes: Horizon, rand: () => number): number {
  const isFoundation = modelType(model) === "foundation";
  const horizonFactor = horizonMinutes / 15;
  const base = isFoundation ? 2 + horizonFactor * 1.5 : 5 + horizonFactor * 2.5;
  const noise = (rand() - 0.5) * 3;
  return Math.max(0.4, base + noise);
}

function statusFor(model: ModelName, calibrationErrorPct: number): { status: ModelStatus; fallbackModel?: ModelName } {
  if (model === "seasonal-naive") return { status: "nominal" };

  const isFoundation = modelType(model) === "foundation";
  if (isFoundation) {
    if (calibrationErrorPct > 11) return { status: "fallback", fallbackModel: "seasonal-naive" };
    if (calibrationErrorPct > 6) return { status: "degraded" };
    return { status: "nominal" };
  }

  // Baselines (xgboost/lstm) can degrade but don't have a further fallback tier.
  if (calibrationErrorPct > 9) return { status: "degraded" };
  return { status: "nominal" };
}

export function generateConfidenceSnapshots(liveSeed = 0): ModelConfidenceSnapshot[] {
  const snapshots: ModelConfidenceSnapshot[] = [];

  ALL_MODELS.forEach((modelName, modelIndex) => {
    HORIZONS.forEach((horizonMinutes) => {
      const rand = seededRandom("confidence", modelName, horizonMinutes);
      const region: Region = REGIONS[(modelIndex + horizonMinutes) % REGIONS.length];
      // Status/fallback derive from the stable base error so badges never flicker.
      const calibrationErrorPct = Math.round(calibrationErrorFor(modelName, horizonMinutes, rand) * 10) / 10;
      const { status, fallbackModel } = statusFor(modelName, calibrationErrorPct);

      // Only the displayed/charted numbers get a small live wobble each tick.
      const jitterRand = liveSeed
        ? seededRandom("live-jitter-confidence", modelName, horizonMinutes, liveSeed)
        : null;
      const jitter = jitterRand ? gaussian(jitterRand, 0, LIVE_JITTER_AMPLITUDE) : 0;
      const displayedErrorPct = Math.max(0.1, Math.round((calibrationErrorPct + jitter) * 10) / 10);
      const actualCoveragePct = Math.round((TARGET_COVERAGE_PCT - displayedErrorPct) * 10) / 10;

      const latencyPenalty = modelType(modelName) === "baseline" ? 6 : 0;
      const confidenceScore = Math.max(
        0,
        Math.min(100, Math.round(100 - displayedErrorPct * 3.4 - latencyPenalty))
      );

      snapshots.push({
        modelName,
        horizonMinutes,
        region,
        targetCoveragePct: TARGET_COVERAGE_PCT,
        actualCoveragePct,
        calibrationErrorPct: displayedErrorPct,
        confidenceScore,
        status,
        fallbackModel,
        asOf: MOCK_NOW.toISOString(),
      });
    });
  });

  return snapshots;
}
