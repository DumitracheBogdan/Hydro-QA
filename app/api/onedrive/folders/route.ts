import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const session = await requireAuth();
  const body = await req.json();
  const record = await prisma.savedOneDriveFolder.create({
    data: {
      userId: session.user.id,
      projectId: body.projectId || null,
      driveId: body.driveId,
      folderId: body.folderId,
      label: body.label
    }
  });
  return NextResponse.json(record);
}

export async function GET(req: NextRequest) {
  const session = await requireAuth();
  const projectId = req.nextUrl.searchParams.get("projectId") || null;
  const data = await prisma.savedOneDriveFolder.findMany({ where: { userId: session.user.id, projectId } });
  return NextResponse.json(data);
}