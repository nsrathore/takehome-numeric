import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@prisma/client";
import { prismaMock } from "@/test/prisma-mock";
import { RECIPE } from "@/lib/gameConfig";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Import AFTER the mock is registered.
const {
  buyInventory,
  calculateDemand,
  costPerCup,
  getGameHistory,
  getOrCreateGame,
  isBankrupt,
  maxSellableByInventory,
  setPriceAndSimulateDay,
  suggestPrice,
} = await import("./gameService");

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    id: "game-1",
    cash: 20,
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("calculateDemand (pure)", () => {
  it("returns the exact value for a fixed randomFactor", () => {
    // priceMultiplier = 1 (price == BASE_PRICE), weatherMultiplier = 1.2 (sunny)
    // demand = round(100 * 1 * 1.2 * 0.5) = 60
    const demand = calculateDemand({ price: 0.5, weather: "sunny", dayNumber: 1 }, 0.5);
    expect(demand).toBe(60);
  });

  it("increases demand when price drops below BASE_PRICE", () => {
    const base = calculateDemand({ price: 0.5, dayNumber: 1 }, 1);
    const cheaper = calculateDemand({ price: 0.25, dayNumber: 1 }, 1);
    expect(cheaper).toBeGreaterThan(base);
  });

  it("decreases demand when price rises above BASE_PRICE", () => {
    const base = calculateDemand({ price: 0.5, dayNumber: 1 }, 1);
    const pricier = calculateDemand({ price: 0.75, dayNumber: 1 }, 1);
    expect(pricier).toBeLessThan(base);
  });

  it("clamps the price multiplier at 0 instead of going negative", () => {
    const demand = calculateDemand({ price: 2.5, dayNumber: 1 }, 1);
    expect(demand).toBe(0);
  });

  // Regression test: PRICE_ELASTICITY=1.2 combined with BASE_PRICE=0.5
  // clamped demand to exactly 0 for any price >= ~$0.92 -- i.e. for nearly
  // every "reasonable" price a player would actually try (e.g. $1). The
  // directional tests above never caught this because they only ever price
  // at or below BASE_PRICE. Assert an *absolute* positive value at a
  // realistic above-base price so a similarly degenerate constant change
  // can't silently pass again.
  it("still produces positive demand at a realistic price above BASE_PRICE (e.g. $1/cup)", () => {
    const demand = calculateDemand({ price: 1, dayNumber: 1 }, 1);
    expect(demand).toBeGreaterThan(0);
    expect(demand).toBe(50);
  });
});

describe("maxSellableByInventory (pure)", () => {
  it("is limited by the scarcest ingredient", () => {
    const max = maxSellableByInventory(
      { iceStock: 10, cupsStock: 3, lemonsStock: 10, sugarStock: 10 },
      RECIPE,
    );
    expect(max).toBe(3);
  });
});

describe("costPerCup (pure)", () => {
  it("sums each ingredient's per-cup recipe amount times its running average cost", () => {
    // RECIPE: 1 ice + 1 lemon + 0.5 sugar + 1 cup per cup.
    const cost = costPerCup({
      avgIceCost: 0.1,
      avgLemonCost: 0.2,
      avgSugarCost: 0.05,
      avgCupCost: 0.05,
    });
    // 1*0.10 + 1*0.20 + 0.5*0.05 + 1*0.05 = 0.375
    expect(cost).toBeCloseTo(0.375);
  });
});

describe("isBankrupt (pure)", () => {
  it("triggers only when cash is exhausted AND inventory can't make another cup", () => {
    expect(isBankrupt(-1, 0)).toBe(true);
    expect(isBankrupt(0, 0)).toBe(true);
  });

  it("does not trigger on low cash alone if inventory remains", () => {
    expect(isBankrupt(-5, 3)).toBe(false);
  });

  it("does not trigger on empty inventory alone if cash remains", () => {
    expect(isBankrupt(10, 0)).toBe(false);
  });
});

