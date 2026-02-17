"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImageAnnotator } from "@/components/image-annotator";

type Evidence = {
  id: string;
  provider: string;
  mimeType: string;
  filename: string;
  driveId?: string | null;
  itemId?: string | null;
  path?: string | null;
  annotatedPath?: string | null;
};

type Defect = {
  id: string;
  title: string;
  status: string;
  severity: string;
  priority: string;
  classification: string;
  environment: string;
  evidence: Evidence[];
  activity: { id: string; action: string; meta: string | null; createdAt: string }[];
};

const columns = ["NEW", "TRIAGED", "IN_PROGRESS", "FIXED", "VERIFIED", "CLOSED", "REOPENED"] as const;

export function BugsPage() {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [view, setView] = useState<"board" | "list">("board");

  async function load() {
    const res = await fetch("/api/defects");
    setDefects(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function move(id: string, status: string) {
    await fetch("/api/defects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status })
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-xl font-semibold text-[#1c2d86]">Bugs</h2>
        <a href="/api/reports/defects" className="text-sm font-medium text-[#1c2d86] underline">
          Export CSV
        </a>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant={view === "board" ? "default" : "outline"} onClick={() => setView("board")}>
            Board
          </Button>
          <Button size="sm" variant={view === "list" ? "default" : "outline"} onClick={() => setView("list")}>
            List
          </Button>
        </div>
      </div>

      {view === "board" ? (
        <div className="grid gap-3 lg:grid-cols-4 xl:grid-cols-7">
          {columns.map((col) => (
            <div key={col} className="rounded-2xl border border-[#c2dff6] bg-white p-3">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-[#358bcd]">{col}</h3>
              <div className="space-y-2">
                {defects
                  .filter((d) => d.status === col)
                  .map((d) => (
                    <div key={d.id} className="rounded-xl border border-[#e2effa] bg-[#f7fbff] p-2 text-xs">
                      <p className="font-semibold text-[#1c2d86]">{d.title}</p>
                      <p className="mt-1 text-slate-500">
                        {d.severity} | {d.priority}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        defects.map((d) => (
          <div key={d.id} className="rounded-xl border border-[#c2dff6] bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{d.title}</h3>
                <p className="text-sm text-muted-foreground">{d.environment}</p>
              </div>
              <div className="flex gap-2">
                <Badge>{d.status}</Badge>
                <Badge>{d.severity}</Badge>
                <Badge>{d.priority}</Badge>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              {columns.map((s) => (
                <Button key={s} size="sm" variant={d.status === s ? "default" : "outline"} onClick={() => move(d.id, s)}>
                  {s}
                </Button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Evidence</h4>
                {d.evidence.map((ev) => (
                  <div key={ev.id} className="rounded border p-2">
                    <p className="text-xs font-medium">{ev.filename}</p>
                    {ev.mimeType.startsWith("video") && ev.provider === "onedrive" && ev.driveId && ev.itemId && (
                      <video className="mt-1 h-48 w-full rounded border" controls src={`/api/onedrive/stream?driveId=${ev.driveId}&itemId=${ev.itemId}`} />
                    )}
                    {ev.mimeType.startsWith("video") && ev.provider === "local" && ev.path && (
                      <video className="mt-1 h-48 w-full rounded border" controls src={ev.path.replace("/uploads/", "/api/evidence/local/")} />
                    )}
                    {ev.mimeType.startsWith("image") && (
                      <div className="relative mt-1 h-48 w-full overflow-hidden rounded border bg-white">
                        <Image
                          className="object-contain"
                          src={(ev.annotatedPath || ev.path || "").replace("/uploads/", "/api/evidence/local/")}
                          alt={ev.filename}
                          fill
                          sizes="(max-width: 768px) 100vw, 50vw"
                        />
                      </div>
                    )}
                    {ev.mimeType.startsWith("image") && <ImageAnnotator evidenceId={ev.id} />}
                  </div>
                ))}
              </div>
              <div>
                <h4 className="text-sm font-semibold">Activity</h4>
                <ul className="mt-2 space-y-1 text-sm">
                  {d.activity.map((a) => (
                    <li key={a.id}>
                      {a.action} {a.meta || ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
