import type { FC, PropsWithChildren } from "hono/jsx";

/** Wraps a table so wide content scrolls inside it, never the page. */
export const Table: FC<PropsWithChildren<{ headers: string[] }>> = ({ headers, children }) => (
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          {headers.map((h) => (
            <th>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);
