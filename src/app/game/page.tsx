"use client";

import { useEffect, useState } from "react";

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

function flavorText(day: Day) {
  if (day.profit < 0) return "Ouch — you lost money today.";
  if (day.endedEarly) return "Sold out! You left demand on the table.";
  if (day.profit === 0) return "Broke even today.";
  if (day.unitsSold === 0) return "Not a single cup sold today.";
  return "Solid day at the stand.";
}

export default function GamePage() {
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadGame() {
    setLoading(true);
    const res = await fetch("/api/game");
    const data = await res.json();
    setGame(data.game);
    setLoading(false);
  }

  useEffect(() => {
    loadGame();
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

  async function handleNewGame() {
    setError(null);
    setLastDay(null);
    const res = await fetch("/api/game", { method: "POST" });
    const data = await res.json();
    setGame(data.game);
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
      <h1 className="text-2xl font-semibold">Lemonade Stand</h1>

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
    </main>
  );
}
