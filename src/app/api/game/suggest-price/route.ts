import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { RECIPE } from "@/lib/gameConfig";
import {
  WeatherSchema,
  costPerCup,
  getOrCreateGame,
  maxSellableByInventory,
  suggestPrice,
} from "@/services/gameService";

export async function GET(req: NextRequest) {
  try {
    const weatherParam = req.nextUrl.searchParams.get("weather");
    const weather = weatherParam ? WeatherSchema.parse(weatherParam) : undefined;

    const game = await getOrCreateGame();
    const suggestion = suggestPrice({
      weather,
      dayNumber: game.currentDay,
      costPerCup: costPerCup(game),
      maxSellable: maxSellableByInventory(game, RECIPE),
    });

    return NextResponse.json({ suggestion });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
