---
name: resource
description: Add a RESTful resource to this app — table, migration, Zod schema, routes, HTMX fragments, and tests. Use for "add a resource", "new model", "CRUD for X", "I need a <thing> table", or any new persisted entity.
---

# Adding a resource

`app/routes/widgets.tsx` is the reference implementation. **Read it first and copy its
shape** — it exists to be copied.

## 1. The table — `db/schema.ts`

```ts
export const widgets = sqliteTable("widgets", {   // table + const: PLURAL
  id: pk,                                          // from db/columns.ts
  name: text("name").notNull(),
  ...timestamps,                                   // created_at / updated_at, always
});

export type Widget = typeof widgets.$inferSelect;  // row type: SINGULAR
```

## 2. The migration

```bash
bun run db:generate    # writes db/migrations/NNNN_*.sql
bun run db:migrate
```

Never hand-write a migration; never edit one that has been applied.

## 3. The Zod schema — at the boundary, always

```ts
export const NewWidget = z.object({ name: z.string().min(1).max(200) });
export type NewWidget = z.infer<typeof NewWidget>;
```

One declaration gives you runtime validation *and* the static type, so they cannot drift.

## 4. The routes — `app/routes/widgets.tsx`

```ts
export function mountWidgets(app: Hono) {
  resources(app, "/widgets", {
    index:   async (c) => { … c.html(<Layout>…</Layout>) },
    create:  [zValidator("form", NewWidget), async (c) => c.html(<Row … />, 201)],
    show:    async (c) => { … },
    update:  [zValidator("form", NewWidget), async (c) => { … }],
    destroy: async (c) => { … c.body(null, 200) },
  });
}
```

Then mount it in `app/app.tsx`. Omit keys you don't need — that's Rails' `only:`.

**Write handlers that return HTML fragments**, not JSON, so HTMX can swap them:
`create` returns the one new `<tr>`; `destroy` returns an empty 200 and HTMX removes
the row.

## 5. The tests — `tests/widgets.test.ts`

Copy `tests/widgets.test.ts`. Cover, at minimum: index renders, create succeeds and
returns the fragment, **create rejects invalid input with 400**, destroy removes it.

```ts
const res = await app.request("/widgets", { method: "POST", body: new URLSearchParams({ name: "x" }) });
```

No server, no browser — `app.request()` is Rails' request spec.

## 6. Verify

```bash
bun run check    # biome, regenerate COMPONENTS.md, run every test
```

## Rules

- Use existing components from `COMPONENTS.md` for the UI. If you need a new one, that
  is the `component` skill's job, not this one.
- HTML forms are POST-only. For update/destroy from a form, use HTMX (`hx-patch`,
  `hx-delete`) or put the action in the path.
- `resources()` breaks Hono's RPC type inference. Fine for server-rendered HTML; if this
  resource needs a typed RPC client, define its routes with chaining instead.
