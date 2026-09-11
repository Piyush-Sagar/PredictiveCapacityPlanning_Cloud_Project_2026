import type { ForecastPoint, ForecastSeries, Horizon, ModelName, Region } from "@/lib/types";
import { FOUNDATION_MODEL_LIST, MOCK_NOW, REGION_BASE_LOAD } from "./constants";
import { gaussian, seededRandom } from "./rng";

const INTERVAL_MINUTES = 5;
const HISTORY_MINUTES = 360; // 6h of trailing history
const LIVE_JITTER_AMPLITUDE = 0.015;

/** Smooth daily traffic curve: overnight trough, midday plateau, evening peak. */
function diurnalMultiplier(minutesSinceMidnight: number): number {
  const angle = (minutesSinceMidnight / 1440) * 2 * Math.PI;
  return 1 + 0.42 * Math.sin(angle - 1.9) + 0.14 * Math.sin(2 * angle - 0.4);
}

function primaryModelFor(region: Region, horizonMinutes: Horizon): ModelName {
  const rand = seededRandom("forecast-model", region, horizonMinutes);
  const index = Math.floor(rand() * FOUNDATION_MODEL_LIST.length);
  return FOUNDATION_MODEL_LIST[index];
}

/**
 * Small per-point wobble layered on top of the stable base curve, reseeded each
 * `liveSeed` (typically a 1s tick counter) so charts visibly breathe like a live
 * feed without reshuffling the underlying trend/spike shape every render.
 */
function livePointJitter(liveSeed: number, region: Region, horizonMinutes: Horizon, pointIndex: number): number {
  if (!liveSeed) return 0;
  const rand = seededRandom("live-jitter", region, horizonMinutes, pointIndex, liveSeed);
  return gaussian(rand, 0, LIVE_JITTER_AMPLITUDE);
}

export function generateForecastSeries(
  region: Region,
  horizonMinutes: Horizon,
  liveSeed = 0
): ForecastSeries {
  const rand = seededRandom("forecast-series", region, horizonMinutes);
  const modelUsed = primaryModelFor(region, horizonMinutes);
  const baseLoad = REGION_BASE_LOAD[region];

  const totalMinutes = HISTORY_MINUTES + horizonMinutes;
  const stepCount = Math.floor(totalMinutes / INTERVAL_MINUTES) + 1;
  const startTime = new Date(MOCK_NOW.getTime() - HISTORY_MINUTES * 60_000);
  const nowIndex = Math.floor(HISTORY_MINUTES / INTERVAL_MINUTES);

  // A couple of seeded "flash crowd" events anchored to fixed steps in the window.
  const spikeStep = Math.floor(rand() * (stepCount - 10)) + 5;
  const spikeWidth = 4 + Math.floor(rand() * 4);

  let noiseWalk = 0;
  const points: ForecastPoint[] = [];

  for (let i = 0; i < stepCount; i++) {
    const timestamp = new Date(startTime.getTime() + i * INTERVAL_MINUTES * 60_000);
    const minutesSinceMidnight = timestamp.getUTCHours() * 60 + timestamp.getUTCMinutes();
    const diurnal = diurnalMultiplier(minutesSinceMidnight);

    noiseWalk = noiseWalk * 0.85 + gaussian(rand, 0, 0.015);
    const spikeDistance = Math.abs(i - spikeStep);
    const spike = spikeDistance < spikeWidth ? (1 - spikeDistance / spikeWidth) * 0.55 : 0;

    const jitter = livePointJitter(liveSeed, region, horizonMinutes, i);
    const centralValue = baseLoad * diurnal * (1 + noiseWalk + spike + jitter);
    const isForecast = i > nowIndex;
    const leadSteps = Math.max(0, i - nowIndex);
    const leadFraction = horizonMinutes > 0 ? (leadSteps * INTERVAL_MINUTES) / horizonMinutes : 0;

    const p50 = Math.max(1, centralValue);
    const spread = 0.06 + 0.32 * leadFraction;
    const p90 = p50 * (1 + spread);

    const actual = isForecast
      ? undefined
      : Math.max(1, p50 * (1 + gaussian(rand, 0, 0.02)));

    points.push({
      timestamp: timestamp.toISOString(),
      region,
      horizonMinutes,
      actual,
      p50: Math.round(p50 * 10) / 10,
      p90: Math.round(p90 * 10) / 10,
      modelUsed,
      isForecast,
    });
  }

  return {
    region,
    horizonMinutes,
    generatedAt: MOCK_NOW.toISOString(),
    nowIndex,
    points,
  };
}

export function generateAllForecastSeries(
  regions: Region[],
  horizonMinutes: Horizon,
  liveSeed = 0
): ForecastSeries[] {
  return regions.map((region) => generateForecastSeries(region, horizonMinutes, liveSeed));
}
