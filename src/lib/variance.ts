import {
  DEMAND_DEVIATION_THRESHOLD,
  MIN_DAYS_FOR_VARIANCE,
  PRICE_DEVIATION_THRESHOLD,
  VARIANCE_Z_THRESHOLD,
} from "./gameConfig";

// Pure variance-day detection: no Prisma, no I/O. Given a trailing window of
// prior profits/days (gameService fetches those), decide whether today is a
// statistical outlier and produce a rule-based explanation. Kept separate
// from gameService.ts because this is a distinct concern (statistics + rule
// -based text generation) from the day-simulation/Prisma-persistence flow,
// and keeping it pure makes it directly unit-testable like calculateDemand.

export type VarianceStats = {
  mean: number;
  stddev: number;
  zScore: number | null;
  isVarianceDay: boolean;
};

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeVarianceStats(currentProfit: number, priorProfits: number[]): VarianceStats {
  const mean = average(priorProfits);
  const variance = average(priorProfits.map((p) => (p - mean) ** 2));
  const stddev = Math.sqrt(variance);

  if (priorProfits.length < MIN_DAYS_FOR_VARIANCE) {
    return { mean, stddev, zScore: null, isVarianceDay: false };
  }

  if (stddev === 0) {
    // No variation in the trailing window to compare against -- don't
    // divide by zero, and there's nothing to call "unusual" relative to.
    return { mean, stddev, zScore: 0, isVarianceDay: false };
  }

  const zScore = (currentProfit - mean) / stddev;
  return { mean, stddev, zScore, isVarianceDay: Math.abs(zScore) > VARIANCE_Z_THRESHOLD };
}

function mostFrequent<T>(values: T[]): T | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T = values[0] as T;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

export function generateVarianceExplanation(
  current: {
    price: number;
    weather: string | null;
    soldOut: boolean;
    peopleTurnedAway: number;
    unitsDemanded: number;
  },
  priorDays: { price: number; weather: string | null; unitsDemanded: number }[],
): string[] {
  const bullets: string[] = [];
  const hasPriorDays = priorDays.length > 0;
  const avgPrice = hasPriorDays ? average(priorDays.map((d) => d.price)) : 0;
  const avgDemand = hasPriorDays ? average(priorDays.map((d) => d.unitsDemanded)) : 0;
  const typicalWeather = hasPriorDays ? mostFrequent(priorDays.map((d) => d.weather)) : null;

  if (
    hasPriorDays &&
    avgPrice > 0 &&
    Math.abs(current.price - avgPrice) / avgPrice > PRICE_DEVIATION_THRESHOLD
  ) {
    const direction = current.price > avgPrice ? "higher" : "lower";
    bullets.push(
      `Price ($${current.price.toFixed(2)}) was notably ${direction} than your recent average ($${avgPrice.toFixed(2)}).`,
    );
  }

  if (hasPriorDays && current.weather !== typicalWeather) {
    bullets.push(
      `Weather was '${current.weather ?? "unknown"}', compared to mostly '${typicalWeather ?? "unknown"}' recently.`,
    );
  }

  if (current.soldOut && current.peopleTurnedAway > 0) {
    bullets.push(
      `You sold out and turned away ${current.peopleTurnedAway} customers -- demand exceeded available inventory.`,
    );
  }

  if (
    hasPriorDays &&
    avgDemand > 0 &&
    Math.abs(current.unitsDemanded - avgDemand) / avgDemand > DEMAND_DEVIATION_THRESHOLD
  ) {
    const direction = current.unitsDemanded > avgDemand ? "higher" : "lower";
    bullets.push(
      `Demand (${current.unitsDemanded}) was much ${direction} than your recent average (${avgDemand.toFixed(0)}).`,
    );
  }

  if (bullets.length === 0) {
    bullets.push(
      "No single factor stands out -- likely a combination of smaller effects or normal day-to-day variation.",
    );
  }

  return bullets;
}
