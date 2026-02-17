import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockPlans } from "@/lib/mock-data";

export default function PlansPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[#1c2d86]">Test Plans</h2>
        <button className="rounded-xl bg-[#3a99e1] px-4 py-2 text-sm font-medium text-white hover:bg-[#61bfff]">Create Plan</button>
      </div>

      <div className="grid gap-4">
        {mockPlans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <p className="text-sm text-slate-500">Milestone: {plan.milestone}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-slate-600">{plan.description}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {plan.runs.map((run) => (
                  <div key={run.id} className="rounded-xl border border-[#c2dff6] bg-[#f7fbff] p-3 text-sm">
                    <p className="font-semibold text-[#1c2d86]">{run.name}</p>
                    <p className="text-slate-600">Passed: {run.passed} | Failed: {run.failed} | Blocked: {run.blocked}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}