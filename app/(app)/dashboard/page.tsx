import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardCharts } from "@/components/dashboard-charts";
import { mockDefects, mockRun } from "@/lib/mock-data";

export default async function DashboardPage() {
  const bypass = process.env.ENABLE_DEV_AUTH_BYPASS === "true";
  const [defects, runs] = bypass
    ? [mockDefects as any[], [mockRun] as any[]]
    : await Promise.all([
        prisma.defect.findMany({ include: { component: true } }),
        prisma.testRun.findMany({ include: { items: true }, orderBy: { createdAt: "asc" } })
      ]);

  const statusMap = defects.reduce<Record<string, number>>((acc, defect) => {
    acc[defect.status] = (acc[defect.status] ?? 0) + 1;
    return acc;
  }, {});
  const status = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

  const trend = runs.map((run) => {
    const total = run.items.length || 1;
    const pass = run.items.filter((i: any) => i.status === "pass").length;
    return { label: run.name.slice(0, 10), passRate: Math.round((pass / total) * 100) };
  });

  const flakyMap = defects
    .filter((d) => d.classification === "FLAKY_GLITCH")
    .reduce<Record<string, number>>((acc, d) => {
      const key = d.componentId ?? "Unassigned";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  const flakyAreas = Object.entries(flakyMap).map(([name, count]) => ({ name, count }));

  const cycleData = defects.filter((d) => d.status === "CLOSED");
  const avgCycle =
    cycleData.length > 0
      ? Math.round(
          cycleData.reduce((acc, d) => acc + (d.updatedAt.getTime() - d.createdAt.getTime()) / (1000 * 3600 * 24), 0) / cycleData.length
        )
      : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader><CardTitle>Open Defects</CardTitle></CardHeader><CardContent>{defects.filter((d) => d.status !== "CLOSED").length}</CardContent></Card>
        <Card><CardHeader><CardTitle>Total Test Runs</CardTitle></CardHeader><CardContent>{runs.length}</CardContent></Card>
        <Card><CardHeader><CardTitle>Average Cycle Time</CardTitle></CardHeader><CardContent>{avgCycle} days</CardContent></Card>
        <Card><CardHeader><CardTitle>Flaky Defects</CardTitle></CardHeader><CardContent>{defects.filter((d) => d.classification === "FLAKY_GLITCH").length}</CardContent></Card>
      </div>
      <DashboardCharts trend={trend} status={status} flakyAreas={flakyAreas} />
    </div>
  );
}
