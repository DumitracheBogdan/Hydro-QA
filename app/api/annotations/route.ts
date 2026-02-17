import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/rbac";
import { annotationSchema } from "@/lib/validators";

function drawAnnotationSvg(shapes: any[]) {
  const nodes = shapes
    .map((s) => {
      if (s.type === "circle") return `<circle cx="${s.x}" cy="${s.y}" r="${s.w || 20}" stroke="#ef4444" stroke-width="3" fill="none"/>`;
      if (s.type === "rect") return `<rect x="${s.x}" y="${s.y}" width="${s.w || 50}" height="${s.h || 30}" stroke="#f97316" stroke-width="3" fill="none"/>`;
      if (s.type === "arrow") return `<line x1="${s.x}" y1="${s.y}" x2="${(s.x || 0) + (s.w || 40)}" y2="${(s.y || 0) + (s.h || 0)}" stroke="#0ea5e9" stroke-width="3" marker-end="url(#arr)"/>`;
      if (s.type === "step") return `<g><circle cx="${s.x}" cy="${s.y}" r="14" fill="#0f766e"/><text x="${s.x}" y="${s.y + 5}" text-anchor="middle" fill="#fff" font-size="12">${s.stepNumber || ""}</text><text x="${s.x + 20}" y="${s.y + 5}" fill="#111827" font-size="12">${s.text || ""}</text></g>`;
      return "";
    })
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><marker id="arr" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#0ea5e9"/></marker></defs>${nodes}</svg>`;
}

export async function POST(req: Request) {
  const session = await requireAuth();
  requireRole("qa", session.user.role);
  const parsed = annotationSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json(parsed.error.flatten(), { status: 400 });

  const svg = drawAnnotationSvg(parsed.data.shapes);
  await mkdir(path.join(process.cwd(), "uploads"), { recursive: true });
  const filename = `annot-${randomUUID()}.svg`;
  const full = path.join(process.cwd(), "uploads", filename);
  await writeFile(full, Buffer.from(svg));

  const updated = await prisma.evidence.update({
    where: { id: parsed.data.evidenceId },
    data: {
      annotationJson: JSON.stringify(parsed.data.shapes),
      annotatedPath: `/uploads/${filename}`
    }
  });

  return NextResponse.json(updated);
}