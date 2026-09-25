import { assertEquals, assertMatch } from "@std/assert";
import { createHandler } from "@janit/fu";
import type { RouteManifest } from "@janit/fu";
import type { State } from "./state.ts";

// The whole app as the server runs it: the real middleware chain in app.ts in
// front of the real API routes. db.ts opens its database on import, so point
// it somewhere disposable first.
Deno.env.set("TODO_DB", ":memory:");
const { default: app } = await import("./app.ts");
const manifest: RouteManifest<State> = {
  "/routes/api/todos/index.ts": () => import("./routes/api/todos/index.ts"),
  "/routes/api/todos/[id].ts": () => import("./routes/api/todos/[id].ts"),
};
const handler = createHandler<State>({
  manifest,
  assets: { js: [], css: [] },
  app,
  initialState: () => ({ requestId: "", startedAt: 0 }),
});

const ORIGIN = "http://todo.example";
/** One request, with requestLog's per-request line kept out of the test output. */
async function send(method: string, path: string, init: RequestInit = {}): Promise<Response> {
  const log = console.log;
  console.log = () => {};
  try {
    return await handler(new Request(ORIGIN + path, { method, ...init }));
  } finally {
    console.log = log;
  }
}
const json = { "content-type": "application/json", "sec-fetch-site": "same-origin" };

Deno.test("every response carries the security headers, request id and no-store", async () => {
  for (const [method, path] of [["GET", "/api/todos"], ["GET", "/healthz"], ["GET", "/api/nope"]]) {
    const res = await send(method, path);
    await res.body?.cancel();
    assertMatch(res.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assertEquals(res.headers.get("x-frame-options"), "DENY");
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    assertEquals(res.headers.get("cross-origin-opener-policy"), "same-origin");
    assertMatch(res.headers.get("x-request-id") ?? "", /^[0-9a-f]{8}$/);
    if (path !== "/healthz") assertEquals(res.headers.get("cache-control"), "no-store");
  }
});

Deno.test("healthz answers before any route exists", async () => {
  const res = await send("GET", "/healthz");
  assertEquals([res.status, await res.text()], [200, "ok"]);
});

Deno.test("a cross-site write is refused as JSON and still decorated", async () => {
  const res = await send("POST", "/api/todos/1", { headers: { "sec-fetch-site": "cross-site" } });
  assertEquals(res.status, 403);
  assertEquals(await res.json(), { error: "cross-site request" });
  assertMatch(res.headers.get("x-request-id") ?? "", /^[0-9a-f]{8}$/);
  assertEquals(res.headers.get("x-frame-options"), "DENY");
  assertEquals(res.headers.get("cache-control"), "no-store");
});

Deno.test("the API adds, toggles, deletes and clears", async () => {
  const created = await send("POST", "/api/todos", {
    headers: json,
    body: JSON.stringify({ title: "  write tests  " }),
  });
  assertEquals(created.status, 201);
  const { todo } = await created.json();
  assertEquals([todo.title, todo.done], ["write tests", 0]);

  const toggled = await send("POST", `/api/todos/${todo.id}`, { headers: json });
  assertEquals((await toggled.json()).todo.done, 1);

  const cleared = await send("DELETE", "/api/todos", { headers: json });
  assertEquals((await cleared.json()).cleared >= 1, true);
  const gone = await send("DELETE", `/api/todos/${todo.id}`, { headers: json });
  assertEquals(gone.status, 404);
});

Deno.test("the API refuses bad input in JSON", async () => {
  const cases: [string, string, RequestInit, number][] = [
    ["POST", "/api/todos", { headers: json, body: "{not json" }, 400],
    ["POST", "/api/todos", { headers: json, body: JSON.stringify({ title: "   " }) }, 400],
    ["POST", "/api/todos/abc", { headers: json }, 400],
    ["POST", "/api/todos/999999", { headers: json }, 404],
    ["DELETE", "/api/todos/999999", { headers: json }, 404],
  ];
  for (const [method, path, init, status] of cases) {
    const res = await send(method, path, init);
    assertEquals(res.status, status, `${method} ${path}`);
    assertEquals(typeof (await res.json()).error, "string");
  }
});

Deno.test("a wrong method on the API is a JSON 405 that says what is allowed", async () => {
  const res = await send("PUT", "/api/todos", { headers: json, body: "{}" });
  assertEquals(res.status, 405);
  assertEquals(await res.json(), { error: "Method Not Allowed" });
  assertEquals(res.headers.get("allow"), "GET, POST, DELETE, HEAD, OPTIONS");
});

Deno.test("an oversized body is refused before anything parses it", async () => {
  const body = JSON.stringify({ title: "x".repeat(40_000) });
  // A Request built in-process carries no content-length; a client's does.
  const res = await send("POST", "/api/todos", {
    headers: { ...json, "content-length": String(body.length) },
    body,
  });
  assertEquals(res.status, 413);
  await res.body?.cancel();
});
