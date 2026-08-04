import { test } from "node:test";
import assert from "node:assert/strict";
import { isParityVisit, looksLikeDevHost, selectDeletable } from "./cleanup-parity-visits.mjs";

const DAY = 86400000;
const NOW = Date.parse("2026-08-04T12:00:00Z");
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();

const visit = (id, title, daysAgo) => ({ id, title, createdAt: iso(daysAgo), visitReference: `VN${id}` });

test("isParityVisit only accepts titles that START with PARITY-", () => {
  assert.equal(isParityVisit({ title: "PARITY-123" }), true);
  assert.equal(isParityVisit({ title: "PARITY-abc-def" }), true);
  // The server-side title filter is a partial ILIKE, so these can come back
  // from the query and must be rejected before any delete.
  assert.equal(isParityVisit({ title: "Site PARITY-123 survey" }), false);
  assert.equal(isParityVisit({ title: "parity-123" }), false, "case sensitive");
  assert.equal(isParityVisit({ title: "Real customer visit" }), false);
  assert.equal(isParityVisit({ title: "" }), false);
  assert.equal(isParityVisit({}), false);
  assert.equal(isParityVisit(null), false);
});

test("looksLikeDevHost is a positive allowlist - anything unrecognised is refused", () => {
  assert.equal(looksLikeDevHost("https://hydrocert-dev-api-exajhpd0brg2bcar.ukwest-01.azurewebsites.net"), true);
  assert.equal(looksLikeDevHost("https://api.dev.gen-cert.com"), true);
  // Prod and near-miss hosts must NOT pass.
  assert.equal(looksLikeDevHost("https://api.gen-cert.com"), false);
  assert.equal(looksLikeDevHost("https://hydrocert-prod-api.azurewebsites.net"), false);
  assert.equal(looksLikeDevHost(""), false);
  assert.equal(looksLikeDevHost(undefined), false);
});

test("selectDeletable keeps the newest N and deletes oldest first", () => {
  const visits = [
    visit("a", "PARITY-1", 30),
    visit("b", "PARITY-2", 20),
    visit("c", "PARITY-3", 10),
    visit("d", "PARITY-4", 9),
    visit("e", "PARITY-5", 8),
  ];
  const out = selectDeletable(visits, { keepNewest: 2, minAgeDays: 3, now: NOW });
  assert.deepEqual(out.map((v) => v.id), ["a", "b", "c"], "oldest first, newest 2 kept");
});

test("selectDeletable never touches visits younger than minAgeDays", () => {
  const visits = [
    visit("old", "PARITY-old", 40),
    visit("today", "PARITY-today", 0),
    visit("yesterday", "PARITY-y", 1),
  ];
  const out = selectDeletable(visits, { keepNewest: 0, minAgeDays: 3, now: NOW });
  assert.deepEqual(out.map((v) => v.id), ["old"]);
});

test("selectDeletable ignores non-PARITY visits entirely", () => {
  const visits = [
    visit("real1", "Legionella survey", 100),
    visit("real2", "Site PARITY-x embedded", 100),
    visit("test1", "PARITY-999", 100),
  ];
  const out = selectDeletable(visits, { keepNewest: 0, minAgeDays: 1, now: NOW });
  assert.deepEqual(out.map((v) => v.id), ["test1"]);
});

test("selectDeletable fails closed on an unparsable createdAt", () => {
  const visits = [
    { id: "nodate", title: "PARITY-nodate" },
    { id: "baddate", title: "PARITY-bad", createdAt: "not-a-date" },
    visit("good", "PARITY-good", 50),
  ];
  const out = selectDeletable(visits, { keepNewest: 0, minAgeDays: 1, now: NOW });
  assert.deepEqual(out.map((v) => v.id), ["good"], "age-unknown rows are never deleted");
});

test("selectDeletable honours excludeIds (the live run's visit)", () => {
  const visits = [visit("live", "PARITY-live", 50), visit("other", "PARITY-other", 60)];
  const out = selectDeletable(visits, {
    keepNewest: 0, minAgeDays: 1, now: NOW, excludeIds: new Set(["live"]),
  });
  assert.deepEqual(out.map((v) => v.id), ["other"]);
});

test("selectDeletable returns nothing for an empty or all-recent set", () => {
  assert.deepEqual(selectDeletable([], { now: NOW }), []);
  assert.deepEqual(selectDeletable(null, { now: NOW }), []);
  const recent = [visit("r", "PARITY-r", 0)];
  assert.deepEqual(selectDeletable(recent, { keepNewest: 5, minAgeDays: 3, now: NOW }), []);
});

test("selectDeletable skips records with no id", () => {
  const visits = [{ title: "PARITY-noid", createdAt: iso(50) }, visit("ok", "PARITY-ok", 60)];
  const out = selectDeletable(visits, { keepNewest: 0, minAgeDays: 1, now: NOW });
  assert.deepEqual(out.map((v) => v.id), ["ok"]);
});
