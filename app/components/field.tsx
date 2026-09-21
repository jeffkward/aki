import type { FC } from "hono/jsx";

type Props = {
  name: string;
  label?: string;
  type?: "text" | "number" | "date" | "email" | "password";
  value?: string | number;
  placeholder?: string;
  required?: boolean;
  [key: string]: unknown;
};

/** A labelled input. Use instead of a bare <input> so labels stay consistent. */
export const Field: FC<Props> = ({ name, label, type = "text", ...rest }) => (
  <label class="flex flex-col gap-1">
    {label ? <span>{label}</span> : null}
    <input type={type} name={name} {...rest} />
  </label>
);

/** A labelled dropdown. The chevron is markup, not a background-image, so its
 *  colour comes from a token like everything else. */
export const Select: FC<{
  name: string;
  label?: string;
  options: string[];
  value?: string;
}> = ({ name, label, options, value }) => (
  <label class="flex flex-col gap-1">
    {label ? <span>{label}</span> : null}
    <span class="select-wrap">
      <select name={name}>
        {options.map((o) => (
          <option value={o} selected={o === value}>
            {o}
          </option>
        ))}
      </select>
      <span class="chev" aria-hidden="true">
        ▼
      </span>
    </span>
  </label>
);
