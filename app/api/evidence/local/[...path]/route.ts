import path from "path";
import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/rbac";

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  await requireAuth();
  const relative = params.path.join("/");
  const full = path.join(process.cwd(), "uploads", relative);

  try {
    const data = await readFile(full);
    const mime = req.nextUrl.searchParams.get("mime") || "application/octet-stream";
    return new NextResponse(data, { headers: { "content-type": mime } });
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
}