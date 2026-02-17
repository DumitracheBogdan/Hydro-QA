import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockRun } from "@/lib/mock-data";

export default async function ShareReportPage({ params }: { params: { runId: string } }) {
  const bypass = process.env.ENABLE_DEV_AUTH_BYPASS === "true";
  const run = bypass
    ? ({
        ...mockRun,
        release: { name: "R2026.02", build: "2026.02.16.1" },
        environment: { name: "stage" },
        defects: []
      } as any)
    : await prisma.testRun.findUnique({
        where: { id: params.runId },
        include: {
          release: true,
          environment: true,
          items: { include: { testCase: true, evidence: true } },
          defects: { include: { evidence: true } }
        }
      });

  if (!run) return <div className="p-6">Run not found</div>;

  const total = run.items.length || 1;
  const pass = run.items.filter((i: any) => i.status === "pass").length;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader><CardTitle>{run.name} - Shareable Report</CardTitle></CardHeader>
        <CardContent>
          <p>Release: {run.release.name} ({run.release.build})</p>
          <p>Environment: {run.environment.name}</p>
          <p>Pass rate: {Math.round((pass / total) * 100)}%</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Executed Cases</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {run.items.map((i: any) => (
              <li key={i.id} className="rounded border p-2 text-sm">
                <p className="font-medium">{i.testCase.title}</p>
                <p>Status: {i.status}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {i.evidence.map((ev: any) => (
                    <span key={ev.id} className="rounded border px-2 py-1 text-xs">{ev.filename}</span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Linked Defects</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {run.defects.map((d: any) => (
              <li key={d.id} className="rounded border p-2">
                <p className="font-medium">{d.title}</p>
                <p>{d.status} | {d.severity} | {d.priority}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
