import { describe, expect, it } from "vitest";
import { computeVarianceStats, generateVarianceExplanation } from "./variance";

describe("computeVarianceStats", () => {
  it("does not flag anything before MIN_DAYS_FOR_VARIANCE prior days exist", () => {
    const stats = computeVarianceStats(50, [5, 5]); // only 2 prior days (< 3)
    expect(stats.zScore).toBeNull();
    expect(stats.isVarianceDay).toBe(false);
  });

  it("does not divide by zero when all prior profits are identical", () => {
    const stats = computeVarianceStats(5, [5, 5, 5, 5]);
    expect(stats.stddev).toBe(0);
    expect(stats.zScore).toBe(0);
    expect(stats.isVarianceDay).toBe(false);
    expect(Number.isNaN(stats.zScore)).toBe(false);
  });

  it("flags a clear outlier with a positive z-score above the threshold", () => {
    // Prior profits clustered near $5, today is $50 -- an unambiguous outlier.
    const stats = computeVarianceStats(50, [4, 5, 6, 5, 4, 6, 5]);
    expect(stats.isVarianceDay).toBe(true);
    expect(stats.zScore).not.toBeNull();
    expect(stats.zScore!).toBeGreaterThan(1.5);
  });

  it("does not flag a day within the normal range of recent variation", () => {
    // Today's profit is close to the trailing mean -- well within threshold.
    const stats = computeVarianceStats(5.2, [4, 5, 6, 5, 4, 6, 5]);
    expect(stats.isVarianceDay).toBe(false);
  });
});

describe("generateVarianceExplanation", () => {
  const priorDays = [
    { price: 0.5, weather: "sunny", unitsDemanded: 100 },
    { price: 0.5, weather: "sunny", unitsDemanded: 105 },
    { price: 0.5, weather: "sunny", unitsDemanded: 95 },
  ];

  it("includes a price-related bullet when price notably deviates from the rolling average", () => {
    const bullets = generateVarianceExplanation(
      { price: 1.0, weather: "sunny", soldOut: false, peopleTurnedAway: 0, unitsDemanded: 100 },
      priorDays,
    );
    expect(bullets.some((b) => b.toLowerCase().includes("price"))).toBe(true);
  });

  it("includes a weather-related bullet when weather differs from the typical value", () => {
    const bullets = generateVarianceExplanation(
      { price: 0.5, weather: "rainy", soldOut: false, peopleTurnedAway: 0, unitsDemanded: 100 },
      priorDays,
    );
    expect(bullets.some((b) => b.toLowerCase().includes("weather"))).toBe(true);
  });

  it("includes a turned-away bullet when sold out with people turned away", () => {
    const bullets = generateVarianceExplanation(
      { price: 0.5, weather: "sunny", soldOut: true, peopleTurnedAway: 12, unitsDemanded: 100 },
      priorDays,
    );
    expect(bullets.some((b) => b.toLowerCase().includes("turned away"))).toBe(true);
  });

  it("includes a demand-related bullet when demand notably deviates from the rolling average", () => {
    const bullets = generateVarianceExplanation(
      { price: 0.5, weather: "sunny", soldOut: false, peopleTurnedAway: 0, unitsDemanded: 200 },
      priorDays,
    );
    expect(bullets.some((b) => b.toLowerCase().includes("demand"))).toBe(true);
  });

  it("returns exactly the fallback bullet when no rule triggers", () => {
    const bullets = generateVarianceExplanation(
      { price: 0.5, weather: "sunny", soldOut: false, peopleTurnedAway: 0, unitsDemanded: 100 },
      priorDays,
    );
    expect(bullets).toHaveLength(1);
    expect(bullets[0]).toMatch(/no single factor stands out/i);
  });
});
