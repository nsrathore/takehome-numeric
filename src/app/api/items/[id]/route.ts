import { NextRequest, NextResponse } from "next/server";
import { deleteItem, getItem } from "@/services/itemService";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const item = await getItem(params.id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await deleteItem(params.id);
  return NextResponse.json({ ok: true });
}
