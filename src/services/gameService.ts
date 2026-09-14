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
// 3. Pure, side-effect-free helpers (calculateDemand, calculateMaxSellable,
//    isBankrupt) take their randomness/inputs as explicit arguments so they
//    can be tested deterministically, separate from the Prisma-touching flow.

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

const Ingredient = z.enum(["ice", "cups", "lemons", "sugar"]);
export type Ingredient = z.infer<typeof Ingredient>;

const WeatherSchema = z.enum(["sunny", "normal", "rainy", "hot"]);

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

export async function resetGame() {
  await prisma.day.deleteMany({});
  await prisma.purchase.deleteMany({});
  const existing = await prisma.gameState.findFirst();
  if (existing) {
    return prisma.gameState.update({
      where: { id: existing.id },
      data: defaultGameStateData(),
    });
  }
  return prisma.gameState.create({ data: defaultGameStateData() });
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

/** Pure helper: how many cups current stock can produce. */
export function calculateMaxSellable(stock: {
  iceStock: number;
  cupsStock: number;
  lemonsStock: number;
  sugarStock: number;
}): number {
  return Math.min(
    Math.floor(stock.iceStock / RECIPE.icePerCup),
    Math.floor(stock.cupsStock / RECIPE.cupsPerCup),
    Math.floor(stock.lemonsStock / RECIPE.lemonsPerCup),
    Math.floor(stock.sugarStock / RECIPE.sugarPerCup),
  );
}

/** Pure helper for the literal bankruptcy rule. */
export function isBankrupt(cash: number, maxSellableByInventory: number): boolean {
  return cash <= 0 && maxSellableByInventory < 1;
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

  const maxSellableByInventory = calculateMaxSellable(game);
  const unitsSold = Math.max(0, Math.min(demand, maxSellableByInventory));
  const endedEarly = unitsSold < demand;

  const newCupsStock = game.cupsStock - unitsSold * RECIPE.cupsPerCup;
  const newLemonsStock = game.lemonsStock - unitsSold * RECIPE.lemonsPerCup;
  const newSugarStock = game.sugarStock - unitsSold * RECIPE.sugarPerCup;

  const revenue = unitsSold * price;
  const perCupCost =
    RECIPE.icePerCup * game.avgIceCost +
    RECIPE.lemonsPerCup * game.avgLemonCost +
    RECIPE.sugarPerCup * game.avgSugarCost +
    RECIPE.cupsPerCup * game.avgCupCost;
  const cogs = unitsSold * perCupCost;
  const profit = revenue - cogs;
  const cashAtEnd = game.cash + profit;

  // Ice melts to zero regardless of what's left; everything else carries
  // forward into the next day unchanged.
  const meltedIceStock = 0;

  const maxSellableAfterMelt = calculateMaxSellable({
    iceStock: meltedIceStock,
    cupsStock: newCupsStock,
    lemonsStock: newLemonsStock,
    sugarStock: newSugarStock,
  });
  const bankrupt = isBankrupt(cashAtEnd, maxSellableAfterMelt);

  const day = await prisma.day.create({
    data: {
      dayNumber: game.currentDay,
      price,
      weather: weather ?? null,
      unitsDemanded: demand,
      unitsSold,
      endedEarly,
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

export async function getGameHistory() {
  return prisma.day.findMany({ orderBy: { dayNumber: "asc" } });
}
