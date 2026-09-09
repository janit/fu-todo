import { useComputed, useSignal } from "@preact/signals";
import type { Todo } from "../db.ts";
import styles from "./todo.module.css";

/**
 * The whole interactive surface. Server-rendered with `initial`, then hydrated;
 * mutations go to /api/todos and update local signals, so the list never
 * round-trips a full page.
 */
export default function TodoList({ initial }: { initial: Todo[] }) {
  const todos = useSignal<Todo[]>(initial);
  const draft = useSignal("");
  const busy = useSignal(false);
  const remaining = useComputed(() => todos.value.filter((t) => !t.done).length);

  async function add(e: Event) {
    e.preventDefault();
    const title = draft.value.trim();
    if (!title || busy.value) return;
    busy.value = true;
    try {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const { todo } = await res.json() as { todo: Todo };
        todos.value = [todo, ...todos.value];
        draft.value = "";
      }
    } finally {
      busy.value = false;
    }
  }

  async function toggle(id: number) {
    // Optimistic: flip locally, reconcile from the server response.
    todos.value = todos.value.map((t) => t.id === id ? { ...t, done: t.done ? 0 : 1 } : t);
    const res = await fetch(`/api/todos/${id}`, { method: "POST" });
    if (!res.ok) {
      todos.value = todos.value.map((t) => t.id === id ? { ...t, done: t.done ? 0 : 1 } : t);
    }
  }

  async function remove(id: number) {
    const before = todos.value;
    todos.value = todos.value.filter((t) => t.id !== id);
    const res = await fetch(`/api/todos/${id}`, { method: "DELETE" });
    if (!res.ok) todos.value = before;
  }

  async function clearDone() {
    const before = todos.value;
    todos.value = todos.value.filter((t) => !t.done);
    const res = await fetch("/api/todos", { method: "DELETE" });
    if (!res.ok) todos.value = before;
  }

  return (
    <section>
      {/* Also a real POST target, so adding works without JavaScript. */}
      <form class={styles.form} method="post" action="/" onSubmit={add}>
        <input
          class={styles.input}
          name="title"
          id="new-todo"
          placeholder="What needs doing?"
          value={draft}
          onInput={(e) => draft.value = (e.target as HTMLInputElement).value}
          autocomplete="off"
        />
        <button class={styles.add} type="submit" disabled={busy}>Add</button>
      </form>

      {todos.value.length === 0
        ? <p class={styles.empty} id="empty">Nothing yet. Add the first one.</p>
        : (
          <ul class={styles.list} id="todos">
            {todos.value.map((t) => (
              <li key={t.id} class={styles.item} data-id={t.id}>
                <input
                  class={styles.check}
                  type="checkbox"
                  checked={!!t.done}
                  onChange={() => toggle(t.id)}
                  aria-label={`Toggle ${t.title}`}
                />
                <span class={`${styles.title} ${t.done ? styles.done : ""}`}>{t.title}</span>
                <button
                  class={styles.remove}
                  type="button"
                  onClick={() => remove(t.id)}
                  aria-label={`Delete ${t.title}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

      <div class={styles.meta}>
        <span id="remaining">{remaining} remaining</span>
        <button class={styles.clear} type="button" onClick={clearDone}>Clear done</button>
      </div>
    </section>
  );
}
