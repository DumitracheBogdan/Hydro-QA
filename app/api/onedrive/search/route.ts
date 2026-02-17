import { NextRequest, NextResponse } from "next/server";
import { graphJson } from "@/lib/graph";
import { requireAuth } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  await requireAuth();
  const driveId = req.nextUrl.searchParams.get("driveId");
  const q = req.nextUrl.searchParams.get("q");

  if (!driveId || !q) return NextResponse.json({ error: "driveId and q required" }, { status: 400 });

  try {
    const result = await graphJson<{ value: any[] }>(`/drives/${driveId}/root/search(q='${encodeURIComponent(q)}')?$top=50`);
    return NextResponse.json(result.value);
  } catch (error) {
    return NextResponse.json({ error: "Search failed", details: String(error) }, { status: 500 });
  }
}