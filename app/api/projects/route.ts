import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/rbac";
import { projectSchema } from "@/lib/validators";
import { mockProject } from "@/lib/mock-data";

export async function GET() {
  await requireAuth();
  if (process.env.ENABLE_DEV_AUTH_BYPASS === "true") {
    return NextResponse.json([mockProject]);
  }
  const projects = await prisma.project.findMany({ include: { environments: true, components: true, releases: true } });
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const session = await requireAuth();
  requireRole("qa", session.user.role);
  const parsed = projectSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json(parsed.error.flatten(), { status: 400 });

  const project = await prisma.project.create({
    data: {
      ...parsed.data,
      repoLink: parsed.data.repoLink || null,
      ownerId: session.user.id
    }
  });
  return NextResponse.json(project);
}
