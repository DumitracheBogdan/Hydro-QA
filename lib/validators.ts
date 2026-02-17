import { z } from "zod";

export const projectSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  repoLink: z.string().url().optional().or(z.literal(""))
});

export const testCaseSchema = z.object({
  projectId: z.string().min(1),
  suiteId: z.string().optional(),
  componentId: z.string().optional(),
  title: z.string().min(3),
  preconditions: z.string().optional(),
  steps: z.array(z.object({ step: z.number().int().positive(), action: z.string().min(1), expected: z.string().min(1) })).min(1),
  tags: z.array(z.string()).default([]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  requirementLink: z.string().optional()
});

export const testRunSchema = z.object({
  name: z.string().min(2),
  projectId: z.string(),
  releaseId: z.string(),
  environmentId: z.string(),
  caseIds: z.array(z.string()).min(1),
  assignedToId: z.string().optional()
});

export const executeCaseSchema = z.object({
  itemId: z.string(),
  status: z.enum(["pass", "fail", "blocked", "skip", "not_run"]),
  notes: z.string().optional()
});

export const defectSchema = z.object({
  projectId: z.string(),
  title: z.string().min(3),
  description: z.string().min(3),
  stepsToReproduce: z.string().min(3),
  expectedResult: z.string().min(3),
  actualResult: z.string().min(3),
  environment: z.string().min(1),
  releaseId: z.string().optional(),
  componentId: z.string().optional(),
  runId: z.string().optional(),
  testCaseId: z.string().optional(),
  severity: z.enum(["S1", "S2", "S3", "S4"]),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  status: z.enum(["NEW", "TRIAGED", "IN_PROGRESS", "FIXED", "VERIFIED", "CLOSED", "REOPENED"]).default("NEW"),
  classification: z.enum(["CONFIRMED_BUG", "FLAKY_GLITCH"]),
  reproducible: z.boolean(),
  reproRate: z.number().int().min(0).max(100),
  jiraUrl: z.string().url().optional().or(z.literal("")),
  tags: z.array(z.string()).default([]),
  assigneeId: z.string().optional()
});

export const annotationSchema = z.object({
  evidenceId: z.string(),
  shapes: z.array(
    z.object({
      type: z.enum(["circle", "rect", "arrow", "step"]),
      x: z.number(),
      y: z.number(),
      w: z.number().optional(),
      h: z.number().optional(),
      text: z.string().optional(),
      stepNumber: z.number().int().positive().optional()
    })
  )
});