describe("getOrCreateGame", () => {
  it("creates a new game with starting cash when none exists", async () => {
    prismaMock.gameState.findFirst.mockResolvedValue(null);
    prismaMock.gameState.create.mockResolvedValue(makeGame());

    const game = await getOrCreateGame();

    expect(prismaMock.gameState.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ cash: 20, currentDay: 1 }),
    });
    expect(game.cash).toBe(20);
  });

  it("resets the existing row when the current game is over", async () => {
    const stale = makeGame({ isGameOver: true, isBankrupt: true, cash: -3 });
    prismaMock.gameState.findFirst.mockResolvedValue(stale);
    prismaMock.gameState.update.mockResolvedValue(makeGame());

    await getOrCreateGame();

    expect(prismaMock.gameState.update).toHaveBeenCalledWith({
      where: { id: stale.id },
      data: expect.objectContaining({ cash: 20, isGameOver: false, isBankrupt: false }),
    });
  });
});

describe("buyInventory", () => {
  it("rejects invalid input before hitting the database", async () => {
    await expect(buyInventory([{ ingredient: "ice", quantity: -1 }])).rejects.toThrow();
    expect(prismaMock.gameState.update).not.toHaveBeenCalled();
  });

  it("applies the weighted-average cost basis across two purchases at different prices", async () => {
    // First purchase: 10 lemons at base cost (no bulk discount): 10 * 0.20 = $2, avg = 0.20
    const initial = makeGame({ cash: 100 });
    prismaMock.gameState.findFirst.mockResolvedValueOnce(initial);
    prismaMock.gameState.update.mockResolvedValueOnce(makeGame());

    await buyInventory([{ ingredient: "lemons", quantity: 10 }]);

    const firstUpdateData = prismaMock.gameState.update.mock.calls[0]![0]!.data as Record<
      string,
      number
    >;
    expect(firstUpdateData.lemonsStock).toBe(10);
    expect(firstUpdateData.avgLemonCost).toBeCloseTo(0.2);

    // Second purchase: 10 more lemons, this time with the 20-qty tier NOT hit
    // (still under 20), but at a different quantity to move the average.
    const afterFirst = makeGame({
      cash: firstUpdateData.cash,
      lemonsStock: firstUpdateData.lemonsStock,
      avgLemonCost: firstUpdateData.avgLemonCost,
    });
    prismaMock.gameState.findFirst.mockResolvedValueOnce(afterFirst);
    prismaMock.gameState.update.mockResolvedValueOnce(makeGame());

    await buyInventory([{ ingredient: "lemons", quantity: 30 }]);

    const secondUpdateData = prismaMock.gameState.update.mock.calls[1]![0]!.data as Record<
      string,
      number
    >;
    // 30 lemons hits the 20-qty (10% off) tier: unitCost = 0.18
    // newAvg = (10*0.20 + 30*0.18) / 40 = (2 + 5.4) / 40 = 0.185
    expect(secondUpdateData.lemonsStock).toBe(40);
    expect(secondUpdateData.avgLemonCost).toBeCloseTo(0.185);
  });

  it("errors when cash is insufficient instead of going negative", async () => {
    prismaMock.gameState.findFirst.mockResolvedValue(makeGame({ cash: 1 }));

    await expect(buyInventory([{ ingredient: "lemons", quantity: 100 }])).rejects.toThrow(
      /insufficient cash/i,
    );
    expect(prismaMock.gameState.update).not.toHaveBeenCalled();
  });

  describe("bulk-discount tiers", () => {
    const cases: Array<{ qty: number; expectedUnitCost: number }> = [
      { qty: 19, expectedUnitCost: 0.2 }, // below every tier
      { qty: 20, expectedUnitCost: 0.18 }, // hits the 20-qty / 10% tier
      { qty: 49, expectedUnitCost: 0.18 }, // still in the 20-qty tier
      { qty: 50, expectedUnitCost: 0.16 }, // hits the 50-qty / 20% tier
      { qty: 51, expectedUnitCost: 0.16 }, // still in the 50-qty tier
    ];

    it.each(cases)("qty=$qty -> unitCost=$expectedUnitCost for lemons", async ({ qty, expectedUnitCost }) => {
      prismaMock.gameState.findFirst.mockResolvedValue(makeGame({ cash: 1000 }));
      prismaMock.gameState.update.mockResolvedValue(makeGame());

      await buyInventory([{ ingredient: "lemons", quantity: qty }]);

      const purchaseRecords = prismaMock.purchase.createMany.mock.calls[0]![0]!
        .data as Array<{ unitCost: number }>;
      expect(purchaseRecords[0]!.unitCost).toBeCloseTo(expectedUnitCost);
    });
  });
});

