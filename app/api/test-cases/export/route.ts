import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { toCsv } from "@/lib/utils";

export async function GET(req: NextRequest) {
  await requireAuth();
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const cases = await prisma.testCase.findMany({ where: { projectId } });
  const csv = toCsv(
    cases.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      suiteId: c.suiteId,
      componentId: c.componentId,
      title: c.title,
      preconditions: c.preconditions,
      stepsJson: c.stepsJson,
      tags: c.tags.join("|"),
      priority: c.priority,
      requirementLink: c.requirementLink
    }))
  );
  return new NextResponse(csv, {
    headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=test-cases.csv" }
  });
}