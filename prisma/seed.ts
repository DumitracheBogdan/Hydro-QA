import { PrismaClient, Role, Priority, Severity, DefectPriority, DefectClass, DefectStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@contoso.com" },
    update: { role: Role.admin },
    create: { email: "admin@contoso.com", name: "Admin User", role: Role.admin }
  });

  const qa = await prisma.user.upsert({
    where: { email: "qa@contoso.com" },
    update: { role: Role.qa },
    create: { email: "qa@contoso.com", name: "QA Engineer", role: Role.qa }
  });

  const project = await prisma.project.create({
    data: {
      name: "Checkout Platform",
      description: "Regression and release quality tracking for checkout services",
      repoLink: "https://github.com/example/checkout",
      ownerId: admin.id,
      environments: { create: [{ name: "dev", url: "https://dev.example.com" }, { name: "stage", url: "https://stage.example.com" }, { name: "prod", url: "https://example.com" }] },
      components: { create: [{ name: "Cart" }, { name: "Payment" }, { name: "Promo" }] },
      releases: { create: [{ name: "R2026.02", build: "2026.02.16.1" }] },
      suites: { create: [{ name: "Smoke" }, { name: "Checkout Core" }] }
    },
    include: { components: true, suites: true, releases: true, environments: true }
  });

  const [cart] = project.components;
  const [smokeSuite] = project.suites;
  const [release] = project.releases;
  const [stage] = project.environments.filter((e) => e.name === "stage");

  const tc1 = await prisma.testCase.create({
    data: {
      projectId: project.id,
      suiteId: smokeSuite.id,
      componentId: cart.id,
      title: "Guest checkout completes with card",
      preconditions: "Valid catalog and payment gateway sandbox credentials",
      stepsJson: JSON.stringify([
        { step: 1, action: "Add SKU-1 to cart", expected: "Cart updates quantity" },
        { step: 2, action: "Proceed to checkout and enter card", expected: "Payment accepted" },
        { step: 3, action: "Submit order", expected: "Order confirmation displayed" }
      ]),
      tags: ["smoke", "checkout"],
      priority: Priority.CRITICAL,
      requirementLink: "REQ-1001",
      createdById: qa.id
    }
  });

  const run = await prisma.testRun.create({
    data: {
      name: "Stage Smoke - Feb 16",
      projectId: project.id,
      releaseId: release.id,
      environmentId: stage.id,
      items: {
        create: [{ caseId: tc1.id, assignedToId: qa.id, status: "fail", notes: "Payment API timeout", executedAt: new Date() }]
      }
    },
    include: { items: true }
  });

  const defect = await prisma.defect.create({
    data: {
      projectId: project.id,
      runId: run.id,
      testCaseId: tc1.id,
      releaseId: release.id,
      componentId: cart.id,
      title: "Checkout payment timeout on stage",
      description: "POST /payments intermittently times out",
      stepsToReproduce: "Run guest checkout flow with card 4111111111111111",
      expectedResult: "Payment completes within SLA",
      actualResult: "Spinner hangs for 45s then error",
      environment: "stage",
      severity: Severity.S2,
      priority: DefectPriority.P1,
      status: DefectStatus.NEW,
      classification: DefectClass.CONFIRMED_BUG,
      reproducible: true,
      reproRate: 70,
      tags: ["payments", "timeout"]
    }
  });

  await prisma.activityLog.create({
    data: { defectId: defect.id, userId: qa.id, action: "CREATED_DEFECT", meta: "Initial defect created from failed test run" }
  });

  await prisma.defectComment.create({
    data: { defectId: defect.id, userId: qa.id, body: "Observed in 7 out of 10 runs" }
  });
}

main().finally(async () => prisma.$disconnect());