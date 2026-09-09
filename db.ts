import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface Todo {
  id: number;
  title: string;
  done: number;
  created_at: string;
}

const DB_PATH = Deno.env.get("TODO_DB") ?? "./data/todos.db";

function open(): DatabaseSync {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  // WAL keeps reads from blocking the single writer, which matters as soon as
  // more than one request is in flight.
  db.exec("PRAGMA journal_mode = WAL");
  // Whether this is a brand-new database, checked before the table exists.
  const fresh = !db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'todos'",
  ).get();
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      title      TEXT    NOT NULL,
      done       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  if (fresh) seed(db);
  return db;
}

/** Starter list, inserted only when the table is empty. */
const DEFAULT_TODOS = [
  "Have fun together",
  "Explore what you can do together",
  "Make it about just the two of you",
  "Give the relationship more",
  "Realize the moment has arrived",
];

/**
 * Seed a newly created database so the app has something to show on first run.
 * Keyed on the table not having existed rather than on the table being empty:
 * clearing your list and restarting must not resurrect the defaults.
 */
function seed(handle: DatabaseSync): void {
  const insert = handle.prepare("INSERT INTO todos (title) VALUES (?)");
  // Reverse, because the list orders newest first and these read top-down.
  for (const title of [...DEFAULT_TODOS].reverse()) insert.run(title);
}

/** One connection for the process; `node:sqlite` is synchronous and reentrant. */
export const db: DatabaseSync = open();

export function listTodos(): Todo[] {
  return db.prepare(
    "SELECT id, title, done, created_at FROM todos ORDER BY done, id DESC",
  ).all() as unknown as Todo[];
}

export function addTodo(title: string): Todo | null {
  const clean = title.trim().slice(0, 200);
  if (!clean) return null;
  const { lastInsertRowid } = db.prepare("INSERT INTO todos (title) VALUES (?)").run(clean);
  return db.prepare("SELECT id, title, done, created_at FROM todos WHERE id = ?")
    .get(Number(lastInsertRowid)) as unknown as Todo;
}

export function toggleTodo(id: number): Todo | null {
  db.prepare("UPDATE todos SET done = 1 - done WHERE id = ?").run(id);
  return (db.prepare("SELECT id, title, done, created_at FROM todos WHERE id = ?")
    .get(id) ?? null) as unknown as Todo | null;
}

export function deleteTodo(id: number): boolean {
  return db.prepare("DELETE FROM todos WHERE id = ?").run(id).changes > 0;
}

export function clearDone(): number {
  return db.prepare("DELETE FROM todos WHERE done = 1").run().changes;
}
