import { REGIONS } from "./constants";
import { generateCapacityRecommendations } from "./capacity";
import { generateConfidenceSnapshots } from "./confidence";
import { generateAlerts } from "./alerts";
import { generateCostSlaTimeseries } from "./cost-sla";

export { generateForecastSeries, generateAllForecastSeries } from "./forecast";
export { generateCapacityRecommendations } from "./capacity";
export { generateConfidenceSnapshots } from "./confidence";
export { generateAlerts } from "./alerts";
export { generateCostSlaTimeseries } from "./cost-sla";
export { BENCHMARK_RESULTS } from "./benchmark";
export * from "./constants";

/** Convenience bundle for pages/components that need several datasets at once. */
export function getDashboardSnapshot() {
  const capacityRecommendations = generateCapacityRecommendations(REGIONS);
  const confidenceSnapshots = generateConfidenceSnapshots();
  const alerts = generateAlerts(capacityRecommendations, confidenceSnapshots);
  const costSlaMetrics = generateCostSlaTimeseries(REGIONS);

  return { capacityRecommendations, confidenceSnapshots, alerts, costSlaMetrics };
}
