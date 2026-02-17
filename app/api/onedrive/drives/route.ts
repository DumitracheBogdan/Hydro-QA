import { NextResponse } from "next/server";
import { graphJson } from "@/lib/graph";
import { requireAuth } from "@/lib/rbac";

export async function GET() {
  await requireAuth();
  try {
    const drives = await graphJson<{ value: any[] }>("/me/drives");
    return NextResponse.json(drives.value);
  } catch (error) {
    return NextResponse.json({ error: "Connect OneDrive", details: String(error) }, { status: 403 });
  }
}