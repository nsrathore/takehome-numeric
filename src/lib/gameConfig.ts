// Tunable game constants. Values are arbitrary/illustrative -- the prompt
// explicitly calls this a "volume game" and asks not to over-invest in
// tuning the simulation's numbers, so these are picked for plausibility,
// not balance.

// Cups worth of each ingredient consumed per cup of lemonade sold.
export const RECIPE = {
  lemonsPerCup: 1,
  sugarPerCup: 0.5,
  icePerCup: 1,
  cupsPerCup: 1,
} as const;

export const BASE_INGREDIENT_COST = {
  ice: 0.1,
  cups: 0.05,
  lemons: 0.2,
  sugar: 0.05,
} as const;

export const STARTING_CASH = 20;
export const BASE_PRICE = 0.5;
export const BASE_DEMAND = 100;
// NOTE: calculateDemand's priceMultiplier clamps to 0 once
// price >= BASE_PRICE * (1 + 1/PRICE_ELASTICITY). At the original value of
// 1.2 that threshold was ~$0.92 -- meaning almost every "reasonable-looking"
// price (e.g. $1, $2) a player would naturally try produced exactly zero
// demand. Lowered to widen the live price range to roughly $0-$1.50.
export const PRICE_ELASTICITY = 0.5;

// Day-to-day demand noise, expressed as +/- a fraction of expected demand
// (not a raw 0-1 draw -- see the noiseFactor comment at calculateDemand's
// call site). Arbitrary/tunable per this take-home's own guidance not to
// over-invest in tuning the simulation's numbers.
export const DEMAND_NOISE_RANGE = 0.2;

export const WEATHER_MULTIPLIERS = {
  sunny: 1.2,
  normal: 1.0,
  rainy: 0.5,
  hot: 1.3,
} as const;

export type Weather = keyof typeof WEATHER_MULTIPLIERS;

// Checked in order; the first tier whose minQty is met applies.
export const BULK_DISCOUNT_TIERS = [
  { minQty: 50, discount: 0.2 },
  { minQty: 20, discount: 0.1 },
] as const;

// Variance-day detection thresholds. All arbitrary/tunable, consistent with
// the rest of this file -- these pick a reasonable-looking sensitivity, not
// a statistically validated one.
export const ROLLING_WINDOW_DAYS = 7; // trailing days considered
export const MIN_DAYS_FOR_VARIANCE = 3; // no flagging before this much history exists
export const VARIANCE_Z_THRESHOLD = 1.5; // |z| beyond this = flagged
export const PRICE_DEVIATION_THRESHOLD = 0.15; // 15%, used only in the explanation text
export const DEMAND_DEVIATION_THRESHOLD = 0.25; // 25%, used only in the explanation text
