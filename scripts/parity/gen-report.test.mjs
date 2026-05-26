import { test } from "node:test";
import assert from "node:assert/strict";
import { renderReport } from "./gen-report.mjs";

test("renderReport shows score banner and a row per check", () => {
  const html = renderReport({ runId: "R1", visitRef: "VN9", total: 2, passed: 1, failed: 1,
    checks: [ { id: "2a", direction: "Web->Mobile", status: "PASS", details: "ok" },
              { id: "3a", direction: "Mobile->Web", status: "FAIL", details: "no sig" } ] });
  assert.match(html, /1\/2 PASS/);
  assert.match(html, /VN9/);
  assert.match(html, /2a/);
  assert.match(html, /3a/);
  assert.match(html, /fail">FAIL/);
});
