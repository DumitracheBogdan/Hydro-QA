import { prisma } from "@/lib/prisma";
import { mockDefects, mockRun } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ReportsPage() {
  const bypass = process.env.ENABLE_DEV_AUTH_BYPASS === "true";

  const [defects, runs] = bypass
    ? [mockDefects as any[], [mockRun] as any[]]
    : await Promise.all([prisma.defect.findMany(), prisma.testRun.findMany({ include: { items: true } })]);

  const totalRuns = runs.length;
  const totalDefects = defects.length;
  const openDefects = defects.filter((d) => d.status !== "CLOSED").length;
  const failedCases = runs.reduce((acc, run) => acc + run.items.filter((item: any) => item.status === "fail").length, 0);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-[#1c2d86]">Reports</h2>
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Runs</CardTitle>
          </CardHeader>
          <CardContent>{totalRuns}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Total Bugs</CardTitle>
          </CardHeader>
          <CardContent>{totalDefects}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Open Bugs</CardTitle>
          </CardHeader>
          <CardContent>{openDefects}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Failed Cases</CardTitle>
          </CardHeader>
          <CardContent>{failedCases}</CardContent>
        </Card>
      </div>

      <div className="rounded-xl border border-[#c2dff6] bg-white p-4">
        <h3 className="font-semibold text-[#1c2d86]">Export Data</h3>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a className="rounded-lg border border-[#c2dff6] px-3 py-2 text-[#1c2d86] hover:bg-[#f2f8fe]" href="/api/reports/test-runs">
            Download Test Runs CSV
          </a>
          <a className="rounded-lg border border-[#c2dff6] px-3 py-2 text-[#1c2d86] hover:bg-[#f2f8fe]" href="/api/reports/defects">
            Download Bugs CSV
          </a>
        </div>
      </div>
    </div>
  );
}
