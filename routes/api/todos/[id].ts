import type { PageContext } from "@janit/fu";
import type { State } from "../../../state.ts";
import { deleteTodo, toggleTodo } from "../../../db.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * A route with handlers but no default export is an API endpoint: every
 * handler returns a Response, so rendering never runs.
 */
export const handlers = {
  POST(ctx: PageContext<State>) {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id)) return json({ error: "bad id" }, 400);
    const todo = toggleTodo(id);
    return todo ? json({ todo }) : json({ error: "not found" }, 404);
  },
  DELETE(ctx: PageContext<State>) {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id)) return json({ error: "bad id" }, 400);
    return deleteTodo(id) ? json({ ok: true }) : json({ error: "not found" }, 404);
  },
};
