import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/rbac";

export async function POST(req: Request) {
  const session = await requireAuth();
  requireRole("qa", session.user.role);
  const body = await req.json();

  const created = await prisma.evidence.create({
    data: {
      provider: "onedrive",
      type: body.mimeType?.startsWith("video") ? "video" : body.mimeType?.startsWith("image") ? "image" : "file",
      filename: body.filename,
      mimeType: body.mimeType || "application/octet-stream",
      size: Number(body.size || 0),
      driveId: body.driveId,
      itemId: body.itemId,
      createdById: session.user.id,
      testRunItemId: body.testRunItemId || null
    }
  });

  return NextResponse.json(created);
}