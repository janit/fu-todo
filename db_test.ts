import { assertEquals } from "@std/assert";

// db.ts opens its database on import, so point it somewhere disposable first.
Deno.env.set("TODO_DB", ":memory:");
const { addTodo, clearDone, deleteTodo, listTodos, toggleTodo } = await import("./db.ts");

Deno.test("addTodo refuses a title that is not a string", () => {
  // Straight from a JSON body: anything a client sends arrives here.
  for (const title of [123, ["x"], { x: 1 }, null, undefined, true]) {
    assertEquals(addTodo(title), null);
  }
});

Deno.test("addTodo strips NUL, which SQLite would silently cut the title at", () => {
  assertEquals(addTodo("\0"), null);
  assertEquals(addTodo(" \0 "), null);
  assertEquals(addTodo("hello\0world")?.title, "helloworld");
});

Deno.test("addTodo trims and caps what it stores", () => {
  assertEquals(addTodo("  buy milk  ")?.title, "buy milk");
  assertEquals(addTodo("x".repeat(500))?.title.length, 200);
});

Deno.test("a new database is seeded with the starter list", () => {
  const titles = listTodos().map((t) => t.title);
  assertEquals(titles.includes("Have fun together"), true);
});

Deno.test("toggle flips done both ways, and a missing id is null", () => {
  const t = addTodo("flip me")!;
  assertEquals(toggleTodo(t.id)?.done, 1);
  assertEquals(toggleTodo(t.id)?.done, 0);
  assertEquals(toggleTodo(9_999_999), null);
});

Deno.test("delete reports whether it removed anything", () => {
  const t = addTodo("delete me")!;
  assertEquals(deleteTodo(t.id), true);
  assertEquals(deleteTodo(t.id), false);
});

Deno.test("clearDone removes only finished todos, and the list puts open ones first", () => {
  const open = addTodo("still open")!;
  const done = addTodo("finished")!;
  toggleTodo(done.id);
  const list = listTodos();
  assertEquals(
    list.findIndex((t) => t.id === open.id) < list.findIndex((t) => t.id === done.id),
    true,
  );
  assertEquals(clearDone() >= 1, true);
  assertEquals(listTodos().some((t) => t.id === done.id), false);
  assertEquals(listTodos().some((t) => t.id === open.id), true);
});

Deno.test("clearing everything and reopening does not bring the starter list back", async () => {
  // Seeding keys on the table not existing, not on it being empty. That takes
  // two processes against one file, since the module opens its database once.
  const dir = await Deno.makeTempDir();
  const run = async (code: string) => {
    const out = await new Deno.Command(Deno.execPath(), {
      args: [
        "eval",
        "--no-check",
        `const db = await import(${JSON.stringify(import.meta.resolve("./db.ts"))}); ${code}`,
      ],
      env: { TODO_DB: `${dir}/todos.db` },
    }).output();
    if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
    return new TextDecoder().decode(out.stdout).trim();
  };
  assertEquals(await run("console.log(db.listTodos().length)"), "5");
  await run("for (const t of db.listTodos()) db.deleteTodo(t.id)");
  assertEquals(await run("console.log(db.listTodos().length)"), "0");
  await Deno.remove(dir, { recursive: true });
});
