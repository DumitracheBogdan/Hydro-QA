import { NextRequest, NextResponse } from "next/server";
import { graphJson } from "@/lib/graph";
import { requireAuth } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  await requireAuth();
  const driveId = req.nextUrl.searchParams.get("driveId");
  const itemId = req.nextUrl.searchParams.get("itemId") ?? "root";
  if (!driveId) return NextResponse.json({ error: "driveId required" }, { status: 400 });

  try {
    const items = await graphJson<{ value: any[] }>(`/drives/${driveId}/items/${itemId}/children?$top=200`);
    return NextResponse.json(items.value);
  } catch (error) {
    return NextResponse.json({ error: "Could not list folder", details: String(error) }, { status: 500 });
  }
}