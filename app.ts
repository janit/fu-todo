import { App } from "@janit/fu";
import type { State } from "./state.ts";
import {
  apiJson,
  bodyLimit,
  healthz,
  noStore,
  requestLog,
  sameOrigin,
  securityHeaders,
} from "./middleware/core.ts";

const app = new App<State>();

// Outermost first: requestLog wraps everything, so its timing and X-Request-Id
// cover short-circuit responses from further in too.
app.use(requestLog);
app.use(securityHeaders);
app.use(noStore);
// Inside the decorators, so the JSON it swaps in still gets their headers.
app.use(apiJson);
// Both refuse a request outright, so they sit inside the middleware that
// decorate the response and outside anything that would read a body.
app.use(sameOrigin);
app.use(bodyLimit);
app.use(healthz);

export default app;
