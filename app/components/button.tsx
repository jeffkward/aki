import type { FC, PropsWithChildren } from "hono/jsx";

export type ButtonVariant = "primary" | "secondary" | "accent" | "danger" | "ghost";

type Props = PropsWithChildren<{
  variant?: ButtonVariant;
  type?: "button" | "submit" | "reset";
  size?: "sm";
  disabled?: boolean;
  tip?: string;
  /** any hx-* attribute is passed straight through */
  [key: string]: unknown;
}>;

/** The only button. Never style a <button> inline. */
export const Button: FC<Props> = ({
  children,
  variant = "primary",
  type = "button",
  size,
  disabled,
  tip,
  ...rest
}) => (
  <button
    type={type}
    class={["btn", variant, size, tip ? "tip" : ""].filter(Boolean).join(" ")}
    disabled={disabled}
    data-tip={tip}
    {...rest}
  >
    {children}
  </button>
);
