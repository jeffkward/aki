import type { FC, PropsWithChildren } from "hono/jsx";

/** A chat message. `me` right-aligns and uses the accent token. */
export const Bubble: FC<PropsWithChildren<{ from?: "me" | "them" }>> = ({
  from = "them",
  children,
}) => <div class={`bubble ${from}`}>{children}</div>;
