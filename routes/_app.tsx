import type { ShellProps } from "@janit/fu";
import type { State } from "../state.ts";

export default function Shell({ ctx, children }: ShellProps<State>) {
  return (
    <div class="page">
      <header>
        <h1>fu-todo</h1>
        <p>A todo app on Fresh Urquell, Deno and SQLite.</p>
      </header>
      {children}
      <footer>
        <span>request {ctx.state.requestId}</span>
      </footer>
    </div>
  );
}
