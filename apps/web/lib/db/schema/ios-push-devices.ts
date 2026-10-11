import { sql as drizzleSql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';

export const IOS_PUSH_ENVIRONMENTS = ['sandbox', 'production'] as const;
export type IosPushEnvironment = (typeof IOS_PUSH_ENVIRONMENTS)[number];

/**
 * APNs device registrations owned by an authenticated Jovie app user.
 *
 * The raw device token is encrypted at rest. Its hash is the stable lookup
 * key that lets a token move safely when a shared device changes accounts.
 */
export const iosPushDevices = pgTable(
  'ios_push_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    encryptedToken: text('encrypted_token').notNull(),
    environment: text('environment').notNull(),
    lastRegisteredAt: timestamp('last_registered_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastDeliveredAt: timestamp('last_delivered_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => ({
    tokenHashUnique: uniqueIndex('ios_push_devices_token_hash_unique').on(
      table.tokenHash
    ),
    activeUserIdx: index('ios_push_devices_active_user_idx')
      .on(table.userId)
      .where(drizzleSql`${table.disabledAt} IS NULL`),
    environmentValid: check(
      'ios_push_devices_environment_valid',
      drizzleSql`${table.environment} IN ('sandbox', 'production')`
    ),
  })
);

export type IosPushDevice = typeof iosPushDevices.$inferSelect;
export type NewIosPushDevice = typeof iosPushDevices.$inferInsert;
