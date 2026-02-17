import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireRole } from "@/lib/rbac";

export async function POST(req: Request) {
  const session = await requireAuth();
  requireRole("qa", session.user.role);

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const type = (form.get("type") as string | null) ?? "file";
  const testRunItemId = (form.get("testRunItemId") as string | null) ?? null;

  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  await mkdir(path.join(process.cwd(), "uploads"), { recursive: true });
  const filename = `${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const full = path.join(process.cwd(), "uploads", filename);
  await writeFile(full, bytes);

  const evidence = await prisma.evidence.create({
    data: {
      provider: "local",
      type,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      size: bytes.length,
      path: `/uploads/${filename}`,
      createdById: session.user.id,
      testRunItemId
    }
  });

  return NextResponse.json(evidence);
}