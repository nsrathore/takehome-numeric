"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STARTING_CASH } from "@/lib/gameConfig";

const MAX_STARTING_CASH = 10_000;

export default function Home() {
  const router = useRouter();
  // No persistence feeds this initial value -- every fresh mount of this
  // page (including landing here after Exit Game) starts from the default
  // again, never a previous game's custom value.
  const [startingCashInput, setStartingCashInput] = useState(String(STARTING_CASH));
  const [starting, setStarting] = useState(false);

  const parsedStartingCash = Number(startingCashInput);
  const isValid =
    startingCashInput.trim() !== "" &&
    Number.isFinite(parsedStartingCash) &&
    parsedStartingCash > 0 &&
    parsedStartingCash <= MAX_STARTING_CASH;

  async function handleStart() {
    if (!isValid || starting) return;
    setStarting(true);
    try {
      await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startingCash: parsedStartingCash }),
      });
      router.push("/game");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Lemonade Stand</h1>
      <p className="mt-2 text-slate-600">
        Next.js (App Router) + TypeScript + Prisma (SQLite) + Tailwind + Vitest.
      </p>

      <label className="mt-6 flex max-w-xs flex-col gap-1 text-sm">
        <span className="text-slate-600">Starting cash ($)</span>
        <input
          type="number"
          min="0.01"
          max={MAX_STARTING_CASH}
          step="0.01"
          className="rounded-md border border-slate-300 px-3 py-2"
          value={startingCashInput}
          onChange={(e) => setStartingCashInput(e.target.value)}
        />
      </label>
      {!isValid && (
        <p className="mt-1 text-sm text-red-600">
          Enter a positive amount up to ${MAX_STARTING_CASH.toLocaleString()}.
        </p>
      )}

      <button
        type="button"
        onClick={handleStart}
        disabled={!isValid || starting}
        className="mt-4 inline-block rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {starting ? "Starting…" : "Start New Game"}
      </button>
    </main>
  );
}
