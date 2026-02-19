import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);

const GITHUB_OWNER = process.env.GITHUB_OWNER || "DumitracheBogdan";
const GITHUB_REPO = process.env.GITHUB_REPO || "Hydro-QA";
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || "").trim();
const GITHUB_API_BASE = "https://api.github.com";
const QA_LABEL = "qa-tracker";
const META_START = "QA_TRACKER_META_START";
const META_END = "QA_TRACKER_META_END";

app.use(express.json({ limit: "2mb" }));

function ensureConfig() {
  if (!GITHUB_TOKEN) {
    const err = new Error("Server missing GITHUB_TOKEN environment variable.");
    err.status = 500;
    throw err;
  }
}

function safeString(value) {
  return String(value ?? "").trim();
}

function sanitizeTaskPayload(input) {
  const mediaUrls = Array.isArray(input?.mediaUrls)
    ? input.mediaUrls.map((x) => safeString(x)).filter(Boolean)
    : [];

  return {
    id: safeString(input?.id) || `TASK-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    title: safeString(input?.title) || "Untitled QA Case",
    qaCategory: safeString(input?.qaCategory) || "BUG",
    issueDescription: safeString(input?.issueDescription),
    targetFixDate: safeString(input?.targetFixDate),
    issueFoundOn: safeString(input?.issueFoundOn),
    devAssigned: safeString(input?.devAssigned),
    severity: safeString(input?.severity) || "Medium",
    priority: safeString(input?.priority) || "Normal",
    status: safeString(input?.status) || "IN PROGRESS",
    consoleEvidence: safeString(input?.consoleEvidence),
    expectedResult: safeString(input?.expectedResult),
    actualResult: safeString(input?.actualResult),
    stepsToReproduce: safeString(input?.stepsToReproduce),
    devComments: safeString(input?.devComments),
    mediaUrls,
    mediaUrl: mediaUrls[0] || "",
    updatedAt: Number(input?.updatedAt || Date.now()),
    spItemId: safeString(input?.spItemId)
  };
}

function toSlug(value) {
  return safeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "none";
}

function buildLabels(task) {
  return Array.from(
    new Set([
      QA_LABEL,
      `status:${toSlug(task.status)}`,
      `priority:${toSlug(task.priority)}`,
      `severity:${toSlug(task.severity)}`,
      `qa:${toSlug(task.qaCategory)}`
    ])
  );
}

function buildIssueBody(task) {
  const mediaLines = task.mediaUrls.length ? task.mediaUrls.join("\n") : "-";
  const meta = {
    id: task.id,
    qaCategory: task.qaCategory,
    issueDescription: task.issueDescription,
    targetFixDate: task.targetFixDate,
    issueFoundOn: task.issueFoundOn,
    devAssigned: task.devAssigned,
    severity: task.severity,
    priority: task.priority,
    status: task.status,
    consoleEvidence: task.consoleEvidence,
    expectedResult: task.expectedResult,
    actualResult: task.actualResult,
    stepsToReproduce: task.stepsToReproduce,
    devComments: task.devComments,
    mediaUrls: task.mediaUrls,
    updatedAt: task.updatedAt
  };

  return [
    "## QA Case",
    "",
    `- Date Reported: ${task.issueFoundOn || "-"}`,
    `- Target Fix Date: ${task.targetFixDate || "-"}`,
    `- Status: ${task.status || "-"}`,
    `- Priority: ${task.priority || "-"}`,
    `- Severity: ${task.severity || "-"}`,
    `- Dev Assigned: ${task.devAssigned || "-"}`,
    `- QA Category: ${task.qaCategory || "-"}`,
    "",
    "### Bug/Issue Description",
    task.issueDescription || "-",
    "",
    "### Expected result",
    task.expectedResult || "-",
    "",
    "### Actual result",
    task.actualResult || "-",
    "",
    "### Steps to Reproduce",
    task.stepsToReproduce || "-",
    "",
    "### Console/Network Evidence",
    task.consoleEvidence || "-",
    "",
    "### DEV Comments",
    task.devComments || "-",
    "",
    "### Media URLs",
    mediaLines,
    "",
    `<!-- ${META_START}`,
    JSON.stringify(meta, null, 2),
    `${META_END} -->`
  ].join("\n");
}

function parseIssueMeta(body) {
  const text = safeString(body);
  const match = text.match(new RegExp(`<!--\\s*${META_START}\\s*([\\s\\S]*?)\\s*${META_END}\\s*-->`));
  if (!match || !match[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function issueToTask(issue) {
  const meta = parseIssueMeta(issue?.body) || {};
  const mediaUrls = Array.isArray(meta.mediaUrls) ? meta.mediaUrls.map((x) => safeString(x)).filter(Boolean) : [];
  return {
    spItemId: String(issue?.number || ""),
    githubIssueId: String(issue?.id || ""),
    githubIssueNumber: Number(issue?.number || 0),
    id: safeString(meta.id) || `GH-${issue?.number}`,
    title: safeString(issue?.title),
    qaCategory: safeString(meta.qaCategory) || "BUG",
    issueDescription: safeString(meta.issueDescription),
    targetFixDate: safeString(meta.targetFixDate),
    issueFoundOn: safeString(meta.issueFoundOn),
    devAssigned: safeString(meta.devAssigned),
    severity: safeString(meta.severity) || "Medium",
    priority: safeString(meta.priority) || "Normal",
    status: safeString(meta.status) || "IN PROGRESS",
    consoleEvidence: safeString(meta.consoleEvidence),
    expectedResult: safeString(meta.expectedResult),
    actualResult: safeString(meta.actualResult),
    stepsToReproduce: safeString(meta.stepsToReproduce),
    devComments: safeString(meta.devComments),
    mediaUrls,
    mediaUrl: mediaUrls[0] || "",
    updatedAt: Number(meta.updatedAt || Date.parse(issue?.updated_at || "") || Date.now())
  };
}

async function githubFetch(pathname, options = {}) {
  ensureConfig();
  const response = await fetch(`${GITHUB_API_BASE}${pathname}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`GitHub ${response.status}: ${text}`);
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) return null;
  return response.json();
}

