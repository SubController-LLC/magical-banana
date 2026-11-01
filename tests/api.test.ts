import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHandler } from "../server/judge";
test("API validates authorization, payload, methods and returns only advisory verdicts", async () => {
  process.env.AI_ENABLED = "true";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.JUDGE_ACCESS_CODE = "test-code";
  let calls = 0;
  const server = createServer(
    createHandler(async (input) => {
      calls++;
      return {
        verdict: input.explanation ? "safe" : "explain",
        recommendation: input.explanation ? "safe" : "unknown",
        source: "ai",
        comment: "その説明ならアリ！",
      };
    }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  const url = `http://127.0.0.1:${addr.port}`;
  try {
    assert.deepEqual(await (await fetch(url)).json(), { enabled: true });
    assert.equal((await fetch(url, { method: "POST" })).status, 401);
    assert.equal((await fetch(url, { method: "DELETE" })).status, 405);
    const post = (body: unknown) =>
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-code",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await post({ from: "a", to: "b", key: "unexpected" })).status,
      400,
    );
    assert.equal(
      (await post({ from: "a", to: "b", explanation: "x".repeat(1201) }))
        .status,
      400,
    );
    const r = await post({
      from: "バナナ",
      to: "宇宙船",
      explanation: "動画でバナナ形の船を見た",
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).verdict, "safe");
    assert.equal(calls, 1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
test("AI failure returns unknown and never out", async () => {
  process.env.AI_ENABLED = "true";
  process.env.OPENAI_API_KEY = "test";
  process.env.JUDGE_ACCESS_CODE = "code";
  const server = createServer(
    createHandler(async () => {
      throw new Error("failure");
    }),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  try {
    const r = await fetch(`http://127.0.0.1:${addr.port}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer code",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: "犬", to: "社長" }),
    });
    assert.equal(r.status, 503);
    const data = await r.json();
    assert.equal(data.verdict, "unknown");
    assert.equal(data.source, "unavailable");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
