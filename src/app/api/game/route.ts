import { NextResponse } from "next/server";
import { getOrCreateGame, resetGame } from "@/services/gameService";

export async function GET() {
  try {
    const game = await getOrCreateGame();
    return NextResponse.json({ game });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const game = await resetGame();
    return NextResponse.json({ game });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
