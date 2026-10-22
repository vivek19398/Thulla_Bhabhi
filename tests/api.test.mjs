import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../api/game.js";
const store = {
  async read() {
    return null;
  },
  async write() {},
};
async function send(req) {
  let body;
  const res = {
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(v) {
      body = JSON.parse(v);
    },
  };
  await createHandler(store)(
    { method: "POST", headers: { host: "game.test" }, ...req },
    res,
  );
  return { status: res.statusCode, body, headers: res.headers };
}
test("request boundary rejects malformed, oversized, cross-origin and wrong method", async () => {
  for (const [req, status] of [
    [{ method: "GET" }, 405],
    [{ body: "{" }, 400],
    [{ body: null }, 400],
    [{ body: { action: "create", name: "x".repeat(5000) } }, 413],
    [
      {
        headers: { host: "game.test", origin: "https://other.test" },
        body: {},
      },
      403,
    ],
  ])
    assert.equal((await send(req)).status, status);
});
test("Vercel parser HTTP 400 is not misreported as a storage outage", async () => {
  const req = {
    method: "POST",
    headers: { host: "game.test" },
    get body() {
      throw Object.assign(Error("Invalid JSON"), { statusCode: 400 });
    },
  };
  let body;
  const res = {
    setHeader() {},
    end(v) {
      body = JSON.parse(v);
    },
  };
  await createHandler(store)(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(body.error, "Invalid request.");
});
