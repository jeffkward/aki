import type { FC, PropsWithChildren } from "hono/jsx";

type ChipProps = PropsWithChildren<{
  active?: boolean;
  /** renders an × remove button; pair with hx-delete on the chip */
  onRemove?: string;
  [key: string]: unknown;
}>;

/** A pill. Use for tags, filters, and small inline labels. */
export const Chip: FC<ChipProps> = ({ children, active, onRemove, ...rest }) => (
  <span
    class={["chip", active ? "active" : "", onRemove ? "listchip" : ""]
      .filter(Boolean)
      .join(" ")}
    {...rest}
  >
    {children}
    {onRemove ? (
      <button
        type="button"
        class="x"
        aria-label="Remove"
        hx-delete={onRemove}
        hx-target="closest .chip"
        hx-swap="outerHTML"
      >
        ×
      </button>
    ) : null}
  </span>
);

/** A chip that shows a label/value pair. */
export const MetaChip: FC<PropsWithChildren<{ label: string }>> = ({ label, children }) => (
  <span class="chip metachip">
    <b>{label}</b> {children}
  </span>
);

/** The dashed "add + Enter" pill. */
export const ChipAdd: FC<{ name: string; placeholder?: string; [key: string]: unknown }> = ({
  name,
  placeholder = "Add + Enter…",
  ...rest
}) => <input type="text" class="chip-add" name={name} placeholder={placeholder} {...rest} />;
