import { NextResponse } from "next/server";
import { getGameHistory } from "@/services/gameService";

export async function GET() {
  try {
    const days = await getGameHistory();
    return NextResponse.json({ days });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
