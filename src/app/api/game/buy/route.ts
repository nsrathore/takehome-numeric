import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { GameError, buyInventory } from "@/services/gameService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const game = await buyInventory(body.purchases);
    return NextResponse.json({ game });
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
