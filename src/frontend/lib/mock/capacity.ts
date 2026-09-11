import type { CapacityRecommendation, DecisionState, Region, ResourceType } from "@/lib/types";
import {
  DEFAULT_BUDGET_THRESHOLD_USD,
  DEFAULT_COST_PER_UNIT_HOUR_USD,
  DEFAULT_SAFETY_MARGIN_PCT,
  DEFAULT_THROUGHPUT_PER_UNIT,
  MOCK_NOW,
  RESOURCE_TYPES,
} from "./constants";
import { generateForecastSeries } from "./forecast";
import { seededRandom } from "./rng";

const RESOURCE_THROUGHPUT_MULTIPLIER: Record<ResourceType, number> = {
  "ecs-task": 1,
  "ec2-asg": 1.6,
  "origin-capacity": 3.2,
  "transcoding-worker": 0.5,
};

const RESOURCE_COST_MULTIPLIER: Record<ResourceType, number> = {
  "ecs-task": 1,
  "ec2-asg": 1.8,
  "origin-capacity": 2.4,
  "transcoding-worker": 1.3,
};

function decisionStateFor(
  requiredUnits: number,
  currentUnits: number,
  estimatedCostUsd: number,
  budgetThresholdUsd: number
): DecisionState {
  const changeMagnitude = Math.abs(requiredUnits - currentUnits) / Math.max(currentUnits, 1);
  if (estimatedCostUsd > budgetThresholdUsd || changeMagnitude > 0.5) return "approve";
  if (changeMagnitude < 0.15) return "auto-execute";
  return "recommend";
}

function buildRecommendation(
  region: Region,
  resourceType: ResourceType,
  periodSeed = 0
): CapacityRecommendation {
  const rand = seededRandom("capacity", region, resourceType);
  const forecastSeries = generateForecastSeries(region, 15, periodSeed);
  const nextForecastPoint =
    forecastSeries.points[forecastSeries.nowIndex + 1] ?? forecastSeries.points[forecastSeries.nowIndex];
  const forecastP90 = nextForecastPoint.p90;

  const throughputPerUnit = DEFAULT_THROUGHPUT_PER_UNIT * RESOURCE_THROUGHPUT_MULTIPLIER[resourceType];
  const safetyMarginPct = DEFAULT_SAFETY_MARGIN_PCT + (rand() - 0.5) * 0.08;
  const requiredUnits = Math.ceil((forecastP90 / throughputPerUnit) * (1 + safetyMarginPct));

  const currentUnitsDrift = Math.round((rand() - 0.5) * requiredUnits * 0.6);
  const currentUnits = Math.max(1, requiredUnits + currentUnitsDrift);

  const minUnits = Math.max(1, Math.round(requiredUnits * 0.3));
  const maxUnits = Math.round(requiredUnits * 2.2) + 4;

  const costPerUnitHour = DEFAULT_COST_PER_UNIT_HOUR_USD * RESOURCE_COST_MULTIPLIER[resourceType];
  const estimatedCostUsd = Math.round(requiredUnits * costPerUnitHour * 24 * 100) / 100;
  const budgetThresholdUsd = Math.round(
    DEFAULT_BUDGET_THRESHOLD_USD * RESOURCE_COST_MULTIPLIER[resourceType]
  );

  const decisionState = decisionStateFor(requiredUnits, currentUnits, estimatedCostUsd, budgetThresholdUsd);

  return {
    id: `${region}-${resourceType}`,
    region,
    resourceType,
    timestamp: MOCK_NOW.toISOString(),
    forecastP90,
    throughputPerUnit,
    safetyMarginPct: Math.round(safetyMarginPct * 1000) / 1000,
    requiredUnits,
    currentUnits,
    minUnits,
    maxUnits,
    hysteresisActive: rand() > 0.6,
    cooldownRemainingSec: Math.round(rand() * 600),
    budgetThresholdUsd,
    estimatedCostUsd,
    decisionState,
  };
}

export function generateCapacityRecommendations(
  regions: Region[],
  periodSeed = 0
): CapacityRecommendation[] {
  const recommendations: CapacityRecommendation[] = [];
  for (const region of regions) {
    for (const resourceType of RESOURCE_TYPES) {
      recommendations.push(buildRecommendation(region, resourceType, periodSeed));
    }
  }
  return recommendations;
}
