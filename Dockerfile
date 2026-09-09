# Deploying fu-todo.
#
# Nitro's build output is self-contained — one .mjs plus the static assets —
# so the image only needs a runtime and that directory. Build first, then
# package:
#
#   deno task build
#   docker build -t fu-todo .
#   docker run -p 1337:1337 -v fu-todo-data:/data fu-todo
#
# Keeping the build outside the image means this Dockerfile works the same in
# this monorepo (where the framework resolves through ../src) and in the
# standalone janit/fu-todo repo (where it resolves from JSR).

FROM denoland/deno:2.9.6

WORKDIR /app

# The SQLite file lives on a volume so todos survive a redeploy.
ENV TODO_DB=/data/todos.db \
    PORT=1337

COPY .output ./.output

# `deno` is the image's unprivileged user; it must own the database directory.
RUN mkdir -p /data && chown -R deno:deno /data /app
USER deno

VOLUME ["/data"]
EXPOSE 1337

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD ["deno", "eval", "const r = await fetch('http://localhost:1337/healthz'); if (!r.ok) Deno.exit(1)"]

CMD ["run", "--allow-net", "--allow-read", "--allow-write=/data", "--allow-env", ".output/server/index.mjs"]
