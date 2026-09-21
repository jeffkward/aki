import type { FC, PropsWithChildren } from "hono/jsx";

/** The standard surface. Anything grouped goes in one of these. */
export const Card: FC<PropsWithChildren<{ [key: string]: unknown }>> = ({
  children,
  ...rest
}) => (
  <div class="card" {...rest}>
    {children}
  </div>
);
