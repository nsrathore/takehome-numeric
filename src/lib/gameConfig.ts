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
export const PRICE_ELASTICITY = 1.2;

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
