"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

type CaseRow = { id: string; title: string; priority: string; tags: string[]; suite?: { name: string } | null; component?: { name: string } | null };

export default function TestCasesPage() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [activeSuite, setActiveSuite] = useState("all");

  async function load() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (priority !== "all") params.set("priority", priority);
    const res = await fetch(`/api/test-cases?${params.toString()}`);
    setRows(await res.json());
  }

  useEffect(() => { load(); }, []);
  const suites = ["all", ...Array.from(new Set(rows.map((r) => r.suite?.name).filter(Boolean) as string[]))];
  const filteredRows = activeSuite === "all" ? rows : rows.filter((r) => r.suite?.name === activeSuite);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#1c2d86]">Test Repository</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline">New Suite</Button>
          <Button>Create Case</Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="rounded-2xl border border-[#c2dff6] bg-white p-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-[#358bcd]">SUITES</p>
          <div className="space-y-1">
            {suites.map((suite) => (
              <button
                key={suite}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm ${activeSuite === suite ? "bg-[#ebf5fc] text-[#1c2d86]" : "hover:bg-[#f7fbff]"}`}
                onClick={() => setActiveSuite(suite)}
              >
                {suite === "all" ? "All Suites" : suite}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-[#c2dff6] bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input placeholder="Search test cases" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="LOW">LOW</SelectItem>
                <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                <SelectItem value="HIGH">HIGH</SelectItem>
                <SelectItem value="CRITICAL">CRITICAL</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={load}>Apply</Button>
            <label className="rounded-xl border border-[#c2dff6] px-3 py-2 text-sm">
              {uploading ? "Importing..." : "Import CSV"}
              <input
                className="hidden"
                type="file"
                accept=".csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  const form = new FormData();
                  form.set("file", file);
                  await fetch("/api/test-cases/import", { method: "POST", body: form });
                  setUploading(false);
                  await load();
                }}
              />
            </label>
            <a className="text-sm underline" href="/api/test-cases/export">Export Cases CSV</a>
          </div>
          <Table>
            <THead><TR><TH>Title</TH><TH>Suite</TH><TH>Component</TH><TH>Priority</TH><TH>Tags</TH></TR></THead>
            <TBody>
              {filteredRows.map((row) => (
                <TR key={row.id}>
                  <TD>{row.title}</TD>
                  <TD>{row.suite?.name ?? "-"}</TD>
                  <TD>{row.component?.name ?? "-"}</TD>
                  <TD>{row.priority}</TD>
                  <TD>{row.tags.join(", ")}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
