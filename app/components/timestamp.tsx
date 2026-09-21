import type { FC } from "hono/jsx";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function relative(value: Date | string): string {
  const then = typeof value === "string" ? new Date(value) : value;
  const secs = Math.round((then.getTime() - Date.now()) / 1000);
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size || unit === "second") {
      return fmt.format(Math.round(secs / size), unit);
    }
  }
  return "";
}

/** A compact relative label with the exact date on hover. */
export const Timestamp: FC<{ value: Date | string; prefix?: string }> = ({
  value,
  prefix = "",
}) => {
  const then = typeof value === "string" ? new Date(value) : value;
  return (
    <time
      class="ts tip"
      datetime={then.toISOString()}
      data-tip={prefix + then.toLocaleString()}
    >
      {relative(then)}
    </time>
  );
};
