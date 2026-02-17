import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/rbac";
import { executeCaseSchema, testRunSchema } from "@/lib/validators";
import { mockRun } from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  await requireAuth();
  if (process.env.ENABLE_DEV_AUTH_BYPASS === "true") {
    return NextResponse.json([mockRun]);
  }
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const runs = await prisma.testRun.findMany({
    where: { projectId },
    include: {
      release: true,
      environment: true,
      items: { include: { testCase: true, assignedTo: true, evidence: true } },
      defects: true
    },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json(runs);
}

export async function POST(req: Request) {
  const session = await requireAuth();
  requireRole("qa", session.user.role);
  const parsed = testRunSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json(parsed.error.flatten(), { status: 400 });

  const run = await prisma.testRun.create({
    data: {
      name: parsed.data.name,
      projectId: parsed.data.projectId,
      releaseId: parsed.data.releaseId,
      environmentId: parsed.data.environmentId,
      items: {
        create: parsed.data.caseIds.map((caseId) => ({ caseId, assignedToId: parsed.data.assignedToId }))
      }
    },
    include: { items: true }
  });

  return NextResponse.json(run);
}

export async function PATCH(req: Request) {
  const session = await requireAuth();
  requireRole("qa", session.user.role);
  const parsed = executeCaseSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json(parsed.error.flatten(), { status: 400 });

  const item = await prisma.testRunItem.update({
    where: { id: parsed.data.itemId },
    data: {
      status: parsed.data.status,
      notes: parsed.data.notes,
      executedAt: parsed.data.status !== "not_run" ? new Date() : null
    }
  });

  return NextResponse.json(item);
}
