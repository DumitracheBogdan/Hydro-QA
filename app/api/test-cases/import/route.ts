import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/rbac";

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cols[i] ?? ""));
    return row;
  });
}

export async function POST(req: Request) {
  const session = await requireAuth();
  requireRole("qa", session.user.role);
  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file required" }, { status: 400 });

  const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
  const rows = parseCsv(text);
  const created = [];

  for (const r of rows) {
    const tc = await prisma.testCase.create({
      data: {
        projectId: r.projectId,
        suiteId: r.suiteId || null,
        componentId: r.componentId || null,
        title: r.title,
        preconditions: r.preconditions || null,
        stepsJson: r.stepsJson || "[]",
        tags: r.tags ? r.tags.split("|") : [],
        priority: (r.priority as any) || "MEDIUM",
        requirementLink: r.requirementLink || null,
        createdById: session.user.id
      }
    });
    created.push(tc.id);
  }

  return NextResponse.json({ inserted: created.length, ids: created });
}