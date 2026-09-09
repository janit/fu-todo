import type { PageContext } from "@janit/fu";
import type { State } from "../state.ts";
import { addTodo, listTodos, type Todo } from "../db.ts";
import TodoList from "../islands/TodoList.tsx";

export const handlers = {
  GET(ctx: PageContext<State>) {
    ctx.head.title = "fu-todo";
    ctx.head.description = "A todo app on Fresh Urquell, Deno and SQLite.";
    return { todos: listTodos() };
  },
  /** Progressive enhancement: the form works with JavaScript disabled. */
  async POST(ctx: PageContext<State>) {
    const form = await ctx.req.formData();
    addTodo(String(form.get("title") ?? ""));
    return new Response(null, { status: 303, headers: { location: "/" } });
  },
};

export default function Home(ctx: PageContext<State>) {
  const { todos } = ctx.data as { todos: Todo[] };
  return <TodoList initial={todos} />;
}
