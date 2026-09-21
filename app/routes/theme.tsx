import type { Hono } from "hono";
/* EVERY component, imported from the barrel. tests/components.test.ts asserts
   that every file in app/components/ appears in this import — that is what
   stops an agent (or a human) adding a component nobody can find. */
import {
  Bubble,
  Button,
  Callout,
  Card,
  Chip,
  ChipAdd,
  Field,
  MetaChip,
  Select,
  Stat,
  Table,
  Timestamp,
  Tip,
} from "../components";
import { Layout } from "../lib/layout";
import { MODES, themes } from "../lib/themes";

const Section = ({ title, children }: { title: string; children?: unknown }) => (
  <>
    <h3>{title}</h3>
    <Card>{children}</Card>
  </>
);

export function mountTheme(app: Hono) {
  app.get("/theme", (c) => {
    const theme = c.req.query("theme") ?? "ochre";
    const mode = c.req.query("mode") ?? "light";
    const now = new Date(Date.now() - 1000 * 60 * 42);

    return c.html(
      <Layout title="Theme" theme={theme} mode={mode}>
        <p class="crumb">
          <a href="/">← Home</a>
        </p>
        <h1>Theme</h1>
        <p class="sub">
          Every component in aki, one theme at a time. If a component is not on this page, it
          does not exist — and the test suite will say so.
        </p>

        <Card>
          <div class="flex flex-wrap gap-2 items-center">
            {themes().map((t) => (
              <a href={`/theme?theme=${t}&mode=${mode}`} class="no-underline">
                <Chip active={t === theme}>{t}</Chip>
              </a>
            ))}
            <span class="meta ml-2">·</span>
            {MODES.map((m) => (
              <a href={`/theme?theme=${theme}&mode=${m}`} class="no-underline">
                <Chip active={m === mode}>{m}</Chip>
              </a>
            ))}
          </div>
        </Card>

        <Section title="Button">
          <div class="flex flex-wrap gap-2 items-center">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="accent">Accent</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="ghost" size="sm">
              Small
            </Button>
            <Button disabled>Disabled</Button>
            <Button tip="A button can carry a tooltip; it is still a button.">With tip</Button>
          </div>
          <p class="meta mt-3">
            <code>{"<Button variant tip size disabled {...hx} />"}</code>
          </p>
        </Section>

        <Section title="Chip">
          <div class="flex flex-wrap gap-2 items-center">
            <Chip>Chip</Chip>
            <Chip active>Active</Chip>
            <Chip onRemove="/items/0">Removable</Chip>
            <MetaChip label="Meta">Value</MetaChip>
            <ChipAdd name="demo" />
          </div>
          <p class="meta mt-3">
            <code>{"<Chip active onRemove /> <MetaChip label /> <ChipAdd name />"}</code>
          </p>
        </Section>

        <Section title="Field & Select">
          <div class="flex flex-wrap gap-3 items-end">
            <Field name="t" label="Text" placeholder="Text input" />
            <Field name="n" label="Number" type="number" value={42} />
            <Field name="d" label="Date" type="date" />
            <Select name="s" label="Select" options={["One", "Two", "Three"]} />
          </div>
          <p class="meta mt-3">
            <code>{"<Field name label type value /> <Select name label options />"}</code>
          </p>
        </Section>

        <Section title="Callout">
          <Callout kind="info">Info — the neutral notice.</Callout>
          <Callout kind="tip">Tip — a helpful nudge.</Callout>
          <Callout kind="warn">Warn — something needs attention.</Callout>
          <Callout kind="alert">Alert — this one is urgent.</Callout>
          <p class="meta mt-3">
            <code>{'<Callout kind="info|tip|warn|alert">'}</code>
          </p>
        </Section>

        <Section title="Timestamp">
          <p>
            A relative label with the exact date on hover: <Timestamp value={now} />.
          </p>
          <p class="meta">
            <code>{"<Timestamp value prefix />"}</code>
          </p>
        </Section>

        <Section title="Tip">
          <p>
            <Tip text="The floating card that shows on hover.">Hover this text.</Tip>
          </p>
          <p class="meta">
            <code>{"<Tip text>…</Tip>"}</code> on any text — never a bespoke hover handler.
          </p>
        </Section>

        <Section title="Table">
          <Table headers={["Column", "Value"]}>
            <tr>
              <td>Example row</td>
              <td class="meta">
                <Timestamp value={now} />
              </td>
            </tr>
          </Table>
          <p class="meta mt-3">
            <code>{"<Table headers={[...]}>…rows…</Table>"}</code>
          </p>
        </Section>

        <h3>Stat</h3>
        <div class="flex gap-3 flex-wrap">
          <Stat n={42} label="Example Stat" />
          <Stat n="1.2k" label="Another" />
        </div>
        <p class="meta">
          <code>{"<Stat n label />"}</code>
        </p>

        <Section title="Bubble">
          <Bubble from="them">A reply from the agent.</Bubble>
          <Bubble from="me">A message from you.</Bubble>
          <p class="meta mt-3">
            <code>{'<Bubble from="me|them">'}</code>
          </p>
        </Section>

        <Section title="Card">
          <p>This is a Card. Anything grouped goes in one.</p>
          <p class="meta">
            <code>{"<Card>…</Card>"}</code>
          </p>
        </Section>

        <Section title="Type scale">
          <p class="text-h1 m-0">text-h1 · an unclassed &lt;h1&gt; gets this too</p>
          <p class="text-h2 m-0">text-h2</p>
          <p class="text-h3 m-0">text-h3</p>
          <p class="text-h4 m-0">text-h4</p>
          <p class="text-body m-0">text-body</p>
          <p class="sub m-0">.sub / text-sub</p>
          <p class="meta m-0">.meta / text-meta</p>
          <p class="font-display mt-3 mb-0">font-display — follows the theme</p>
          <p class="font-body m-0">font-body</p>
          <p class="font-mono m-0">font-mono</p>
          <p class="meta mt-3">
            <code>{"text-h1 … text-meta · font-display|body|mono · rounded-card|btn"}</code>
            {" — the same tokens base.css applies to bare elements"}
          </p>
        </Section>
      </Layout>,
    );
  });
}
