import { App } from "@janit/fu";
import type { State } from "./state.ts";
import { healthz, noStore, requestLog, securityHeaders } from "./middleware/core.ts";

const app = new App<State>();

// Outermost first: requestLog wraps everything, so its timing and X-Request-Id
// cover short-circuit responses from further in too.
app.use(requestLog);
app.use(securityHeaders);
app.use(noStore);
app.use(healthz);

export default app;
