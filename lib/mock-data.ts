export const mockProject = {
  id: "mock-project-1",
  name: "Checkout Platform",
  description: "Mock project for UI preview mode",
  repoLink: "https://github.com/example/checkout",
  environments: [
    { id: "env1", name: "dev", url: "https://dev.example.local", notes: "" },
    { id: "env2", name: "stage", url: "https://stage.example.local", notes: "" },
    { id: "env3", name: "prod", url: "https://example.local", notes: "" }
  ],
  components: [
    { id: "cmp1", name: "Cart" },
    { id: "cmp2", name: "Payment" }
  ],
  releases: [{ id: "rel1", name: "R2026.02", build: "2026.02.16.1" }]
};

export const mockCases = [
  {
    id: "tc1",
    title: "Guest checkout completes with card",
    priority: "CRITICAL",
    tags: ["smoke", "checkout"],
    suite: { name: "Smoke" },
    component: { name: "Payment" }
  },
  {
    id: "tc2",
    title: "Promo code applies discount",
    priority: "HIGH",
    tags: ["regression", "promo"],
    suite: { name: "Regression" },
    component: { name: "Cart" }
  }
];

export const mockRun = {
  id: "run1",
  name: "Stage Smoke - Mock",
  projectId: "mock-project-1",
  items: [
    {
      id: "item1",
      status: "fail",
      notes: "Payment timeout observed",
      testCase: { id: "tc1", title: "Guest checkout completes with card" },
      evidence: []
    },
    {
      id: "item2",
      status: "pass",
      notes: "OK",
      testCase: { id: "tc2", title: "Promo code applies discount" },
      evidence: []
    }
  ]
};

export const mockDefects = [
  {
    id: "def1",
    title: "Payment timeout on submit",
    status: "NEW",
    severity: "S2",
    priority: "P1",
    classification: "CONFIRMED_BUG",
    environment: "stage",
    evidence: [],
    activity: [{ id: "a1", action: "CREATED", meta: "Mock defect", createdAt: new Date().toISOString() }]
  }
];

export const mockPlans = [
  {
    id: "plan1",
    name: "Release 2026.02 Regression Plan",
    milestone: "R2026.02",
    description: "Covers smoke + regression on web checkout and payments.",
    runs: [
      { id: "run1", name: "Chrome / Stage", passed: 18, failed: 2, blocked: 1 },
      { id: "run2", name: "Firefox / Stage", passed: 16, failed: 3, blocked: 2 }
    ]
  }
];
