import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  BASE_DEMAND,
  BASE_INGREDIENT_COST,
  BASE_PRICE,
  BULK_DISCOUNT_TIERS,
  PRICE_ELASTICITY,
  RECIPE,
  STARTING_CASH,
  WEATHER_MULTIPLIERS,
  type Weather,
} from "@/lib/gameConfig";

// Reference service for this app's layering convention:
// 1. Zod schemas validate input at the top of each function.
// 2. Plain async functions hold the business logic (framework-agnostic,
//    unit-tested here without HTTP mocking).
// 3. Pure, side-effect-free helpers (calculateDemand, maxSellableByInventory,
//    canMakeOneMoreCup, costPerCup, isBankrupt, suggestPrice) take their
//    randomness/inputs as explicit arguments so they can be tested
//    deterministically, separate from the Prisma-touching flow.

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

const Ingredient = z.enum(["ice", "cups", "lemons", "sugar"]);
export type Ingredient = z.infer<typeof Ingredient>;

export const WeatherSchema = z.enum(["sunny", "normal", "rainy", "hot"]);

const STOCK_FIELD = {
  ice: "iceStock",
  cups: "cupsStock",
  lemons: "lemonsStock",
  sugar: "sugarStock",
} as const;

const AVG_COST_FIELD = {
  ice: "avgIceCost",
  cups: "avgCupCost",
  lemons: "avgLemonCost",
  sugar: "avgSugarCost",
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function defaultGameStateData() {
  return {
    cash: STARTING_CASH,
    currentDay: 1,
    iceStock: 0,
    lemonsStock: 0,
    sugarStock: 0,
    cupsStock: 0,
    avgIceCost: 0,
    avgLemonCost: 0,
    avgSugarCost: 0,
    avgCupCost: 0,
    isGameOver: false,
    isBankrupt: false,
  };
}

export async function getOrCreateGame() {
  const existing = await prisma.gameState.findFirst();
  if (!existing) {
    return prisma.gameState.create({ data: defaultGameStateData() });
  }
  if (existing.isGameOver) {
    return prisma.gameState.update({
      where: { id: existing.id },
      data: defaultGameStateData(),
    });
  }
  return existing;
}

/**
 * Full wipe: deletes every Purchase, Day, and GameState row. This is a full
 * wipe rather than a scoped delete because Day/Purchase have no `gameId`
 * foreign key back to a specific GameState -- the current design assumes
 * exactly one active game at a time, so there's nothing to scope the delete
 * to. Scoping this to a single game's data would require adding that FK
 * (see NOTES.md).
 *
 * Callers that want a freshly playable game afterward (e.g. "start a new
 * game") should call `getOrCreateGame()` next; callers that just want to
 * end the game (e.g. "exit") can leave it wiped.
 */
export async function resetGame() {
  await prisma.purchase.deleteMany({});
  await prisma.day.deleteMany({});
  await prisma.gameState.deleteMany({});
}

/**
 * Pure demand function. `randomFactor` is a caller-supplied number (call
 * sites pass `Math.random()`) rather than generated internally, so this is
 * deterministically unit-testable.
 */
export function calculateDemand(
  input: { price: number; weather?: Weather; dayNumber: number },
  randomFactor: number,
): number {
  const weatherMultiplier = WEATHER_MULTIPLIERS[input.weather ?? "normal"];
  const priceMultiplier = clamp(
    1 - ((input.price - BASE_PRICE) / BASE_PRICE) * PRICE_ELASTICITY,
    0,
    2,
  );
  return Math.round(BASE_DEMAND * priceMultiplier * weatherMultiplier * randomFactor);
}

type Recipe = {
  icePerCup: number;
  cupsPerCup: number;
  lemonsPerCup: number;
  sugarPerCup: number;
};

/** Pure helper: how many cups the current inventory can produce. */
export function maxSellableByInventory(
  inventory: { iceStock: number; cupsStock: number; lemonsStock: number; sugarStock: number },
  recipe: Recipe,
): number {
  return Math.min(
    Math.floor(inventory.iceStock / recipe.icePerCup),
    Math.floor(inventory.cupsStock / recipe.cupsPerCup),
    Math.floor(inventory.lemonsStock / recipe.lemonsPerCup),
    Math.floor(inventory.sugarStock / recipe.sugarPerCup),
  );
}

/** Pure helper: blended per-cup ingredient cost at current running averages. */
export function costPerCup(game: {
  avgIceCost: number;
  avgLemonCost: number;
  avgSugarCost: number;
  avgCupCost: number;
}): number {
  return (
    RECIPE.icePerCup * game.avgIceCost +
    RECIPE.lemonsPerCup * game.avgLemonCost +
    RECIPE.sugarPerCup * game.avgSugarCost +
    RECIPE.cupsPerCup * game.avgCupCost
  );
}

/** Pure helper for the literal bankruptcy rule. */
export function isBankrupt(cash: number, maxSellableByInventory: number): boolean {
  return cash <= 0 && maxSellableByInventory < 1;
}

type Inventory = { iceStock: number; cupsStock: number; lemonsStock: number; sugarStock: number };

/** Pure helper: does inventory have at least one full recipe's worth left? */
export function canMakeOneMoreCup(inventory: Inventory): boolean {
  return (
    inventory.iceStock >= RECIPE.icePerCup &&
    inventory.cupsStock >= RECIPE.cupsPerCup &&
    inventory.lemonsStock >= RECIPE.lemonsPerCup &&
    inventory.sugarStock >= RECIPE.sugarPerCup
  );
}

function unitCostForQuantity(ingredient: Ingredient, quantity: number): number {
  const tier = BULK_DISCOUNT_TIERS.find((t) => quantity >= t.minQty);
  const discount = tier?.discount ?? 0;
  return BASE_INGREDIENT_COST[ingredient] * (1 - discount);
}

const BuyInventoryInput = z
  .array(
    z.object({
      ingredient: Ingredient,
      quantity: z.number().positive(),
    }),
  )
  .min(1, "at least one purchase line is required");
export type BuyInventoryInput = z.infer<typeof BuyInventoryInput>;

export async function buyInventory(purchases: BuyInventoryInput) {
  const input = BuyInventoryInput.parse(purchases);
  const game = await getOrCreateGame();
  if (game.isGameOver) {
    throw new GameError("Game is over — start a new game before buying inventory.");
  }

  const state = {
    cash: game.cash,
    iceStock: game.iceStock,
    cupsStock: game.cupsStock,
    lemonsStock: game.lemonsStock,
    sugarStock: game.sugarStock,
    avgIceCost: game.avgIceCost,
    avgCupCost: game.avgCupCost,
    avgLemonCost: game.avgLemonCost,
    avgSugarCost: game.avgSugarCost,
  };

  const purchaseRecords = input.map(({ ingredient, quantity }) => {
    const unitCost = unitCostForQuantity(ingredient, quantity);
    const totalCost = quantity * unitCost;

    if (totalCost > state.cash) {
      throw new GameError(
        `Insufficient cash to buy ${quantity} ${ingredient} (need $${totalCost.toFixed(2)}, have $${state.cash.toFixed(2)}).`,
      );
    }
    state.cash -= totalCost;

    const stockKey = STOCK_FIELD[ingredient];
    const avgKey = AVG_COST_FIELD[ingredient];
    const existingQty = state[stockKey];
    const existingAvg = state[avgKey];
    const newQty = existingQty + quantity;
    const newAvg = newQty === 0 ? existingAvg : (existingQty * existingAvg + quantity * unitCost) / newQty;

    state[stockKey] = newQty;
    state[avgKey] = newAvg;

    return {
      dayNumber: game.currentDay,
      ingredient,
      quantity,
      unitCost,
      totalCost,
    };
  });

  await prisma.gameState.update({
    where: { id: game.id },
    data: {
      cash: state.cash,
      iceStock: state.iceStock,
      cupsStock: Math.round(state.cupsStock),
      lemonsStock: state.lemonsStock,
      sugarStock: state.sugarStock,
      avgIceCost: state.avgIceCost,
      avgCupCost: state.avgCupCost,
      avgLemonCost: state.avgLemonCost,
      avgSugarCost: state.avgSugarCost,
    },
  });

  await prisma.purchase.createMany({ data: purchaseRecords });

  return getOrCreateGame();
}

const SetPriceAndSimulateDayInput = z.object({
  price: z.number().positive(),
  weather: WeatherSchema.optional(),
});
export type SetPriceAndSimulateDayInput = z.infer<typeof SetPriceAndSimulateDayInput>;

export async function setPriceAndSimulateDay(input: SetPriceAndSimulateDayInput) {
  const { price, weather } = SetPriceAndSimulateDayInput.parse(input);
  const game = await getOrCreateGame();
  if (game.isGameOver) {
    throw new GameError("Game is over — start a new game before playing another day.");
  }

  const demand = calculateDemand({ price, weather, dayNumber: game.currentDay }, Math.random());

  // Serve customers one at a time rather than computing unitsSold in closed
  // form (min(demand, maxSellableByInventory)) -- mathematically equivalent
  // for now, but this explicit loop is what makes future per-customer
  // variation (different order sizes, walk-away behavior, etc.) a small
  // change instead of a rewrite.
  let inventory: Inventory = {
    iceStock: game.iceStock,
    cupsStock: game.cupsStock,
    lemonsStock: game.lemonsStock,
    sugarStock: game.sugarStock,
  };
  let peopleServed = 0;
  for (let i = 0; i < demand; i++) {
    if (!canMakeOneMoreCup(inventory)) break; // sold out
    inventory = {
      iceStock: inventory.iceStock - RECIPE.icePerCup,
      cupsStock: inventory.cupsStock - RECIPE.cupsPerCup,
      lemonsStock: inventory.lemonsStock - RECIPE.lemonsPerCup,
      sugarStock: inventory.sugarStock - RECIPE.sugarPerCup,
    };
    peopleServed++;
  }
  const unitsSold = peopleServed;
  const soldOut = peopleServed < demand; // stored on Day.endedEarly (no separate field for the same thing)
  const peopleTurnedAway = demand - peopleServed;

  const newCupsStock = inventory.cupsStock;
  const newLemonsStock = inventory.lemonsStock;
  const newSugarStock = inventory.sugarStock;

  const revenue = unitsSold * price;
  const cogs = unitsSold * costPerCup(game);
  const profit = revenue - cogs;
  // Cash only tracks revenue here, not profit: buyInventory already deducted
  // the full ingredient cost from cash at purchase time, so subtracting cogs
  // again here would double-count it. `profit` is still stored on the Day
  // record below as a reporting metric — it just doesn't drive the balance.
  const cashAtEnd = game.cash + revenue;

  // Ice melts to zero regardless of what's left; everything else carries
  // forward into the next day unchanged.
  const meltedIceStock = 0;

  const maxSellableAfterMelt = maxSellableByInventory(
    {
      iceStock: meltedIceStock,
      cupsStock: newCupsStock,
      lemonsStock: newLemonsStock,
      sugarStock: newSugarStock,
    },
    RECIPE,
  );
  const bankrupt = isBankrupt(cashAtEnd, maxSellableAfterMelt);

  const day = await prisma.day.create({
    data: {
      dayNumber: game.currentDay,
      price,
      weather: weather ?? null,
      unitsDemanded: demand,
      unitsSold,
      endedEarly: soldOut,
      peopleTurnedAway,
      revenue,
      cogs,
      profit,
      cashAtStart: game.cash,
      cashAtEnd,
    },
  });

  await prisma.gameState.update({
    where: { id: game.id },
    data: {
      cash: cashAtEnd,
      iceStock: meltedIceStock,
      cupsStock: Math.round(newCupsStock),
      lemonsStock: newLemonsStock,
      sugarStock: newSugarStock,
      currentDay: bankrupt ? game.currentDay : game.currentDay + 1,
      isBankrupt: bankrupt,
      isGameOver: bankrupt,
    },
  });

  return day;
}

export type PriceSuggestion = {
  suggestedPrice: number;
  expectedDemand: number;
  expectedSales: number;
  expectedRevenue: number;
  expectedProfit: number;
};

/**
 * Pure grid search over candidate prices for the one that maximizes
 * expected profit, given a known cost-per-cup and inventory ceiling.
 * `randomFactor: 1` is used for every candidate (not `Math.random()`) since
 * this estimates an *expected* outcome, not a simulated one -- keeping it
 * pure/deterministic like `calculateDemand` itself.
 */
export function suggestPrice({
  weather,
  dayNumber,
  costPerCup,
  maxSellable,
  priceMin = 0,
  priceMax = BASE_PRICE * 3,
  steps = 60,
}: {
  weather?: Weather;
  dayNumber: number;
  costPerCup: number;
  maxSellable: number;
  priceMin?: number;
  priceMax?: number;
  steps?: number;
}): PriceSuggestion {
  let best: PriceSuggestion | undefined;

  for (let i = 0; i <= steps; i++) {
    const price = priceMin + ((priceMax - priceMin) * i) / steps;
    const expectedDemand = calculateDemand({ price, weather, dayNumber }, 1);
    const expectedSales = Math.min(expectedDemand, maxSellable);
    const expectedRevenue = expectedSales * price;
    const expectedProfit = expectedSales * (price - costPerCup);

    if (!best || expectedProfit > best.expectedProfit) {
      best = { suggestedPrice: price, expectedDemand, expectedSales, expectedRevenue, expectedProfit };
    }
  }

  // Unreachable in practice: the loop always runs at least once (i=0).
  if (!best) {
    throw new GameError("Unable to compute a price suggestion.");
  }
  return best;
}

export async function getGameHistory() {
  return prisma.day.findMany({ orderBy: { dayNumber: "asc" } });
}
