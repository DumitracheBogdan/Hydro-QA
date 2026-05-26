import { test } from "node:test";
import assert from "node:assert/strict";
import { makeClient } from "./api.mjs";

test("login posts credentials and stores bearer token", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, json: async () => ({ tokens: { accessToken: "TKN" }, user: { id: "U1" } }) }; };
  const c = makeClient("https://api.dev.example", fakeFetch);
  const user = await c.login("a@b.c", "pw");
  assert.equal(user.id, "U1");
  assert.equal(calls[0].url, "https://api.dev.example/auth/login");
  assert.equal(JSON.parse(calls[0].opts.body).email, "a@b.c");
});

test("get sends bearer token after login", async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    if (url.endsWith("/auth/login")) return { ok: true, status: 200, json: async () => ({ tokens: { accessToken: "TKN" }, user: { id: "U1" } }) };
    return { ok: true, status: 200, json: async () => [{ id: "V1" }] };
  };
  const c = makeClient("https://api.dev.example", fakeFetch);
  await c.login("a@b.c", "pw");
  await c.get("/visits/filter?visitReference=VN1");
  assert.equal(calls[1].opts.headers.Authorization, "Bearer TKN");
});

test("throws with method+path+status on error", async () => {
  const fakeFetch = async () => ({ ok: false, status: 400, json: async () => ({ message: "bad" }) });
  const c = makeClient("https://x", fakeFetch);
  await assert.rejects(() => c.login("a", "b"), /POST \/auth\/login -> 400/);
});
