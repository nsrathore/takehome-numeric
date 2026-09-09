import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createItem, listItems } from "@/services/itemService";

export async function GET() {
  const items = await listItems();
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const item = await createItem(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
