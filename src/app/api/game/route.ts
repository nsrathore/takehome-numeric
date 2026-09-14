import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  try {
    // "Start a new game": wipe everything, then immediately create a fresh,
    // playable GameState so this route's contract (returns { game }) holds.
    // Body is optional -- an empty/missing body just falls back to defaults.
    const body = await req.json().catch(() => ({}));
    await resetGame();
    const game = await getOrCreateGame(body?.startingCash);
    return NextResponse.json({ game });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await resetGame();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
