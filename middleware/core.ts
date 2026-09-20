import { statusText } from "@janit/fu";
import type { Ctx, Middleware } from "@janit/fu";
import type { State } from "../state.ts";
import { DEV } from "../env.ts";

/** Tag each request and time it. Registered outermost so it sees the total. */
export const requestLog: Middleware<State> = async (ctx) => {
  ctx.state.requestId = crypto.randomUUID().slice(0, 8);
  ctx.state.startedAt = Date.now();
  const res = await ctx.next();
  const ms = Date.now() - ctx.state.startedAt;
  console.log(
    `[${ctx.state.requestId}] ${ctx.req.method} ${ctx.url.pathname} ${res.status} ${ms}ms`,
  );
  res.headers.set("X-Request-Id", ctx.state.requestId);
  return res;
};

/** API responses and errors must never be cached. */
export const noStore: Middleware<State> = async (ctx) => {
  const res = await ctx.next();
  if (ctx.url.pathname.startsWith("/api/") || res.status >= 400) {
    res.headers.set("Cache-Control", "no-store");
  }
  return res;
};

/**
 * Keep `/api/*` speaking JSON when the framework answers instead of a handler.
 * An unknown endpoint's 404 and a wrong method's 405 are rendered through
 * `routes/_error.tsx` as HTML — right for a browser tab, useless to the
 * island's `fetch`. Anything a handler already wrote as JSON passes through.
 */
export const apiJson: Middleware<State> = async (ctx) => {
  const res = await ctx.next();
  if (
    !ctx.url.pathname.startsWith("/api/") || res.status < 400 ||
    res.headers.get("content-type")?.startsWith("application/json")
  ) return res;
  await res.body?.cancel();
  return Response.json({ error: statusText(res.status) }, { status: res.status });
};

/**
 * The policy is this strict because the framework's shell earns it: every
 * script it emits is an external `type="module"` with a `src`, and neither the
 * app nor the dev server's CSS swap ever writes an inline `<style>`. So there
 * is nothing here to grant `'unsafe-inline'` for, and the one real defence
 * against an escaping bug in Preact costs nothing to turn on.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  // 'self' covers same-origin ws:// as well, but the dev server's HMR socket
  // listens on port+1, and a different port is a different origin — so dev,
  // and only dev, has to name it.
  DEV ? "connect-src 'self' ws://localhost:* ws://127.0.0.1:*" : "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
].join("; ");

export const securityHeaders: Middleware<State> = async (ctx) => {
  const res = await ctx.next();
  res.headers.set("Content-Security-Policy", CSP);
  res.headers.set("X-Content-Type-Options", "nosniff");
  // DENY rather than SAMEORIGIN, to say the same thing as frame-ancestors.
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return res;
};

/** The methods that change something, and so need guarding. */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Whether the request was driven by a page on somebody else's site.
 *
 * Not every mutating endpoint here is reachable cross-site — `POST /api/todos`
 * sends JSON and every `DELETE` is a non-safelisted method, so the browser
 * preflights them and the framework answers OPTIONS with 405. But
 * `POST /api/todos/:id` carries no body and no custom header, and `POST /`
 * takes urlencoded form data: both are simple requests, sent with no preflight
 * to refuse. Those two are why this exists.
 */
function crossSite(ctx: Ctx<State>): boolean {
  // Sec-Fetch-Site is the direct answer and every current browser sends it.
  // "none" is someone typing the URL or following a bookmark; "same-origin" is
  // our own page. Everything else — "cross-site", and "same-site" for a
  // neighbouring subdomain — is another page steering the user's browser.
  const site = ctx.req.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";

  // Older browsers: fall back to Origin, comparing hosts rather than whole
  // origins, because a TLS-terminating proxy leaves ctx.url on http while the
  // browser reports https.
  const origin = ctx.req.headers.get("origin");
  if (!origin) return false; // curl and other API clients; not the threat here
  try {
    return new URL(origin).host !== ctx.url.host;
  } catch {
    return true; // "null": a sandboxed frame or a cross-site redirect
  }
}

/**
 * Refuse cross-site writes. The app has no cookies and no session, so SameSite
 * offers nothing and this header check is the whole defence.
 *
 * It returns rather than throws `HttpError`: a middleware that throws unwinds
 * past the chain straight to the error renderer, so the response would come
 * back without the headers and request id the middleware above set.
 */
export const sameOrigin: Middleware<State> = (ctx) => {
  if (!MUTATING.has(ctx.req.method) || !crossSite(ctx)) return ctx.next();
  return ctx.url.pathname.startsWith("/api/")
    ? Response.json({ error: "cross-site request" }, { status: 403 })
    : new Response("403 Forbidden", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
};

/** Bytes a request body may carry. Titles cap at 200 chars; this is generous. */
const MAX_BODY = 32 * 1024;

/**
 * Reject an oversized body before anything reads it, so `ctx.req.json()` cannot
 * be handed 400 MB to parse on the one thread this server has.
 *
 * A cheap gate on the declared length, not a hard cap: an HTTP/2 client can
 * send a body with neither header, and only a proxy in front can bound that.
 */
export const bodyLimit: Middleware<State> = (ctx) => {
  if (!MUTATING.has(ctx.req.method)) return ctx.next();

  // Chunked means the size is unknown until it has all arrived — which is the
  // thing being avoided. Nothing this app talks to sends one.
  if (ctx.req.headers.get("transfer-encoding")?.toLowerCase().includes("chunked")) {
    return Response.json({ error: "length required" }, { status: 411 });
  }
  if (Number(ctx.req.headers.get("content-length") ?? 0) > MAX_BODY) {
    return Response.json({ error: "body too large" }, { status: 413 });
  }
  return ctx.next();
};

export const healthz: Middleware<State> = (ctx) =>
  ctx.url.pathname === "/healthz" ? new Response("ok") : ctx.next();
