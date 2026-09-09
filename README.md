# fu-todo

A todo app built with [Fresh Urquell](https://github.com/janit/fu), Deno and
SQLite. It exists to be a small, complete example of what the framework looks
like in a real app: middleware, an island, a JSON API, server-rendered state and
persistence.

## Run it

```sh
deno task dev      # dev server with HMR on :1337
deno task build    # production build into .output
deno task start    # serve the build
```

The database is created on first write at `./data/todos.db`. Point `TODO_DB`
somewhere else to move it.

## Deploy it

Nitro's build output is self-contained, so the image only needs a runtime and
`.output`:

```sh
deno task build
docker build -t fu-todo .
docker run -p 1337:1337 -v fu-todo-data:/data fu-todo
```

Or with compose, which sets up the named volume for you:

```sh
deno task build && docker compose up --build
```

The SQLite file lives on the `/data` volume so todos survive a redeploy. The
image runs as the unprivileged `deno` user and has a healthcheck on `/healthz`.

## What it shows

**Middleware** (`app.ts`, `middleware/core.ts`) — request logging with timing
and an `X-Request-Id`, security headers, `no-store` on API and error responses,
and a `/healthz` short-circuit. Registration order is outermost first, so the
logger wraps everything and still sees short-circuited responses.

**An island** (`islands/TodoList.tsx`) — the whole interactive surface. It is
server-rendered from SQLite, then hydrated. Adds, toggles and deletes are
optimistic: local signals update immediately and roll back if the request fails.

**Progressive enhancement** — the add form is a real `POST /` with a 303
redirect, so it works with JavaScript disabled. The island intercepts `submit`
when it is available.

**A JSON API** (`routes/api/todos/`) — routes that export `handlers` but no
default component never render; every handler returns a `Response`.
`[id].ts` shows a dynamic segment.

**Page metadata** — the route handler writes `ctx.head.title` and
`ctx.head.description`; the framework renders them into `<head>`.

**CSS Modules** (`islands/todo.module.css`) — scoped class names with native
nesting and `color-mix`, compiled by lightningcss.

## Runtimes

The build output is portable, and so is the app: it runs on Deno, Node and Bun.
Nitro picks its preset from whatever builds it, so build under Node — or set
`NITRO_PRESET=node-server` — for an artefact that runs on all three.

```sh
NITRO_PRESET=node-server deno task build
node .output/server/index.mjs   # or: bun / deno run -A
```

## Storage

`db.ts` uses `node:sqlite`, which is built into Deno and Node 22+ — no
dependency, no native build step. WAL mode is on so reads do not block the
single writer.

## API

| method | path | does |
|---|---|---|
| `GET` | `/api/todos` | list |
| `POST` | `/api/todos` | add, `{"title": "..."}` |
| `DELETE` | `/api/todos` | clear completed |
| `POST` | `/api/todos/:id` | toggle done |
| `DELETE` | `/api/todos/:id` | delete one |

MIT.
