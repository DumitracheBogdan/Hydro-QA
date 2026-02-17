"use client";

import { LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, BarChart, Bar } from "recharts";

export function DashboardCharts({
  trend,
  status,
  flakyAreas
}: {
  trend: { label: string; passRate: number }[];
  status: { name: string; value: number }[];
  flakyAreas: { name: string; count: number }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <div className="rounded-xl border bg-white p-4">
        <h3 className="mb-3 font-semibold">Pass Rate Trend</h3>
        <LineChart width={320} height={220} data={trend}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Line type="monotone" dataKey="passRate" stroke="#0284c7" strokeWidth={2} />
        </LineChart>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <h3 className="mb-3 font-semibold">Defects by Status</h3>
        <PieChart width={320} height={220}>
          <Pie data={status} dataKey="value" nameKey="name" outerRadius={80}>
            {status.map((_, i) => (
              <Cell key={i} fill={["#ef4444", "#f97316", "#0ea5e9", "#16a34a", "#64748b", "#8b5cf6", "#eab308"][i % 7]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </div>
      <div className="rounded-xl border bg-white p-4">
        <h3 className="mb-3 font-semibold">Top Flaky Areas</h3>
        <BarChart width={320} height={220} data={flakyAreas}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="count" fill="#f97316" />
        </BarChart>
      </div>
    </div>
  );
}