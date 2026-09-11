import type { CostSlaMetric, Region } from "@/lib/types";
import { MOCK_NOW, REGION_BASE_LOAD } from "./constants";
import { gaussian, seededRandom } from "./rng";

const LIVE_JITTER_AMPLITUDE = 0.03;

function liveJitter(liveSeed: number, region: Region, dayOffset: number, field: string): number {
  if (!liveSeed) return 0;
  const rand = seededRandom("live-jitter-cost", region, dayOffset, field, liveSeed);
  return gaussian(rand, 0, LIVE_JITTER_AMPLITUDE);
}

export function generateCostSlaTimeseries(regions: Region[], days = 7, liveSeed = 0): CostSlaMetric[] {
  const metrics: CostSlaMetric[] = [];

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    const timestamp = new Date(MOCK_NOW.getTime() - dayOffset * 24 * 60 * 60_000);

    for (const region of regions) {
      const rand = seededRandom("cost-sla", region, dayOffset);
      const loadFactor = REGION_BASE_LOAD[region] / 300;

      const instanceHours = Math.round((14 + rand() * 10) * loadFactor * 10) / 10;
      const taskHours = Math.round((26 + rand() * 16) * loadFactor * 10) / 10;
      const modelInferenceCostUsd =
        Math.round((18 + rand() * 14) * (1 + liveJitter(liveSeed, region, dayOffset, "inference")) * 100) / 100;
      const infrastructureCostUsd =
        Math.round(
          (90 + rand() * 60) * loadFactor * (1 + liveJitter(liveSeed, region, dayOffset, "infra")) * 100
        ) / 100;

      const stressed = rand() > 0.82;
      const slaViolationMinutes = Math.max(
        0,
        Math.round(
          (stressed ? 4 + rand() * 22 : rand() * 3) *
            (1 + liveJitter(liveSeed, region, dayOffset, "sla"))
        )
      );
      const overloadEvents = stressed ? Math.round(1 + rand() * 2) : rand() > 0.7 ? 1 : 0;
      const underutilizationEvents = rand() > 0.6 ? Math.round(rand() * 3) : 0;
      const scalingOscillations = rand() > 0.75 ? Math.round(rand() * 4) : 0;

      metrics.push({
        timestamp: timestamp.toISOString(),
        region,
        instanceHours,
        taskHours,
        modelInferenceCostUsd,
        infrastructureCostUsd,
        slaViolationMinutes,
        overloadEvents,
        underutilizationEvents,
        scalingOscillations,
      });
    }
  }

  return metrics;
}
