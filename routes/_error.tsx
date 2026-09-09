import type { PageContext } from "@janit/fu";
import type { State } from "../state.ts";

export default function ErrorPage(ctx: PageContext<State>) {
  const { status = 500, message = "Error" } = ctx.error ?? {};
  return (
    <section>
      <h2 id="error-status">{status}</h2>
      <p id="error-message">{message}</p>
      <p><a href="/">Back to the list</a></p>
    </section>
  );
}
