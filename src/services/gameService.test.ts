import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameState } from "@prisma/client";
import { prismaMock } from "@/test/prisma-mock";

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Import AFTER the mock is registered.
const {
  buyInventory,
  calculateDemand,
  calculateMaxSellable,
  getGameHistory,
  getOrCreateGame,
  isBankrupt,
  setPriceAndSimulateDay,
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
});

describe("calculateMaxSellable (pure)", () => {
  it("is limited by the scarcest ingredient", () => {
    const max = calculateMaxSellable({
      iceStock: 10,
      cupsStock: 3,
      lemonsStock: 10,
      sugarStock: 10,
    });
    expect(max).toBe(3);
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
});

describe("getGameHistory", () => {
  it("returns days ordered by dayNumber", async () => {
    prismaMock.day.findMany.mockResolvedValue([]);

    await getGameHistory();

    expect(prismaMock.day.findMany).toHaveBeenCalledWith({ orderBy: { dayNumber: "asc" } });
  });
});
