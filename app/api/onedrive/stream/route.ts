import { NextRequest, NextResponse } from "next/server";
import { graphRequest } from "@/lib/graph";
import { requireAuth } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  await requireAuth();
  const driveId = req.nextUrl.searchParams.get("driveId");
  const itemId = req.nextUrl.searchParams.get("itemId");

  if (!driveId || !itemId) {
    return NextResponse.json({ error: "driveId and itemId required" }, { status: 400 });
  }

  const range = req.headers.get("range") ?? undefined;
  const graphRes = await graphRequest(`/drives/${driveId}/items/${itemId}/content`, {
    headers: range ? { Range: range } : undefined
  });

  if (!graphRes.ok && graphRes.status !== 206) {
    return NextResponse.json({ error: "Unable to stream content" }, { status: graphRes.status });
  }

  const headers = new Headers();
  const ct = graphRes.headers.get("content-type") || "application/octet-stream";
  headers.set("content-type", ct);
  const acceptRanges = graphRes.headers.get("accept-ranges") || "bytes";
  headers.set("accept-ranges", acceptRanges);

  const contentRange = graphRes.headers.get("content-range");
  const contentLength = graphRes.headers.get("content-length");
  if (contentRange) headers.set("content-range", contentRange);
  if (contentLength) headers.set("content-length", contentLength);

  return new NextResponse(graphRes.body, {
    status: graphRes.status === 206 || range ? 206 : 200,
    headers
  });
}