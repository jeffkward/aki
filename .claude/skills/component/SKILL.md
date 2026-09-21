---
name: component
description: Add or change a component in this app's component library. Use whenever the UI needs something that COMPONENTS.md doesn't already have — never inline styles, never a one-off. Triggers on "add a component", "new component", "needs a <thing>", or when a route wants markup the library lacks.
---

# Adding a component

## First: don't

Read `COMPONENTS.md`. If something close exists, **extend it with a prop** rather than
adding a sibling. Two components that differ by a border are one component with a variant.

## If it really is new, all five steps, in one change

1. **Create `app/components/<name>.tsx`** — one component per file, lowercase filename,
   PascalCase export. Copy the shape of an existing one:

```tsx
import type { FC, PropsWithChildren } from "hono/jsx";

/** One line saying what it is FOR. This becomes its row in COMPONENTS.md. */
export const Thing: FC<PropsWithChildren<{ variant?: "a" | "b" }>> = ({ variant = "a", children }) => (
  <div class={`thing ${variant}`}>{children}</div>
);
```

2. **Create `app/components/<name>.css`** — its stylesheet lives BESIDE it, same name.
   **Only tokens for colour.** If you need a colour that isn't a token, you need a
   token, not a literal — add it to *every* theme block in `styles/tokens.css`.

3. **Export it from `app/components/index.ts`.**

4. **Render it in `app/routes/theme.tsx`** — inside a `<Section title="Thing">`, showing
   every variant and every state (including disabled/empty), plus a `<p class="meta">`
   with its signature.

5. **Run `bun run components:index`** to refresh `COMPONENTS.md` and the generated CSS index.

## Then verify

```bash
bun run test
```

Six tests will tell you if you missed a step: barrel export, gallery registration,
`COMPONENTS.md` currency, a stylesheet beside the component, that stylesheet being in
the generated index, and colour literals. Do not edit the tests to pass.

## Rules

- Layout via Tailwind utilities **in the template** (`flex gap-2`), never as CSS here.
- Colour/type/shape from tokens only. No `#hex`, no `rgb()`, no `bg-slate-500`, no
  `style="color:…"`.
- Pass `hx-*` attributes through with `{...rest}` so HTMX works on any component.
- If the component is **data-backed** (needs real application state to render), don't
  invent a fixture — document its signature in the gallery and link to a live page that
  shows it. A fixture drifts from reality; V2 learned this and so did we.
