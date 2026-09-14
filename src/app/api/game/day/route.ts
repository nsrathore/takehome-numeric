import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { GameError, setPriceAndSimulateDay } from "@/services/gameService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const day = await setPriceAndSimulateDay(body);
    return NextResponse.json({ day });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    if (err instanceof GameError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
