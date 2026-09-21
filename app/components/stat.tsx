import type { FC } from "hono/jsx";

/** A single number with a label. For dashboards and summary rows. */
export const Stat: FC<{ n: string | number; label: string }> = ({ n, label }) => (
  <div class="stat">
    <div class="n">{n}</div>
    <div class="l">{label}</div>
  </div>
);
