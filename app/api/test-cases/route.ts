import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/rbac";
import { testCaseSchema } from "@/lib/validators";
import { mockCases } from "@/lib/mock-data";

export async function GET(req: NextRequest) {
  await requireAuth();
  if (process.env.ENABLE_DEV_AUTH_BYPASS === "true") {
    return NextResponse.json(mockCases);
  }
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const componentId = req.nextUrl.searchParams.get("componentId") ?? undefined;
  const priority = req.nextUrl.searchParams.get("priority") ?? undefined;
  const tag = req.nextUrl.searchParams.get("tag") ?? undefined;

  const cases = await prisma.testCase.findMany({
    where: {
      projectId,
      componentId,
      priority: priority as any,
      tags: tag ? { has: tag } : undefined,
      OR: q
        ? [
            { title: { contains: q, mode: "insensitive" } },
            { preconditions: { contains: q, mode: "insensitive" } },
            { requirementLink: { contains: q, mode: "insensitive" } }
          ]
        : undefined
    },
    include: { suite: true, component: true, createdBy: true }
  });

  return NextResponse.json(cases);
}

export async function POST(req: Request) {
  const session = await requireAuth();
  requireRole("qa", session.user.role);
  const parsed = testCaseSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json(parsed.error.flatten(), { status: 400 });

  const testCase = await prisma.testCase.create({
    data: {
      ...parsed.data,
      stepsJson: JSON.stringify(parsed.data.steps),
      createdById: session.user.id
    }
  });
  return NextResponse.json(testCase);
}
