import type { PageContext } from "@janit/fu";
import type { State } from "../../../state.ts";
import { deleteTodo, toggleTodo } from "../../../db.ts";

/**
 * A route with handlers but no default export is an API endpoint: every
 * handler returns a Response, so rendering never runs.
 */
export const handlers = {
  POST(ctx: PageContext<State>) {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id)) return Response.json({ error: "bad id" }, { status: 400 });
    const todo = toggleTodo(id);
    return todo ? Response.json({ todo }) : Response.json({ error: "not found" }, { status: 404 });
  },
  DELETE(ctx: PageContext<State>) {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id)) return Response.json({ error: "bad id" }, { status: 400 });
    return deleteTodo(id)
      ? Response.json({ ok: true })
      : Response.json({ error: "not found" }, { status: 404 });
  },
};
