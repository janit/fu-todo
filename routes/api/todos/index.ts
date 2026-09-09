import type { PageContext } from "@janit/fu";
import type { State } from "../../../state.ts";
import { addTodo, clearDone, listTodos } from "../../../db.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const handlers = {
  GET: () => json({ todos: listTodos() }),
  async POST(ctx: PageContext<State>) {
    const body = await ctx.req.json().catch(() => null) as { title?: string } | null;
    const todo = addTodo(body?.title ?? "");
    return todo ? json({ todo }, 201) : json({ error: "title required" }, 400);
  },
  DELETE: () => json({ cleared: clearDone() }),
};
