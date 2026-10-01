import * as pg from 'drizzle-orm/pg-core';

export const musicResolverReceipts = pg.pgTable('music_resolver_receipts', {
  id: pg.uuid('id').primaryKey().defaultRandom(),
  inputKey: pg.text('input_key').notNull().unique(),
  receipt: pg.jsonb('receipt').$type<Record<string, unknown>>().notNull(),
  expiresAt: pg.timestamp('expires_at').notNull(),
});
