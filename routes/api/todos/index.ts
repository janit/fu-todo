import type { PageContext } from "@janit/fu";
import type { State } from "../../../state.ts";
import { addTodo, clearDone, listTodos } from "../../../db.ts";

export const handlers = {
  GET: () => Response.json({ todos: listTodos() }),
  async POST(ctx: PageContext<State>) {
    const body = await ctx.req.json().catch(() => null) as { title?: string } | null;
    const todo = addTodo(body?.title ?? "");
    return todo
      ? Response.json({ todo }, { status: 201 })
      : Response.json({ error: "title required" }, { status: 400 });
  },
  DELETE: () => Response.json({ cleared: clearDone() }),
};
