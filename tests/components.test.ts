import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

/* ═══════════════════════════════════════════════════════════════
   THE TEETH.
   A rule in CLAUDE.md degrades over a long session; a red test does not.
   These tests are what stop an agent inventing a component, inlining a
   colour, or shipping something nobody can find.
   ═══════════════════════════════════════════════════════════════ */

const files = readdirSync("app/components").filter((f) => f.endsWith(".tsx"));
const cssFiles = readdirSync("app/components").filter((f) => f.endsWith(".css"));

/** Every stylesheet that may define component classes: the co-located ones plus
 *  the page base. If you add a CSS file, it must be one of these. */
const allComponentCss = [...cssFiles.map((f) => `app/components/${f}`), "styles/base.css"];
const componentNames = files.flatMap((f) =>
  [...readFileSync(`app/components/${f}`, "utf8").matchAll(/export const (\w+)/g)]
    .map((m) => m[1] as string)
    .filter((n) => /^[A-Z]/.test(n)),
);

describe("component contract", () => {
  it("every component is exported from the barrel", () => {
    const barrel = readFileSync("app/components/index.ts", "utf8");
    const missing = componentNames.filter((n) => !barrel.includes(n));
    expect(missing).toEqual([]);
  });

  it("every component is registered in the /theme gallery", () => {
    const gallery = readFileSync("app/routes/theme.tsx", "utf8");
    const missing = componentNames.filter((n) => !new RegExp(`\\b${n}\\b`).test(gallery));
    expect(missing).toEqual([]);
  });

  it("every component has a stylesheet beside it", () => {
    const missing = files
      .map((f) => f.replace(/\.tsx$/, ".css"))
      .filter((c) => !cssFiles.includes(c));
    expect(missing).toEqual([]);
  });

  it("every co-located stylesheet is imported by the generated index", () => {
    const index = readFileSync("styles/components.generated.css", "utf8");
    const missing = cssFiles.filter((f) => !index.includes(`/${f}"`));
    expect(missing).toEqual([]);
  });

  it("COMPONENTS.md is current (run `bun run components:index`)", () => {
    const md = readFileSync("COMPONENTS.md", "utf8");
    const missing = componentNames.filter((n) => !md.includes(`<${n}>`));
    expect(missing).toEqual([]);
  });
});