app.get("/api/qa/health", (_req, res) => {
  try {
    ensureConfig();
    res.json({ ok: true, provider: "github-issues", repo: `${GITHUB_OWNER}/${GITHUB_REPO}` });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message });
  }
});

app.get("/api/qa/tasks", async (_req, res) => {
  try {
    const all = [];
    let page = 1;
    while (page <= 10) {
      const issues = await githubFetch(
        `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues?state=open&per_page=100&page=${page}`
      );
      if (!Array.isArray(issues) || !issues.length) break;
      const filtered = issues
        .filter((issue) => !issue.pull_request)
        .filter((issue) => {
          const labels = (issue.labels || []).map((x) =>
            safeString(typeof x === "string" ? x : x?.name).toLowerCase()
          );
          return labels.includes(QA_LABEL) || safeString(issue.body).includes(META_START);
        });
      all.push(...filtered);
      if (issues.length < 100) break;
      page += 1;
    }

    const tasks = all.map(issueToTask).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json(tasks);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/qa/tasks", async (req, res) => {
  try {
    const task = sanitizeTaskPayload(req.body || {});
    const payload = {
      title: task.title,
      body: buildIssueBody(task),
      labels: buildLabels(task)
    };
    const created = await githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    res.status(201).json(issueToTask(created));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.patch("/api/qa/tasks/:issueNumber", async (req, res) => {
  try {
    const issueNumber = safeString(req.params.issueNumber);
    if (!issueNumber) {
      res.status(400).json({ error: "Missing issue number." });
      return;
    }
    const task = sanitizeTaskPayload(req.body || {});
    const payload = {
      title: task.title,
      body: buildIssueBody(task),
      labels: buildLabels(task)
    };
    const updated = await githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    res.json(issueToTask(updated));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.delete("/api/qa/tasks/:issueNumber", async (req, res) => {
  try {
    const issueNumber = safeString(req.params.issueNumber);
    if (!issueNumber) {
      res.status(400).json({ error: "Missing issue number." });
      return;
    }
    await githubFetch(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issueNumber}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "closed" })
    });
    res.status(204).send();
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.use(express.static(__dirname, { extensions: ["html"] }));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Hydro QA Tracker running on http://localhost:${PORT}`);
});
