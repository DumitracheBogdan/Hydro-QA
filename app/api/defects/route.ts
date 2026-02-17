import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/rbac";
import { defectSchema } from "@/lib/validators";
import { mockDefects } from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  await requireAuth();
  if (process.env.ENABLE_DEV_AUTH_BYPASS === "true") {
    return NextResponse.json(mockDefects);
  }
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const defects = await prisma.defect.findMany({
    where: { projectId },
    include: {
      component: true,
      release: true,
      assignee: true,
      evidence: true,
      comments: { include: { user: true } },
      activity: { include: { user: true }, orderBy: { createdAt: "desc" } }
    },
    orderBy: { updatedAt: "desc" }
  });

  return NextResponse.json(defects);
}

export async function POST(req: Request) {
  const session = await requireAuth();
  requireRole("qa", session.user.role);
  const parsed = defectSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json(parsed.error.flatten(), { status: 400 });

  if (parsed.data.classification === "CONFIRMED_BUG") {
    const evidenceCount = await prisma.evidence.count({
      where: {
        createdById: session.user.id,
        createdAt: { gte: new Date(Date.now() - 20 * 60 * 1000) },
        defectId: null
      }
    });
    if (evidenceCount === 0) {
      return NextResponse.json({ error: "Confirmed Bug requires at least one evidence item." }, { status: 400 });
    }
  }

  const defect = await prisma.defect.create({
    data: {
      ...parsed.data,
      jiraUrl: parsed.data.jiraUrl || null
    }
  });

  await prisma.activityLog.create({
    data: {
      defectId: defect.id,
      userId: session.user.id,
      action: "CREATED",
      meta: `Status ${defect.status}`
    }
  });

  await prisma.evidence.updateMany({
    where: {
      createdById: session.user.id,
      defectId: null,
      createdAt: { gte: new Date(Date.now() - 20 * 60 * 1000) }
    },
    data: { defectId: defect.id }
  });

  return NextResponse.json(defect);
}

export async function PATCH(req: Request) {
  const session = await requireAuth();
  requireRole("qa", session.user.role);
  const body = await req.json();
  const id = body.id as string;
  const status = body.status as string;

  const updated = await prisma.defect.update({ where: { id }, data: { status: status as any } });
  await prisma.activityLog.create({
    data: { defectId: id, userId: session.user.id, action: "STATUS_CHANGED", meta: `to ${status}` }
  });

  return NextResponse.json(updated);
}
