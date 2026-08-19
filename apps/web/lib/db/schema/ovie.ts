import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Durable key/value for Ovie MCP operating records (initiatives, decisions,
 * and their indexes). Survives Vercel instance hops and Redis quota.
 */
export const ovieOperatingKv = pgTable('ovie_operating_kv', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type OvieOperatingKvRow = typeof ovieOperatingKv.$inferSelect;
