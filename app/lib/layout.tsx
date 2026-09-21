import type { FC, PropsWithChildren } from "hono/jsx";

/** The app's display name — the one place it is spelled.
 *  Used in <title> and by the native shell's window title.
 *  `bun run rename` rewrites this line. */
export const APP_NAME = "Aki";

type Props = PropsWithChildren<{
  /** The PAGE title. " — Aki" is appended; omit it entirely on the root page. */
  title?: string;
  theme?: string;
  mode?: string;
}>;

/** The document shell. Every full-page route renders through this. */
export const Layout: FC<Props> = ({ title, theme = "ochre", mode = "light", children }) => (
  <html lang="en" data-theme={theme} data-mode={mode}>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title ? `${title} — ${APP_NAME}` : APP_NAME}</title>
      <link rel="icon" type="image/svg+xml" href="/icon.svg" />
      <link rel="stylesheet" href="/app.css" />
      <script src="/htmx.min.js" defer />
    </head>
    <body>
      <main class="mx-auto max-w-4xl p-6 flex flex-col gap-4">{children}</main>
    </body>
  </html>
);
