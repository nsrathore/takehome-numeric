"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BASE_DEMAND,
  BASE_INGREDIENT_COST,
  BASE_PRICE,
  BULK_DISCOUNT_TIERS,
  PRICE_ELASTICITY,
  RECIPE,
  WEATHER_MULTIPLIERS,
} from "@/lib/gameConfig";

type GameState = {
  id: string;
  cash: number;
  currentDay: number;
  iceStock: number;
  lemonsStock: number;
  sugarStock: number;
  cupsStock: number;
  isGameOver: boolean;
  isBankrupt: boolean;
};

type Day = {
  id: string;
  dayNumber: number;
  price: number;
  weather: string | null;
  unitsDemanded: number;
  unitsSold: number;
  endedEarly: boolean;
  peopleTurnedAway: number;
  revenue: number;
  cogs: number;
  profit: number;
  cashAtStart: number;
  cashAtEnd: number;
};

type Suggestion = {
  suggestedPrice: number;
  expectedDemand: number;
  expectedSales: number;
  expectedRevenue: number;
  expectedProfit: number;
};

const INGREDIENTS = ["ice", "cups", "lemons", "sugar"] as const;
const WEATHERS = ["normal", "sunny", "rainy", "hot"] as const;

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

type HistoryDotProps = { cx?: number; cy?: number; payload?: Day };

// Renders a small red square on sold-out days instead of the normal dot, so
// they're visible at a glance without a separate legend entry.
function CashHistoryDot({ cx, cy, payload }: HistoryDotProps) {
  if (cx === undefined || cy === undefined || !payload) return null;
  if (payload.endedEarly) {
    return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill="#dc2626" stroke="#7f1d1d" />;
  }
  return <circle cx={cx} cy={cy} r={3} fill="#0f172a" />;
}

// Cash can't go negative (buyInventory already blocks over-spending), so
// only the profit line's dot needs loss-aware coloring.
function ProfitHistoryDot({ cx, cy, payload }: HistoryDotProps) {
  if (cx === undefined || cy === undefined || !payload) return null;
  if (payload.profit < 0) {
    return <circle cx={cx} cy={cy} r={4} fill="#dc2626" stroke="#7f1d1d" />;
  }
  return <circle cx={cx} cy={cy} r={3} fill="#059669" />;
}

// Explicit numeric Y domain so losses are actually visible: recharts'
// default domain is [0, 'auto'], which clips negative profit to the bottom
// axis line instead of letting it dip below. Min is driven by profit only
// (the one series that can go negative); max considers both series.
function computeYDomain(history: Day[]): [number, number] {
  const lowestProfit = history.length ? Math.min(...history.map((d) => d.profit)) : 0;
  const highestValue = history.length
    ? Math.max(...history.flatMap((d) => [d.cashAtEnd, d.profit]))
    : 0;
  const min = Math.min(0, lowestProfit);
  const max = Math.max(0, highestValue);
  const padding = (max - min || 1) * 0.1;
  return [min - padding, max + padding];
}

function flavorText(day: Day) {
  if (day.profit < 0) return "Ouch — you lost money today.";
  if (day.endedEarly) return "Sold out! You left demand on the table.";
  if (day.profit === 0) return "Broke even today.";
  if (day.unitsSold === 0) return "Not a single cup sold today.";
  return "Solid day at the stand.";
}