describe("setPriceAndSimulateDay", () => {
  it("rejects an invalid price before hitting the database", async () => {
    await expect(setPriceAndSimulateDay({ price: 0 })).rejects.toThrow();
    expect(prismaMock.day.create).not.toHaveBeenCalled();
  });

  it("caps unitsSold at inventory capacity and marks endedEarly when demand exceeds it", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1); // maximize demand
    const game = makeGame({
      cash: 20,
      iceStock: 3,
      cupsStock: 3,
      lemonsStock: 3,
      sugarStock: 3, // 3 cups worth of sugar at 0.5/cup -> 6 sellable, but capped by others at 3
    });
    prismaMock.gameState.findFirst.mockResolvedValue(game);
    prismaMock.day.create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "d1", ...data })) as unknown as typeof prismaMock.day.create);

    const day = await setPriceAndSimulateDay({ price: 0.5 });

    expect(day.unitsDemanded).toBeGreaterThan(3);
    expect(day.unitsSold).toBe(3);
    expect(day.endedEarly).toBe(true);
    expect(day.peopleTurnedAway).toBe(day.unitsDemanded - 3);
  });

  it("sells exactly unitsDemanded, with no one turned away, when inventory fully covers demand", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const game = makeGame({
      cash: 20,
      iceStock: 1000,
      cupsStock: 1000,
      lemonsStock: 1000,
      sugarStock: 1000,
    });
    prismaMock.gameState.findFirst.mockResolvedValue(game);
    prismaMock.day.create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "d1", ...data })) as unknown as typeof prismaMock.day.create);
    prismaMock.gameState.update.mockResolvedValue(makeGame());

    const day = await setPriceAndSimulateDay({ price: 0.5 });

    expect(day.unitsDemanded).toBeGreaterThan(0); // sanity: this scenario has real demand to satisfy
    expect(day.unitsSold).toBe(day.unitsDemanded);
    expect(day.endedEarly).toBe(false);
    expect(day.peopleTurnedAway).toBe(0);
  });

  // Regression check: the explicit unit-by-unit loop is an architecture
  // change (transparency + future extensibility), not a behavior change --
  // confirm it produces the exact same numbers the old
  // min(demand, maxSellableByInventory) formula would have.
  it("produces the same unitsSold/revenue/cogs/profit as the old min()-based formula", async () => {
    const randomFactor = 0.9;
    vi.spyOn(Math, "random").mockReturnValue(randomFactor);
    const game = makeGame({
      cash: 20,
      iceStock: 7, // the binding constraint
      cupsStock: 10,
      lemonsStock: 10,
      sugarStock: 10,
      avgIceCost: 0.1,
      avgLemonCost: 0.2,
      avgSugarCost: 0.05,
      avgCupCost: 0.05,
    });
    prismaMock.gameState.findFirst.mockResolvedValue(game);
    prismaMock.day.create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "d1", ...data })) as unknown as typeof prismaMock.day.create);
    prismaMock.gameState.update.mockResolvedValue(makeGame());

    const price = 0.5;
    const expectedDemand = calculateDemand({ price, dayNumber: game.currentDay }, randomFactor);
    const oldMaxSellable = maxSellableByInventory(game, RECIPE);
    const oldUnitsSold = Math.min(expectedDemand, oldMaxSellable);
    const oldRevenue = oldUnitsSold * price;
    const oldCogs = oldUnitsSold * costPerCup(game);
    const oldProfit = oldRevenue - oldCogs;

    const day = await setPriceAndSimulateDay({ price });

    expect(oldMaxSellable).toBe(7); // sanity: ice is genuinely the binding constraint here
    expect(day.unitsDemanded).toBe(expectedDemand);
    expect(day.unitsSold).toBe(oldUnitsSold);
    expect(day.revenue).toBeCloseTo(oldRevenue);
    expect(day.cogs).toBeCloseTo(oldCogs);
    expect(day.profit).toBeCloseTo(oldProfit);
  });

  it("melts ice to 0 after the day while other ingredients carry forward what's left", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01); // minimize demand so stock isn't fully consumed
    const game = makeGame({
      cash: 20,
      iceStock: 100,
      cupsStock: 100,
      lemonsStock: 100,
      sugarStock: 100,
    });
    prismaMock.gameState.findFirst.mockResolvedValue(game);
    prismaMock.day.create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "d1", ...data })) as unknown as typeof prismaMock.day.create);
    prismaMock.gameState.update.mockResolvedValue(makeGame());

    await setPriceAndSimulateDay({ price: 0.5 });

    const updateData = prismaMock.gameState.update.mock.calls[0]![0]!.data as Record<
      string,
      number
    >;
    expect(updateData.iceStock).toBe(0);
    expect(updateData.cupsStock).toBeGreaterThan(0);
    expect(updateData.lemonsStock).toBeGreaterThan(0);
    expect(updateData.sugarStock).toBeGreaterThan(0);
  });

  it("ends the game once cash is gone and there's no inventory left to sell", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // zero demand -> zero sales -> zero profit
    const game = makeGame({ cash: 0, iceStock: 0, cupsStock: 0, lemonsStock: 0, sugarStock: 0 });
    prismaMock.gameState.findFirst.mockResolvedValue(game);
    prismaMock.day.create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "d1", ...data })) as unknown as typeof prismaMock.day.create);
    prismaMock.gameState.update.mockResolvedValue(makeGame());

    await setPriceAndSimulateDay({ price: 0.5 });

    const updateData = prismaMock.gameState.update.mock.calls[0]![0]!.data as Record<
      string,
      boolean
    >;
    expect(updateData.isBankrupt).toBe(true);
    expect(updateData.isGameOver).toBe(true);
  });

  it("increases cash by exactly revenue, not profit (buyInventory already paid for COGS)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const game = makeGame({
      cash: 20,
      iceStock: 50,
      cupsStock: 50,
      lemonsStock: 50,
      sugarStock: 50,
      avgIceCost: 0.1,
      avgLemonCost: 0.2,
      avgSugarCost: 0.05,
      avgCupCost: 0.05,
    });
    prismaMock.gameState.findFirst.mockResolvedValue(game);
    prismaMock.day.create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "d1", ...data })) as unknown as typeof prismaMock.day.create);
    prismaMock.gameState.update.mockResolvedValue(makeGame());

    const day = await setPriceAndSimulateDay({ price: 0.5 });

    expect(day.cogs).toBeGreaterThan(0); // sanity: this scenario actually has COGS to double-count
    expect(day.cashAtEnd).toBeCloseTo(game.cash + day.revenue);
    expect(day.cashAtEnd).not.toBeCloseTo(game.cash + day.profit);

    const updateData = prismaMock.gameState.update.mock.calls[0]![0]!.data as Record<
      string,
      number
    >;
    expect(updateData.cash).toBeCloseTo(game.cash + day.revenue);
  });

  it("across two days, cumulative cash added does not equal cumulative profit when leftover inventory carries COGS", async () => {
    const day1Game = makeGame({
      cash: 100,
      iceStock: 50,
      cupsStock: 50,
      lemonsStock: 50,
      sugarStock: 50,
      avgIceCost: 0.1,
      avgLemonCost: 0.2,
      avgSugarCost: 0.05,
      avgCupCost: 0.05,
      currentDay: 1,
    });
    prismaMock.gameState.findFirst.mockResolvedValueOnce(day1Game);
    prismaMock.day.create.mockImplementation((({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "d1", ...data })) as unknown as typeof prismaMock.day.create);
    prismaMock.gameState.update.mockResolvedValueOnce(makeGame());
    // Chain both days' random values on a single spy so consumption order is
    // guaranteed FIFO (one Math.random() call per setPriceAndSimulateDay call).
    const randomSpy = vi.spyOn(Math, "random");
    randomSpy.mockReturnValueOnce(0.05).mockReturnValueOnce(0.08);

    const day1 = await setPriceAndSimulateDay({ price: 0.5 });

    // Leftover cups/lemons/sugar carry forward; ice is replenished for day 2
    // (as if bought off-screen) so day 2 can also sell.
    const day1UpdateData = prismaMock.gameState.update.mock.calls[0]![0]!.data as Record<
      string,
      number
    >;
    const day2Game = makeGame({
      cash: day1UpdateData.cash,
      iceStock: 50,
      cupsStock: day1UpdateData.cupsStock,
      lemonsStock: day1UpdateData.lemonsStock,
      sugarStock: day1UpdateData.sugarStock,
      avgIceCost: 0.1,
      avgLemonCost: 0.2,
      avgSugarCost: 0.05,
      avgCupCost: 0.05,
      currentDay: 2,
    });
    prismaMock.gameState.findFirst.mockResolvedValueOnce(day2Game);
    prismaMock.gameState.update.mockResolvedValueOnce(makeGame());

    const day2 = await setPriceAndSimulateDay({ price: 0.5 });

    // Both days genuinely had leftover inventory and nonzero COGS.
    expect(day1.endedEarly).toBe(false);
    expect(day1.cogs).toBeGreaterThan(0);
    expect(day2.cogs).toBeGreaterThan(0);

    const cumulativeCashAdded = day1.revenue + day2.revenue;
    const cumulativeProfit = day1.profit + day2.profit;
    expect(cumulativeCashAdded).not.toBeCloseTo(cumulativeProfit);
    expect(cumulativeCashAdded).toBeCloseTo(cumulativeProfit + day1.cogs + day2.cogs);
  });
});

