import type { FC, PropsWithChildren } from "hono/jsx";

/** Hover help on any text. Never write a bespoke hover handler. */
export const Tip: FC<PropsWithChildren<{ text: string }>> = ({ text, children }) => (
  <span class="tip" data-tip={text}>
    {children}
  </span>
);
