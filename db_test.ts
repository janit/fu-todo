import { assertEquals } from "@std/assert";

// db.ts opens its database on import, so point it somewhere disposable first.
Deno.env.set("TODO_DB", ":memory:");
const { addTodo } = await import("./db.ts");

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
