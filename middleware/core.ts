import type { Middleware } from "@janit/fu";
import type { State } from "../state.ts";

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

export const securityHeaders: Middleware<State> = async (ctx) => {
  const res = await ctx.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
};

export const healthz: Middleware<State> = (ctx) =>
  ctx.url.pathname === "/healthz" ? new Response("ok") : ctx.next();
