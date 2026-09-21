import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { type Widget, widgets } from "../../db/schema";
import { Button, Card, Field, Table, Timestamp } from "../components";
import { Layout } from "../lib/layout";
import { resources } from "../lib/resources";

/* THE REFERENCE RESOURCE — deliberately fake, deliberately copyable.
   Schema in db/schema.ts, Zod at the boundary, RESTful routes via resources(),
   HTML fragments back to HTMX. Copy this file's shape for anything real. */

export const NewWidget = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  // The form sends dollars as a string; coerce, then convert to cents below.
  price: z.coerce.number().min(0, "Price cannot be negative").max(1_000_000).default(0),
});
export type NewWidget = z.infer<typeof NewWidget>;

const money = (cents: number) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(cents / 100);

/* ── fragments (what HTMX swaps in) ───────────────────────────── */

const Row = ({ widget }: { widget: Widget }) => (
  <tr id={`widget-${widget.id}`}>
    <td>
      <a href={`/widgets/${widget.id}`}>{widget.name}</a>
    </td>
    <td class="meta">{widget.description ?? "—"}</td>
    <td>{money(widget.priceCents)}</td>
    <td class="meta">
      <Timestamp value={widget.createdAt} />
    </td>
    <td>
      <Button
        variant="ghost"
        size="sm"
        hx-delete={`/widgets/${widget.id}`}
        hx-target={`#widget-${widget.id}`}
        hx-swap="outerHTML"
      >
        Remove
      </Button>
    </td>
  </tr>
);

/* ── the resource ─────────────────────────────────────────────── */

export function mountWidgets(app: Hono) {
  resources(app, "/widgets", {
    index: async (c) => {
      const all = await db.select().from(widgets).orderBy(desc(widgets.createdAt));
      return c.html(
        <Layout title="Widgets">
          <p class="crumb">
            <a href="/">← Home</a>
          </p>
          <h1>Widgets</h1>
          <p class="sub">
            The reference resource. Widgets are fake on purpose — copy the shape, not the
            domain. Everything here is in <code>app/routes/widgets.tsx</code>.
          </p>

          <Card>
            <form
              class="flex gap-3 items-end flex-wrap"
              hx-post="/widgets"
              hx-target="#rows"
              hx-swap="afterbegin"
              hx-on--after-request="this.reset()"
            >
              <Field name="name" label="Name" required placeholder="Sprocket" />
              <Field name="description" label="Description" placeholder="Turns things" />
              <Field name="price" label="Price" type="number" step="0.01" value="0" />
              <Button type="submit">Add</Button>
            </form>
          </Card>

          <Card>
            <Table headers={["Name", "Description", "Price", "Created", ""]}>
              <tbody id="rows">
                {all.map((w) => (
                  <Row widget={w} />
                ))}
              </tbody>
            </Table>
            {/* Empty state, belt and braces:
                - rendered server-side only when the list is empty, so it is
                  absent (not merely hidden) on a page that has rows
                - AND hidden by CSS `:has(tbody tr)` for the HTMX case, where the
                  first row is swapped in without a page reload and a
                  server-rendered message would otherwise go stale. */}
            {all.length === 0 ? (
              <p class="sub empty-hint">Use the form above to add your first widget.</p>
            ) : null}
          </Card>
        </Layout>,
      );
    },

    /* middleware + handler — the resources() array form (Rails' before_action) */
    create: [
      zValidator("form", NewWidget),
      async (c) => {
        const { name, description, price } = c.req.valid("form");
        const [row] = await db
          .insert(widgets)
          .values({ name, description, priceCents: Math.round(price * 100) })
          .returning();
        if (!row) return c.text("insert failed", 500);
        return c.html(<Row widget={row} />, 201);
      },
    ],

    show: async (c) => {
      const id = Number(c.req.param("id"));
      const [row] = await db.select().from(widgets).where(eq(widgets.id, id));
      if (!row) return c.notFound();
      return c.html(
        <Layout title={row.name}>
          <p class="crumb">
            <a href="/widgets">← Widgets</a>
          </p>
          <h1>{row.name}</h1>
          <p class="sub">{money(row.priceCents)}</p>
          {row.description ? <Card>{row.description}</Card> : null}
          <p class="meta">
            <Timestamp value={row.createdAt} prefix="Created " />
          </p>
        </Layout>,
      );
    },

    destroy: async (c) => {
      await db.delete(widgets).where(eq(widgets.id, Number(c.req.param("id"))));
      return c.body(null, 200);
    },
  });
}
