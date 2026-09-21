import { Hono } from "hono";
import icon from "../assets/icon.svg" with { type: "text" };
import css from "../public/app.css" with { type: "text" };
import htmx from "../public/htmx.min.js" with { type: "text" };
import { Card } from "./components";
import { APP_NAME, Layout } from "./lib/layout";
import { mountTheme } from "./routes/theme";
import { mountWidgets } from "./routes/widgets";

export const app = new Hono();

/* Static assets are BUNDLED as text, not served off disk — a compiled binary
   has no ./public folder. Run `bun run css:build` before compiling.
 *
 * Each is served with a content-derived ETag so the browser revalidates instead
 * of guessing. Without it, an edited icon or stylesheet keeps showing the old
 * one from cache after a restart, which is indistinguishable from a broken
 * build — and cost exactly one confused round of "does the dev server need a
 * restart?". A URL with no version in it must not be cached blindly. */
function bundled(path: string, body: string, type: string) {
  const etag = `"${Bun.hash(body).toString(36)}"`;
  app.get(path, (c) => {
    if (c.req.header("if-none-match") === etag) return c.body(null, 304);
    return c.body(body, 200, {
      "Content-Type": type,
      ETag: etag,
      "Cache-Control": "no-cache", // revalidate every time; 304s are cheap
    });
  });
}

bundled("/app.css", css, "text/css; charset=utf-8");
bundled("/htmx.min.js", htmx, "text/javascript; charset=utf-8");
bundled("/icon.svg", icon, "image/svg+xml");

const Tile = ({ href, title, body }: { href: string; title: string; body: string }) => (
  <a href={href} class="no-underline flex-1 min-w-64">
    <Card>
      <h3 class="mt-0 mb-1">{title} →</h3>
      <p class="sub m-0">{body}</p>
    </Card>
  </a>
);

app.get("/", (c) =>
  c.html(
    <Layout>
      <div class="flex flex-col items-center text-center gap-2 pt-10 pb-2">
        <img src="/icon.svg" alt="aki" width="250" height="250" />
        <h1 class="mb-0">You're on {APP_NAME}.</h1>
        <p class="sub m-0">
          <em>aki</em> — land, earth. The foundation you build on.
        </p>
        <p class="meta m-0">TypeScript · Bun · Hono · JSX + HTMX · Zod · Drizzle · SQLite</p>
      </div>

      <div class="flex gap-3 flex-wrap pt-4">
        <Tile
          href="/theme"
          title="UI Components"
          body="Every component in the library, in 9 themes × light/dark. If it isn't here, it doesn't exist."
        />
        <Tile
          href="/widgets"
          title="CRUD Example"
          body="The reference resource — schema, validation, RESTful routes, HTMX fragments, tests."
        />
      </div>

      <Card>
        <h3 class="mt-0">Next</h3>
        <ol class="sub">
          <li>
            Make it yours: <code>bun run rename &lt;name&gt;</code>
          </li>
          <li>
            Your first table: edit <code>db/schema.ts</code>, then{" "}
            <code>bun run db:generate</code>
          </li>
          <li>
            Your palette: edit <code>styles/tokens.css</code>
          </li>
          <li>
            Read <code>CLAUDE.md</code> for the conventions, <code>COMPONENTS.md</code> for the
            component list
          </li>
        </ol>
      </Card>
    </Layout>,
  ),
);

mountTheme(app);
mountWidgets(app);
