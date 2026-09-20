import { assertEquals } from "@std/assert";
import { compose } from "@janit/fu";
import type { Ctx } from "@janit/fu";
import type { State } from "../state.ts";
import { apiJson, bodyLimit, sameOrigin } from "./core.ts";

const ORIGIN = "http://todo.example";

function ctx(
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Ctx<State> {
  const url = new URL(ORIGIN + path);
  return {
    req: new Request(url, { method, headers }),
    url,
    params: {},
    state: { requestId: "test", startedAt: 0 },
    head: {},
    next: () => Promise.reject(new Error("not composed")),
  };
}

/** Run one middleware with a terminal that reports whether it was reached. */
async function run(
  mw: Parameters<typeof compose<State>>[0][number],
  c: Ctx<State>,
): Promise<{ status: number; reached: boolean }> {
  let reached = false;
  const res = await compose<State>([mw], () => {
    reached = true;
    return new Response("handler");
  })(c);
  return { status: res.status, reached };
}

Deno.test("sameOrigin lets safe methods through whoever asks", async () => {
  for (const method of ["GET", "HEAD"]) {
    const r = await run(sameOrigin, ctx(method, "/", { "sec-fetch-site": "cross-site" }));
    assertEquals(r.reached, true, `${method} should not be gated`);
  }
});

Deno.test("sameOrigin accepts our own page and a typed-in URL", async () => {
  for (const site of ["same-origin", "none"]) {
    const r = await run(sameOrigin, ctx("POST", "/api/todos/1", { "sec-fetch-site": site }));
    assertEquals(r.reached, true, `sec-fetch-site: ${site} should pass`);
  }
});

Deno.test("sameOrigin blocks the two endpoints reachable as simple requests", async () => {
  // POST /api/todos/:id carries no body and no custom header, and POST / takes
  // urlencoded form data: both are CORS-safelisted, so a browser sends them
  // cross-site with no preflight to refuse.
  const toggle = await run(
    sameOrigin,
    ctx("POST", "/api/todos/1", { "sec-fetch-site": "cross-site" }),
  );
  assertEquals(toggle.status, 403);
  assertEquals(toggle.reached, false);

  const add = await run(sameOrigin, ctx("POST", "/", { "sec-fetch-site": "cross-site" }));
  assertEquals(add.status, 403);
  assertEquals(add.reached, false);
});

Deno.test("sameOrigin treats a same-site subdomain as somebody else", async () => {
  const r = await run(sameOrigin, ctx("DELETE", "/api/todos", { "sec-fetch-site": "same-site" }));
  assertEquals(r.status, 403);
});

Deno.test("sameOrigin falls back to Origin when Sec-Fetch-Site is absent", async () => {
  const same = await run(sameOrigin, ctx("POST", "/", { origin: ORIGIN }));
  assertEquals(same.reached, true);

  const other = await run(sameOrigin, ctx("POST", "/", { origin: "http://evil.example" }));
  assertEquals(other.status, 403);

  // A TLS-terminating proxy leaves ctx.url on http while the browser says
  // https, so the comparison is on host, not on the whole origin.
  const proxied = await run(sameOrigin, ctx("POST", "/", { origin: "https://todo.example" }));
  assertEquals(proxied.reached, true);

  // The opaque origin of a sandboxed frame or a cross-site redirect.
  const opaque = await run(sameOrigin, ctx("POST", "/", { origin: "null" }));
  assertEquals(opaque.status, 403);
});

Deno.test("sameOrigin lets a request with no browser headers at all through", async () => {
  // curl and other API clients send neither header. They are not a browser
  // being steered by a third-party page, which is the whole threat here.
  const r = await run(sameOrigin, ctx("DELETE", "/api/todos/1"));
  assertEquals(r.reached, true);
});

Deno.test("sameOrigin answers in the shape the path speaks", async () => {
  const api = await compose<State>([sameOrigin], () => new Response("x"))(
    ctx("POST", "/api/todos/1", { "sec-fetch-site": "cross-site" }),
  );
  assertEquals(api.headers.get("content-type"), "application/json");
  assertEquals(await api.json(), { error: "cross-site request" });

  const page = await compose<State>([sameOrigin], () => new Response("x"))(
    ctx("POST", "/", { "sec-fetch-site": "cross-site" }),
  );
  assertEquals(page.headers.get("content-type"), "text/plain; charset=utf-8");
});

Deno.test("bodyLimit ignores requests that carry nothing", async () => {
  const none = await run(bodyLimit, ctx("POST", "/api/todos/1"));
  assertEquals(none.reached, true);
  const empty = await run(bodyLimit, ctx("DELETE", "/api/todos", { "content-length": "0" }));
  assertEquals(empty.reached, true);
  const small = await run(bodyLimit, ctx("POST", "/api/todos", { "content-length": "42" }));
  assertEquals(small.reached, true);
});

Deno.test("bodyLimit refuses a body bigger than the cap before it is parsed", async () => {
  const big = await run(
    bodyLimit,
    ctx("POST", "/api/todos", { "content-length": String(400_000_000) }),
  );
  assertEquals(big.status, 413);
  assertEquals(big.reached, false);
  // Exactly at the cap is still fine; one byte over is not.
  assertEquals(
    (await run(bodyLimit, ctx("POST", "/x", { "content-length": "32768" }))).reached,
    true,
  );
  assertEquals(
    (await run(bodyLimit, ctx("POST", "/x", { "content-length": "32769" }))).status,
    413,
  );
});

Deno.test("bodyLimit refuses a chunked body, whose size is unknowable up front", async () => {
  const r = await run(
    bodyLimit,
    ctx("POST", "/api/todos", { "transfer-encoding": "chunked" }),
  );
  assertEquals(r.status, 411);
  assertEquals(r.reached, false);
});

Deno.test("bodyLimit leaves reads alone", async () => {
  const r = await run(bodyLimit, ctx("GET", "/api/todos", { "content-length": "400000000" }));
  assertEquals(r.reached, true);
});

/** What the framework sends when no handler answered: the rendered error page. */
const errorPage = (status: number) => () =>
  new Response(`<h2>${status}</h2>`, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

Deno.test("apiJson turns the framework's error page under /api/ into JSON", async () => {
  const wrongMethod = await compose<State>([apiJson], errorPage(405))(ctx("PUT", "/api/todos"));
  assertEquals(wrongMethod.status, 405);
  assertEquals(await wrongMethod.json(), { error: "Method Not Allowed" });

  const unknown = await compose<State>([apiJson], errorPage(404))(ctx("GET", "/api/nope"));
  assertEquals(unknown.status, 404);
  assertEquals(await unknown.json(), { error: "Not Found" });
});

Deno.test("apiJson leaves pages, successes and a handler's own JSON alone", async () => {
  const page = await compose<State>([apiJson], errorPage(404))(ctx("GET", "/nope"));
  assertEquals(page.headers.get("content-type"), "text/html; charset=utf-8");

  const ok = await compose<State>([apiJson], () => new Response("fine"))(ctx("GET", "/api/todos"));
  assertEquals(await ok.text(), "fine");

  const own = await compose<State>(
    [apiJson],
    () => Response.json({ error: "not found" }, { status: 404 }),
  )(ctx("POST", "/api/todos/9"));
  assertEquals(await own.json(), { error: "not found" });
});