describe("suggestPrice (pure)", () => {
  it("returns a local profit optimum: no adjacent grid point beats it", () => {
    const params = {
      weather: "normal" as const,
      dayNumber: 1,
      costPerCup: 0.2,
      maxSellable: 1000,
      priceMin: 0,
      priceMax: 1.5,
      steps: 30,
    };

    const result = suggestPrice(params);

    // Independently recompute the same grid the implementation searches,
    // using the same pure calculateDemand function, and verify nothing
    // beats the returned candidate -- not just its immediate neighbors.
    let bestProfit = -Infinity;
    for (let i = 0; i <= params.steps; i++) {
      const price = params.priceMin + ((params.priceMax - params.priceMin) * i) / params.steps;
      const demand = calculateDemand({ price, weather: params.weather, dayNumber: params.dayNumber }, 1);
      const sales = Math.min(demand, params.maxSellable);
      const profit = sales * (price - params.costPerCup);
      bestProfit = Math.max(bestProfit, profit);
    }

    expect(result.expectedProfit).toBeCloseTo(bestProfit);

    // Explicitly check the immediate neighbors on the actual grid step size.
    const step = (params.priceMax - params.priceMin) / params.steps;
    for (const neighborPrice of [result.suggestedPrice - step, result.suggestedPrice + step]) {
      if (neighborPrice < params.priceMin || neighborPrice > params.priceMax) continue;
      const demand = calculateDemand(
        { price: neighborPrice, weather: params.weather, dayNumber: params.dayNumber },
        1,
      );
      const sales = Math.min(demand, params.maxSellable);
      const neighborProfit = sales * (neighborPrice - params.costPerCup);
      expect(result.expectedProfit).toBeGreaterThanOrEqual(neighborProfit);
    }
  });

  it("prices higher when inventory is the binding constraint than when it's unconstrained", () => {
    const shared = { weather: "normal" as const, dayNumber: 1, costPerCup: 0.2 };

    const unconstrained = suggestPrice({ ...shared, maxSellable: 100_000 });
    const constrained = suggestPrice({ ...shared, maxSellable: 1 });

    expect(constrained.suggestedPrice).toBeGreaterThan(unconstrained.suggestedPrice);
  });
});

describe("getGameHistory", () => {
  it("returns days ordered by dayNumber", async () => {
    prismaMock.day.findMany.mockResolvedValue([]);

    await getGameHistory();

    expect(prismaMock.day.findMany).toHaveBeenCalledWith({ orderBy: { dayNumber: "asc" } });
  });
});
