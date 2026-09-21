import type { FC, PropsWithChildren } from "hono/jsx";

export type CalloutKind = "info" | "tip" | "warn" | "alert";
const PREFIX: Record<CalloutKind, string> = { info: "ℹ️", tip: "💡", warn: "⚠️", alert: "🚨" };

/** An inline notice. The emoji lives here, not in the CSS. */
export const Callout: FC<PropsWithChildren<{ kind?: CalloutKind }>> = ({
  kind = "info",
  children,
}) => (
  <div class={`callout ${kind}`}>
    {PREFIX[kind]} {children}
  </div>
);
