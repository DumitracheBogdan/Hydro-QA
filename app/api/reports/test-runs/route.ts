import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { toCsv } from "@/lib/utils";

export async function GET(req: NextRequest) {
  await requireAuth();
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const runs = await prisma.testRun.findMany({ where: { projectId }, include: { release: true, environment: true, items: true } });

  const csv = toCsv(
    runs.map((r) => ({
      id: r.id,
      name: r.name,
      release: r.release.name,
      environment: r.environment.name,
      totalCases: r.items.length,
      passed: r.items.filter((i) => i.status === "pass").length,
      failed: r.items.filter((i) => i.status === "fail").length,
      blocked: r.items.filter((i) => i.status === "blocked").length,
      createdAt: r.createdAt.toISOString()
    }))
  );

  return new NextResponse(csv, {
    headers: { "content-type": "text/csv", "content-disposition": "attachment; filename=test-runs.csv" }
  });
}