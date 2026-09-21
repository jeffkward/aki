import type { Handler, MiddlewareHandler } from "hono";
import { Hono } from "hono";

/** One entry: a handler, or middleware followed by a handler
 *  (Zod validation, auth — Rails' `before_action` shape). */
export type Route = Handler | [...MiddlewareHandler[], Handler];

/** Rails' `resources :items`, minus new/edit (server-rendered forms live on
 *  the index page here). Omit a key to get Rails' `only:`. */
export type Controller = Partial<
  Record<"index" | "create" | "show" | "update" | "destroy", Route>
>;

/** TRADE-OFF: registering routes imperatively breaks Hono's RPC type
 *  inference, which needs CHAINED definitions. Fine for server-rendered HTML.
 *  If a route needs a typed RPC client, define it with chaining instead. */
export function resources(app: Hono, base: string, c: Controller): void {
  const r = new Hono();
  const add = (
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    route: Route | undefined,
  ) => {
    if (!route) return;
    const handlers = (Array.isArray(route) ? route : [route]) as [Handler];
    r[method](path, ...handlers);
  };

  add("get", "/", c.index);
  add("post", "/", c.create);
  add("get", "/:id", c.show);
  add("put", "/:id", c.update);
  add("patch", "/:id", c.update);
  add("delete", "/:id", c.destroy);
  app.route(base, r);
}
