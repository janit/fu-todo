/**
 * Read an env var on whichever runtime we are on. `Deno.env` does not exist on
 * Node or Bun, and this app is meant to run on all three — the framework's
 * output is portable, so the app should be too.
 */
export function env(name: string): string | undefined {
  const g = globalThis as {
    Deno?: { env: { get(k: string): string | undefined } };
    process?: { env: Record<string, string | undefined> };
  };
  return g.Deno?.env.get(name) ?? g.process?.env?.[name];
}

/** True inside `fu dev`, which sets this. Never true in a built server. */
export const DEV: boolean = env("FU_DEV") === "1";
