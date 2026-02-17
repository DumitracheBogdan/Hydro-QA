import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { toCsv } from "@/lib/utils";

export async function GET(req: NextRequest) {
  await requireAuth();
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const defects = await prisma.defect.findMany({ where: { projectId }, include: { component: true, release: true } });

  const csv = toCsv(
    defects.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      severity: d.severity,
      priority: d.priority,
      environment: d.environment,
      component: d.component?.name ?? "",
      release: d.release?.name ?? "",
      createdAt: d.createdAt.toISOString()
    }))
  );

  return new NextResponse(csv, {
    headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=defects.csv" }
  });
}