import tokens from "../../styles/tokens.css" with { type: "text" };

/** Parse the theme list out of styles/tokens.css.
 *  The switcher must never be a hardcoded array that drifts from the stylesheet.
 *
 *  The stylesheet is BUNDLED as text, not read from disk, so this works
 *  unchanged inside a compiled single-file binary. */
export function themes(): string[] {
  // Strip comments FIRST — the contract comment at the top of tokens.css
  // contains a literal `[data-theme=X][data-mode=Y]` example, which would
  // otherwise appear as a theme called "X". A test asserts this.
  const css = tokens.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Set<string>();
  // Quotes are optional: biome's CSS formatter rewrites [data-theme=ochre]
  // as [data-theme="ochre"]. Match both or the switcher silently empties.
  for (const m of css.matchAll(/\[data-theme=["']?([A-Za-z0-9_-]+)["']?\]/g)) {
    if (m[1]) found.add(m[1]);
  }
  return [...found].sort();
}

export const MODES = ["light", "dark"] as const;
export type Mode = (typeof MODES)[number];
