import { integer } from "drizzle-orm/sqlite-core";

/** Rails' standard timestamps. Spread into EVERY table:
 *    export const items = sqliteTable("items", { id: ..., ...timestamps });
 *  `$onUpdate` gives a real `updated_at` auto-touch on every write. */
export const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
};

/** The standard primary key. */
export const pk = integer("id").primaryKey({ autoIncrement: true });
