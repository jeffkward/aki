import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { pk, timestamps } from "./columns";

/* CONVENTIONS (see CLAUDE.md):
   - table name PLURAL         → "widgets"
   - exported const PLURAL     → widgets
   - the row type SINGULAR     → Widget
   - always ...timestamps      → created_at / updated_at
*/
export const widgets = sqliteTable("widgets", {
  id: pk,
  name: text("name").notNull(),
  description: text("description"),
  /* Money is an INTEGER number of cents, never a float. 19.99 as a float is
     19.989999999999998, and those errors accumulate. The route converts at the
     boundary; everything inside works in cents. */
  priceCents: integer("price_cents").notNull().default(0),
  ...timestamps,
});

export type Widget = typeof widgets.$inferSelect;
export type NewWidgetRow = typeof widgets.$inferInsert;