export default function GamePage() {
  const router = useRouter();
  const [game, setGame] = useState<GameState | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({
    ice: "",
    cups: "",
    lemons: "",
    sugar: "",
  });
  const [price, setPrice] = useState("0.5");
  const [weather, setWeather] = useState<(typeof WEATHERS)[number]>("normal");
  const [lastDay, setLastDay] = useState<Day | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [history, setHistory] = useState<Day[]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadGame() {
    setLoading(true);
    const res = await fetch("/api/game");
    const data = await res.json();
    setGame(data.game);
    setLoading(false);
  }

  async function loadHistory() {
    const res = await fetch("/api/game/history");
    const data = await res.json();
    setHistory(data.days ?? []);
  }

  useEffect(() => {
    loadGame();
    loadHistory();
  }, []);

  async function handleBuy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const purchases = INGREDIENTS.filter((i) => Number(quantities[i]) > 0).map((ingredient) => ({
      ingredient,
      quantity: Number(quantities[ingredient]),
    }));
    if (purchases.length === 0) return;

    const res = await fetch("/api/game/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ purchases }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      return;
    }
    setGame(data.game);
    setQuantities({ ice: "", cups: "", lemons: "", sugar: "" });
  }

  async function handleRunDay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/game/day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price: Number(price), weather }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
      return;
    }
    setLastDay(data.day);
    setSuggestion(null);
    await loadGame();
    await loadHistory();
  }

  async function handleSuggestPrice() {
    setError(null);
    setSuggestLoading(true);
    try {
      const res = await fetch(`/api/game/suggest-price?weather=${weather}`);
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : JSON.stringify(data.error));
        return;
      }
      setSuggestion(data.suggestion);
    } finally {
      setSuggestLoading(false);
    }
  }

  async function handleExitConfirmed() {
    await fetch("/api/game", { method: "DELETE" });
    router.push("/");
  }

  async function handleNewGame() {
    setError(null);
    setLastDay(null);
    setSuggestion(null);
    const res = await fetch("/api/game", { method: "POST" });
    const data = await res.json();
    setGame(data.game);
    await loadHistory();
  }

  if (loading || !game) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-slate-500">Loading…</p>
      </main>
    );
  }

  if (game.isGameOver) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-red-700">
          {game.isBankrupt ? "Bankrupt!" : "Game over"}
        </h1>
        <p className="mt-2 text-slate-600">
          You made it to day {game.currentDay} with {money(game.cash)} and not enough
          inventory left to make another cup.
        </p>
        <button
          onClick={handleNewGame}
          className="mt-6 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700"
        >
          Start a new game
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lemonade Stand</h1>
        <button
          type="button"
          onClick={() => setShowExitConfirm(true)}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
        >
          Exit Game
        </button>
      </div>

      {showExitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
            <p className="text-sm text-slate-700">
              Are you sure you want to Exit this game? Data will be lost.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExitConfirmed}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 rounded-md border border-slate-200 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase text-slate-500">Day</p>
          <p className="text-lg font-medium">{game.currentDay}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Cash</p>
          <p className="text-lg font-medium">{money(game.cash)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Ice</p>
          <p className="text-lg font-medium">{game.iceStock}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Cups</p>
          <p className="text-lg font-medium">{game.cupsStock}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Lemons</p>
          <p className="text-lg font-medium">{game.lemonsStock}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Sugar</p>
          <p className="text-lg font-medium">{game.sugarStock}</p>
        </div>
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <form onSubmit={handleBuy} className="mt-8">
        <h2 className="text-lg font-semibold">Buy inventory</h2>
        <p className="mt-1 text-sm text-slate-500">Ice melts every day — you&apos;ll need more.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {INGREDIENTS.map((ingredient) => (
            <label key={ingredient} className="flex flex-col gap-1 text-sm">
              <span className="capitalize text-slate-600">{ingredient}</span>
              <input
                type="number"
                min="0"
                step="any"
                className="rounded-md border border-slate-300 px-2 py-1"
                value={quantities[ingredient]}
                onChange={(e) =>
                  setQuantities((q) => ({ ...q, [ingredient]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-700"
        >
          Buy
        </button>
      </form>

      <form onSubmit={handleRunDay} className="mt-8">
        <h2 className="text-lg font-semibold">Set price and run the day</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Price per cup ($)</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="rounded-md border border-slate-300 px-2 py-1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600">Weather</span>
            <select
              className="rounded-md border border-slate-300 px-2 py-1"
              value={weather}
              onChange={(e) => setWeather(e.target.value as (typeof WEATHERS)[number])}
            >
              {WEATHERS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm text-white hover:bg-emerald-600"
          >
            Run the day
          </button>
          <button
            type="button"
            onClick={handleSuggestPrice}
            disabled={suggestLoading}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {suggestLoading ? "Thinking…" : "Suggest price"}
          </button>
        </div>

        {suggestion && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
            <p>
              For <span className="capitalize">{weather}</span> weather, the estimated
              profit-maximizing price is{" "}
              <span className="font-semibold">{money(suggestion.suggestedPrice)}</span> — expected
              demand {suggestion.expectedDemand}, sales {suggestion.expectedSales}, revenue{" "}
              {money(suggestion.expectedRevenue)}, profit {money(suggestion.expectedProfit)}.
            </p>
            <button
              type="button"
              onClick={() => setPrice(suggestion.suggestedPrice.toFixed(2))}
              className="mt-2 rounded-md bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700"
            >
              Use this price
            </button>
          </div>
        )}
      </form>

      {lastDay && (
        <section className="mt-8 rounded-md border border-slate-200 p-4">
          <h2 className="text-lg font-semibold">Day {lastDay.dayNumber} results</h2>
          <p className="mt-1 text-sm text-slate-600">{flavorText(lastDay)}</p>
          {lastDay.endedEarly && (
            <p className="mt-1 text-sm text-amber-700">
              Sold out! {lastDay.unitsDemanded} people wanted lemonade, you served{" "}
              {lastDay.unitsSold}, {lastDay.peopleTurnedAway} were turned away.
            </p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Demand</dt>
              <dd>{lastDay.unitsDemanded}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Sold</dt>
              <dd>
                {lastDay.unitsSold}
                {lastDay.endedEarly && " (sold out)"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Revenue</dt>
              <dd>{money(lastDay.revenue)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">COGS</dt>
              <dd>{money(lastDay.cogs)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Profit</dt>
              <dd className={lastDay.profit < 0 ? "text-red-600" : "text-emerald-700"}>
                {money(lastDay.profit)}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <section className="mt-8 rounded-md border border-slate-200 p-4">
        <h2 className="text-lg font-semibold">Game History</h2>
        <p className="mt-1 text-sm text-slate-500">
          Cash and profit by day.{" "}
          <span className="inline-block h-2 w-2 bg-red-600 align-middle" /> marks a sold-out day
          (cash line) or a loss (profit line); the shaded band below $0 is the loss zone.
        </p>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No days played yet.</p>
        ) : (
          (() => {
            const [yMin, yMax] = computeYDomain(history);
            return (
              <div className="mt-3" style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="dayNumber" tick={{ fontSize: 12 }} />
                    <YAxis
                      domain={[yMin, yMax]}
                      width={56}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v: number) => `$${Math.round(v)}`}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        typeof value === "number" ? money(value) : value,
                        name,
                      ]}
                      labelFormatter={(label) => `Day ${label}`}
                    />
                    <Legend />
                    {yMin < 0 && (
                      <ReferenceArea y1={yMin} y2={0} fill="#ef4444" fillOpacity={0.08} />
                    )}
                    <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="cashAtEnd"
                      name="Cash"
                      stroke="#0f172a"
                      dot={<CashHistoryDot />}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="profit"
                      name="Profit"
                      stroke="#059669"
                      dot={<ProfitHistoryDot />}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })()
        )}
      </section>

      <details className="mt-8 rounded-md border border-slate-200 p-4">
        <summary className="cursor-pointer text-lg font-semibold">
          How these numbers are calculated
        </summary>
        <div className="mt-3 space-y-4 text-sm text-slate-700">
          <div>
            <h3 className="font-semibold text-slate-900">Demand</h3>
            <p className="mt-1">
              <code className="text-xs">
                demand = round(BASE_DEMAND × priceMultiplier × weatherMultiplier × random)
              </code>
            </p>
            <p className="mt-1">
              BASE_DEMAND is {BASE_DEMAND} cups/day at the base price of {money(BASE_PRICE)}.
              priceMultiplier drops as price rises above {money(BASE_PRICE)} (elasticity{" "}
              {PRICE_ELASTICITY}) and hits exactly 0 once price reaches{" "}
              {money(BASE_PRICE * (1 + 1 / PRICE_ELASTICITY))} — above that, nobody buys
              regardless of weather. weatherMultiplier is{" "}
              {Object.entries(WEATHER_MULTIPLIERS)
                .map(([w, m]) => `${w} ×${m}`)
                .join(", ")}
              .
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">Cash</h3>
            <p className="mt-1">
              <strong>Cash increases by the full Revenue each day, not Profit.</strong>{" "}
              Ingredient cost is already deducted from cash the moment you buy it (Buy Inventory
              above) — subtracting COGS again when the day resolves would count that cost twice.
              Profit is still calculated and shown for reporting, it just isn&apos;t what moves
              the cash balance.
            </p>
            <p className="mt-1">
              Buying in bulk lowers the per-unit price you pay:{" "}
              {BULK_DISCOUNT_TIERS.map((t) => `${t.minQty}+ units → ${t.discount * 100}% off`).join(
                ", ",
              )}
              .
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">Revenue</h3>
            <p className="mt-1">
              <code className="text-xs">revenue = unitsSold × price</code>
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">COGS</h3>
            <p className="mt-1">
              <code className="text-xs">cogs = unitsSold × costPerCup</code>, where costPerCup
              sums each ingredient&apos;s recipe amount times its running average purchase cost:
              {" "}
              {RECIPE.icePerCup} ice + {RECIPE.lemonsPerCup} lemon + {RECIPE.sugarPerCup} sugar +{" "}
              {RECIPE.cupsPerCup} cup per cup sold. Base (pre-discount) prices are ice{" "}
              {money(BASE_INGREDIENT_COST.ice)}, cups {money(BASE_INGREDIENT_COST.cups)}, lemons{" "}
              {money(BASE_INGREDIENT_COST.lemons)}, sugar {money(BASE_INGREDIENT_COST.sugar)} per
              unit.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">Profit</h3>
            <p className="mt-1">
              <code className="text-xs">profit = revenue − cogs</code> — a reporting metric shown
              per day and charted above; see the Cash note above for why it doesn&apos;t directly
              change your cash balance.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900">Suggested price</h3>
            <p className="mt-1">
              Tries a range of candidate prices from $0 up to{" "}
              {money(BASE_PRICE * 3)} (3× the base price) and, for each one, estimates{" "}
              <code className="text-xs">expectedSales × (price − costPerCup)</code> using the same
              demand formula above with a fixed random factor of 1 (an expected value, not a
              simulated outcome) — then returns whichever price scored the highest expected
              profit, capped by how many cups your current inventory can actually make.
            </p>
          </div>
        </div>
      </details>
    </main>
  );
}