describe("token contract", () => {
  const css = allComponentCss.map((f) => readFileSync(f, "utf8")).join("\n");
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("component CSS names no colour literals — only tokens", () => {
    expect(allComponentCss.length).toBeGreaterThan(1); // non-vacuous
    const hex = stripped.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    const fns = stripped.match(/\b(rgb|rgba|hsl|hsla)\(/g) ?? [];
    expect([...hex, ...fns]).toEqual([]);
  });

  it("no Tailwind colour utilities in templates — colour comes from tokens", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name)) {
          const src = readFileSync(p, "utf8");
          const bad = src.match(
            /\b(bg|text|border)-(slate|gray|zinc|neutral|stone|red|blue|green|amber|indigo|teal)-\d{2,3}\b/g,
          );
          if (bad) offenders.push(`${p}: ${bad.join(", ")}`);
        }
      }
    };
    walk("app");
    expect(offenders).toEqual([]);
  });

  it("no colour in an inline style attribute — that is what tokens are for", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (/\.tsx$/.test(e.name)) {
          for (const m of readFileSync(p, "utf8").matchAll(
            /style=(?:"([^"]*)"|\{`([^`]*)`\})/g,
          )) {
            const decl = m[1] ?? m[2] ?? "";
            if (
              /#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|(?:^|[;\s])(?:color|background)\s*:/.test(decl)
            ) {
              offenders.push(`${p}: style="${decl}"`);
            }
          }
        }
      }
    };
    walk("app");
    expect(offenders).toEqual([]);
  });

  it("no theme gives --primary and --accent the same value", () => {
    // They mean different things: --primary marks the ACTION, --accent marks
    // links, focus rings and active chips. Identical values make an Accent
    // button indistinguishable from a Primary one and a focus ring invisible
    // against the button it is on. `ops` and `vanilla` shipped identical
    // (ported from V2) until 2026-09-18.
    //
    // This asserts only IDENTITY, not a minimum distance: ochre (grey +
    // gold) and den (cedar + birch) are deliberately analogous, and a distance
    // threshold would fight those on purpose.
    const tokens = readFileSync("styles/tokens.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const blocks = [
      ...tokens.matchAll(
        /\[data-theme=["']?([\w-]+)["']?\]\[data-mode=["']?(\w+)["']?\]\s*\{([^}]*)\}/g,
      ),
    ];
    expect(blocks.length).toBeGreaterThan(4); // non-vacuous
    const clashes: string[] = [];
    for (const [, name, mode, body] of blocks) {
      const get = (k: string) => body.match(new RegExp(`--${k}:\\s*(#[0-9A-Fa-f]{3,8})`))?.[1];
      const p = get("primary");
      const a = get("accent");
      if (p && a && p.toLowerCase() === a.toLowerCase()) clashes.push(`${name}/${mode}`);
    }
    expect(clashes).toEqual([]);
  });

  it("every theme defines BOTH light and dark", () => {
    const tokens = readFileSync("styles/tokens.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const names = new Set(
      [...tokens.matchAll(/\[data-theme=["']?([A-Za-z0-9_-]+)["']?\]/g)].map(
        (m) => m[1] as string,
      ),
    );
    // Non-vacuous: an empty set would make the filter below pass trivially.
    // This is exactly how a broken parser hid behind a green test once.
    expect(names.size).toBeGreaterThan(1);
    const has = (n: string, mode: string) =>
      new RegExp(`\\[data-theme=["']?${n}["']?\\]\\[data-mode=["']?${mode}["']?\\]`).test(
        tokens,
      );
    const incomplete = [...names].filter((n) => !has(n, "light") || !has(n, "dark"));
    expect(incomplete).toEqual([]);
  });

  it("the focus-ring enumeration and the :disabled rule still exist", () => {
    expect(stripped).toInclude(":focus-visible");
    expect(stripped).toInclude(".btn:disabled");
  });
});

describe("theme parser", () => {
  it("themes() finds every theme in the stylesheet and no phantoms", async () => {
    const { themes } = await import("../app/lib/themes");
    const found = themes();
    expect(found.length).toBeGreaterThan(1);
    expect(found).toContain("ochre");
    // "X" is the placeholder inside tokens.css's contract comment — if it
    // appears here, comment-stripping regressed.
    expect(found).not.toContain("X");
  });
});

describe("page base", () => {
  const base = readFileSync("styles/base.css", "utf8");

  it("restores the heading scale preflight strips, from the size tokens", () => {
    // preflight sets `h1..h6 { font-size: inherit; font-weight: inherit }`, so
    // without these an <h1> renders at body size and no page has a header. And
    // the size must be a --size-* token, not a px: the type scale has ONE
    // source, so `class="text-h2"` and a bare <h2> cannot drift apart.
    for (const h of ["h1", "h2", "h3", "h4"]) {
      const rule = base.match(new RegExp(`(^|\\n)${h}\\s*\\{[^}]*\\}`))?.[0];
      expect(rule).toMatch(/font-size:\s*var\(--size-/);
    }
  });

  it("bridges the tokens into Tailwind with @theme inline", () => {
    // `inline` is load-bearing: it makes the utility emit var(--token) instead
    // of a baked value, so text-h1 / font-display follow [data-theme] at RUN
    // TIME. A plain @theme block would freeze one theme's values at build.
    const tokens = readFileSync("styles/tokens.css", "utf8");
    expect(tokens).toContain("@theme inline");
    for (const t of ["--text-h1", "--font-display", "--radius-card"]) {
      expect(tokens).toContain(t);
    }
  });

  it("restores list markers preflight strips", () => {
    // preflight sets `ol, ul, menu { list-style: none }` — an ordered list
    // silently loses its numbers.
    expect(base).toMatch(/ol,\s*ul\s*\{[^}]*list-style/);
  });
});
