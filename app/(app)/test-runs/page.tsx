"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EvidencePicker } from "@/components/evidence-picker";

type Run = {
  id: string;
  name: string;
  projectId: string;
  items: { id: string; status: string; notes: string | null; testCase: { id: string; title: string }; evidence: any[] }[];
};

export default function TestRunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<string>("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardIndex, setWizardIndex] = useState(0);
  const [reportPublic, setReportPublic] = useState(true);

  async function load() {
    const res = await fetch("/api/test-runs");
    const data = await res.json();
    setRuns(data);
    if (!selectedRun && data[0]) setSelectedRun(data[0].id);
  }

  useEffect(() => { load(); }, []);

  const run = useMemo(() => runs.find((r) => r.id === selectedRun), [runs, selectedRun]);
  const metrics = useMemo(() => {
    const items = run?.items || [];
    const total = items.length || 1;
    const passed = items.filter((i) => i.status === "pass").length;
    const failed = items.filter((i) => i.status === "fail").length;
    const blocked = items.filter((i) => i.status === "blocked").length;
    const notRun = items.filter((i) => i.status === "not_run").length;
    return { passRate: Math.round((passed / total) * 100), passed, failed, blocked, notRun };
  }, [run]);

  async function updateItem(itemId: string, status: string, notes: string) {
    await fetch("/api/test-runs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, status, notes })
    });
    await load();
  }

  async function attachOneDrive(itemId: string, selected: any[]) {
    await Promise.all(
      selected.map((s) =>
        fetch("/api/evidence/onedrive-select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...s, testRunItemId: itemId })
        })
      )
    );
    await load();
  }

  async function localUpload(itemId: string, file: File) {
    const form = new FormData();
    form.set("file", file);
    form.set("type", file.type.startsWith("video") ? "video" : file.type.startsWith("image") ? "image" : "log");
    form.set("testRunItemId", itemId);
    await fetch("/api/evidence/local-upload", { method: "POST", body: form });
    await load();
  }

  async function createDefect(item: Run["items"][number]) {
    await fetch("/api/defects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: run?.projectId || "",
        title: `Failure from ${item.testCase.title}`,
        description: item.notes || "Auto defect from failed case",
        stepsToReproduce: "See test case steps",
        expectedResult: "Case should pass",
        actualResult: item.notes || "Case failed",
        environment: "stage",
        severity: "S2",
        priority: "P1",
        classification: "FLAKY_GLITCH",
        reproducible: true,
        reproRate: 50,
        tags: ["auto"],
        runId: run?.id,
        testCaseId: item.testCase.id
      })
    });
    alert("Defect created");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="h-10 min-w-64 rounded-xl border border-[#c2dff6] bg-[#f7fbff] px-3 text-sm" value={selectedRun} onChange={(e) => setSelectedRun(e.target.value)}>
          {runs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="rounded-xl border border-[#c2dff6] bg-white px-3 py-2 text-sm">Pass rate: {metrics.passRate}%</div>
        <div className="rounded-xl border border-[#c2dff6] bg-white px-3 py-2 text-sm">Failed: {metrics.failed}</div>
        <button className="rounded-xl border border-[#c2dff6] bg-white px-3 py-2 text-sm text-[#1c2d86] hover:bg-[#ebf5fc]" onClick={() => setWizardOpen(true)}>
          Open Run Wizard
        </button>
        <button className="rounded-xl border border-[#c2dff6] bg-white px-3 py-2 text-sm text-[#1c2d86] hover:bg-[#ebf5fc]" onClick={() => alert("Run cloned (demo flow).")}>
          Clone Run
        </button>
        <label className="ml-auto flex items-center gap-2 rounded-xl border border-[#c2dff6] bg-white px-3 py-2 text-sm">
          <input type="checkbox" checked={reportPublic} onChange={(e) => setReportPublic(e.target.checked)} />
          Public report
        </label>
        <a className="text-sm font-medium text-[#1c2d86] underline" href={`/report/${selectedRun}`}>Shareable report</a>
      </div>

      <div className="space-y-3">
        {run?.items.map((item) => (
          <div key={item.id} className="rounded-xl border bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-semibold">{item.testCase.title}</h3>
              <Select value={item.status} onValueChange={(v) => updateItem(item.id, v, item.notes || "")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">pass</SelectItem>
                  <SelectItem value="fail">fail</SelectItem>
                  <SelectItem value="blocked">blocked</SelectItem>
                  <SelectItem value="skip">skip</SelectItem>
                  <SelectItem value="not_run">not_run</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea defaultValue={item.notes || ""} onBlur={(e) => updateItem(item.id, item.status, e.target.value)} placeholder="Execution notes" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="file" onChange={(e) => e.target.files?.[0] && localUpload(item.id, e.target.files[0])} />
              <EvidencePicker onSelected={(sel) => attachOneDrive(item.id, sel)} />
              <Button variant="secondary" onClick={() => createDefect(item)}>Create defect from this failure</Button>
            </div>
          </div>
        ))}
      </div>

      {wizardOpen && run?.items[wizardIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-[#c2dff6] bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1c2d86]">Execution Wizard</h3>
              <button className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100" onClick={() => setWizardOpen(false)}>Close</button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Case {wizardIndex + 1} / {run.items.length}
            </p>
            <p className="mb-3 text-base font-medium">{run.items[wizardIndex].testCase.title}</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {["pass", "fail", "blocked", "skip", "not_run"].map((status) => (
                <button
                  key={status}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${run.items[wizardIndex].status === status ? "border-[#3a99e1] bg-[#ebf5fc] text-[#1c2d86]" : "border-[#c2dff6] bg-white"}`}
                  onClick={() => updateItem(run.items[wizardIndex].id, status, run.items[wizardIndex].notes || "")}
                >
                  {status}
                </button>
              ))}
            </div>
            <Textarea
              defaultValue={run.items[wizardIndex].notes || ""}
              onBlur={(e) => updateItem(run.items[wizardIndex].id, run.items[wizardIndex].status, e.target.value)}
              placeholder="Add execution notes"
            />
            <div className="mt-4 flex items-center justify-between">
              <Button variant="outline" onClick={() => setWizardIndex((i) => Math.max(i - 1, 0))}>Previous</Button>
              <Button onClick={() => setWizardIndex((i) => Math.min(i + 1, run.items.length - 1))}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
